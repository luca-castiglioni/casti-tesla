import { useMemo, useState } from 'react'
import { indici, raggruppa, type Giorno, type Periodo } from '../calcoli'
import { aggiungiGiorni, formatData, formatEuro, formatEuroFine, formatNumero, nomeMese } from '../format'

type Per = 'settimana' | 'mese'
type Misura = 'costo' | 'kwh' | 'costo100km'

const MISURE: Record<Misura, { etichetta: string; colore: string; valore: (p: Periodo) => number; testo: (n: number) => string }> = {
  costo: { etichetta: 'Costo', colore: 'var(--viola)', valore: (p) => p.costo, testo: formatEuro },
  kwh: { etichetta: 'kWh', colore: 'var(--ambra)', valore: (p) => p.kwh, testo: (n) => `${formatNumero(n, 1)} kWh` },
  costo100km: {
    etichetta: '€ / 100 km',
    colore: 'var(--ciano)',
    valore: (p) => indici(p.costo, p.kwh, p.km).costo100km ?? 0,
    testo: formatEuro,
  },
}

const QUANTI = { settimana: 10, mese: 12 }

export function nomePeriodo(p: Periodo, per: Per, breve = false): string {
  if (per === 'mese') return breve ? nomeMese(p.chiave, false) : nomeMese(p.chiave)
  const fine = aggiungiGiorni(p.chiave, 6)
  return breve
    ? formatData(p.chiave, { day: 'numeric', month: 'numeric' })
    : `${formatData(p.chiave, { day: 'numeric', month: 'short' })} – ${formatData(fine, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function Grafici({ giorni }: { giorni: Giorno[] }) {
  const [per, setPer] = useState<Per>('mese')
  const [misura, setMisura] = useState<Misura>('costo')
  const [scelto, setScelto] = useState<string | null>(null)

  const periodi = useMemo(() => raggruppa(giorni, per), [giorni, per])
  const visibili = periodi.slice(-QUANTI[per])
  const m = MISURE[misura]
  const selezionato = visibili.find((p) => p.chiave === scelto) ?? visibili.at(-1)

  return (
    <>
      <header className="testata">
        <h1>Grafici</h1>
      </header>

      <div className="segmenti">
        {(['settimana', 'mese'] as Per[]).map((v) => (
          <button key={v} className={per === v ? 'attivo' : ''} onClick={() => { setPer(v); setScelto(null) }}>
            {v === 'settimana' ? 'Settimane' : 'Mesi'}
          </button>
        ))}
      </div>
      <div className="segmenti piccoli">
        {(Object.keys(MISURE) as Misura[]).map((v) => (
          <button key={v} className={misura === v ? 'attivo' : ''} onClick={() => setMisura(v)}>
            {MISURE[v].etichetta}
          </button>
        ))}
      </div>

      <section className="scheda grafico-contenitore">
        <h2 className="titolo-grafico">
          {m.etichetta} per {per === 'mese' ? 'mese' : 'settimana'}
        </h2>
        {visibili.length ? (
          <GraficoBarre
            periodi={visibili}
            valore={m.valore}
            testo={m.testo}
            colore={m.colore}
            etichetta={(p) => nomePeriodo(p, per, true)}
            scelto={selezionato?.chiave}
            onScegli={setScelto}
          />
        ) : (
          <p className="vuoto">Nessun dato ancora.</p>
        )}
      </section>

      {selezionato && <Dettaglio p={selezionato} titolo={nomePeriodo(selezionato, per)} />}

      <h2 className="titolo-sezione">Tutti i {per === 'mese' ? 'mesi' : 'periodi'}</h2>
      <section className="scheda tabella-contenitore">
        <table className="tabella">
          <thead>
            <tr>
              <th>{per === 'mese' ? 'Mese' : 'Settimana dal'}</th>
              <th>kWh</th>
              <th>Costo</th>
              <th>€/100 km</th>
            </tr>
          </thead>
          <tbody>
            {[...periodi].reverse().map((p) => {
              const i = indici(p.costo, p.kwh, p.km)
              return (
                <tr key={p.chiave} onClick={() => setScelto(p.chiave)} className={p.chiave === selezionato?.chiave ? 'scelta' : ''}>
                  <td>{per === 'mese' ? nomeMese(p.chiave) : formatData(p.chiave)}</td>
                  <td>{formatNumero(p.kwh, 1)}</td>
                  <td>{formatEuro(p.costo)}</td>
                  <td>{i.costo100km !== null ? formatEuro(i.costo100km) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </>
  )
}

function Dettaglio({ p, titolo }: { p: Periodo; titolo: string }) {
  const i = indici(p.costo, p.kwh, p.km)
  return (
    <section className="scheda dettaglio-periodo">
      <h3>{titolo}</h3>
      <div className="dettaglio-griglia">
        <div><small>Costo ricariche</small><strong className="testo-viola">{formatEuro(p.costo)}</strong></div>
        <div><small>Di cui fuori casa</small><strong>{formatEuro(p.costoEsterni)}</strong></div>
        <div><small>kWh ricaricati</small><strong className="testo-ambra">{formatNumero(p.kwh, 1)}</strong></div>
        <div><small>Km percorsi{p.kmStimati ? ' *' : ''}</small><strong className="testo-rosa">{formatNumero(p.km)}</strong></div>
        <div><small>Costo per 100 km</small><strong className="testo-ciano">{i.costo100km !== null ? formatEuro(i.costo100km) : '—'}</strong></div>
        <div><small>Costo al km</small><strong>{i.costoKm !== null ? formatEuroFine(i.costoKm) : '—'}</strong></div>
        <div><small>kWh / 100 km</small><strong>{i.kwh100km !== null ? formatNumero(i.kwh100km, 1) : '—'}</strong></div>
      </div>
      {p.kmStimati && <p className="nota-piccola">* km in parte stimati dal consumo medio</p>}
    </section>
  )
}

interface PropsGrafico {
  periodi: Periodo[]
  valore: (p: Periodo) => number
  testo: (n: number) => string
  colore: string
  etichetta: (p: Periodo) => string
  scelto?: string
  onScegli: (chiave: string) => void
}

// Grafico a barre in SVG: tocca una barra per vederne il dettaglio
function GraficoBarre({ periodi, valore, testo, colore, etichetta, scelto, onScegli }: PropsGrafico) {
  const L = 340
  const H = 190
  const alto = 22 // spazio per l'etichetta del valore
  const basso = 22 // spazio per le etichette dei periodi
  const max = Math.max(...periodi.map(valore), 0) || 1
  const passo = L / periodi.length
  const larghezza = Math.min(26, passo - 4)
  const altezzaUtile = H - alto - basso

  return (
    <svg className="grafico" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Grafico a barre">
      {[0.5, 1].map((f) => (
        <line key={f} x1="0" x2={L} y1={alto + altezzaUtile * (1 - f)} y2={alto + altezzaUtile * (1 - f)} className="griglia" />
      ))}
      <line x1="0" x2={L} y1={alto + altezzaUtile} y2={alto + altezzaUtile} className="asse" />
      {periodi.map((p, i) => {
        const v = valore(p)
        const h = Math.max(v > 0 ? 3 : 0, (v / max) * altezzaUtile)
        const x = i * passo + (passo - larghezza) / 2
        const y = alto + altezzaUtile - h
        const attivo = p.chiave === scelto
        const r = Math.min(4, h / 2, larghezza / 2)
        return (
          <g key={p.chiave} onClick={() => onScegli(p.chiave)} className="barra">
            {/* area di tocco più grande della barra */}
            <rect x={i * passo} y={0} width={passo} height={H} fill="transparent" />
            {h > 0 && (
              <path
                d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + larghezza - r} Q${x + larghezza},${y} ${x + larghezza},${y + r} V${y + h} Z`}
                fill={colore}
                opacity={attivo ? 1 : 0.45}
              />
            )}
            {attivo && (
              <text x={x + larghezza / 2} y={Math.max(14, y - 6)} textAnchor="middle" className="valore-barra">
                {testo(v)}
              </text>
            )}
            <text x={i * passo + passo / 2} y={H - 6} textAnchor="middle" className={`etichetta-asse ${attivo ? 'attiva' : ''}`}>
              {etichetta(p)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
