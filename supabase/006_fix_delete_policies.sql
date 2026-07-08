-- ═══════════════════════════════════════════════════════════════
-- Migration 006: Fix missing DELETE policies (root cause of
-- "delete button does nothing" across the app)
--
-- Supabase/Postgres RLS behavior that causes this bug: if a table has
-- RLS enabled but NO policy for DELETE, a `delete().eq('id', x)` call
-- from the JS client does NOT throw an error — it just matches zero
-- rows (RLS silently filters everything out) and returns success.
-- The UI closes the confirm dialog like nothing went wrong, but the
-- row is still sitting right there in the table.
--
-- This was traced to migrations 001/002 (created earlier when the
-- FleetOS tables were first merged in) being missing from this
-- project folder — so depending on what actually got run against the
-- live database, some or all of these tables may never have gotten a
-- DELETE policy at all. This migration is idempotent (safe to run
-- even if some policies already exist) and re-establishes all of them
-- in one place, so the fix doesn't depend on finding those old files.
--
-- Design: `vehicles` and `drivers` are shared with the original
-- driver-assignment app, so delete stays admin-only (matching the
-- original intent). Every FleetOS-exclusive table (claims, overtime,
-- driver_tiers, gas_stations, employees, job_types) and `tasks` get
-- open delete for any authenticated user, consistent with how this
-- internal tool already handles insert/update everywhere else.
-- ═══════════════════════════════════════════════════════════════

-- ── Admin-only delete: shared tables ──
drop policy if exists "vehicles_delete_admin" on vehicles;
create policy "vehicles_delete_admin" on vehicles for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists "drivers_delete_admin" on drivers;
create policy "drivers_delete_admin" on drivers for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Also make sure UPDATE exists for these two (needed for editing
-- vehicle/driver records — same silent-failure risk as DELETE).
drop policy if exists "vehicles_update_authenticated" on vehicles;
create policy "vehicles_update_authenticated" on vehicles for update using (auth.role() = 'authenticated');

drop policy if exists "drivers_update_authenticated" on drivers;
create policy "drivers_update_authenticated" on drivers for update using (auth.role() = 'authenticated');

-- ── Open delete: FleetOS-exclusive tables ──
drop policy if exists "claims_delete_authenticated" on claims;
create policy "claims_delete_authenticated" on claims for delete using (auth.role() = 'authenticated');

drop policy if exists "overtime_delete_authenticated" on overtime;
create policy "overtime_delete_authenticated" on overtime for delete using (auth.role() = 'authenticated');

drop policy if exists "driver_tiers_delete_authenticated" on driver_tiers;
create policy "driver_tiers_delete_authenticated" on driver_tiers for delete using (auth.role() = 'authenticated');

drop policy if exists "gas_stations_delete_authenticated" on gas_stations;
create policy "gas_stations_delete_authenticated" on gas_stations for delete using (auth.role() = 'authenticated');

-- ── Open delete: original driver-assignment tables that were never
-- given a delete policy at all ──
drop policy if exists "tasks_delete_authenticated" on tasks;
create policy "tasks_delete_authenticated" on tasks for delete using (auth.role() = 'authenticated');

drop policy if exists "employees_delete_authenticated" on employees;
create policy "employees_delete_authenticated" on employees for delete using (auth.role() = 'authenticated');

drop policy if exists "job_types_delete_authenticated" on job_types;
create policy "job_types_delete_authenticated" on job_types for delete using (auth.role() = 'authenticated');

-- Also missing entirely from schema.sql: UPDATE for employees/job_types
-- (only tasks/vehicles/drivers had update policies before).
drop policy if exists "employees_update_authenticated" on employees;
create policy "employees_update_authenticated" on employees for update using (auth.role() = 'authenticated');

drop policy if exists "job_types_update_authenticated" on job_types;
create policy "job_types_update_authenticated" on job_types for update using (auth.role() = 'authenticated');
