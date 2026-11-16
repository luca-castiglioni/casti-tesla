import { describe, expect, it } from 'vitest'
import { calcolaGiorni, calcolaTotali, prezzoDel, raggruppa } from './calcoli'
import type { Dati } from './types'

function dati(parziali: Partial<Dati> = {}): Dati {
  return {
    impostazioni: { km_iniziali: 10000, kwh_iniziali: 1800, data_inizio: '2026-11-01' },
    prezzi: [
      { id: 'a', valido_dal: '2026-11-01', euro_kwh: 0.3 },
      { id: 'b', valido_dal: '2026-11-10', euro_kwh: 0.2 },
    ],
    km: [],
    giorni: [],
    ricariche: [],
    ultima: null,
    ...parziali,
  }
}

describe('prezzoDel', () => {
  it('usa il prezzo in vigore e il primo prima di ogni prezzo', () => {
    const p = dati().prezzi
    expect(prezzoDel('2026-10-01', p)).toBe(0.3)
    expect(prezzoDel('2026-11-09', p)).toBe(0.3)
    expect(prezzoDel('2026-11-10', p)).toBe(0.2)
    expect(prezzoDel('2026-11-10', [])).toBe(0)
  })
})

describe('calcolaGiorni', () => {
  it('divide i km tra due letture in proporzione ai kWh', () => {
    const d = dati({
      giorni: [
        { giorno: '2026-11-02', kwh: 10 },
        { giorno: '2026-11-04', kwh: 30 },
      ],
      km: [{ id: '1', data: '2026-11-05', km: 10200, created_by: 'x' }],
    })
    const g = calcolaGiorni(d, '2026-11-05')
    expect(g).toHaveLength(5)
    expect(g.find((x) => x.giorno === '2026-11-02')!.km).toBeCloseTo(50)
    expect(g.find((x) => x.giorno === '2026-11-04')!.km).toBeCloseTo(150)
    expect(g.find((x) => x.giorno === '2026-11-03')!.km).toBe(0)
  })

  it('stima i km dopo l\'ultima lettura con il consumo medio', () => {
    const d = dati({
      giorni: [
        { giorno: '2026-11-02', kwh: 20 },
        { giorno: '2026-11-07', kwh: 10 },
      ],
      km: [{ id: '1', data: '2026-11-03', km: 10100, created_by: 'x' }],
    })
    const g = calcolaGiorni(d, '2026-11-08')
    const dopo = g.find((x) => x.giorno === '2026-11-07')!
    expect(dopo.km).toBeCloseTo(50) // 100 km / 20 kWh × 10 kWh
    expect(dopo.kmStimati).toBe(true)
  })

  it('applica il prezzo del giorno e ignora i consumi prima dell\'inizio', () => {
    const d = dati({
      giorni: [
        { giorno: '2026-10-30', kwh: 99 },
        { giorno: '2026-11-09', kwh: 10 },
        { giorno: '2026-11-10', kwh: 10 },
      ],
    })
    const g = calcolaGiorni(d, '2026-11-10')
    expect(g.reduce((s, x) => s + x.kwh, 0)).toBe(20)
    expect(g.reduce((s, x) => s + x.costo, 0)).toBeCloseTo(5)
  })
})

describe('totali e periodi', () => {
  it('somma i valori iniziali al primo prezzo', () => {
    const d = dati({
      giorni: [{ giorno: '2026-11-02', kwh: 20 }],
      km: [{ id: '1', data: '2026-11-03', km: 10100, created_by: 'x' }],
    })
    const g = calcolaGiorni(d, '2026-11-03')
    const t = calcolaTotali(d, g)
    expect(t.kwh).toBe(1820)
    expect(t.costo).toBeCloseTo(1820 * 0.3)
    expect(t.km).toBeCloseTo(10100)
    expect(t.costo100km).toBeCloseTo((546 / 10100) * 100)
  })

  it('raggruppa per settimana (dal lunedì) e per mese', () => {
    const d = dati({ giorni: [{ giorno: '2026-11-01', kwh: 5 }, { giorno: '2026-11-02', kwh: 7 }] })
    const g = calcolaGiorni(d, '2026-11-02')
    const sett = raggruppa(g, 'settimana')
    expect(sett.map((s) => s.chiave)).toEqual(['2026-10-26', '2026-11-02'])
    expect(raggruppa(g, 'mese')[0].kwh).toBe(12)
  })
})
