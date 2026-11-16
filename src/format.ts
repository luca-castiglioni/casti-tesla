const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const euroFine = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

export function formatEuro(n: number): string {
  return euro.format(n)
}

// Per importi piccoli come il costo al km (es. € 0,052)
export function formatEuroFine(n: number): string {
  return euroFine.format(n)
}

export function formatNumero(n: number, decimali = 0): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali })
}

export function formatPotenza(w: number): string {
  return w >= 1000 ? `${formatNumero(w / 1000, 1)} kW` : `${formatNumero(w)} W`
}

// Accetta "0,28", "1.234,5", "12.5"; restituisce NaN se non valido
export function parseNumero(testo: string): number {
  let s = testo.replace(/[€\s]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  return Number(s)
}

// ---------- Date come testo AAAA-MM-GG (nessun problema di fuso orario) ----------

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function oggi(): string {
  return toISODate(new Date())
}

export function aggiungiGiorni(iso: string, n: number): string {
  const [a, m, g] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, g + n))
  return d.toISOString().slice(0, 10)
}

// Lunedì della settimana del giorno indicato
export function lunedi(iso: string): string {
  const [a, m, g] = iso.split('-').map(Number)
  const giornoSettimana = new Date(Date.UTC(a, m - 1, g)).getUTCDay() // 0 = domenica
  return aggiungiGiorni(iso, -((giornoSettimana + 6) % 7))
}

export function formatData(iso: string, opzioni: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const [a, m, g] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, g).toLocaleDateString('it-IT', opzioni)
}

export function formatDataOra(ts: string): string {
  return new Date(ts).toLocaleString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatOra(ts: string): string {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function formatDurata(minuti: number): string {
  const h = Math.floor(minuti / 60)
  const m = Math.round(minuti % 60)
  return h ? `${h} h ${String(m).padStart(2, '0')}′` : `${m} min`
}

export function nomeMese(chiave: string, lungo = true): string {
  const [a, m] = chiave.split('-').map(Number)
  const s = new Date(a, m - 1, 1).toLocaleDateString('it-IT', lungo ? { month: 'long', year: 'numeric' } : { month: 'short' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// "Fa 3 minuti", "fa 2 ore"
export function quantoTempoFa(ts: string): string {
  const minuti = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (minuti < 1) return 'adesso'
  if (minuti < 60) return `${minuti} min fa`
  const ore = Math.round(minuti / 60)
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`
  const giorni = Math.round(ore / 24)
  return `${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} fa`
}
