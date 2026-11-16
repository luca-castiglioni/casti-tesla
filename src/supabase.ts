import { createClient } from '@supabase/supabase-js'
import { creaDatiDemo } from './demo'
import type { ConsumoGiorno, Dati, Impostazioni, LetturaKm, LetturaShelly, Prezzo, Profilo, Ricarica } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurato = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'non-configurato')

// Modalità demo: dati inventati, nessun database (si apre con ?demo nell'indirizzo)
export const demo = new URLSearchParams(location.search).has('demo')
let datiDemo: Dati | null = null

function controlla<T>(risposta: { data: T | null; error: { message: string } | null }): T {
  if (risposta.error) throw new Error(risposta.error.message)
  return risposta.data as T
}

// Le API di Supabase restituiscono al massimo 1000 righe per volta: leggo a pagine
async function tutteLeRighe<T>(crea: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const righe: T[] = []
  for (let da = 0; ; da += 1000) {
    const pagina = controlla(await crea(da, da + 999))
    righe.push(...pagina)
    if (pagina.length < 1000) return righe
  }
}

export async function caricaProfilo(userId: string): Promise<Profilo | null> {
  if (demo) return { id: 'demo', email: 'demo@esempio.it', nome: 'Demo', is_admin: true }
  return controlla(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle())
}

export async function caricaDati(): Promise<Dati> {
  if (demo) return (datiDemo ??= creaDatiDemo())
  const impostazioni = controlla<Impostazioni>(
    await supabase.from('impostazioni').select('km_iniziali, kwh_iniziali, data_inizio').eq('id', 1).single(),
  )
  const [prezzi, km, giorni, ricariche, ultima] = await Promise.all([
    supabase.from('prezzi').select('id, valido_dal, euro_kwh').order('valido_dal').then(controlla<Prezzo[]>),
    supabase.from('km').select('id, data, km, created_by').order('data').then(controlla<LetturaKm[]>),
    tutteLeRighe<ConsumoGiorno>((da, a) =>
      supabase.from('consumi_giornalieri').select('giorno, kwh').gte('giorno', impostazioni.data_inizio).order('giorno').range(da, a),
    ),
    supabase
      .from('ricariche')
      .select('inizio, fine, kwh, potenza_max_w')
      .gte('inizio', impostazioni.data_inizio)
      .order('inizio', { ascending: false })
      .limit(500)
      .then(controlla<Ricarica[]>),
    supabase
      .from('letture')
      .select('ts, totale_wh, potenza_w, tensione')
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(controlla<LetturaShelly | null>),
  ])
  // i numeri "numeric" di Postgres arrivano come testo o numero: li rendo sempre numeri
  return {
    impostazioni: {
      ...impostazioni,
      km_iniziali: Number(impostazioni.km_iniziali),
      kwh_iniziali: Number(impostazioni.kwh_iniziali),
    },
    prezzi: prezzi.map((p) => ({ ...p, euro_kwh: Number(p.euro_kwh) })),
    km: km.map((k) => ({ ...k, km: Number(k.km) })),
    giorni: giorni.map((g) => ({ ...g, kwh: Number(g.kwh) })),
    ricariche: ricariche.map((r) => ({ ...r, kwh: Number(r.kwh), potenza_max_w: Number(r.potenza_max_w) })),
    ultima: ultima && { ...ultima, potenza_w: Number(ultima.potenza_w), totale_wh: Number(ultima.totale_wh) },
  }
}

// Chiede una lettura nuova allo Shelly (tramite la Edge Function). Errore = messaggio in italiano.
export async function aggiornaShelly(): Promise<void> {
  if (demo) return
  const { error } = await supabase.functions.invoke('leggi_shelly', { body: {} })
  if (!error) return
  const dettaglio = await (error as { context?: Response }).context?.json?.().catch(() => null)
  throw new Error(dettaglio?.errore ?? 'Shelly non raggiungibile in questo momento.')
}

// ---------- Modifiche ----------

function erroreLeggibile(e: { code?: string; message: string }): Error {
  if (e.code === '42501' || e.message.includes('row-level security')) return new Error('Solo l\'amministratore può farlo.')
  if (e.code === '23505') return new Error('Esiste già un prezzo con questa data.')
  if (e.code === '23514') return new Error('Valore non valido.')
  if (e.message.includes('Failed to fetch')) return new Error('Connessione assente, riprova.')
  return new Error(e.message)
}

async function esegui(op: PromiseLike<{ error: { code?: string; message: string } | null; data?: unknown }>, richiedeRiga = false) {
  const { error, data } = await op
  if (error) throw erroreLeggibile(error)
  if (richiedeRiga && Array.isArray(data) && !data.length) throw new Error('Non hai i permessi per questa modifica.')
}

export async function salvaImpostazioni(i: Impostazioni) {
  if (demo) return void (datiDemo!.impostazioni = i)
  await esegui(supabase.from('impostazioni').update({ ...i, updated_at: new Date().toISOString() }).eq('id', 1).select('id'), true)
}

export async function aggiungiPrezzo(valido_dal: string, euro_kwh: number) {
  if (demo) return void datiDemo!.prezzi.push({ id: crypto.randomUUID(), valido_dal, euro_kwh })
  await esegui(supabase.from('prezzi').insert({ valido_dal, euro_kwh }))
}

export async function eliminaPrezzo(id: string) {
  if (demo) return void (datiDemo!.prezzi = datiDemo!.prezzi.filter((p) => p.id !== id))
  await esegui(supabase.from('prezzi').delete().eq('id', id).select('id'), true)
}

export async function aggiungiKm(data: string, km: number) {
  if (demo) return void datiDemo!.km.push({ id: crypto.randomUUID(), data, km, created_by: 'demo' })
  await esegui(supabase.from('km').insert({ data, km }))
}

export async function eliminaKm(id: string) {
  if (demo) return void (datiDemo!.km = datiDemo!.km.filter((k) => k.id !== id))
  await esegui(supabase.from('km').delete().eq('id', id).select('id'), true)
}
