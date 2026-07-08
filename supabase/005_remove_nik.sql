-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Remove NIK (national ID number) from employees
--
-- Internal policy decision: this system should never store NIK
-- (Nomor Induk Kependudukan), even though full names are fine to
-- keep. This permanently drops the column and any values already
-- stored in it — this cannot be undone, so make sure that's really
-- what you want before running it.
-- ═══════════════════════════════════════════════════════════════

alter table employees drop column if exists nik;
