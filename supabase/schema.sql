-- =====================================================================
-- Casti Tesla — schema del database
-- Da eseguire in Supabase → SQL Editor → New query → Run (si può rieseguire).
--
-- Permessi:
--   * tutti gli utenti collegati VEDONO tutto
--   * letture dello Shelly: le scrive SOLO la Edge Function "leggi_shelly"
--     (con la chiave di servizio), nessun utente può modificarle
--   * letture dei km: le aggiunge chiunque; modifica/elimina chi le ha
--     inserite oppure l'amministratore
--   * prezzi e valori iniziali: solo l'amministratore
-- =====================================================================

-- ---------- Profili ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  nome       text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

insert into public.profiles (id, email, nome)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------- Letture dello Shelly (automatiche) ----------
-- totale_wh = contatore dell'energia del canale 1 (wallbox), cresce sempre;
-- se lo Shelly lo azzera (es. aggiornamento firmware) i calcoli lo gestiscono.
create table if not exists public.letture (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null default now(),
  totale_wh numeric not null check (totale_wh >= 0),
  potenza_w numeric not null default 0,
  tensione  numeric
);
create index if not exists letture_ts on public.letture (ts);

-- ---------- Prezzi del kWh (storico) ----------
create table if not exists public.prezzi (
  id         uuid primary key default gen_random_uuid(),
  valido_dal date not null unique,
  euro_kwh   numeric not null check (euro_kwh > 0 and euro_kwh < 5),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- Letture del contachilometri (a mano) ----------
create table if not exists public.km (
  id         uuid primary key default gen_random_uuid(),
  data       date not null,
  km         numeric not null check (km >= 0),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists km_data on public.km (data);

-- ---------- Valori iniziali (una sola riga) ----------
-- Quello che la Tesla aveva percorso e ricaricato PRIMA dello Shelly.
create table if not exists public.impostazioni (
  id            int primary key default 1 check (id = 1),
  km_iniziali   numeric not null default 0 check (km_iniziali >= 0),
  kwh_iniziali  numeric not null default 0 check (kwh_iniziali >= 0),
  data_inizio   date not null default current_date,
  updated_at    timestamptz not null default now()
);
insert into public.impostazioni (id) values (1) on conflict (id) do nothing;

-- ---------- Viste di calcolo ----------
-- Energia di ogni intervallo tra due letture (in Wh)
create or replace view public.letture_delta with (security_invoker = on) as
select
  ts,
  potenza_w,
  lag(ts) over w as ts_prec,
  case
    when lag(totale_wh) over w is null then 0
    when totale_wh >= lag(totale_wh) over w then totale_wh - lag(totale_wh) over w
    else totale_wh -- il contatore è ripartito da zero
  end as delta_wh
from public.letture
window w as (order by ts);

-- kWh ricaricati per giorno (ora italiana)
create or replace view public.consumi_giornalieri with (security_invoker = on) as
select (ts at time zone 'Europe/Rome')::date as giorno,
       round(sum(delta_wh) / 1000.0, 3) as kwh
from public.letture_delta
group by 1;

-- Singole ricariche: letture consecutive con potenza o energia, senza pause > 20 minuti
create or replace view public.ricariche with (security_invoker = on) as
with attive as (
  select * from public.letture_delta where potenza_w > 300 or delta_wh > 10
), segnate as (
  select *,
    case when lag(ts) over (order by ts) is null
           or ts - lag(ts) over (order by ts) > interval '20 minutes' then 1 else 0 end as nuova
  from attive
), gruppi as (
  select *, sum(nuova) over (order by ts) as gruppo from segnate
)
select
  min(coalesce(ts_prec, ts)) as inizio,
  max(ts) as fine,
  round(sum(delta_wh) / 1000.0, 3) as kwh,
  max(potenza_w) as potenza_max_w
from gruppi
group by gruppo;

-- ---------- Sicurezza ----------
alter table public.profiles     enable row level security;
alter table public.letture      enable row level security;
alter table public.prezzi       enable row level security;
alter table public.km           enable row level security;
alter table public.impostazioni enable row level security;

drop policy if exists "profili visibili" on public.profiles;
create policy "profili visibili" on public.profiles
  for select to authenticated using (true);
drop policy if exists "modifica proprio profilo" on public.profiles;
create policy "modifica proprio profilo" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = public.is_admin());

-- letture: solo lettura per gli utenti (scrive la Edge Function con la chiave di servizio)
drop policy if exists "lettura" on public.letture;
create policy "lettura" on public.letture for select to authenticated using (true);

-- prezzi: tutti vedono, solo admin modifica
drop policy if exists "lettura" on public.prezzi;
create policy "lettura" on public.prezzi for select to authenticated using (true);
drop policy if exists "inserimento admin" on public.prezzi;
create policy "inserimento admin" on public.prezzi
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
drop policy if exists "modifica admin" on public.prezzi;
create policy "modifica admin" on public.prezzi
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "eliminazione admin" on public.prezzi;
create policy "eliminazione admin" on public.prezzi
  for delete to authenticated using (public.is_admin());

-- km: tutti vedono e aggiungono; modifica/elimina il proprio o l'admin
drop policy if exists "lettura" on public.km;
create policy "lettura" on public.km for select to authenticated using (true);
drop policy if exists "inserimento" on public.km;
create policy "inserimento" on public.km
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "modifica" on public.km;
create policy "modifica" on public.km
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
drop policy if exists "eliminazione" on public.km;
create policy "eliminazione" on public.km
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- impostazioni: tutti vedono, solo admin modifica (la riga è una sola, niente insert/delete)
drop policy if exists "lettura" on public.impostazioni;
create policy "lettura" on public.impostazioni for select to authenticated using (true);
drop policy if exists "modifica admin" on public.impostazioni;
create policy "modifica admin" on public.impostazioni
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Dopo aver creato il primo utente in Authentication → Users:
--   update public.profiles set is_admin = true where email = 'tua@email.it';
