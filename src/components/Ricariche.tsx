import { useState, type FormEvent } from 'react'
import { costoRicarica } from '../calcoli'
import {
  formatData,
  formatDataOra,
  formatDurata,
  formatEuro,
  formatEuroFine,
  formatNumero,
  formatOra,
  formatPotenza,
  nomeMese,
  oggi,
  parseNumero,
} from '../format'
import { aggiungiEsterna, eliminaEsterna } from '../supabase'
import type { Dati, Ricarica, RicaricaEsterna } from '../types'
import { IconaCestino } from './Icone'

interface Props {
  dati: Dati
  userId: string
  admin: boolean
  onCambiato: () => Promise<void>
}

// Una voce dell'elenco: ricarica di casa (Shelly) oppure fuori casa
type Voce =
  | { tipo: 'casa'; quando: string; mese: string; r: Ricarica; costo: number; kwh: number }
  | { tipo: 'esterna'; quando: string; mese: string; r: RicaricaEsterna; costo: number; kwh: number }

export default function Ricariche({ dati, userId, admin, onCambiato }: Props) {
  const [modulo, setModulo] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const voci: Voce[] = [
    ...dati.ricariche.map((r): Voce => {
      const giorno = new Date(r.inizio).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
      return { tipo: 'casa', quando: r.inizio, mese: giorno.slice(0, 7), r, costo: costoRicarica(r, dati.prezzi), kwh: r.kwh }
    }),
    ...dati.esterne
      .filter((r) => r.data >= dati.impostazioni.data_inizio)
      .map((r): Voce => ({ tipo: 'esterna', quando: `${r.data}T12:00:00`, mese: r.data.slice(0, 7), r, costo: r.euro, kwh: r.kwh ?? 0 })),
  ].sort((a, b) => b.quando.localeCompare(a.quando))

  const perMese = new Map<string, Voce[]>()
  for (const v of voci) perMese.set(v.mese, [...(perMese.get(v.mese) ?? []), v])

  async function elimina(id: string) {
    if (!confirm('Eliminare questa ricarica fuori casa?')) return
    try {
      await eliminaEsterna(id)
      await onCambiato()
    } catch (err) {
      setErrore((err as Error).message)
    }
  }

  return (
    <>
      <header className="testata">
        <div>
          <h1>Ricariche</h1>
          <small>Casa in automatico dallo Shelly · fuori casa a mano o da Tesla</small>
        </div>
      </header>

      {modulo ? (
        <NuovaEsterna
          dati={dati}
          onChiudi={() => setModulo(false)}
          onSalvata={async () => {
            setModulo(false)
            await onCambiato()
          }}
        />
      ) : (
        <button className="pulsante primario largo" onClick={() => setModulo(true)}>
          + Ricarica fuori casa
        </button>
      )}
      {errore && <p className="errore riquadro">{errore}</p>}

      {!voci.length && <p className="vuoto">Nessuna ricarica registrata finora.</p>}

      {[...perMese].map(([mese, elenco]) => {
        const kwh = elenco.reduce((s, v) => s + v.kwh, 0)
        const costo = elenco.reduce((s, v) => s + v.costo, 0)
        return (
          <section key={mese}>
            <h2 className="titolo-mese">
              <span>{nomeMese(mese)}</span>
              <span className="tenue">
                {elenco.length} · {formatNumero(kwh, 1)} kWh · {formatEuro(costo)}
              </span>
            </h2>
            <ul className="scheda elenco-ricariche">
              {elenco.map((v) =>
                v.tipo === 'casa' ? (
                  <VoceCasa key={v.quando} r={v.r} costo={v.costo} />
                ) : (
                  <VoceEsterna
                    key={v.r.id}
                    r={v.r}
                    eliminabile={v.r.created_by === userId || admin}
                    onElimina={() => elimina(v.r.id)}
                  />
                ),
              )}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function VoceCasa({ r, costo }: { r: Ricarica; costo: number }) {
  const minuti = (new Date(r.fine).getTime() - new Date(r.inizio).getTime()) / 60000
  return (
    <li>
      <span className="bollino">⚡</span>
      <div className="voce-testo">
        <strong>{formatDataOra(r.inizio)}</strong>
        <small>
          Casa · fino alle {formatOra(r.fine)} · {formatDurata(minuti)} · max {formatPotenza(r.potenza_max_w)}
        </small>
      </div>
      <div className="voce-valori">
        <strong>{formatEuro(costo)}</strong>
        <small>{formatNumero(r.kwh, 1)} kWh</small>
      </div>
    </li>
  )
}

function VoceEsterna({ r, eliminabile, onElimina }: { r: RicaricaEsterna; eliminabile: boolean; onElimina: () => void }) {
  const supercharger = r.tipo === 'supercharger'
  const dettagli = [
    formatData(r.data, { weekday: 'short', day: 'numeric', month: 'short' }),
    r.kwh ? `${formatEuroFine(r.euro / r.kwh)}/kWh` : null,
    r.fonte === 'tesla' ? 'da Tesla' : null,
  ].filter(Boolean)
  return (
    <li>
      <span className={`bollino ${supercharger ? 'rosso' : 'ambra'}`}>{supercharger ? 'S' : '🔌'}</span>
      <div className="voce-testo">
        <strong>{r.luogo || (supercharger ? 'Supercharger' : 'Colonnina esterna')}</strong>
        <small>{dettagli.join(' · ')}</small>
      </div>
      <div className="voce-valori">
        <strong>{formatEuro(r.euro)}</strong>
        <small>{r.kwh !== null ? `${formatNumero(r.kwh, 1)} kWh` : 'kWh ?'}</small>
      </div>
      {eliminabile && (
        <button className="pulsante-icona" onClick={onElimina} aria-label="Elimina">
          <IconaCestino />
        </button>
      )}
    </li>
  )
}

function NuovaEsterna({ dati, onChiudi, onSalvata }: { dati: Dati; onChiudi: () => void; onSalvata: () => Promise<void> }) {
  const [tipo, setTipo] = useState<RicaricaEsterna['tipo']>('supercharger')
  const [data, setData] = useState(oggi())
  const [euro, setEuro] = useState('')
  const [kwh, setKwh] = useState('')
  const [luogo, setLuogo] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function salva(e: FormEvent) {
    e.preventDefault()
    const importo = parseNumero(euro)
    const energia = kwh.trim() ? parseNumero(kwh) : null
    if (Number.isNaN(importo)) return setErrore('Scrivi l\'importo come numero, es. 18,40.')
    if (energia !== null && (Number.isNaN(energia) || energia <= 0)) return setErrore('Scrivi i kWh come numero, es. 35,2 (oppure lascia vuoto).')
    if (data < dati.impostazioni.data_inizio) return setErrore('La data è prima dell\'inizio dei conteggi.')
    setErrore(null)
    setAttesa(true)
    try {
      await aggiungiEsterna({ data, tipo, luogo: luogo.trim() || null, kwh: energia, euro: importo })
      await onSalvata()
    } catch (err) {
      setErrore((err as Error).message)
      setAttesa(false)
    }
  }

  return (
    <form className="scheda modulo" onSubmit={salva}>
      <div className="segmenti piccoli">
        <button type="button" className={tipo === 'supercharger' ? 'attivo' : ''} onClick={() => setTipo('supercharger')}>
          Supercharger
        </button>
        <button type="button" className={tipo === 'altra' ? 'attivo' : ''} onClick={() => setTipo('altra')}>
          Altra colonnina
        </button>
      </div>
      <div className="riga-campi">
        <label>
          Data
          <input type="date" value={data} min={dati.impostazioni.data_inizio} max={oggi()} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Pagato €
          <input inputMode="decimal" placeholder="18,40" value={euro} onChange={(e) => setEuro(e.target.value)} required />
        </label>
      </div>
      <div className="riga-campi">
        <label>
          kWh <span className="tenue">(se li sai)</span>
          <input inputMode="decimal" placeholder="35,2" value={kwh} onChange={(e) => setKwh(e.target.value)} />
        </label>
        <label>
          Dove <span className="tenue">(facoltativo)</span>
          <input placeholder={tipo === 'supercharger' ? 'Supercharger Milano' : 'Enel X Bergamo'} value={luogo} onChange={(e) => setLuogo(e.target.value)} />
        </label>
      </div>
      {errore && <p className="errore">{errore}</p>}
      <div className="riga-pulsanti">
        <button type="button" className="pulsante" onClick={onChiudi}>Annulla</button>
        <button className="pulsante primario" disabled={attesa}>{attesa ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </form>
  )
}
