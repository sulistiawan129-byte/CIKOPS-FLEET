-- ═══════════════════════════════════════════════════════════════
-- Migration 007: Canteen reports (merged from the standalone
-- GAS/Google Sheets-based Canteen Ops system)
--
-- One row per date, with per-shift (1/2/3) order + leftover numbers
-- for both Snack and Meal categories — "consumed" is always derived
-- (order − leftover) at query time, never stored, exactly matching
-- how the original system worked.
-- ═══════════════════════════════════════════════════════════════

create table if not exists canteen_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,

  snack_order_1 numeric not null default 0,
  snack_order_2 numeric not null default 0,
  snack_order_3 numeric not null default 0,
  snack_leftover_1 numeric not null default 0,
  snack_leftover_2 numeric not null default 0,
  snack_leftover_3 numeric not null default 0,

  meal_order_1 numeric not null default 0,
  meal_order_2 numeric not null default 0,
  meal_order_3 numeric not null default 0,
  meal_leftover_1 numeric not null default 0,
  meal_leftover_2 numeric not null default 0,
  meal_leftover_3 numeric not null default 0,

  submitted_by text default '',
  created_at timestamptz not null default now()
);

alter table canteen_reports enable row level security;

drop policy if exists "canteen_reports_select_all" on canteen_reports;
create policy "canteen_reports_select_all" on canteen_reports for select using (true);

drop policy if exists "canteen_reports_insert_all" on canteen_reports;
create policy "canteen_reports_insert_all" on canteen_reports for insert with check (true);

drop policy if exists "canteen_reports_update_all" on canteen_reports;
create policy "canteen_reports_update_all" on canteen_reports for update using (true);

drop policy if exists "canteen_reports_delete_authenticated" on canteen_reports;
create policy "canteen_reports_delete_authenticated" on canteen_reports for delete using (auth.role() = 'authenticated');

-- One report per date — re-submitting the same date updates it instead
-- of creating a duplicate (upsert pattern), matching the original
-- system's "Save Report" behavior for a given day.
create unique index if not exists canteen_reports_date_idx on canteen_reports(report_date);
