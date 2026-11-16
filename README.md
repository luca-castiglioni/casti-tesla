# Casti Tesla

App per il telefono che mostra **ricariche, costi e km della Tesla** usando lo Shelly EM
"Energia wallbox" (canale 1).

| Pezzo | A cosa serve |
|---|---|
| **Shelly EM** + **Cloud Shelly** | misura l'energia della wallbox |
| **Supabase** | database nel cloud, utenti, funzione `leggi_shelly` che ogni 5 minuti legge il contatore dal Cloud Shelly |
| **GitHub Pages** | pubblica l'app (`https://luca-castiglioni.github.io/casti-tesla/`) |

Demo senza database: aggiungi `?demo` all'indirizzo.

## Configurazione (una volta sola)

### 1. Database
1. supabase.com → **New project**, regione **Central EU (Frankfurt)**.
2. **SQL Editor → New query** → incolla `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers** → disattiva *Allow new users to sign up* → Save.
4. **Authentication → Users → Add user → Create new user**, spunta *Auto Confirm User*.
5. Rendi admin il tuo utente (SQL Editor):
   `update public.profiles set is_admin = true where email = 'tua@email.it';`

### 2. Collegamento al Cloud Shelly
1. Nell'app **Shelly** sul telefono: **Impostazioni utente → Chiave di autorizzazione Cloud**.
   Ci sono due valori: l'indirizzo del server (es. `https://shelly-123-eu.shelly.cloud`) e la chiave.
2. Supabase → **Edge Functions → Secrets** → aggiungi:
   - `SHELLY_SERVER` = indirizzo del server
   - `SHELLY_AUTH_KEY` = la chiave
3. Pubblica la funzione (dal Terminale, nella cartella del progetto):
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase functions deploy leggi_shelly --use-api
   ```
4. **SQL Editor** → incolla `supabase/cron.sql` (con URL e chiave publishable al posto dei segnaposto) → **Run**.
   Da quel momento lo Shelly viene letto ogni 5 minuti.

### 3. App in locale
- Copia `.env.example` in `.env.local` e inserisci URL e chiave **publishable/anon**.
- `npm install` poi `npm run dev`.

## Uso
- **Impostazioni → Prezzo del kWh**: aggiungi il prezzo (vale dalla data indicata in poi).
- **Impostazioni → Valori iniziali**: *KM iniziali* e *Kwh ricaricati iniziali* = quanto la Tesla
  aveva percorso e ricaricato prima dello Shelly, più la data di installazione.
- **Km**: ogni tanto scrivi il contachilometri. I km tra due letture vengono divisi tra i giorni in
  proporzione ai kWh ricaricati; dopo l'ultima lettura sono stimati con il consumo medio.

## Telefono
- iPhone: **Safari** → Condividi → *Aggiungi alla schermata Home*.
- Android: **Chrome** → ⋮ → *Installa app*.
