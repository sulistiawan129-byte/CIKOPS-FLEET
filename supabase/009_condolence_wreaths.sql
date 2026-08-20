-- ════════════════════════════════════════════════════════════
-- 009_condolence_wreaths.sql
--
-- "Karangan Bunga Duka Cita" — condolence flower wreath records.
-- Tracked separately from the "claims" table because a wreath isn't
-- tied to a driver or an expense line item — it's a one-off event
-- (date + on whose behalf) that just needs a claim-submitted status
-- and its own report, independent of the regular fuel/toll claim flow.
--
-- Safe to run multiple times.
-- ════════════════════════════════════════════════════════════

create table if not exists condolence_wreaths (
  id uuid primary key default gen_random_uuid(),
  plant text not null check (plant in ('CIK', 'PRB')),
  tanggal date not null,
  atas_nama text not null,
  keterangan text default '',
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists condolence_wreaths_plant_tanggal_idx
  on condolence_wreaths (plant, tanggal desc);

alter table condolence_wreaths enable row level security;

drop policy if exists "condolence_wreaths_select_all" on condolence_wreaths;
create policy "condolence_wreaths_select_all" on condolence_wreaths for select using (true);

drop policy if exists "condolence_wreaths_insert_all" on condolence_wreaths;
create policy "condolence_wreaths_insert_all" on condolence_wreaths for insert with check (true);

drop policy if exists "condolence_wreaths_update_all" on condolence_wreaths;
create policy "condolence_wreaths_update_all" on condolence_wreaths for update using (true);

drop policy if exists "condolence_wreaths_delete_all" on condolence_wreaths;
create policy "condolence_wreaths_delete_all" on condolence_wreaths for delete using (true);

-- Register with realtime, same as other live-updating tables (tasks) —
-- keeps the Claims tab's wreath list in sync across open sessions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'condolence_wreaths'
  ) then
    alter publication supabase_realtime add table condolence_wreaths;
  end if;
end $$;
