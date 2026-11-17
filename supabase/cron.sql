-- =====================================================================
-- Lettura automatica dello Shelly ogni 5 minuti.
-- Da eseguire UNA volta in Supabase → SQL Editor, DOPO aver pubblicato
-- la Edge Function "leggi_shelly" e impostato i suoi segreti.
-- Sostituisci <URL_PROGETTO> e <CHIAVE_PUBLISHABLE> (gli stessi di .env.local).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('leggi-shelly')
where exists (select 1 from cron.job where jobname = 'leggi-shelly');

select cron.schedule(
  'leggi-shelly',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<URL_PROGETTO>/functions/v1/leggi_shelly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<CHIAVE_PUBLISHABLE>',
      'Authorization', 'Bearer <CHIAVE_PUBLISHABLE>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Per controllare che giri:  select * from cron.job_run_details order by start_time desc limit 5;
-- Ultime letture salvate:     select * from public.letture order by ts desc limit 5;

-- =====================================================================
-- Collegamento Tesla (MyTeslaMate): ogni 10 minuti.
-- Da eseguire DOPO aver pubblicato la Edge Function "leggi_tesla" e impostato TESLA_TOKEN.
-- Quasi sempre la funzione non fa niente: legge i km solo mentre l'auto carica a casa
-- e lo storico Supercharger una volta al giorno.
-- =====================================================================
select cron.unschedule('leggi-tesla')
where exists (select 1 from cron.job where jobname = 'leggi-tesla');

select cron.schedule(
  'leggi-tesla',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := '<URL_PROGETTO>/functions/v1/leggi_tesla',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<CHIAVE_PUBLISHABLE>',
      'Authorization', 'Bearer <CHIAVE_PUBLISHABLE>'
    ),
    body := '{}'::jsonb
  );
  $$
);
