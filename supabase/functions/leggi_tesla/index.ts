// Legge dalla Tesla (tramite il "ponte" API di MyTeslaMate, che inoltra all'API ufficiale Tesla):
//   1. il contachilometri, SOLO mentre l'auto carica a casa (lo dice lo Shelly):
//      l'auto è già sveglia, quindi non la svegliamo mai (niente consumo di batteria né crediti extra).
//      Al massimo una lettura ogni 6 ore → tabella "km" con fonte 'tesla'.
//   2. lo storico delle ricariche ai Supercharger, una volta al giorno → tabella "ricariche_esterne".
// La chiama il pianificatore del database ogni 10 minuti (vedi supabase/cron.sql): quasi sempre
// non fa niente e non costa crediti.
// Con { "azione": "prova" } (solo l'amministratore, dall'app) legge subito entrambe le cose
// e restituisce un riassunto per controllare che tutto funzioni.
//
// Segreti da impostare in Supabase → Edge Functions → Secrets:
//   TESLA_TOKEN  il token della pagina "API" / "Fleet" di MyTeslaMate
//   TESLA_VIN    facoltativo: il telaio dell'auto (se manca uso la prima auto dell'account)
//   TESLA_API    facoltativo, predefinito https://api.myteslamate.com
import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'

const MIGLIA_KM = 1.609344
const ORE = 3600_000

class ErroreTesla extends Error {
  constructor(messaggio: string, public status = 0) {
    super(messaggio)
  }
}

function giornoItaliano(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

function numero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Chiamata all'API Tesla con i messaggi d'errore in italiano
async function tesla(percorso: string): Promise<Record<string, unknown>> {
  const base = (Deno.env.get('TESLA_API') ?? 'https://api.myteslamate.com').replace(/\/+$/, '')
  const risposta = await fetch(base + percorso, {
    headers: { Authorization: `Bearer ${Deno.env.get('TESLA_TOKEN')}`, Accept: 'application/json' },
  })
  const json = await risposta.json().catch(() => null)
  if (risposta.ok && json) return json
  const s = risposta.status
  if (s === 401 || s === 403) throw new ErroreTesla('Token Tesla non valido o scaduto: rigeneralo su MyTeslaMate.', s)
  if (s === 402) throw new ErroreTesla('Crediti MyTeslaMate esauriti: ricaricali sul loro sito.', s)
  if (s === 408) throw new ErroreTesla('L\'auto dorme.', s)
  if (s === 429) throw new ErroreTesla('Troppe richieste a Tesla, riprovo più tardi.', s)
  throw new ErroreTesla(`Risposta Tesla ${s}: ${JSON.stringify(json?.error ?? json ?? '').slice(0, 200)}`, s)
}

interface Auto {
  vin: string
  state: string
}

async function auto(): Promise<Auto> {
  const vin = Deno.env.get('TESLA_VIN')
  if (vin) {
    const r = (await tesla(`/api/1/vehicles/${vin}`)).response as Auto | undefined
    if (!r) throw new ErroreTesla('Auto non trovata: controlla TESLA_VIN.')
    return { vin, state: r.state }
  }
  const elenco = (await tesla('/api/1/vehicles')).response as Auto[] | undefined
  if (!elenco?.length) throw new ErroreTesla('Nessuna auto collegata a questo token.')
  return elenco[0]
}

function ora(ms: number): string {
  return new Date(ms).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Contachilometri in km (Tesla lo dà in miglia) e quando è stato rilevato dall'auto.
// null se l'auto non è sveglia.
// Per la diagnostica: solo nomi dei campi e valori che sembrano orari (nessun dato personale)
function orari(o: Record<string, unknown> | undefined): Record<string, string> {
  const r: Record<string, string> = {}
  for (const [k, v] of Object.entries(o ?? {})) {
    const n = Number(v)
    if (/time|stamp|date/i.test(k) && Number.isFinite(n) && n > 1e9) r[k] = ora(n < 1e12 ? n * 1000 : n)
  }
  return r
}

async function contachilometri(a: Auto): Promise<
  { km: number; quando: number | null; diagnostica: Record<string, unknown> } | null
> {
  if (a.state !== 'online') return null
  const json = await tesla(`/api/1/vehicles/${a.vin}/vehicle_data?endpoints=vehicle_state%3Bcharge_state`)
  const dati = json.response as
    | { vehicle_state?: { odometer?: number; timestamp?: number }; charge_state?: Record<string, unknown> }
    | undefined
  const miglia = dati?.vehicle_state?.odometer
  if (typeof miglia !== 'number' || miglia <= 0) throw new ErroreTesla('La Tesla non ha restituito il contachilometri.')
  const t = Number(dati?.vehicle_state?.timestamp)
  const diagnostica = {
    campi_risposta: Object.keys(json),
    campi_auto: Object.keys(dati ?? {}),
    campi_vehicle_state: Object.keys(dati?.vehicle_state ?? {}),
    orari_risposta: { ...orari(json), ...orari(dati as Record<string, unknown>) },
    orari_vehicle_state: orari(dati?.vehicle_state as Record<string, unknown>),
    orari_charge_state: orari(dati?.charge_state),
    stato_ricarica: dati?.charge_state?.charging_state ?? null,
  }
  return { km: Math.round(miglia * MIGLIA_KM * 10) / 10, quando: Number.isFinite(t) && t > 0 ? t : null, diagnostica }
}

interface Sessione {
  sessionId?: number | string
  siteLocationName?: string
  chargeStartDateTime?: string
  fees?: { feeType?: string; uom?: string; totalDue?: number; currencyCode?: string; [k: string]: unknown }[]
}

// Una sessione dello storico → riga di ricariche_esterne
function daSessione(s: Sessione) {
  let euro = 0
  let kwh = 0
  for (const f of s.fees ?? []) {
    euro += numero(f.totalDue)
    if (f.feeType === 'CHARGING' && String(f.uom ?? '').toLowerCase() === 'kwh') {
      for (const [k, v] of Object.entries(f)) if (k.startsWith('usage')) kwh += numero(v)
    }
  }
  return {
    id_tesla: String(s.sessionId),
    data: giornoItaliano(new Date(s.chargeStartDateTime!)),
    tipo: 'supercharger',
    luogo: s.siteLocationName ?? null,
    kwh: kwh > 0 ? Math.round(kwh * 100) / 100 : null,
    euro: Math.round(euro * 100) / 100,
    fonte: 'tesla',
    created_by: null,
  }
}

async function storicoSupercharger(vin: string, da: Date): Promise<{ sessioni: Sessione[] }> {
  const sessioni: Sessione[] = []
  for (let pagina = 1; pagina <= 10; pagina++) {
    const q = new URLSearchParams({ vin, startTime: da.toISOString(), pageNo: String(pagina), pageSize: '50' })
    const json = await tesla(`/api/1/dx/charging/history?${q}`)
    const blocco = (json.data ?? (json.response as { data?: unknown })?.data ?? []) as Sessione[]
    sessioni.push(...blocco)
    const altre = json.hasMoreData ?? (json.response as { hasMoreData?: boolean })?.hasMoreData
    if (!altre || !blocco.length) break
  }
  return { sessioni }
}

export default {
  fetch: withSupabase({ auth: 'publishable', errors: { detailed: false } }, async (req, ctx) => {
    const admin = ctx.supabaseAdmin
    if (!Deno.env.get('TESLA_TOKEN')) return Response.json({ attivo: false, motivo: 'Manca il segreto TESLA_TOKEN.' })

    const corpo = await req.json().catch(() => ({}))
    let prova = false
    if (corpo?.azione === 'prova') {
      // solo l'amministratore collegato
      const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
      const { data: utente } = await admin.auth.getUser(jwt)
      const { data: profilo } = utente.user
        ? await admin.from('profiles').select('is_admin').eq('id', utente.user.id).maybeSingle()
        : { data: null }
      if (!profilo?.is_admin) return Response.json({ errore: "Solo l'amministratore può fare la prova." }, { status: 403 })
      prova = true
    }

    const { data: stato } = await admin.from('tesla_stato').select('*').eq('id', 1).maybeSingle()
    const { data: imp } = await admin.from('impostazioni').select('data_inizio').eq('id', 1).single()
    const adesso = Date.now()
    const esito: Record<string, unknown> = {}
    const aggiorna: Record<string, unknown> = {}
    const errori: string[] = []

    // L'auto sta caricando a casa? (ultima lettura dello Shelly sopra 300 W negli ultimi 10 minuti)
    const { data: ultima } = await admin.from('letture').select('ts, potenza_w').order('ts', { ascending: false }).limit(1).maybeSingle()
    const inCarica = Boolean(ultima && Number(ultima.potenza_w) > 300 && adesso - new Date(ultima.ts).getTime() < 10 * 60_000)
    const kmVecchi = !stato?.ultimo_km || adesso - new Date(stato.ultimo_km).getTime() > 6 * ORE
    const storicoVecchio = !stato?.ultimo_storico || adesso - new Date(stato.ultimo_storico).getTime() > 20 * ORE

    if (!prova && !(inCarica && kmVecchi) && !storicoVecchio) return Response.json({ niente_da_fare: true })

    let a: Auto
    try {
      a = await auto()
      esito.stato_auto = a.state
    } catch (e) {
      const m = (e as Error).message
      await admin.from('tesla_stato').update({ ultimo_errore: m, ultimo_errore_ts: new Date().toISOString() }).eq('id', 1)
      return Response.json({ errore: m }, { status: 502 })
    }

    // 1. Contachilometri
    if (prova || (inCarica && kmVecchi)) {
      try {
        const letto = await contachilometri(a)
        esito.km = letto?.km ?? null
        if (letto?.quando) esito.km_rilevato = ora(letto.quando)
        if (prova && letto) esito.diagnostica = letto.diagnostica
        if (letto) {
          const { km, quando } = letto
          // A volte il ponte restituisce un dato vecchio (salvato ore prima): non lo considero una lettura
          // riuscita, così riprovo al prossimo giro (solo mentre l'auto carica).
          if (quando && adesso - quando > 30 * 60_000) {
            throw new Error(`La Tesla ha dato ${km.toLocaleString('it-IT')} km ma è un dato vecchio (delle ${ora(quando)}): riprovo più tardi.`)
          }
          const { data: massimo } = await admin.from('km').select('km').order('km', { ascending: false }).limit(1).maybeSingle()
          if (massimo && km < Number(massimo.km)) {
            throw new Error(
              `La Tesla ha dato ${km.toLocaleString('it-IT')} km, meno dell'ultima lettura (${Number(massimo.km).toLocaleString('it-IT')}): riprovo più tardi.`,
            )
          }
          const { error } = await admin.from('km').insert({ data: giornoItaliano(new Date()), km, fonte: 'tesla', created_by: null })
          if (error) throw new Error('Errore del database: ' + error.message)
          aggiorna.ultimo_km = new Date().toISOString()
        }
      } catch (e) {
        if ((e as ErroreTesla).status !== 408) errori.push((e as Error).message)
      }
    }

    // 2. Storico Supercharger (dal giorno di inizio, poi solo l'ultimo mese)
    if (prova || storicoVecchio) {
      try {
        const inizio = new Date(`${imp?.data_inizio}T00:00:00Z`)
        const mese = stato?.ultimo_storico ? new Date(new Date(stato.ultimo_storico).getTime() - 30 * 24 * ORE) : inizio
        const { sessioni } = await storicoSupercharger(a.vin, mese > inizio ? mese : inizio)
        const righe = sessioni.filter((s) => s.sessionId != null && s.chargeStartDateTime).map(daSessione)
        if (righe.length) {
          const { error } = await admin.from('ricariche_esterne').upsert(righe, { onConflict: 'id_tesla', ignoreDuplicates: true })
          if (error) throw new Error('Errore del database: ' + error.message)
        }
        esito.sessioni_supercharger = righe.length
        // per la prova: solo i NOMI dei campi della prima sessione (nessun dato personale), per controllare il formato
        if (prova && sessioni[0]) {
          esito.campi_sessione = Object.keys(sessioni[0])
          esito.campi_costo = Object.keys(sessioni[0].fees?.[0] ?? {})
          esito.esempio = righe[0] && { kwh: righe[0].kwh, euro: righe[0].euro, valuta: sessioni[0].fees?.[0]?.currencyCode }
        }
        aggiorna.ultimo_storico = new Date().toISOString()
      } catch (e) {
        errori.push('Storico Supercharger: ' + (e as Error).message)
      }
    }

    aggiorna.ultimo_errore = errori.length ? errori.join(' · ') : null
    aggiorna.ultimo_errore_ts = errori.length ? new Date().toISOString() : (stato?.ultimo_errore_ts ?? null)
    await admin.from('tesla_stato').update(aggiorna).eq('id', 1)
    return Response.json({ ...esito, errori })
  }),
}
