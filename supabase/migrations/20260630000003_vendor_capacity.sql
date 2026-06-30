-- =============================================================================
-- ADDON #4 — vendor daily capacity & availability
-- =============================================================================
-- Lets a vendor self-manage their serving availability (open/closed, out of
-- stock, a temporary closure window) and an optional daily meal capacity. The
-- redemption engine (lib/services/redemption.ts, Wave-1) ALREADY reads these
-- columns + the vendor_capacity_usage table tolerantly — this migration makes
-- them real and adds the per-day usage counter the engine throttles against
-- when `vendor_capacity_enforcement_enabled` is on (addon config seed).
--
-- Availability columns are VENDOR-CONTROLLED on purpose (same stance as
-- settlement_cycle in m25): they are intentionally NOT added to the
-- guard_vendor_controlled_cols() trigger, so a vendor can flip them through
-- vendors_update_own. Only staff-gated trust columns (status/kyc/rating) stay
-- guarded.
--
-- Depends on M04 (vendors) and M17 (token_redemptions vendor-scoping pattern is
-- mirrored for the usage table RLS). Apply AFTER the addon config seed.
-- snake_case · RLS on the new table · reversible DOWN at the bottom.
-- =============================================================================

begin;

-- --- vendors availability columns -------------------------------------------
alter table public.vendors
    add column if not exists daily_meal_capacity     integer,
    add column if not exists is_open                 boolean    not null default true,
    add column if not exists temporary_closure_until timestamptz,
    add column if not exists stock_exhausted         boolean    not null default false;

alter table public.vendors
    add constraint vendors_daily_meal_capacity_nonneg
    check (daily_meal_capacity is null or daily_meal_capacity >= 0);

comment on column public.vendors.daily_meal_capacity is
    'Optional max meals this outlet can serve per day. NULL = uncapped. Enforced at redemption only when vendor_capacity_enforcement_enabled is on.';
comment on column public.vendors.is_open is
    'Vendor-controlled open/closed switch. false blocks redemptions (HARD) regardless of capacity.';
comment on column public.vendors.temporary_closure_until is
    'When set in the future, the outlet is temporarily closed until this instant (HARD block).';
comment on column public.vendors.stock_exhausted is
    'Vendor-controlled "out of food today" flag. true blocks redemptions (HARD).';

-- --- vendor_capacity_usage (per-vendor, per-day served counter) --------------
create table if not exists public.vendor_capacity_usage (
    id           uuid primary key default gen_random_uuid(),
    vendor_id    uuid not null references public.vendors (id) on delete cascade,
    usage_date   date not null default current_date,
    meals_served integer not null default 0 check (meals_served >= 0),
    updated_at   timestamptz not null default now(),
    unique (vendor_id, usage_date)
);

comment on table public.vendor_capacity_usage is
    'Counts meals served by a vendor on a given day; compared against vendors.daily_meal_capacity at redemption when capacity enforcement is enabled.';

create index vendor_capacity_usage_vendor_date_idx
    on public.vendor_capacity_usage (vendor_id, usage_date desc);

create trigger vendor_capacity_usage_set_updated_at
    before update on public.vendor_capacity_usage
    for each row execute function public.set_updated_at();

-- --- atomic increment RPC ----------------------------------------------------
-- Upsert today's row and bump meals_served by one in a SINGLE statement so a
-- concurrent redemption can't lose a count (read-modify-write would race). Used
-- by lib/services/vendorCapacity.ts incrementUsage() on the service-role client
-- as a best-effort post-burn write. SECURITY DEFINER so the counter is
-- maintained even though the table is otherwise vendor/staff-scoped.
create or replace function public.increment_vendor_capacity_usage(p_vendor_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_served integer;
begin
    insert into public.vendor_capacity_usage (vendor_id, usage_date, meals_served)
    values (p_vendor_id, current_date, 1)
    on conflict (vendor_id, usage_date)
    do update set meals_served = public.vendor_capacity_usage.meals_served + 1,
                  updated_at   = now()
    returning meals_served into v_served;

    return v_served;
end;
$$;

-- =============================================================================
-- RLS — staff read all; a vendor reads + writes ONLY its own outlet's usage
--       (mirrors token_redemptions vendor-scoping in m17). The increment RPC
--       runs SECURITY DEFINER + the route uses the service-role client, so the
--       hot path is unaffected; these policies cover direct/session access.
-- =============================================================================
alter table public.vendor_capacity_usage enable row level security;

create policy vendor_capacity_usage_select_staff on public.vendor_capacity_usage
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy vendor_capacity_usage_select_own_vendor on public.vendor_capacity_usage
    for select to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

create policy vendor_capacity_usage_insert_own_vendor on public.vendor_capacity_usage
    for insert to authenticated
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

create policy vendor_capacity_usage_update_own_vendor on public.vendor_capacity_usage
    for update to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()))
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

create policy vendor_capacity_usage_write_admin on public.vendor_capacity_usage
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop function if exists public.increment_vendor_capacity_usage(uuid);
-- drop table if exists public.vendor_capacity_usage cascade;
-- alter table public.vendors drop constraint if exists vendors_daily_meal_capacity_nonneg;
-- alter table public.vendors
--     drop column if exists daily_meal_capacity,
--     drop column if exists is_open,
--     drop column if exists temporary_closure_until,
--     drop column if exists stock_exhausted;
-- commit;
