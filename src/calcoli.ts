// Tutti i conti dell'app: costi, km per giorno, settimane e mesi, totali.
// Funzioni "pure" (nessun accesso al database): si provano in calcoli.test.ts.
import { aggiungiGiorni, lunedi, oggi } from './format'
import type { Dati, Prezzo, Ricarica } from './types'

export interface Giorno {
  giorno: string
  kwh: number // tutti i kWh del giorno: casa + fuori casa
  euro_kwh: number // prezzo di casa
  costo: number // casa + fuori casa
  kwhEsterni: number // di cui fuori casa (Supercharger e altre colonnine)
  costoEsterni: number
  km: number
  kmStimati: boolean // true = km ricavati dal consumo medio (dopo l'ultima lettura del contachilometri)
}

export interface Periodo {
  chiave: string // lunedì della settimana (AAAA-MM-GG) oppure mese (AAAA-MM)
  kwh: number
  costo: number
  kwhEsterni: number
  costoEsterni: number
  km: number
  kmStimati: boolean
}

export interface Totali {
  kwh: number
  costo: number
  kwhEsterni: number
  costoEsterni: number
  km: number
  kmStimati: number // quanti dei km sono stimati
  costoKm: number | null
  costo100km: number | null
  kwh100km: number | null
}

// Prezzo valido in un giorno: l'ultimo "valido dal" non successivo.
// Prima del primo prezzo vale il primo (es. per i kWh iniziali).
export function prezzoDel(giorno: string, prezzi: Prezzo[]): number {
  if (!prezzi.length) return 0
  const ordinati = [...prezzi].sort((a, b) => a.valido_dal.localeCompare(b.valido_dal))
  let prezzo = ordinati[0].euro_kwh
  for (const p of ordinati) {
    if (p.valido_dal <= giorno) prezzo = p.euro_kwh
    else break
  }
  return Number(prezzo)
}

// Elenco dei giorni dalla data di inizio a oggi, con kWh, costo e km attribuiti.
// Contano sia le ricariche di casa (Shelly) sia quelle fuori casa (con il loro importo pagato).
// I km tra due letture del contachilometri vengono divisi tra i giorni
// in proporzione ai kWh ricaricati (se non c'è stata nessuna ricarica, in parti uguali).
// Dopo l'ultima lettura i km sono stimati con il consumo medio (km per kWh).
export function calcolaGiorni(dati: Dati, fino = oggi()): Giorno[] {
  const { impostazioni: imp, prezzi } = dati
  const inizio = imp.data_inizio
  const kwhDel = new Map<string, number>()
  for (const g of dati.giorni) {
    if (g.giorno >= inizio) kwhDel.set(g.giorno, (kwhDel.get(g.giorno) ?? 0) + Number(g.kwh))
  }
  const esterneDel = new Map<string, { kwh: number; euro: number }>()
  for (const r of dati.esterne) {
    if (r.data < inizio) continue
    const e = esterneDel.get(r.data) ?? { kwh: 0, euro: 0 }
    e.kwh += Number(r.kwh ?? 0)
    e.euro += Number(r.euro)
    esterneDel.set(r.data, e)
  }
  const ultimoConDati = [...kwhDel.keys(), ...esterneDel.keys()].sort().at(-1)
  if (ultimoConDati && ultimoConDati > fino) fino = ultimoConDati

  const giorni: Giorno[] = []
  for (let g = inizio; g <= fino; g = aggiungiGiorni(g, 1)) {
    const kwhCasa = kwhDel.get(g) ?? 0
    const est = esterneDel.get(g) ?? { kwh: 0, euro: 0 }
    const euro_kwh = prezzoDel(g, prezzi)
    giorni.push({
      giorno: g,
      kwh: kwhCasa + est.kwh,
      euro_kwh,
      costo: kwhCasa * euro_kwh + est.euro,
      kwhEsterni: est.kwh,
      costoEsterni: est.euro,
      km: 0,
      kmStimati: false,
    })
  }
  if (!giorni.length) return giorni

  // Punti del contachilometri: quello iniziale + le letture successive, km crescenti
  const punti = [{ data: inizio, km: Number(imp.km_iniziali) }]
  const letture = [...dati.km]
    .filter((k) => k.data >= inizio)
    .sort((a, b) => a.data.localeCompare(b.data) || a.km - b.km)
  for (const k of letture) {
    const ultimo = punti[punti.length - 1]
    if (Number(k.km) < ultimo.km) continue // lettura incoerente: la ignoro
    if (k.data === ultimo.data) ultimo.km = Number(k.km)
    else punti.push({ data: k.data, km: Number(k.km) })
  }

  const indice = new Map(giorni.map((g, i) => [g.giorno, i]))
  let kwhMisurati = 0
  for (let p = 1; p < punti.length; p++) {
    const a = punti[p - 1]
    const b = punti[p]
    const tratto = giorni.filter((g) => g.giorno > a.data && g.giorno <= b.data)
    const kwhTratto = tratto.reduce((s, g) => s + g.kwh, 0)
    kwhMisurati += kwhTratto
    for (const g of tratto) {
      g.km = kwhTratto > 0 ? ((b.km - a.km) * g.kwh) / kwhTratto : (b.km - a.km) / tratto.length
    }
  }

  // Consumo medio per stimare i km dopo l'ultima lettura
  const ultimo = punti[punti.length - 1]
  const kmMisurati = ultimo.km - punti[0].km
  let kmPerKwh = 0
  if (kmMisurati > 0 && kwhMisurati > 0) kmPerKwh = kmMisurati / kwhMisurati
  else if (imp.km_iniziali > 0 && imp.kwh_iniziali > 0) kmPerKwh = imp.km_iniziali / imp.kwh_iniziali
  const da = indice.get(ultimo.data) ?? 0
  for (let i = da + 1; i < giorni.length; i++) {
    giorni[i].km = giorni[i].kwh * kmPerKwh
    giorni[i].kmStimati = giorni[i].kwh > 0
  }
  return giorni
}

export function raggruppa(giorni: Giorno[], per: 'settimana' | 'mese'): Periodo[] {
  const mappa = new Map<string, Periodo>()
  for (const g of giorni) {
    const chiave = per === 'mese' ? g.giorno.slice(0, 7) : lunedi(g.giorno)
    const p = mappa.get(chiave) ?? { chiave, kwh: 0, costo: 0, kwhEsterni: 0, costoEsterni: 0, km: 0, kmStimati: false }
    p.kwh += g.kwh
    p.costo += g.costo
    p.kwhEsterni += g.kwhEsterni
    p.costoEsterni += g.costoEsterni
    p.km += g.km
    p.kmStimati ||= g.kmStimati
    mappa.set(chiave, p)
  }
  return [...mappa.values()].sort((a, b) => a.chiave.localeCompare(b.chiave))
}

export function calcolaTotali(dati: Dati, giorni: Giorno[]): Totali {
  const { impostazioni: imp, prezzi } = dati
  const prezzoIniziale = prezzoDel(imp.data_inizio, prezzi)
  const kwh = Number(imp.kwh_iniziali) + giorni.reduce((s, g) => s + g.kwh, 0)
  const costo = Number(imp.kwh_iniziali) * prezzoIniziale + giorni.reduce((s, g) => s + g.costo, 0)
  const kmStimati = giorni.filter((g) => g.kmStimati).reduce((s, g) => s + g.km, 0)
  const km = Number(imp.km_iniziali) + giorni.reduce((s, g) => s + g.km, 0)
  const kwhEsterni = giorni.reduce((s, g) => s + g.kwhEsterni, 0)
  const costoEsterni = giorni.reduce((s, g) => s + g.costoEsterni, 0)
  return { kwh, costo, kwhEsterni, costoEsterni, km, kmStimati, ...indici(costo, kwh, km) }
}

export function indici(costo: number, kwh: number, km: number) {
  return {
    costoKm: km > 0 ? costo / km : null,
    costo100km: km > 0 ? (costo / km) * 100 : null,
    kwh100km: km > 0 ? (kwh / km) * 100 : null,
  }
}

export function costoRicarica(r: Ricarica, prezzi: Prezzo[]): number {
  const giorno = new Date(r.inizio).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  return Number(r.kwh) * prezzoDel(giorno, prezzi)
}

// La Tesla sta caricando? Potenza sopra 300 W in una lettura degli ultimi 10 minuti
export function inRicarica(dati: Dati): boolean {
  const u = dati.ultima
  return Boolean(u && u.potenza_w > 300 && Date.now() - new Date(u.ts).getTime() < 10 * 60_000)
}
