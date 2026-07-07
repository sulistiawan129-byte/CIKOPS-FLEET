-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Admin driver PIN management
--
-- The existing `set_driver_pin` RPC requires the OLD pin to match
-- before allowing a change — correct for a driver changing their own
-- PIN from their profile screen, but useless for:
--   (a) setting an initial PIN when an admin creates a brand-new
--       driver (pin_hash is NULL, so no "old pin" can ever match), and
--   (b) an admin resetting a driver's PIN after they forget it.
--
-- This adds a second RPC, callable only by an authenticated admin/GA
-- user (via the profiles table), that sets a driver's PIN directly.
-- ═══════════════════════════════════════════════════════════════

create or replace function admin_set_driver_pin(p_driver_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid()
  ) then
    raise exception 'Only admin/GA users can set a driver PIN directly';
  end if;

  if p_new_pin is null or length(p_new_pin) < 4 then
    raise exception 'PIN must be at least 4 digits';
  end if;

  update drivers
    set pin_hash = crypt(p_new_pin, gen_salt('bf'))
    where id = p_driver_id;
end;
$$;
