import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { calcolaGiorni, calcolaTotali } from './calcoli'
import Cruscotto from './components/Cruscotto'
import Grafici from './components/Grafici'
import { IconaCasa, IconaGrafico, IconaFulmine, IconaStrada, IconaIngranaggio } from './components/Icone'
import Impostazioni from './components/Impostazioni'
import Login from './components/Login'
import PaginaKm from './components/PaginaKm'
import Ricariche from './components/Ricariche'
import { aggiornaShelly, caricaDati, caricaProfilo, demo, supabase, supabaseConfigurato } from './supabase'
import type { Dati, Profilo } from './types'

export type Scheda = 'home' | 'grafici' | 'ricariche' | 'km' | 'impostazioni'

const SCHEDE: { id: Scheda; etichetta: string; Icona: () => React.JSX.Element }[] = [
  { id: 'home', etichetta: 'Home', Icona: IconaCasa },
  { id: 'grafici', etichetta: 'Grafici', Icona: IconaGrafico },
  { id: 'ricariche', etichetta: 'Ricariche', Icona: IconaFulmine },
  { id: 'km', etichetta: 'Km', Icona: IconaStrada },
  { id: 'impostazioni', etichetta: 'Impostazioni', Icona: IconaIngranaggio },
]

export default function App() {
  const [sessione, setSessione] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabaseConfigurato || demo) return
    supabase.auth.getSession().then(({ data }) => setSessione(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessione(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (demo) return <Principale userId="demo" />
  if (!supabaseConfigurato) return <DaConfigurare />
  if (sessione === undefined) return <p className="vuoto">Caricamento…</p>
  if (!sessione) return <Login />
  return <Principale userId={sessione.user.id} />
}

function Principale({ userId }: { userId: string }) {
  const [scheda, setScheda] = useState<Scheda>('home')
  const [dati, setDati] = useState<Dati | null>(null)
  const [profilo, setProfilo] = useState<Profilo | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [avvisoShelly, setAvvisoShelly] = useState<string | null>(null)
  const [aggiornamento, setAggiornamento] = useState(false)

  const ricarica = useCallback(async () => {
    try {
      setDati(await caricaDati())
      setErrore(null)
    } catch (err) {
      setErrore('Impossibile caricare i dati: ' + (err as Error).message)
    }
  }, [])

  // Lettura fresca dallo Shelly, poi ricarico i dati
  const aggiorna = useCallback(async () => {
    setAggiornamento(true)
    try {
      await aggiornaShelly()
      setAvvisoShelly(null)
    } catch (err) {
      setAvvisoShelly((err as Error).message)
    }
    await ricarica()
    setAggiornamento(false)
  }, [ricarica])

  useEffect(() => {
    aggiorna()
    caricaProfilo(userId).then(setProfilo).catch(() => setProfilo(null))
  }, [aggiorna, userId])

  // Sulla Home aggiorno la potenza ogni minuto, solo se l'app è in primo piano
  useEffect(() => {
    if (scheda !== 'home') return
    const t = setInterval(() => document.visibilityState === 'visible' && aggiorna(), 60_000)
    return () => clearInterval(t)
  }, [scheda, aggiorna])

  const giorni = useMemo(() => (dati ? calcolaGiorni(dati) : []), [dati])
  const totali = useMemo(() => (dati ? calcolaTotali(dati, giorni) : null), [dati, giorni])
  const admin = Boolean(profilo?.is_admin)

  return (
    <div className="app">
      <div className="sfondo-colori" aria-hidden />
      {demo && <p className="banda-demo">Modalità demo · dati di esempio</p>}
      {errore && <p className="errore riquadro">{errore}</p>}

      {!dati || !totali ? (
        !errore && <p className="vuoto">Caricamento…</p>
      ) : (
        <main className="contenuto">
          {scheda === 'home' && (
            <Cruscotto
              dati={dati}
              giorni={giorni}
              totali={totali}
              avviso={avvisoShelly}
              aggiornamento={aggiornamento}
              onAggiorna={aggiorna}
              onVai={setScheda}
            />
          )}
          {scheda === 'grafici' && <Grafici giorni={giorni} />}
          {scheda === 'ricariche' && <Ricariche dati={dati} userId={userId} admin={admin} onCambiato={ricarica} />}
          {scheda === 'km' && <PaginaKm dati={dati} userId={userId} admin={admin} onCambiato={ricarica} />}
          {scheda === 'impostazioni' && (
            <Impostazioni dati={dati} giorni={giorni} profilo={profilo} onCambiato={ricarica} />
          )}
        </main>
      )}

      <nav className="barra-schede">
        {SCHEDE.map(({ id, etichetta, Icona }) => (
          <button key={id} className={scheda === id ? 'attiva' : ''} onClick={() => setScheda(id)}>
            <Icona />
            <span>{etichetta}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function DaConfigurare() {
  return (
    <main className="schermata-centrale">
      <div className="sfondo-colori" aria-hidden />
      <div className="logo">⚡</div>
      <h1>Casti Tesla</h1>
      <div className="scheda testo">
        <p><strong>Manca il collegamento a Supabase.</strong></p>
        <p>
          Crea il file <code>.env.local</code> copiando <code>.env.example</code> e inserisci URL e chiave
          del progetto Supabase. Poi riavvia l'app.
        </p>
        <a className="pulsante primario" href="?demo">Guarda la demo</a>
      </div>
    </main>
  )
}
