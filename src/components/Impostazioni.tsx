import { useState, type FormEvent } from 'react'
import { prezzoDel, type Giorno } from '../calcoli'
import { scaricaExcel } from '../export'
import { formatData, formatEuroFine, formatNumero, oggi, parseNumero, quantoTempoFa } from '../format'
import { aggiungiPrezzo, cambiaPassword, demo, eliminaPrezzo, provaTesla, salvaImpostazioni, supabase, type EsitoProvaTesla } from '../supabase'
import type { Dati, Profilo } from '../types'
import { IconaCestino, IconaFreccia } from './Icone'
import Utenti from './Utenti'

function CambiaPassword({ email, onIndietro }: { email: string; onIndietro: () => void }) {
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [conferma, setConferma] = useState('')
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function salva(e: FormEvent) {
    e.preventDefault()
    if (nuova.length < 6) return setMessaggio({ ok: false, testo: 'La nuova password deve avere almeno 6 caratteri.' })
    if (nuova !== conferma) return setMessaggio({ ok: false, testo: 'Le due nuove password non coincidono.' })
    setAttesa(true)
    try {
      await cambiaPassword(email, attuale, nuova)
      setAttuale('')
      setNuova('')
      setConferma('')
      setMessaggio({ ok: true, testo: 'Password cambiata.' })
    } catch (err) {
      setMessaggio({ ok: false, testo: (err as Error).message })
    } finally {
      setAttesa(false)
    }
  }

  return (
    <>
      <TestataSottomenu titolo="Cambia password" onIndietro={onIndietro} />
      <form className="scheda modulo" onSubmit={salva}>
        <label>
          Password attuale
          <input type="password" value={attuale} onChange={(e) => setAttuale(e.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          Nuova password
          <input type="password" value={nuova} onChange={(e) => setNuova(e.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          Ripeti la nuova password
          <input type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="new-password" required />
        </label>
        {messaggio && <p className={messaggio.ok ? 'successo' : 'errore'}>{messaggio.testo}</p>}
        <button className="pulsante primario" disabled={attesa}>{attesa ? 'Salvataggio…' : 'Cambia password'}</button>
      </form>
    </>
  )
}

type Sottomenu = null | 'iniziali' | 'prezzi' | 'utenti' | 'password' | 'tesla'

interface Props {
  dati: Dati
  giorni: Giorno[]
  profilo: Profilo | null
  onCambiato: () => Promise<void>
}

export default function Impostazioni({ dati, giorni, profilo, onCambiato }: Props) {
  const [menu, setMenu] = useState<Sottomenu>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const admin = Boolean(profilo?.is_admin)

  if (menu === 'iniziali') return <ValoriIniziali dati={dati} admin={admin} onIndietro={() => setMenu(null)} onCambiato={onCambiato} />
  if (menu === 'prezzi') return <Prezzi dati={dati} admin={admin} onIndietro={() => setMenu(null)} onCambiato={onCambiato} />
  if (menu === 'utenti' && profilo)
    return <Utenti io={profilo} testata={<TestataSottomenu titolo="Utenti" onIndietro={() => setMenu(null)} />} />
  if (menu === 'tesla')
    return <CollegamentoTesla dati={dati} admin={admin} onIndietro={() => setMenu(null)} onCambiato={onCambiato} />
  if (menu === 'password' && profilo)
    return <CambiaPassword email={profilo.email} onIndietro={() => setMenu(null)} />

  const imp = dati.impostazioni
  async function esporta() {
    try {
      await scaricaExcel(dati, giorni)
    } catch (err) {
      setErrore('Esportazione non riuscita: ' + (err as Error).message)
    }
  }

  return (
    <>
      <header className="testata">
        <h1>Impostazioni</h1>
      </header>

      <ul className="scheda menu-voci">
        <li>
          <button onClick={() => setMenu('prezzi')}>
            <span className="bollino viola">€</span>
            <div className="voce-testo">
              <strong>Prezzo del kWh</strong>
              <small>
                {dati.prezzi.length ? `Oggi ${formatEuroFine(prezzoDel(oggi(), dati.prezzi))} al kWh` : 'Non ancora impostato'}
              </small>
            </div>
            <IconaFreccia />
          </button>
        </li>
        <li>
          <button onClick={() => setMenu('iniziali')}>
            <span className="bollino ciano">0</span>
            <div className="voce-testo">
              <strong>Valori iniziali</strong>
              <small>
                {formatNumero(imp.km_iniziali)} km · {formatNumero(imp.kwh_iniziali)} kWh prima dello Shelly
              </small>
            </div>
            <IconaFreccia />
          </button>
        </li>
        <li>
          <button onClick={() => setMenu('tesla')}>
            <span className="bollino rosso">T</span>
            <div className="voce-testo">
              <strong>Collegamento Tesla</strong>
              <small>{testoStatoTesla(dati)}</small>
            </div>
            <IconaFreccia />
          </button>
        </li>
        {admin && (
          <li>
            <button onClick={() => setMenu('utenti')}>
              <span className="bollino rosa">👤</span>
              <div className="voce-testo">
                <strong>Utenti</strong>
                <small>Aggiungi familiari, ruoli</small>
              </div>
              <IconaFreccia />
            </button>
          </li>
        )}
        <li>
          <button onClick={esporta}>
            <span className="bollino verde">⇩</span>
            <div className="voce-testo">
              <strong>Esporta in Excel</strong>
              <small>Mesi, settimane, ricariche (anche fuori casa) e km</small>
            </div>
            <IconaFreccia />
          </button>
        </li>
      </ul>
      {errore && <p className="errore riquadro">{errore}</p>}

      <h2 className="titolo-sezione">Account</h2>
      <section className="scheda account">
        <div className="voce-testo">
          <strong>{profilo?.nome ?? '…'}</strong>
          <small>
            {profilo?.email}
            {admin ? ' · amministratore' : ''}
          </small>
        </div>
        <button className="pulsante piccolo" onClick={() => setMenu('password')}>
          Password
        </button>
        {!demo && (
          <button className="pulsante piccolo" onClick={() => supabase.auth.signOut()}>
            Esci
          </button>
        )}
      </section>
    </>
  )
}

function testoStatoTesla(dati: Dati): string {
  const t = dati.tesla
  if (!t || (!t.ultimo_km && !t.ultimo_storico && !t.ultimo_errore)) return 'Non ancora attivo (MyTeslaMate)'
  if (t.ultimo_errore) return '⚠ ' + t.ultimo_errore
  return t.ultimo_km ? `Km letti ${quantoTempoFa(t.ultimo_km)}` : 'Attivo, in attesa di una ricarica'
}

function CollegamentoTesla({ dati, admin, onIndietro, onCambiato }: { dati: Dati; admin: boolean; onIndietro: () => void; onCambiato: () => Promise<void> }) {
  const [esito, setEsito] = useState<EsitoProvaTesla | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const t = dati.tesla

  async function prova() {
    setAttesa(true)
    setErrore(null)
    setEsito(null)
    try {
      setEsito(await provaTesla())
      await onCambiato()
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setAttesa(false)
    }
  }

  return (
    <>
      <TestataSottomenu titolo="Collegamento Tesla" onIndietro={onIndietro} />
      <p className="spiegazione">
        Tramite MyTeslaMate l'app legge da sola il contachilometri mentre l'auto carica a casa (senza mai svegliarla)
        e, una volta al giorno, le ricariche fatte ai Supercharger con il loro costo.
      </p>
      <ul className="scheda elenco-semplice">
        <li>
          <div className="voce-testo">
            <strong>Ultima lettura km</strong>
            <small>{t?.ultimo_km ? quantoTempoFa(t.ultimo_km) : 'mai'}</small>
          </div>
        </li>
        <li>
          <div className="voce-testo">
            <strong>Ultimo controllo Supercharger</strong>
            <small>{t?.ultimo_storico ? quantoTempoFa(t.ultimo_storico) : 'mai'}</small>
          </div>
        </li>
        {t?.ultimo_errore && (
          <li>
            <div className="voce-testo">
              <strong className="errore">Ultimo problema</strong>
              <small>
                {t.ultimo_errore}
                {t.ultimo_errore_ts ? ` · ${quantoTempoFa(t.ultimo_errore_ts)}` : ''}
              </small>
            </div>
          </li>
        )}
      </ul>

      {admin && (
        <section className="scheda modulo">
          <button className="pulsante primario" onClick={prova} disabled={attesa}>
            {attesa ? 'Prova in corso…' : 'Prova adesso'}
          </button>
          {errore && <p className="errore">{errore}</p>}
          {esito && <EsitoProva e={esito} />}
        </section>
      )}
    </>
  )
}

function EsitoProva({ e }: { e: EsitoProvaTesla }) {
  if (e.attivo === false) return <p className="errore">{e.motivo}</p>
  const righe = [
    `Auto: ${e.stato_auto === 'online' ? 'sveglia' : e.stato_auto === 'asleep' ? 'addormentata' : (e.stato_auto ?? '?')}`,
    e.km != null ? `Contachilometri: ${formatNumero(e.km)} km` : 'Contachilometri: non letto (l\'auto dorme: lo leggerò alla prossima ricarica)',
    e.sessioni_supercharger !== undefined ? `Ricariche Supercharger trovate: ${e.sessioni_supercharger}` : null,
    e.esempio ? `Esempio: ${e.esempio.kwh ?? '?'} kWh, ${e.esempio.euro} ${e.esempio.valuta ?? ''}` : null,
    e.campi_costo?.length ? `Campi costo: ${e.campi_costo.join(', ')}` : null,
  ].filter(Boolean)
  return (
    <div>
      {righe.map((r) => <p key={r} className="successo">{r}</p>)}
      {e.errori?.map((r) => <p key={r} className="errore">{r}</p>)}
    </div>
  )
}

function TestataSottomenu({ titolo, onIndietro }: { titolo: string; onIndietro: () => void }) {
  return (
    <header className="testata">
      <button className="link indietro" onClick={onIndietro}>‹ Impostazioni</button>
      <h1>{titolo}</h1>
    </header>
  )
}

function ValoriIniziali({ dati, admin, onIndietro, onCambiato }: { dati: Dati; admin: boolean; onIndietro: () => void; onCambiato: () => Promise<void> }) {
  const imp = dati.impostazioni
  const [km, setKm] = useState(String(imp.km_iniziali).replace('.', ','))
  const [kwh, setKwh] = useState(String(imp.kwh_iniziali).replace('.', ','))
  const [inizio, setInizio] = useState(imp.data_inizio)
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function salva(e: FormEvent) {
    e.preventDefault()
    const k = parseNumero(km)
    const w = parseNumero(kwh)
    if (Number.isNaN(k) || Number.isNaN(w)) return setMessaggio({ ok: false, testo: 'Scrivi dei numeri, es. 40000 e 6500.' })
    setAttesa(true)
    try {
      await salvaImpostazioni({ km_iniziali: k, kwh_iniziali: w, data_inizio: inizio })
      await onCambiato()
      setMessaggio({ ok: true, testo: 'Salvato.' })
    } catch (err) {
      setMessaggio({ ok: false, testo: (err as Error).message })
    } finally {
      setAttesa(false)
    }
  }

  return (
    <>
      <TestataSottomenu titolo="Valori iniziali" onIndietro={onIndietro} />
      <p className="spiegazione">
        Quello che la Tesla aveva già percorso e ricaricato <strong>prima</strong> di installare lo Shelly. Vengono
        sommati ai dati misurati: i kWh iniziali sono valorizzati con il primo prezzo dello storico.
      </p>
      <form className="scheda modulo" onSubmit={salva}>
        <label>
          KM iniziali
          <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} disabled={!admin} required />
          <small>Contachilometri il giorno dell'installazione</small>
        </label>
        <label>
          Kwh ricaricati iniziali
          <input inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} disabled={!admin} required />
          <small>Totale kWh ricaricati fino a quel giorno (es. dall'app Tesla)</small>
        </label>
        <label>
          Data di installazione dello Shelly
          <input type="date" value={inizio} max={oggi()} onChange={(e) => setInizio(e.target.value)} disabled={!admin} required />
          <small>Le misure dello Shelly contano da questo giorno</small>
        </label>
        {messaggio && <p className={messaggio.ok ? 'successo' : 'errore'}>{messaggio.testo}</p>}
        {admin ? (
          <button className="pulsante primario" disabled={attesa}>{attesa ? 'Salvataggio…' : 'Salva'}</button>
        ) : (
          <p className="nota-piccola">Solo l'amministratore può modificarli.</p>
        )}
      </form>
    </>
  )
}

function Prezzi({ dati, admin, onIndietro, onCambiato }: { dati: Dati; admin: boolean; onIndietro: () => void; onCambiato: () => Promise<void> }) {
  const [dal, setDal] = useState(dati.prezzi.length ? oggi() : dati.impostazioni.data_inizio)
  const [prezzo, setPrezzo] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const elenco = [...dati.prezzi].sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))

  async function salva(e: FormEvent) {
    e.preventDefault()
    const p = parseNumero(prezzo)
    if (Number.isNaN(p) || p <= 0 || p >= 5) return setErrore('Prezzo non valido: scrivilo in euro, es. 0,28.')
    setErrore(null)
    setAttesa(true)
    try {
      await aggiungiPrezzo(dal, p)
      setPrezzo('')
      await onCambiato()
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setAttesa(false)
    }
  }

  async function elimina(id: string) {
    if (!confirm('Eliminare questo prezzo? I costi verranno ricalcolati.')) return
    try {
      await eliminaPrezzo(id)
      await onCambiato()
    } catch (err) {
      setErrore((err as Error).message)
    }
  }

  return (
    <>
      <TestataSottomenu titolo="Prezzo del kWh" onIndietro={onIndietro} />
      <p className="spiegazione">
        Ogni prezzo vale dal giorno indicato fino al prezzo successivo: le ricariche passate restano calcolate con il
        prezzo dell'epoca.
      </p>
      {admin && (
        <form className="scheda modulo" onSubmit={salva}>
          <div className="riga-campi">
            <label>
              Valido dal
              <input type="date" value={dal} onChange={(e) => setDal(e.target.value)} required />
            </label>
            <label>
              € al kWh
              <input inputMode="decimal" placeholder="0,28" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} required />
            </label>
          </div>
          {errore && <p className="errore">{errore}</p>}
          <button className="pulsante primario" disabled={attesa}>{attesa ? 'Salvataggio…' : 'Aggiungi prezzo'}</button>
        </form>
      )}
      <ul className="scheda elenco-semplice">
        {!elenco.length && <li className="tenue">Nessun prezzo inserito.</li>}
        {elenco.map((p) => (
          <li key={p.id}>
            <div className="voce-testo">
              <strong>{formatEuroFine(p.euro_kwh)} / kWh</strong>
              <small>dal {formatData(p.valido_dal, { day: 'numeric', month: 'long', year: 'numeric' })}</small>
            </div>
            {admin && (
              <button className="pulsante-icona" onClick={() => elimina(p.id)} aria-label="Elimina">
                <IconaCestino />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!admin && <p className="nota-piccola">Solo l'amministratore può modificare i prezzi.</p>}
    </>
  )
}
