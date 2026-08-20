-- ════════════════════════════════════════════════════════════
-- 008_kantong_plant_and_unsubmitted_claim_RECOVERY.sql
--
-- RECOVERY migration, same reason as 001_..._RECOVERY.sql: the original
-- migration that added multi-plant support and the "Unsubmitted Claim (A7)"
-- field to Dana Operasional (kantong) was lost from this repo before it
-- could be committed. This reconstructs it from what src/lib/api.ts and
-- src/app/dashboard/page.tsx (OpFundTab) actually expect at runtime:
--
--   • a "plant" column ('CIK' | 'PRB') — every kantong query filters by it
--   • an "unsubmitted_claim" column      — read/written by updateKantongBudget()
--   • a UNIQUE constraint on (period, plant), not on period alone — two
--     plants must be able to have a row for the same month
--   • a get_current_kantong(p_plant) RPC — called by getCurrentKantong()
--     every time the Operational Fund tab loads, but never defined in SQL
--
-- Safe to run multiple times.
-- ════════════════════════════════════════════════════════════

-- ── plant column ──
alter table kantong add column if not exists plant text not null default 'CIK';
alter table kantong drop constraint if exists kantong_plant_check;
alter table kantong add constraint kantong_plant_check check (plant in ('CIK', 'PRB'));

-- ── unsubmitted_claim column (the A7 field) ──
alter table kantong add column if not exists unsubmitted_claim numeric not null default 0;

-- ── fix the unique constraint: was on period alone, must be (period, plant)
--    so CIK and PRB can each have their own row for the same month ──
alter table kantong drop constraint if exists kantong_period_key;
drop index if exists kantong_period_key;
alter table kantong drop constraint if exists kantong_period_plant_key;
alter table kantong add constraint kantong_period_plant_key unique (period, plant);

-- ── refresh the view to reflect the new columns / one row per plant ──
create or replace view current_kantong as
select distinct on (plant) *
from kantong
order by plant, period desc;

-- ── the RPC the frontend actually calls: latest row for a given plant ──
-- Dropped first (not just CREATE OR REPLACE) because Postgres refuses to
-- replace a function whose return type differs from what's already there,
-- which happens if an older/partial version of this function already
-- exists in the database with a different signature.
drop function if exists get_current_kantong(text);

create function get_current_kantong(p_plant text)
returns setof kantong
language sql
stable
as $$
  select *
  from kantong
  where plant = p_plant
  order by period desc
  limit 1;
$$;
