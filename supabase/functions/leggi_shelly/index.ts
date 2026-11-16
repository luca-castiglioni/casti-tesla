// Legge lo Shelly EM "Energia wallbox" dal Cloud Shelly e salva una lettura.
// La chiamano: il pianificatore del database (ogni 5 minuti, vedi supabase/cron.sql)
// e l'app quando la apri (per avere la potenza aggiornata).
// Se l'ultima lettura ha meno di 30 secondi non richiama il cloud: restituisce quella.
//
// Segreti da impostare in Supabase → Edge Functions → Secrets:
//   SHELLY_SERVER    es. https://shelly-123-eu.shelly.cloud  (dall'app Shelly)
//   SHELLY_AUTH_KEY  la "chiave di autorizzazione cloud"     (dall'app Shelly)
//   SHELLY_DEVICE_ID facoltativo, predefinito c4d8d5001868
import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'

const CANALE = 0 // canale 1 dello Shelly = wallbox

function errore(messaggio: string, status = 400): Response {
  return Response.json({ errore: messaggio }, { status })
}

interface Emeter {
  power?: number
  total?: number
  voltage?: number
}

// Chiede lo stato del dispositivo al Cloud Shelly (API v1, valida per gli Shelly Gen1)
async function statoDalCloud(server: string, chiave: string, id: string): Promise<Emeter> {
  const risposta = await fetch(`${server.replace(/\/+$/, '')}/device/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id, auth_key: chiave }),
  })
  const json = await risposta.json().catch(() => null)
  if (!risposta.ok || !json?.isok) {
    throw new Error(`Cloud Shelly: ${JSON.stringify(json?.errors ?? risposta.status)}`)
  }
  const emeter = json.data?.device_status?.emeters?.[CANALE] as Emeter | undefined
  if (!json.data?.online) throw new Error('Lo Shelly risulta offline nel cloud.')
  if (!emeter || typeof emeter.total !== 'number') throw new Error('Risposta del cloud senza contatore.')
  return emeter
}

export default {
  fetch: withSupabase({ auth: 'publishable', errors: { detailed: false } }, async (_req, ctx) => {
    const admin = ctx.supabaseAdmin

    const { data: ultima } = await admin
      .from('letture')
      .select('ts, totale_wh, potenza_w, tensione')
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultima && Date.now() - new Date(ultima.ts).getTime() < 30_000) {
      return Response.json({ lettura: ultima, nuova: false })
    }

    const server = Deno.env.get('SHELLY_SERVER')
    const chiave = Deno.env.get('SHELLY_AUTH_KEY')
    const id = Deno.env.get('SHELLY_DEVICE_ID') ?? 'c4d8d5001868'
    if (!server || !chiave) return errore('Mancano i segreti SHELLY_SERVER e SHELLY_AUTH_KEY.', 500)

    let emeter: Emeter
    try {
      emeter = await statoDalCloud(server, chiave, id)
    } catch (e) {
      return errore((e as Error).message, 502)
    }

    const riga = {
      totale_wh: emeter.total,
      potenza_w: Math.max(0, emeter.power ?? 0),
      tensione: emeter.voltage ?? null,
    }
    const { data, error } = await admin.from('letture').insert(riga).select().single()
    if (error) return errore('Errore del database: ' + error.message, 500)
    return Response.json({ lettura: data, nuova: true })
  }),
}
