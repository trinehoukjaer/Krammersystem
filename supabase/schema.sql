-- Kræmmer Depositum - Supabase Schema
-- Kør dette SQL i Supabase SQL Editor
-- VIGTIGT: Slet først den gamle tabel hvis den findes:
-- drop table if exists deposita; drop table if exists saesoner;

create table deposita (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  status text not null default 'afventer' check (status in ('afventer', 'aktiv', 'udbetalt')),
  aar int not null default 2026,
  oprettet_at timestamptz not null default now(),

  unique (device_id, aar)
);

create table saesoner (
  aar int primary key,
  aktiv boolean not null default true,
  oprettet_at timestamptz not null default now()
);

insert into saesoner (aar, aktiv) values (2026, true);

create index idx_deposita_device_aar on deposita (device_id, aar);

-- RLS
alter table deposita enable row level security;
alter table saesoner enable row level security;

-- Anon: kan oprette sig selv og læse egen record
create policy "Insert egen registrering"
  on deposita for insert to anon
  with check (true);

create policy "Læs egne deposita"
  on deposita for select to anon
  using (true);

-- Anon kan læse sæsoner
create policy "Læs sæsoner"
  on saesoner for select to anon
  using (true);

-- Ingen UPDATE/DELETE for anon — alt admin sker via service_role server-side
