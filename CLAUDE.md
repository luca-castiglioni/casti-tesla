# Casti Tesla

Web app mobile (PWA) per monitorare le ricariche domestiche della Tesla di Luca: costi per
settimana/mese, costo al km e per 100 km. L'utente (Luca) è alle prime armi: spiega in italiano,
in modo semplice, un passo alla volta. Metodo e passi di pubblicazione: skill `casti-app`.

## Stack
- Vite + React 19 + TypeScript, CSS semplice in `src/styles.css` (tema scuro colorato, niente librerie di grafici: SVG a mano)
- Supabase: Auth email+password (registrazioni chiuse), Postgres con RLS, Edge Function `leggi_shelly`, pg_cron + pg_net
- GitHub Pages (`base: './'`), workflow `.github/workflows/deploy.yml`

## Comandi
- `npm run dev` — locale (porta 5174 con `.claude/launch.json`); `?demo` = dati inventati senza database
- `npm run build` — controllo tipi + build
- `npm test` — test dei calcoli (`src/calcoli.test.ts`)
- `supabase functions deploy <nome> --remote=oqedsmomrbmdbbzooafd --use-api --yes` — pubblica una Edge Function (`leggi_shelly`, `gestisci_utenti`)

## Come arrivano i dati
- Shelly EM Gen1 `192.168.1.68`, nome "Energia wallbox", id cloud `c4d8d5001868`, canale 1 (indice 0) = wallbox.
- Dal browser non si legge lo Shelly in locale (http + niente CORS). MQTT scartato: sui Gen1 disattiva il Cloud Shelly.
- `leggi_shelly` chiama `POST {SHELLY_SERVER}/device/status` (API cloud v1) e salva `emeters[0].total` (Wh, contatore) in `letture`.
  La chiama pg_cron ogni 5 min (`supabase/cron.sql`) e l'app all'apertura/ogni minuto sulla Home (rate limit 30 s nella funzione).
- Segreti della funzione: `SHELLY_SERVER`, `SHELLY_AUTH_KEY`, facoltativo `SHELLY_DEVICE_ID`.

## Regole di calcolo (`src/calcoli.ts`)
- Energia = differenze del contatore (`letture_delta`); se il contatore cala si considera ripartito da zero.
- Viste: `consumi_giornalieri` (ora italiana), `ricariche` (letture con potenza > 300 W o > 10 Wh, pause ≤ 20 min).
- Prezzo: storico `prezzi.valido_dal`; vale l'ultimo non successivo; prima del primo vale il primo (anche per i kWh iniziali).
- Valori iniziali (`impostazioni`, una riga): `km_iniziali` = contachilometri all'installazione, `kwh_iniziali`, `data_inizio`
  (i consumi prima di questa data sono ignorati).
- Km per giorno: tra due letture del contachilometri divisi in proporzione ai kWh; dopo l'ultima stimati con km/kWh medio (`kmStimati`).
- Si contano solo le ricariche di casa (niente Supercharger).

## Permessi (RLS)
- Tutti gli utenti collegati vedono tutto. `letture` le scrive solo la Edge Function (service key).
- Utenti: li gestisce l'admin dall'app (Impostazioni → Utenti) tramite la Edge Function `gestisci_utenti` (crea, elimina, ruolo admin). Ognuno cambia la propria password in Impostazioni.
- `km`: tutti inseriscono; modifica/elimina chi l'ha inserito o l'admin. `prezzi` e `impostazioni`: solo admin.

## Sicurezza
- Mai committare `.env.local`. Nell'app solo la chiave anon/publishable; la chiave Shelly solo nei segreti della funzione.
- Modifiche allo schema: aggiorna `supabase/schema.sql` (rieseguibile) e dai a Luca la query da eseguire.
