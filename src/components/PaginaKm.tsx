import { useState, type FormEvent } from 'react'
import { formatData, formatNumero, oggi, parseNumero } from '../format'
import { aggiungiKm, eliminaKm } from '../supabase'
import type { Dati } from '../types'
import { IconaCestino } from './Icone'

interface Props {
  dati: Dati
  userId: string
  admin: boolean
  onCambiato: () => Promise<void>
}

export default function PaginaKm({ dati, userId, admin, onCambiato }: Props) {
  const [data, setData] = useState(oggi())
  const [km, setKm] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  const letture = [...dati.km].sort((a, b) => b.data.localeCompare(a.data) || b.km - a.km)
  const ultimoKm = Math.max(dati.impostazioni.km_iniziali, ...dati.km.map((k) => k.km))

  async function salva(e: FormEvent) {
    e.preventDefault()
    const valore = parseNumero(km)
    if (Number.isNaN(valore)) return setErrore('Scrivi i km come numero, es. 42350.')
    if (valore < ultimoKm) return setErrore(`I km non possono essere meno dell'ultima lettura (${formatNumero(ultimoKm)}).`)
    if (data < dati.impostazioni.data_inizio) return setErrore('La data è prima dell\'installazione dello Shelly.')
    setErrore(null)
    setAttesa(true)
    try {
      await aggiungiKm(data, valore)
      setKm('')
      await onCambiato()
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setAttesa(false)
    }
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questa lettura dei km?')) return
    try {
      await eliminaKm(id)
      await onCambiato()
    } catch (err) {
      setErrore((err as Error).message)
    }
  }

  return (
    <>
      <header className="testata">
        <div>
          <h1>Km percorsi</h1>
          <small>Leggi il contachilometri della Tesla</small>
        </div>
      </header>

      <form className="scheda modulo" onSubmit={salva}>
        <div className="riga-campi">
          <label>
            Data
            <input type="date" value={data} max={oggi()} onChange={(e) => setData(e.target.value)} required />
          </label>
          <label>
            Km totali
            <input
              inputMode="numeric"
              placeholder={formatNumero(ultimoKm)}
              value={km}
              onChange={(e) => setKm(e.target.value)}
              required
            />
          </label>
        </div>
        {errore && <p className="errore">{errore}</p>}
        <button className="pulsante primario" disabled={attesa}>
          {attesa ? 'Salvataggio…' : 'Aggiungi lettura'}
        </button>
      </form>

      <h2 className="titolo-sezione">Letture</h2>
      <ul className="scheda elenco-semplice">
        {letture.map((k) => (
          <li key={k.id}>
            <div className="voce-testo">
              <strong>{formatNumero(k.km)} km</strong>
              <small>{formatData(k.data, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</small>
            </div>
            {(k.created_by === userId || admin) && (
              <button className="pulsante-icona" onClick={() => elimina(k.id)} aria-label="Elimina">
                <IconaCestino />
              </button>
            )}
          </li>
        ))}
        <li className="tenue">
          <div className="voce-testo">
            <strong>{formatNumero(dati.impostazioni.km_iniziali)} km</strong>
            <small>Km iniziali · {formatData(dati.impostazioni.data_inizio)}</small>
          </div>
        </li>
      </ul>
    </>
  )
}
