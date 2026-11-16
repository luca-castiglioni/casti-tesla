// Dati inventati per provare l'app senza database (indirizzo con ?demo)
import { aggiungiGiorni, oggi } from './format'
import type { ConsumoGiorno, Dati, LetturaKm, Ricarica } from './types'

export function creaDatiDemo(): Dati {
  const fine = oggi()
  const inizio = aggiungiGiorni(fine, -120)
  let seme = 7
  const caso = () => ((seme = (seme * 16807) % 2147483647) / 2147483647)

  const giorni: ConsumoGiorno[] = []
  const ricariche: Ricarica[] = []
  const km: LetturaKm[] = []
  let contachilometri = 18_400
  for (let g = aggiungiGiorni(inizio, 1); g <= fine; g = aggiungiGiorni(g, 1)) {
    if (caso() < 0.4) {
      const kwh = Math.round((8 + caso() * 30) * 10) / 10
      contachilometri += kwh * (5.6 + caso() * 0.8) // circa 16 kWh / 100 km
      giorni.push({ giorno: g, kwh })
      const partenza = new Date(`${g}T${String(19 + Math.floor(caso() * 4)).padStart(2, '0')}:10:00`)
      const fineRicarica = new Date(partenza.getTime() + (kwh / 7.2) * 3600_000)
      ricariche.push({ inizio: partenza.toISOString(), fine: fineRicarica.toISOString(), kwh, potenza_max_w: 7150 + caso() * 150 })
    }
    if (g.endsWith('-01') || g.endsWith('-15')) {
      km.push({ id: crypto.randomUUID(), data: g, km: Math.round(contachilometri), created_by: 'demo' })
    }
  }
  ricariche.reverse()
  return {
    impostazioni: { km_iniziali: 18_400, kwh_iniziali: 3_150, data_inizio: inizio },
    prezzi: [
      { id: crypto.randomUUID(), valido_dal: inizio, euro_kwh: 0.31 },
      { id: crypto.randomUUID(), valido_dal: aggiungiGiorni(fine, -50), euro_kwh: 0.27 },
    ],
    km,
    giorni,
    ricariche,
    ultima: { ts: new Date().toISOString(), totale_wh: 4_730_900, potenza_w: 7177, tensione: 218.6 },
  }
}
