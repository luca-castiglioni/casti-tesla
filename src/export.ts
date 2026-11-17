import { costoRicarica, indici, raggruppa, type Giorno, type Periodo } from './calcoli'
import { oggi } from './format'
import type { Dati } from './types'

function data(iso: string): Date {
  const [a, m, g] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, g))
}

// Crea il file Excel con mesi, settimane, ricariche e km, e lo fa scaricare
export async function scaricaExcel(dati: Dati, giorni: Giorno[]) {
  const { default: ExcelJS } = await import('exceljs') // libreria grande: caricata solo quando serve
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Casti Tesla'
  wb.created = new Date()

  type Colonna = { name: string; larghezza: number; formato?: string }
  function foglio(nome: string, colonne: Colonna[], righe: unknown[][]) {
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
    if (!righe.length) righe = [colonne.map(() => '')]
    ws.addTable({
      name: nome.replace(/\W/g, ''),
      ref: 'A1',
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: colonne.map((c) => ({ name: c.name, filterButton: true })),
      rows: righe,
    })
    colonne.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.larghezza
      if (c.formato) ws.getColumn(i + 1).numFmt = c.formato
    })
  }

  const colonnePeriodo = (prima: string): Colonna[] => [
    { name: prima, larghezza: 14, formato: 'dd/mm/yyyy' },
    { name: 'kWh', larghezza: 10, formato: '0.0' },
    { name: 'Costo €', larghezza: 12, formato: '#,##0.00' },
    { name: 'Di cui fuori casa €', larghezza: 18, formato: '#,##0.00' },
    { name: 'Km', larghezza: 10, formato: '0' },
    { name: '€/km', larghezza: 10, formato: '0.000' },
    { name: '€/100 km', larghezza: 12, formato: '#,##0.00' },
    { name: 'kWh/100 km', larghezza: 12, formato: '0.0' },
    { name: 'Km stimati', larghezza: 11 },
  ]
  const rigaPeriodo = (p: Periodo, inizio: string) => {
    const i = indici(p.costo, p.kwh, p.km)
    return [data(inizio), p.kwh, p.costo, p.costoEsterni, p.km, i.costoKm ?? '', i.costo100km ?? '', i.kwh100km ?? '', p.kmStimati ? 'sì' : '']
  }

  foglio('Mesi', colonnePeriodo('Mese'), raggruppa(giorni, 'mese').map((p) => rigaPeriodo(p, `${p.chiave}-01`)))
  foglio('Settimane', colonnePeriodo('Settimana dal'), raggruppa(giorni, 'settimana').map((p) => rigaPeriodo(p, p.chiave)))
  foglio(
    'Ricariche',
    [
      { name: 'Inizio', larghezza: 18, formato: 'dd/mm/yyyy hh:mm' },
      { name: 'Fine', larghezza: 18, formato: 'dd/mm/yyyy hh:mm' },
      { name: 'kWh', larghezza: 10, formato: '0.00' },
      { name: 'Costo €', larghezza: 12, formato: '#,##0.00' },
      { name: 'Potenza max W', larghezza: 15, formato: '0' },
    ],
    [...dati.ricariche].reverse().map((r) => [
      oraLocale(r.inizio),
      oraLocale(r.fine),
      r.kwh,
      costoRicarica(r, dati.prezzi),
      r.potenza_max_w,
    ]),
  )
  foglio(
    'Fuori casa',
    [
      { name: 'Data', larghezza: 14, formato: 'dd/mm/yyyy' },
      { name: 'Tipo', larghezza: 14 },
      { name: 'Luogo', larghezza: 26 },
      { name: 'kWh', larghezza: 10, formato: '0.00' },
      { name: 'Costo €', larghezza: 12, formato: '#,##0.00' },
      { name: 'Fonte', larghezza: 10 },
    ],
    [...dati.esterne].reverse().map((r) => [
      data(r.data),
      r.tipo === 'supercharger' ? 'Supercharger' : 'Altra',
      r.luogo ?? '',
      r.kwh ?? '',
      r.euro,
      r.fonte === 'tesla' ? 'Tesla' : 'A mano',
    ]),
  )
  foglio(
    'Km',
    [
      { name: 'Data', larghezza: 14, formato: 'dd/mm/yyyy' },
      { name: 'Km', larghezza: 12, formato: '0' },
    ],
    [[data(dati.impostazioni.data_inizio), dati.impostazioni.km_iniziali], ...dati.km.map((k) => [data(k.data), k.km])],
  )

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `casti-tesla-${oggi()}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Excel non conosce i fusi orari: scrivo l'ora italiana come se fosse UTC
function oraLocale(ts: string): Date {
  const s = new Date(ts).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' })
  return new Date(s.replace(' ', 'T') + 'Z')
}
