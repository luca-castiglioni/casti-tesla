import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { caricaUtenti, creaUtente, eliminaUtente, impostaAdmin } from '../supabase'
import type { Profilo } from '../types'
import { IconaCestino } from './Icone'

// Sottomenu "Utenti" (solo amministratore): elenco, aggiunta, ruolo, eliminazione
export default function Utenti({ io, testata }: { io: Profilo; testata: React.ReactNode }) {
  const [utenti, setUtenti] = useState<Profilo[]>([])
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [password, setPassword] = useState('')
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null)
  const [attesa, setAttesa] = useState(false)

  const ricarica = useCallback(async () => {
    try {
      setUtenti(await caricaUtenti())
    } catch (err) {
      setMessaggio({ ok: false, testo: (err as Error).message })
    }
  }, [])
  useEffect(() => void ricarica(), [ricarica])

  async function esegui(azione: () => Promise<void>, ok: string) {
    setMessaggio(null)
    setAttesa(true)
    try {
      await azione()
      await ricarica()
      setMessaggio({ ok: true, testo: ok })
      return true
    } catch (err) {
      setMessaggio({ ok: false, testo: (err as Error).message })
      return false
    } finally {
      setAttesa(false)
    }
  }

  async function aggiungi(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setMessaggio({ ok: false, testo: 'La password deve avere almeno 6 caratteri.' })
    const fatto = await esegui(
      () => creaUtente(email.trim(), password, nome.trim()),
      `Utente creato. Comunica a ${nome.trim() || email.trim()} email e password: potrà cambiarla in Impostazioni.`,
    )
    if (fatto) {
      setEmail('')
      setNome('')
      setPassword('')
    }
  }

  function elimina(u: Profilo) {
    if (!confirm(`Eliminare l'utente ${u.nome ?? u.email}? Non potrà più accedere.`)) return
    esegui(() => eliminaUtente(u.id), 'Utente eliminato.')
  }

  function cambiaRuolo(u: Profilo) {
    const testo = u.is_admin ? `Togliere a ${u.nome ?? u.email} il ruolo di amministratore?` : `Rendere ${u.nome ?? u.email} amministratore? Potrà cambiare prezzi, valori iniziali e utenti.`
    if (!confirm(testo)) return
    esegui(() => impostaAdmin(u.id, !u.is_admin), 'Ruolo aggiornato.')
  }

  return (
    <>
      {testata}
      <p className="spiegazione">
        Gli utenti vedono tutti i dati e possono inserire i km. Prezzi, valori iniziali e utenti li gestisce solo
        l'amministratore.
      </p>

      <form className="scheda modulo" onSubmit={aggiungi}>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Marta" autoComplete="off" />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </label>
        <label>
          Password iniziale
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            autoCapitalize="none"
          />
          <small>Almeno 6 caratteri: l'utente potrà cambiarla dopo il primo accesso</small>
        </label>
        {messaggio && <p className={messaggio.ok ? 'successo' : 'errore'}>{messaggio.testo}</p>}
        <button className="pulsante primario" disabled={attesa}>
          {attesa ? 'Attendi…' : 'Aggiungi utente'}
        </button>
      </form>

      <h2 className="titolo-sezione">Utenti ({utenti.length})</h2>
      <ul className="scheda elenco-semplice">
        {utenti.map((u) => (
          <li key={u.id}>
            <div className="voce-testo">
              <strong>
                {u.nome ?? u.email}
                {u.id === io.id ? ' (tu)' : ''}
              </strong>
              <small>{u.email}</small>
            </div>
            {u.id === io.id ? (
              <span className="etichetta-ruolo admin">Admin</span>
            ) : (
              <>
                <button className={`etichetta-ruolo ${u.is_admin ? 'admin' : ''}`} onClick={() => cambiaRuolo(u)} disabled={attesa}>
                  {u.is_admin ? 'Admin' : 'Utente'}
                </button>
                <button className="pulsante-icona" onClick={() => elimina(u)} disabled={attesa} aria-label="Elimina utente">
                  <IconaCestino />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
