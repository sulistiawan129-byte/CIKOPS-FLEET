-- ═══════════════════════════════════════════════════════════════
-- Migration 001 (RECOVERY): FleetOS core tables
--
-- The original migration files that created these tables (when
-- FleetOS was first merged into this driver-assignment system) went
-- missing from the project folder somewhere along the way. This is a
-- reconstruction based on what the actual TypeScript code (types.ts /
-- api.ts) expects to exist — the live database most likely already
-- has all of this (since Claims/Overtime/Gas Stations have been
-- working in testing), but if you're ever setting up a FRESH Supabase
-- project from this codebase, you need this file to exist.
--
-- Everything here uses `if not exists` / `if not exists` column
-- guards, so it's safe to run even against a database that already
-- has some or all of this — it will not error or duplicate anything.
-- ═══════════════════════════════════════════════════════════════

-- ── Extend existing shared tables (vehicles, drivers) ──
alter table vehicles add column if not exists year int;
alter table vehicles add column if not exists color text;
alter table vehicles add column if not exists fuel text;
alter table vehicles add column if not exists odometer numeric default 0;
alter table vehicles add column if not exists kir_date date;
alter table vehicles add column if not exists service_date date;
alter table vehicles add column if not exists stnk_date date;
alter table vehicles add column if not exists dept text;
alter table vehicles add column if not exists default_driver_id uuid references drivers(id);
alter table vehicles add column if not exists updated_at timestamptz default now();
alter table vehicles add column if not exists updated_by uuid references auth.users(id);

alter table drivers add column if not exists email text;
alter table drivers add column if not exists updated_at timestamptz default now();
alter table drivers add column if not exists updated_by uuid references auth.users(id);

-- ── profiles — admin/GA accounts (Supabase Auth), separate from the
-- driver PIN system ──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'ga' check (role in ('admin', 'ga')),
  created_at timestamptz not null default now()
);
alter table drivers add column if not exists tier_id uuid;

-- Auto-create a profile row (default role 'ga') whenever a new
-- Supabase Auth user signs up — lets an admin create accounts via the
-- Supabase Dashboard and immediately have a usable profile.
create or replace function handle_new_admin_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'ga')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_admin_user();

-- ── driver_tiers — operational allowance tiers ──
create table if not exists driver_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3d6ff2',
  amount_per_month numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table drivers add constraint drivers_tier_id_fkey
  foreign key (tier_id) references driver_tiers(id) on delete set null;

-- View: derived active-driver-count per tier (never stored directly)
create or replace view driver_tier_summary as
select
  t.id, t.name, t.color, t.amount_per_month,
  count(d.id) filter (where d.aktif) as active_driver_count
from driver_tiers t
left join drivers d on d.tier_id = t.id
group by t.id, t.name, t.color, t.amount_per_month;

-- ── claims ──
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  submission_date date not null,
  period_date date not null,
  items jsonb not null default '[]',
  total numeric not null default 0,
  status text not null default 'submitted',
  note text default '',
  submitted_at timestamptz not null default now()
);

-- ── overtime ──
create table if not exists overtime (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  period text not null, -- "YYYY-MM"
  plant text not null check (plant in ('CIK', 'PRB')),
  hours numeric not null default 0,
  amount numeric not null default 0,
  reason text default '',
  created_at timestamptz not null default now()
);

-- ── kantong (Dana Operasional) — period-keyed, one row per month ──
create table if not exists kantong (
  id uuid primary key default gen_random_uuid(),
  period text not null unique, -- "YYYY-MM"
  total_budget numeric not null default 0,
  alloc_op_driver numeric not null default 0,
  alloc_emergency numeric not null default 0,
  cash_available numeric not null default 0,
  claim_submitted numeric not null default 0,
  claim_paid numeric not null default 0,
  last_reset date not null default current_date
);

create or replace view current_kantong as
select * from kantong order by period desc limit 1;

-- ── gas_stations ──
create table if not exists gas_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text default '',
  lat numeric not null,
  lng numeric not null,
  fuels jsonb not null default '[]',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS — enable + open policies (select/insert/update), matching the
-- permissive pattern used throughout this internal-tool app. DELETE
-- policies are handled separately in migration 006 (which is the fix
-- for the actual reported bug) so they stay in one place.
-- ═══════════════════════════════════════════════════════════════

alter table profiles enable row level security;
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (true);

alter table driver_tiers enable row level security;
drop policy if exists "driver_tiers_select_all" on driver_tiers;
create policy "driver_tiers_select_all" on driver_tiers for select using (true);
drop policy if exists "driver_tiers_insert_all" on driver_tiers;
create policy "driver_tiers_insert_all" on driver_tiers for insert with check (true);
drop policy if exists "driver_tiers_update_all" on driver_tiers;
create policy "driver_tiers_update_all" on driver_tiers for update using (true);

alter table claims enable row level security;
drop policy if exists "claims_select_all" on claims;
create policy "claims_select_all" on claims for select using (true);
drop policy if exists "claims_insert_all" on claims;
create policy "claims_insert_all" on claims for insert with check (true);

alter table overtime enable row level security;
drop policy if exists "overtime_select_all" on overtime;
create policy "overtime_select_all" on overtime for select using (true);
drop policy if exists "overtime_insert_all" on overtime;
create policy "overtime_insert_all" on overtime for insert with check (true);
drop policy if exists "overtime_update_all" on overtime;
create policy "overtime_update_all" on overtime for update using (true);

alter table kantong enable row level security;
drop policy if exists "kantong_select_all" on kantong;
create policy "kantong_select_all" on kantong for select using (true);
drop policy if exists "kantong_insert_all" on kantong;
create policy "kantong_insert_all" on kantong for insert with check (true);
drop policy if exists "kantong_update_all" on kantong;
create policy "kantong_update_all" on kantong for update using (true);

alter table gas_stations enable row level security;
drop policy if exists "gas_stations_select_all" on gas_stations;
create policy "gas_stations_select_all" on gas_stations for select using (true);
drop policy if exists "gas_stations_insert_all" on gas_stations;
create policy "gas_stations_insert_all" on gas_stations for insert with check (true);
drop policy if exists "gas_stations_update_all" on gas_stations;
create policy "gas_stations_update_all" on gas_stations for update using (true);
