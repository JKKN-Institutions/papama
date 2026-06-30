-- =============================================================================
-- ADDON #1 — meal_windows (multi-level clock-time serving windows)
-- =============================================================================
-- Phase-1 addon area #1 (docs/phase 1 addon.md §1). Stores the per-slot serving
-- windows the redemption engine enforces when `meal_window_enforcement_enabled`
-- is ON (Wave 1, lib/services/redemption.ts reads vendor_id/start_time/end_time/
-- is_active). Multi-level model: a NULL vendor_id row is the GLOBAL/default
-- window for a meal slot; a row with a vendor_id OVERRIDES the global window for
-- that vendor (the engine prefers vendor-specific windows when any exist).
--
-- Enum used: public.meal_type (created Wave 0, 20260630000001_addon_enums.sql) —
--   referenced here, NEVER recreated.
-- Depends on M16 (public.vendors), M02 (current_app_role, set_updated_at).
-- Apply AFTER 20260630000001 (enums) and the vendors table.
--
-- OVERNIGHT WINDOWS ARE OUT OF SCOPE: the CHECK (start_time < end_time) forbids a
-- wrap-past-midnight window here (e.g. 22:00–02:00). The engine still handles a
-- wrap defensively (inWindow wraps midnight) for safety, but the admin UI / this
-- table only ever stores same-day windows. Split an overnight slot into two rows
-- if that is ever needed.
-- =============================================================================

begin;

create table public.meal_windows (
    id          uuid primary key default gen_random_uuid(),
    meal_type   public.meal_type not null,
    -- NULL = global/default window for the meal slot; a vendor_id row OVERRIDES
    -- the global window for that vendor (multi-level model).
    vendor_id   uuid references public.vendors (id) on delete cascade,
    start_time  time not null,
    end_time    time not null,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    -- same-day windows only (overnight wrap is out of scope — see header).
    constraint meal_windows_time_order check (start_time < end_time)
);

comment on table public.meal_windows is 'Per-slot meal serving windows (addon #1). vendor_id NULL = global default; a vendor row overrides the global window for that vendor. Enforced at redemption when meal_window_enforcement_enabled is on.';
comment on column public.meal_windows.vendor_id is 'NULL = global/default window; non-NULL overrides the global window for that vendor.';

-- The engine filters on is_active then (vendor_id, meal_type) — partial index
-- over the active rows it actually queries.
create index meal_windows_active_lookup_idx
    on public.meal_windows (vendor_id, meal_type)
    where is_active;

-- reuse public.set_updated_at() from M02
create trigger meal_windows_set_updated_at
    before update on public.meal_windows
    for each row execute function public.set_updated_at();

-- --- RLS: any authenticated user reads; only admin writes -------------------
-- Mirrors the system_config policy shape (M03): serving windows are non-secret
-- operational config that every signed-in role may read, but only an admin may
-- change. Admin write routes run on the service-role client AFTER the matrix
-- check; these policies are the defense-in-depth floor on the session client.
alter table public.meal_windows enable row level security;

create policy meal_windows_select_authenticated
    on public.meal_windows for select
    to authenticated
    using (true);

create policy meal_windows_insert_admin
    on public.meal_windows for insert
    to authenticated
    with check (public.current_app_role() = 'admin');

create policy meal_windows_update_admin
    on public.meal_windows for update
    to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

create policy meal_windows_delete_admin
    on public.meal_windows for delete
    to authenticated
    using (public.current_app_role() = 'admin');

-- --- SEED: the doc's suggested GLOBAL windows, DISABLED ----------------------
-- docs/phase 1 addon.md §1 suggests Breakfast 06:00–10:00, Lunch 11:00–15:00,
-- Dinner 18:00–22:00 (snack left unseeded — no client-confirmed hours). Seeded
-- is_active=false AND meal_window_enforcement_enabled ships 'false' (Wave 0), so
-- this changes NOTHING until an admin enables the windows AND flips the flag.
insert into public.meal_windows (meal_type, vendor_id, start_time, end_time, is_active) values
    ('breakfast', null, '06:00', '10:00', false),
    ('lunch',     null, '11:00', '15:00', false),
    ('dinner',    null, '18:00', '22:00', false);

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists meal_windows_delete_admin        on public.meal_windows;
-- drop policy if exists meal_windows_update_admin        on public.meal_windows;
-- drop policy if exists meal_windows_insert_admin        on public.meal_windows;
-- drop policy if exists meal_windows_select_authenticated on public.meal_windows;
-- drop trigger if exists meal_windows_set_updated_at     on public.meal_windows;
-- drop table if exists public.meal_windows;
-- commit;
