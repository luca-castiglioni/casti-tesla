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
    esterne: [],
    ultima: null,
    tesla: null,
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
      km: [{ id: '1', data: '2026-11-05', km: 10200, created_by: 'x', fonte: 'manuale' }],
    })
    const g = calcolaGiorni(d, '2026-11-05')
    expect(g).toHaveLength(5)
    expect(g.find((x) => x.giorno === '2026-11-02')!.km).toBeCloseTo(50)
    expect(g.find((x) => x.giorno === '2026-11-04')!.km).toBeCloseTo(150)
    expect(g.find((x) => x.giorno === '2026-11-03')!.km).toBe(0)
  })

  it('non stima i km dopo l\'ultima lettura: contano solo i km reali', () => {
    const d = dati({
      giorni: [
        { giorno: '2026-11-02', kwh: 20 },
        { giorno: '2026-11-07', kwh: 10 },
      ],
      km: [{ id: '1', data: '2026-11-03', km: 10100, created_by: 'x', fonte: 'manuale' }],
    })
    const g = calcolaGiorni(d, '2026-11-08')
    const dopo = g.find((x) => x.giorno === '2026-11-07')!
    expect(dopo.km).toBe(0)
    expect(calcolaTotali(d, g).km).toBe(10100)
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
      km: [{ id: '1', data: '2026-11-03', km: 10100, created_by: 'x', fonte: 'manuale' }],
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

describe('ricariche esterne', () => {
  const esterna = (data: string, kwh: number | null, euro: number) => ({
    id: data, data, tipo: 'supercharger' as const, luogo: null, kwh, euro, fonte: 'manuale' as const, created_by: 'x',
  })

  it('somma importo e kWh fuori casa a quelli di casa', () => {
    const d = dati({
      giorni: [{ giorno: '2026-11-02', kwh: 10 }],
      esterne: [esterna('2026-11-02', 40, 22), esterna('2026-11-03', null, 5), esterna('2026-10-20', 50, 30)],
    })
    const g = calcolaGiorni(d, '2026-11-03')
    const g2 = g.find((x) => x.giorno === '2026-11-02')!
    expect(g2.kwh).toBe(50)
    expect(g2.costo).toBeCloseTo(10 * 0.3 + 22)
    expect(g2.costoEsterni).toBe(22)
    const t = calcolaTotali(d, g)
    expect(t.costoEsterni).toBe(27) // quella prima della data di inizio è ignorata
    expect(t.kwhEsterni).toBe(40)
    expect(raggruppa(g, 'mese')[0].costoEsterni).toBe(27)
  })

  it('divide i km anche sui kWh caricati fuori casa', () => {
    const d = dati({
      giorni: [{ giorno: '2026-11-02', kwh: 10 }],
      esterne: [esterna('2026-11-04', 30, 15)],
      km: [{ id: '1', data: '2026-11-05', km: 10200, created_by: 'x', fonte: 'manuale' }],
    })
    const g = calcolaGiorni(d, '2026-11-05')
    expect(g.find((x) => x.giorno === '2026-11-02')!.km).toBeCloseTo(50)
    expect(g.find((x) => x.giorno === '2026-11-04')!.km).toBeCloseTo(150)
  })
})
