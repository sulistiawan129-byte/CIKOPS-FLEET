-- ═══════════════════════════════════════════════════════════════
-- Migration 004: App settings (key-value) + manager email default
--
-- Needed for the Claims email notification feature: lets an admin
-- configure which manager email address receives a copy of every
-- submitted claim, without hardcoding it in the frontend.
-- ═══════════════════════════════════════════════════════════════

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists "app_settings_select_all" on app_settings;
create policy "app_settings_select_all" on app_settings for select using (true);

drop policy if exists "app_settings_upsert_authenticated" on app_settings;
create policy "app_settings_upsert_authenticated" on app_settings
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed the manager_email key (empty by default — admin fills it in via
-- the Master Data / Settings UI before claim emails will be cc'd to a manager).
insert into app_settings (key, value)
values ('manager_email', '')
on conflict (key) do nothing;
