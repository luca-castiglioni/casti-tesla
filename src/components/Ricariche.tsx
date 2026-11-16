import { costoRicarica } from '../calcoli'
import { formatDataOra, formatDurata, formatEuro, formatNumero, formatOra, formatPotenza, nomeMese } from '../format'
import type { Dati, Ricarica } from '../types'

export default function Ricariche({ dati }: { dati: Dati }) {
  // raggruppo per mese (ora italiana)
  const perMese = new Map<string, Ricarica[]>()
  for (const r of dati.ricariche) {
    const mese = new Date(r.inizio).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 7)
    perMese.set(mese, [...(perMese.get(mese) ?? []), r])
  }

  return (
    <>
      <header className="testata">
        <div>
          <h1>Ricariche</h1>
          <small>Riconosciute in automatico dallo Shelly</small>
        </div>
      </header>

      {!dati.ricariche.length && <p className="vuoto">Nessuna ricarica registrata finora.</p>}

      {[...perMese].map(([mese, elenco]) => {
        const kwh = elenco.reduce((s, r) => s + r.kwh, 0)
        const costo = elenco.reduce((s, r) => s + costoRicarica(r, dati.prezzi), 0)
        return (
          <section key={mese}>
            <h2 className="titolo-mese">
              <span>{nomeMese(mese)}</span>
              <span className="tenue">
                {elenco.length} · {formatNumero(kwh, 1)} kWh · {formatEuro(costo)}
              </span>
            </h2>
            <ul className="scheda elenco-ricariche">
              {elenco.map((r) => {
                const minuti = (new Date(r.fine).getTime() - new Date(r.inizio).getTime()) / 60000
                return (
                  <li key={r.inizio}>
                    <span className="bollino">⚡</span>
                    <div className="voce-testo">
                      <strong>{formatDataOra(r.inizio)}</strong>
                      <small>
                        fino alle {formatOra(r.fine)} · {formatDurata(minuti)} · max {formatPotenza(r.potenza_max_w)}
                      </small>
                    </div>
                    <div className="voce-valori">
                      <strong>{formatEuro(costoRicarica(r, dati.prezzi))}</strong>
                      <small>{formatNumero(r.kwh, 1)} kWh</small>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}
