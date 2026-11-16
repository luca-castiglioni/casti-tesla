import { inRicarica, indici, raggruppa, type Giorno, type Totali } from '../calcoli'
import type { Scheda } from '../App'
import {
  formatEuro,
  formatEuroFine,
  formatNumero,
  formatPotenza,
  lunedi,
  oggi,
  quantoTempoFa,
} from '../format'
import type { Dati } from '../types'
import { IconaAggiorna } from './Icone'

interface Props {
  dati: Dati
  giorni: Giorno[]
  totali: Totali
  avviso: string | null
  aggiornamento: boolean
  onAggiorna: () => void
  onVai: (s: Scheda) => void
}

// Potenza massima della wallbox, per riempire l'anello (7,4 kW = 32 A monofase)
const POTENZA_MAX_W = 7400

export default function Cruscotto({ dati, giorni, totali, avviso, aggiornamento, onAggiorna, onVai }: Props) {
  const carica = inRicarica(dati)
  const ultima = dati.ultima
  const potenza = carica && ultima ? ultima.potenza_w : 0
  const frazione = Math.min(1, potenza / POTENZA_MAX_W)
  const circonferenza = 2 * Math.PI * 52

  const meseCorrente = raggruppa(giorni, 'mese').find((p) => p.chiave === oggi().slice(0, 7))
  const settimanaCorrente = raggruppa(giorni, 'settimana').find((p) => p.chiave === lunedi(oggi()))
  const senzaPrezzo = dati.prezzi.length === 0

  return (
    <>
      <header className="testata">
        <div>
          <h1>Casti Tesla</h1>
          <small>Energia wallbox</small>
        </div>
        <button className={`pulsante-tondo ${aggiornamento ? 'gira' : ''}`} onClick={onAggiorna} aria-label="Aggiorna">
          <IconaAggiorna />
        </button>
      </header>

      {senzaPrezzo && (
        <button className="avviso" onClick={() => onVai('impostazioni')}>
          Imposta il prezzo del kWh in Impostazioni per vedere i costi →
        </button>
      )}

      <section className={`scheda live ${carica ? 'in-carica' : ''}`}>
        <svg className="anello" viewBox="0 0 120 120" aria-hidden>
          <defs>
            <linearGradient id="grad-anello" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="52" className="anello-fondo" />
          <circle
            cx="60"
            cy="60"
            r="52"
            className="anello-valore"
            strokeDasharray={`${circonferenza * frazione} ${circonferenza}`}
          />
        </svg>
        <div className="live-testo">
          <span className={`stato ${carica ? 'on' : ''}`}>{carica ? '⚡ In ricarica' : 'Ferma'}</span>
          <strong>{formatPotenza(potenza)}</strong>
          <small>
            {ultima
              ? `${ultima.tensione ? formatNumero(ultima.tensione, 0) + ' V · ' : ''}${quantoTempoFa(ultima.ts)}`
              : 'Nessuna lettura ancora'}
          </small>
        </div>
      </section>
      {avviso && <p className="nota-piccola">⚠ {avviso}</p>}

      <h2 className="titolo-sezione">Dall'inizio</h2>
      <section className="griglia-tessere">
        <Tessera colore="viola" etichetta="Costo totale ricariche" valore={formatEuro(totali.costo)} grande />
        <Tessera
          colore="ciano"
          etichetta="Costo per 100 km"
          valore={totali.costo100km !== null ? formatEuro(totali.costo100km) : '—'}
        />
        <Tessera
          colore="verde"
          etichetta="Costo al km"
          valore={totali.costoKm !== null ? formatEuroFine(totali.costoKm) : '—'}
        />
        <Tessera
          colore="ambra"
          etichetta="kWh ricaricati"
          valore={formatNumero(totali.kwh, 0)}
          nota={totali.kwh100km !== null ? `${formatNumero(totali.kwh100km, 1)} kWh / 100 km` : undefined}
        />
        <Tessera colore="rosa" etichetta="Km percorsi" valore={formatNumero(totali.km, 0)} />
      </section>
      {totali.kmStimati > 1 && (
        <p className="nota-piccola">
          Di cui {formatNumero(totali.kmStimati)} km stimati dai consumi:{' '}
          <button className="link" onClick={() => onVai('km')}>aggiorna il contachilometri</button>
        </p>
      )}

      <section className="riga-periodi">
        <MiniPeriodo titolo="Questa settimana" p={settimanaCorrente} onClick={() => onVai('grafici')} />
        <MiniPeriodo titolo="Questo mese" p={meseCorrente} onClick={() => onVai('grafici')} />
      </section>
    </>
  )
}

function Tessera({ colore, etichetta, valore, grande, nota }: { colore: string; etichetta: string; valore: string; grande?: boolean; nota?: string }) {
  return (
    <div className={`tessera ${colore} ${grande ? 'grande' : ''}`}>
      <small>{etichetta}</small>
      <strong>{valore}</strong>
      {nota && <span className="nota-tessera">{nota}</span>}
    </div>
  )
}

function MiniPeriodo({ titolo, p, onClick }: { titolo: string; p?: { costo: number; kwh: number; km: number }; onClick: () => void }) {
  const i = p ? indici(p.costo, p.kwh, p.km) : null
  return (
    <button className="scheda mini-periodo" onClick={onClick}>
      <small>{titolo}</small>
      <strong>{formatEuro(p?.costo ?? 0)}</strong>
      <span>
        {formatNumero(p?.kwh ?? 0, 1)} kWh · {formatNumero(p?.km ?? 0)} km
      </span>
      <span className="tenue">{i?.costo100km != null ? `${formatEuro(i.costo100km)} / 100 km` : '—'}</span>
    </button>
  )
}
