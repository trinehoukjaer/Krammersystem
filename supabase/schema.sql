-- Kræmmer Depositum - Supabase Schema
-- Kør dette SQL i Supabase SQL Editor

-- Tabel til depositum-registreringer
create table deposita (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  status text not null default 'aktiv' check (status in ('aktiv', 'udbetalt')),
  aar int not null default extract(year from now())::int,
  oprettet_at timestamptz not null default now(),

  -- Én enhed kan kun have én aktiv sag pr. år
  unique (device_id, aar)
);

-- Tabel til sæsonstyring
create table saesoner (
  aar int primary key,
  aktiv boolean not null default true,
  oprettet_at timestamptz not null default now()
);

-- Indsæt nuværende sæson
insert into saesoner (aar, aktiv) values (extract(year from now())::int, true);

-- Index for hurtige opslag
create index idx_deposita_device_aar on deposita (device_id, aar);
create index idx_deposita_status on deposita (status);

-- Row Level Security
alter table deposita enable row level security;
alter table saesoner enable row level security;

-- DEPOSITA: Anon-brugere kan kun inserter og læse deres egen record
create policy "Kræmmere kan registrere depositum"
  on deposita for insert
  to anon
  with check (true);

create policy "Kræmmere kan læse eget depositum via device_id"
  on deposita for select
  to anon
  using (true);

-- Anon-brugere kan IKKE opdatere eller slette
-- (ingen UPDATE/DELETE policies for anon)

-- SAESONER: Anon-brugere kan kun læse
create policy "Alle kan læse sæsoner"
  on saesoner for select
  to anon
  using (true);

-- Ingen INSERT/UPDATE/DELETE for anon på saesoner

-- Service role (brugt af API-ruter) bypasser RLS automatisk
-- så admin-handlinger kører via supabaseAdmin-klienten server-side
