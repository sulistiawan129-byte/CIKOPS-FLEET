-- ═══════════════════════════════════════════════════════════════
--  Migration 013: Sistem Pembagian Gift / Seragam / dll
--  Jalankan di Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabel event pembagian
create table if not exists gift_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- Item dan variannya disimpan sebagai JSON array
  -- contoh: [{"name":"Seragam","variants":["S","M","L","XL"]},{"name":"Sepatu","variants":["39","40","41","42"]}]
  items       jsonb not null default '[]',
  status      text not null default 'open' check (status in ('open','closed')),
  plant       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Tabel pendaftaran karyawan
create table if not exists gift_registrations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references gift_events(id) on delete cascade,
  nik         text not null,
  nama        text not null,
  departemen  text not null,
  email       text not null,
  -- Pilihan item: [{"item":"Seragam","variant":"L"},{"item":"Sepatu","variant":"41"}]
  selections  jsonb not null default '[]',
  -- Passcode di-hash pakai pgcrypto (tidak pernah tersimpan plaintext)
  passcode_hash text not null,
  -- Status pengambilan
  claimed     boolean not null default false,
  claimed_at  timestamptz,
  claimed_by  text,  -- nama petugas yang memproses
  registered_at timestamptz not null default now(),
  -- Satu NIK hanya bisa daftar sekali per event
  unique (event_id, nik)
);

-- 3. Aktifkan RLS
alter table gift_events enable row level security;
alter table gift_registrations enable row level security;

-- gift_events: read public (supaya halaman /gift bisa tampilkan daftar event)
-- write hanya authenticated (admin)
create policy "gift_events_select_public" on gift_events
  for select using (true);
create policy "gift_events_write_admin" on gift_events
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- gift_registrations: insert public (karyawan daftar tanpa login)
-- select/update terbuka (petugas /gift/verify perlu baca dan update status)
-- delete hanya admin
create policy "gift_reg_insert_public" on gift_registrations
  for insert with check (true);
create policy "gift_reg_select_public" on gift_registrations
  for select using (true);
create policy "gift_reg_update_public" on gift_registrations
  for update using (true) with check (true);
create policy "gift_reg_delete_admin" on gift_registrations
  for delete using (auth.role() = 'authenticated');

-- 4. RPC: verifikasi passcode (security definer supaya hash tidak ter-expose)
create or replace function public.verify_gift_passcode(p_passcode text)
returns table (
  id uuid, event_id uuid, event_name text,
  nik text, nama text, departemen text, email text,
  selections jsonb, claimed boolean, claimed_at timestamptz,
  claimed_by text, registered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      r.id, r.event_id, e.name as event_name,
      r.nik, r.nama, r.departemen, r.email,
      r.selections, r.claimed, r.claimed_at,
      r.claimed_by, r.registered_at
    from gift_registrations r
    join gift_events e on e.id = r.event_id
    where r.passcode_hash = crypt(p_passcode, r.passcode_hash);
end;
$$;

grant execute on function public.verify_gift_passcode(text) to anon, authenticated;

-- 5. RPC: generate passcode hash (8 digit angka) + simpan registrasi
--    Dikerjakan server-side supaya passcode PLAINTEXT tidak pernah masuk DB
create or replace function public.create_gift_registration(
  p_event_id  uuid,
  p_nik       text,
  p_nama      text,
  p_departemen text,
  p_email     text,
  p_selections jsonb,
  p_passcode  text  -- 8-digit, generated di client tapi di-hash di sini
)
returns table (success boolean, error_code text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cek event masih open
  if not exists (
    select 1 from gift_events where id = p_event_id and status = 'open'
  ) then
    return query select false, 'EVENT_CLOSED';
    return;
  end if;

  -- Cek NIK belum daftar di event ini
  if exists (
    select 1 from gift_registrations where event_id = p_event_id and nik = p_nik
  ) then
    return query select false, 'ALREADY_REGISTERED';
    return;
  end if;

  -- Insert dengan hash passcode
  insert into gift_registrations (
    event_id, nik, nama, departemen, email,
    selections, passcode_hash
  ) values (
    p_event_id, p_nik, p_nama, p_departemen, p_email,
    p_selections, crypt(p_passcode, gen_salt('bf', 8))
  );

  return query select true, '';
end;
$$;

grant execute on function public.create_gift_registration(uuid, text, text, text, text, jsonb, text) to anon, authenticated;

-- 6. Pastikan pgcrypto aktif (butuh untuk crypt/gen_salt)
create extension if not exists pgcrypto;
