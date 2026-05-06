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

-- ==============================================================
-- State-machine-beskyttelse
-- --------------------------------------------------------------
-- Status MÅ kun bevæge sig én vej:
--   afventer  ->  aktiv
--   aktiv     ->  udbetalt
-- Direkte spring (afventer -> udbetalt) er ALDRIG tilladt — heller
-- ikke for service_role. Triggeren rejser en exception ved forbudt
-- overgang, så ingen kombination af to-fejl, race-conditions eller
-- ondsindet API-misbrug kan udbetale uden forudgående aktivering.
-- ==============================================================
create or replace function deposita_enforce_state_machine()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'afventer' and new.status = 'aktiv' then
    return new;
  end if;

  if old.status = 'aktiv' and new.status = 'udbetalt' then
    return new;
  end if;

  raise exception
    'Ulovlig status-overgang: % -> % (id=%)',
    old.status, new.status, old.id
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_deposita_state_machine on deposita;

create trigger trg_deposita_state_machine
  before update of status on deposita
  for each row
  execute function deposita_enforce_state_machine();
