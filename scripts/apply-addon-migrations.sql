-- ==============================================================================
-- pApAmA Phase-1 ADDON — combined migration bundle (apply in this order)
-- Paste this whole file into the Supabase SQL editor (project qxdxefofeykzvegykitt)
-- and Run. Each section is its own begin/commit transaction.
-- DOWN/rollback blocks are left COMMENTED at the bottom of each section.
-- Generated from supabase/migrations/20260630*.sql
-- ==============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000001_addon_enums.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON — Phase-1 addon enum types
-- =============================================================================
-- Mirrors lib/types/enums.ts exactly (single source of truth for allowed values):
--   MEAL_TYPES               -> public.meal_type
--   VOLUNTEER_ACTIVITY_TYPES -> public.volunteer_activity_type
--
-- Net-new TYPES for the Phase-1 addon (meal windows #1, volunteer activity #13).
-- They do NOT touch any existing table. Follows the m01 named-type pattern.
--
-- Apply this file as-is. To roll back, run the DOWN block at the bottom (after
-- rolling back any later addon migration that references these types first).
-- =============================================================================

begin;

create type public.meal_type as enum (
    'breakfast', 'lunch', 'dinner', 'snack'
);

create type public.volunteer_activity_type as enum (
    'token_distributed', 'registration_assisted'
);

commit;

-- =============================================================================
-- DOWN (rollback) — drop in reverse dependency order.
-- =============================================================================
-- begin;
-- drop type if exists public.volunteer_activity_type;
-- drop type if exists public.meal_type;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000002_addon_config_seed.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON — Phase-1 addon system_config seed (13 new tunables)
-- =============================================================================
-- Every tunable rule lives in system_config and is read at runtime via
-- lib/system-config.ts — NEVER hard-coded (AGENTS.md hard rule). Boolean feature
-- flags ship OFF ('false') so the addon behaviours stay dark until an admin opts
-- in. Numeric thresholds are intentionally seeded NULL (unset on purpose): the
-- code SOFT-skips the rule while a value is unset rather than inventing a default
-- — same discipline as max_tokens_per_volunteer (m03).
--
-- Idempotent (on conflict do nothing). Apply AFTER m03 (system_config table).
-- Column list mirrors m03: (key, value, value_type, description).
--
-- -----------------------------------------------------------------------------
-- RESERVED MIGRATION TIMESTAMP SLOTS (Wave-2 agents — do NOT collide):
--   20260630000003  vendor capacity (#4)
--   20260630000004  vendor feedback / inspections (#9)
--   20260630000005  meal windows (#1)
--   20260630000006  emergency mode (#8)
--   20260630000007  institution allocations (#11)
--   20260630000008  CSR / 80G certificates (#7)
--   20260630000009  duplicate-proof + settlement audit (#10)
--   20260630000010  volunteer activity / zones (#13)
--   20260630000011  public transparency function (#14)
-- -----------------------------------------------------------------------------
-- =============================================================================

begin;

-- --- boolean feature flags (default OFF) -------------------------------------
insert into public.system_config (key, value, value_type, description) values
    ('meal_window_enforcement_enabled',      'false', 'boolean', 'Enforce per-slot meal serving windows at redemption (addon #1). Off = no time-of-day restriction.'),
    ('vendor_capacity_enforcement_enabled',  'false', 'boolean', 'Enforce vendor daily capacity / availability limits at redemption (addon #4).'),
    ('csr_80g_certificates_enabled',         'false', 'boolean', 'Issue 80G CSR donation certificates to donors (addon #7).'),
    ('emergency_mode_enabled',               'false', 'boolean', 'Global emergency-relief mode: relaxed meal limits/cooldown (addon #8).'),
    ('vendor_auto_suspend_enabled',          'false', 'boolean', 'Auto-suspend vendors that fall below rating/feedback thresholds (addon #9).'),
    ('volunteer_zones_enabled',              'false', 'boolean', 'Enable volunteer geographic zones and zone-scoped activity (addon #13).'),
    ('transparency_dashboard_enabled',       'false', 'boolean', 'Publish the public transparency dashboard (addon #14).')
on conflict (key) do nothing;

-- --- numeric thresholds (intentionally NULL — do NOT invent values) ----------
insert into public.system_config (key, value, value_type, description) values
    ('emergency_max_meals_per_day',     null, 'number', 'Per-beneficiary daily meal cap while emergency_mode_enabled (addon #8). TBD — admin must set.'),
    ('emergency_meal_cooldown_hours',   null, 'number', 'Minimum gap (hours) between meals while emergency_mode_enabled (addon #8). TBD — admin must set.'),
    ('vendor_min_feedback_count',       null, 'number', 'Minimum feedback samples before vendor auto-suspend rules apply (addon #9). TBD — admin must set.'),
    ('proof_phash_dup_distance',        null, 'number', 'Max perceptual-hash Hamming distance for duplicate proof-photo detection (addon #10). TBD — admin must set.'),
    ('settlement_random_audit_rate',    null, 'number', 'Fraction (0..1) of settlements pulled for random audit (addon #10). TBD — admin must set.'),
    ('institution_bulk_allocation_max', null, 'number', 'Maximum tokens an institution may be bulk-allocated at once (addon #11). TBD — admin must set.')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- delete from public.system_config where key in (
--     'meal_window_enforcement_enabled',
--     'vendor_capacity_enforcement_enabled',
--     'csr_80g_certificates_enabled',
--     'emergency_mode_enabled',
--     'vendor_auto_suspend_enabled',
--     'volunteer_zones_enabled',
--     'transparency_dashboard_enabled',
--     'emergency_max_meals_per_day',
--     'emergency_meal_cooldown_hours',
--     'vendor_min_feedback_count',
--     'proof_phash_dup_distance',
--     'settlement_random_audit_rate',
--     'institution_bulk_allocation_max'
-- );
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000003_vendor_capacity.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

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
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000004_vendor_feedback.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #9 — vendor rating, feedback & surprise inspections
-- =============================================================================
-- Adds the staff-trust quality signals on the vendor record (rating_avg,
-- feedback_count, complaint_count, quality_score), a beneficiary feedback log,
-- and a surprise-inspection log. The rating/quality columns are STAFF-ONLY:
-- vendors must not be able to rate themselves, so this migration EXTENDS the
-- existing guard_vendor_controlled_cols() trigger (defined in m04) to block a
-- non-staff vendor from moving any of the four new columns through
-- vendors_update_own.
--
-- Auto-suspend is OFF by default (vendor_auto_suspend_enabled = 'false') and its
-- thresholds (vendor_min_feedback_count / vendor_min_rating /
-- vendor_max_complaint_rate) are read at runtime via lib/system-config; an unset
-- threshold SOFT-skips the rule (no invented value) — see
-- lib/services/vendorRating.ts.
--
-- Depends on M04 (vendors + guard trigger), M05 (beneficiaries), M02 (users),
-- M17 (token_redemptions). Apply AFTER 20260630000003.
-- snake_case · RLS on every new table · reversible DOWN at the bottom.
-- =============================================================================

begin;

-- --- vendors quality columns (STAFF-ONLY) -----------------------------------
alter table public.vendors
    add column if not exists rating_avg      numeric(3, 2),
    add column if not exists feedback_count  integer not null default 0,
    add column if not exists complaint_count integer not null default 0,
    add column if not exists quality_score   numeric(5, 2);

alter table public.vendors
    add constraint vendors_feedback_count_nonneg  check (feedback_count >= 0),
    add constraint vendors_complaint_count_nonneg check (complaint_count >= 0),
    add constraint vendors_rating_avg_range
        check (rating_avg is null or (rating_avg >= 0 and rating_avg <= 5));

comment on column public.vendors.rating_avg is
    'Mean beneficiary rating (1..5), recomputed on each feedback. Staff-controlled; vendors cannot self-rate.';
comment on column public.vendors.feedback_count is 'Total feedback rows recorded for this vendor.';
comment on column public.vendors.complaint_count is 'Subset of feedback flagged as a complaint.';
comment on column public.vendors.quality_score is
    'Derived 0..100 quality index (rating + complaint-rate penalty). Staff-controlled.';

-- --- EXTEND guard_vendor_controlled_cols() to cover the new trust columns ----
-- Mirrors the m04 definition and ADDS rating_avg / feedback_count /
-- complaint_count / quality_score to the guarded set. Admin & vendor_manager
-- bypass; any other role attempting to change a guarded column is rejected.
create or replace function public.guard_vendor_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status          is distinct from old.status
       or new.kyc_status      is distinct from old.kyc_status
       or new.hygiene_rating  is distinct from old.hygiene_rating
       or new.owner_id        is distinct from old.owner_id
       or new.rating_avg      is distinct from old.rating_avg
       or new.feedback_count  is distinct from old.feedback_count
       or new.complaint_count is distinct from old.complaint_count
       or new.quality_score   is distinct from old.quality_score then
        raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, owner, rating_avg, feedback_count, complaint_count, or quality_score';
    end if;
    return new;
end;
$$;

-- --- vendor_feedback ---------------------------------------------------------
create table if not exists public.vendor_feedback (
    id             uuid primary key default gen_random_uuid(),
    vendor_id      uuid not null references public.vendors (id) on delete cascade,
    redemption_id  uuid references public.token_redemptions (id) on delete set null,
    beneficiary_id uuid references public.beneficiaries (id) on delete set null,
    rating         smallint not null check (rating between 1 and 5),
    comment        text,
    is_complaint   boolean not null default false,
    created_at     timestamptz not null default now()
);

comment on table public.vendor_feedback is
    'Beneficiary feedback on a vendor (1..5 rating + optional comment/complaint). Aggregated into vendors.rating_avg / quality_score by lib/services/vendorRating.ts.';

create index vendor_feedback_vendor_created_idx on public.vendor_feedback (vendor_id, created_at desc);

-- --- surprise_inspections ----------------------------------------------------
create table if not exists public.surprise_inspections (
    id               uuid primary key default gen_random_uuid(),
    vendor_id        uuid not null references public.vendors (id) on delete cascade,
    inspector_user_id uuid references public.users (id) on delete set null,
    inspection_date  date not null default current_date,
    hygiene_score    smallint check (hygiene_score between 1 and 5),
    passed           boolean,
    notes            text,
    created_at       timestamptz not null default now()
);

comment on table public.surprise_inspections is
    'Staff-recorded surprise hygiene/quality inspections of a vendor outlet (addon #9).';

create index surprise_inspections_vendor_idx on public.surprise_inspections (vendor_id, inspection_date desc);

-- =============================================================================
-- RLS
--   vendor_feedback     — staff read all; a beneficiary creates feedback tied to
--                         their OWN beneficiary row; admin full. (The public
--                         feedback route uses the service-role client, like
--                         /api/beneficiary/register, so anonymous submissions are
--                         server-mediated; these policies cover authenticated /
--                         direct access + defense-in-depth.)
--   surprise_inspections — admin/compliance/vendor_manager only (staff control).
-- =============================================================================
alter table public.vendor_feedback       enable row level security;
alter table public.surprise_inspections  enable row level security;

-- --- vendor_feedback ---------------------------------------------------------
create policy vendor_feedback_select_staff on public.vendor_feedback
    for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy vendor_feedback_insert_own_beneficiary on public.vendor_feedback
    for insert to authenticated
    with check (
        beneficiary_id is not null
        and exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and b.user_id = auth.uid())
    );

create policy vendor_feedback_write_admin on public.vendor_feedback
    for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- surprise_inspections ----------------------------------------------------
create policy surprise_inspections_select_staff on public.surprise_inspections
    for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy surprise_inspections_insert_staff on public.surprise_inspections
    for insert to authenticated
    with check (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy surprise_inspections_update_staff on public.surprise_inspections
    for update to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy surprise_inspections_delete_admin on public.surprise_inspections
    for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.surprise_inspections cascade;
-- drop table if exists public.vendor_feedback      cascade;
-- -- restore the m04 guard_vendor_controlled_cols() (without the #9 columns):
-- create or replace function public.guard_vendor_controlled_cols()
-- returns trigger language plpgsql as $$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then
--         return new;
--     end if;
--     if new.status is distinct from old.status
--        or new.kyc_status is distinct from old.kyc_status
--        or new.hygiene_rating is distinct from old.hygiene_rating
--        or new.owner_id is distinct from old.owner_id then
--         raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, or owner';
--     end if;
--     return new;
-- end;
-- $$;
-- alter table public.vendors drop constraint if exists vendors_rating_avg_range;
-- alter table public.vendors drop constraint if exists vendors_complaint_count_nonneg;
-- alter table public.vendors drop constraint if exists vendors_feedback_count_nonneg;
-- alter table public.vendors
--     drop column if exists rating_avg,
--     drop column if exists feedback_count,
--     drop column if exists complaint_count,
--     drop column if exists quality_score;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000005_meal_windows.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000006_emergency.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #8 — emergency / disaster-relief mode (token flag + grant trail)
-- =============================================================================
-- Phase-1 addon area #8 (docs/phase 1 addon.md §8: disaster relief mode,
-- temporary meal-limit increase, emergency token issuance). The RELAXED-LIMIT
-- behaviour is already wired in the redemption engine (Wave 1) which reads
-- emergency_mode_enabled / emergency_max_meals_per_day / emergency_meal_cooldown_hours
-- from system_config (seeded Wave 0). This migration adds:
--   1. tokens.is_emergency — marks a token minted as disaster relief.
--   2. emergency_token_grants — the audit trail of who issued relief tokens & why.
--
-- Depends on M16 (public.tokens), M02 (public.users, current_app_role).
-- Apply AFTER 20260620010116_m16_tokens.sql.
--
-- OPEN ITEM — DISASTER-AFFECTED PROOF RULES (client Q7): how a beneficiary
-- PROVES they are disaster-affected (and whether relief tokens require such proof
-- before redemption) is UNDECIDED. This migration does NOT implement any proof
-- gating — `reason` is a free-text note only. Do NOT add proof columns/logic here
-- until the client answers Q7 (see lib/services/emergency.ts TODO).
-- =============================================================================

begin;

-- --- 1. mark emergency-relief tokens -----------------------------------------
alter table public.tokens
    add column if not exists is_emergency boolean not null default false;

comment on column public.tokens.is_emergency is 'True when this token was minted as disaster/emergency relief (addon #8). Provenance only — relaxed redemption limits are driven by emergency_mode_enabled config, not this flag.';

-- --- 2. emergency token grant trail ------------------------------------------
create table public.emergency_token_grants (
    id          uuid primary key default gen_random_uuid(),
    -- keep the grant record even if the token is later cancelled/cleaned up.
    token_id    uuid references public.tokens (id) on delete set null,
    issued_by   uuid references public.users (id) on delete set null,
    reason      text,
    created_at  timestamptz not null default now()
);

comment on table public.emergency_token_grants is 'Audit trail of emergency/disaster relief token issuance (addon #8): which token, issued by whom, and why.';

create index emergency_token_grants_token_idx  on public.emergency_token_grants (token_id);
create index emergency_token_grants_issued_idx on public.emergency_token_grants (created_at desc);

-- --- RLS: admin writes; admin + compliance read ------------------------------
-- Issuance is an admin action; compliance may review the relief trail (read-only).
alter table public.emergency_token_grants enable row level security;

create policy emergency_grants_select_staff
    on public.emergency_token_grants for select
    to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy emergency_grants_write_admin
    on public.emergency_token_grants for all
    to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists emergency_grants_write_admin  on public.emergency_token_grants;
-- drop policy if exists emergency_grants_select_staff on public.emergency_token_grants;
-- drop table if exists public.emergency_token_grants;
-- alter table public.tokens drop column if exists is_emergency;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000007_institution.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #11 — NGO / institution beneficiary module
-- =============================================================================
-- Links beneficiaries to a partner institution (ngo_partners) and lets an admin
-- bulk-allocate pooled tokens "toward" an institution so the institution can hand
-- them to its own beneficiaries.
--
-- Three pieces:
--   1. beneficiaries.institution_id  — optional partner an approved beneficiary
--      belongs to (admin-write table already; no RLS change needed).
--   2. institution_token_allocations — the bulk-allocation ledger (admin write,
--      admin+compliance read).
--   3. allocate_pooled_tokens_to_institution() — the atomic draw, modelled on
--      allocate_pooled_tokens (20260625000004): cap-check, pull N oldest pooled
--      tokens, flip them to 'distributed', log one distribution record each, AND
--      write the institution_token_allocations summary row — all in ONE locked
--      transaction. The service layer only writes audit_logs afterward.
--
-- RECONCILIATION NOTES:
--   * Token target state: institution-allocated tokens leave `in_admin_pool` and
--     become `distributed` (a redeemable state — REDEEMABLE_STATUSES in
--     lib/services/redemption.ts is {live, distributed}). The institution then
--     hands them to its beneficiaries who redeem at vendors. We do NOT invent a
--     new token_status enum value. The volunteer pool-pull (FOR UPDATE SKIP
--     LOCKED on in_admin_pool) and this one never double-claim the same token.
--   * distribution_channel has no 'institution' value and we deliberately do NOT
--     add one (an ALTER TYPE ADD VALUE can't share this txn). The per-token
--     token_distribution_records row is written with channel = NULL (the column
--     is nullable) + an explanatory note; the institution linkage of record is
--     the institution_token_allocations row. A NULL-channel record on a
--     `distributed` token never enters the volunteer holdings derivation (which
--     only inspects assigned_to_volunteer tokens on GRANT_CHANNELS).
--   * cap = system_config.institution_bulk_allocation_max (seeded NULL in
--     20260630000002). NULL/unset => no cap (soft-skip), never invent a default.
--
-- Depends on M05 (beneficiaries), M13 (ngo_partners), M16 (tokens,
-- token_distribution_records), M03 (system_config), M02 (users, set_updated_at).
-- Apply order: … → 20260630000002 → 20260630000007.
-- =============================================================================

begin;

-- --- 1. beneficiaries.institution_id -----------------------------------------
alter table public.beneficiaries
    add column if not exists institution_id uuid
        references public.ngo_partners (id) on delete set null;

comment on column public.beneficiaries.institution_id is
    'Optional partner institution (ngo_partners) this beneficiary belongs to (addon #11). Powers per-institution redemption reporting.';

create index if not exists beneficiaries_institution_idx
    on public.beneficiaries (institution_id) where institution_id is not null;

-- --- 2. institution_token_allocations (bulk-allocation ledger) ----------------
create table public.institution_token_allocations (
    id             uuid primary key default gen_random_uuid(),
    ngo_partner_id uuid not null references public.ngo_partners (id) on delete cascade,
    token_count    integer not null check (token_count > 0),
    allocated_by   uuid references public.users (id) on delete set null,
    status         text not null default 'pending'
        check (status in ('pending', 'allocated', 'cancelled')),
    notes          text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table public.institution_token_allocations is
    'Ledger of admin bulk token allocations toward partner institutions (addon #11). Each allocated row corresponds to N pooled tokens drawn into the field via the institution.';

create index institution_allocations_ngo_idx
    on public.institution_token_allocations (ngo_partner_id, created_at desc);
create index institution_allocations_status_idx
    on public.institution_token_allocations (status);

create trigger institution_token_allocations_set_updated_at
    before update on public.institution_token_allocations
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — admin writes; admin + compliance read (matrix §6 audit-altitude).
-- The RPC runs SECURITY DEFINER and the admin route uses the service-role client,
-- both of which bypass RLS for the actual draw/insert.
-- =============================================================================
alter table public.institution_token_allocations enable row level security;

create policy institution_allocations_select_staff on public.institution_token_allocations
    for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy institution_allocations_write_admin on public.institution_token_allocations
    for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- =============================================================================
-- 3. allocate_pooled_tokens_to_institution — atomic institution bulk draw.
-- Modelled on allocate_pooled_tokens (20260625000004). Returns the new
-- allocation id + the count actually moved (one row).
-- =============================================================================
create or replace function public.allocate_pooled_tokens_to_institution(
    p_ngo_partner_id uuid,
    p_count          integer,
    p_allocated_by   uuid,
    p_notes          text default null
)
returns table (allocation_id uuid, moved_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ngo_status   text;
    v_cap          numeric;
    v_moved_ids    uuid[];
    v_alloc_id     uuid;
    v_now          timestamptz := now();
begin
    if p_count is null or p_count <= 0 then
        raise exception 'count must be a positive integer';
    end if;

    -- Resolve the institution (and serialise concurrent allocations to the same
    -- partner by locking its row).
    select status into v_ngo_status
        from public.ngo_partners
        where id = p_ngo_partner_id
        for update;
    if not found then
        raise exception 'institution (ngo_partner) not found';
    end if;
    if v_ngo_status <> 'active' then
        raise exception 'cannot allocate to a % institution', v_ngo_status;
    end if;

    -- Per-allocation cap (addon #11). NULL/empty => no cap (soft-skip; never
    -- invent a default — AGENTS.md hard rule).
    select case
               when value is null or btrim(value) = '' then null
               else value::numeric
           end
        into v_cap
        from public.system_config
        where key = 'institution_bulk_allocation_max';

    if v_cap is not null and p_count > v_cap then
        raise exception
            'requested % exceeds institution_bulk_allocation_max (%)', p_count, v_cap;
    end if;

    -- Claim N oldest pooled tokens and flip them to 'distributed'. SKIP LOCKED so
    -- this and the volunteer pool-pull never double-claim a token; the per-token
    -- guard on in_admin_pool prevents two institution draws racing for one token.
    with claimed as (
        select t.id
        from public.tokens t
        where t.status = 'in_admin_pool'
        order by t.minted_at asc
        limit p_count
        for update skip locked
    ),
    moved as (
        update public.tokens t
            set status = 'distributed', distributed_at = v_now
            from claimed c
            where t.id = c.id
              and t.status = 'in_admin_pool'
            returning t.id
    )
    select array_agg(id) into v_moved_ids from moved;

    if v_moved_ids is null or array_length(v_moved_ids, 1) < p_count then
        raise exception
            'admin pool has fewer than % allocatable token(s)', p_count;
    end if;

    -- One distribution record per moved token (channel NULL — no institution
    -- channel value exists; the allocation row below is the institution linkage).
    insert into public.token_distribution_records (token_id, distributed_by, channel, notes, distributed_at)
    select u.id, p_allocated_by, null, 'institution bulk allocation', v_now
    from unnest(v_moved_ids) as u(id);

    -- Summary ledger row (status 'allocated' — the draw succeeded atomically).
    insert into public.institution_token_allocations
        (ngo_partner_id, token_count, allocated_by, status, notes)
    values
        (p_ngo_partner_id, array_length(v_moved_ids, 1), p_allocated_by, 'allocated', p_notes)
    returning id into v_alloc_id;

    return query select v_alloc_id, array_length(v_moved_ids, 1);
end;
$$;

comment on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) is
    'Atomic institution bulk allocation (addon #11): cap check + oldest-first pool pull + flip to distributed + per-token distribution records + institution_token_allocations summary row, in one locked transaction. Called by lib/services/institution.ts.';

revoke all on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) to service_role;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop function if exists public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text);
-- drop table if exists public.institution_token_allocations cascade;
-- drop index if exists public.beneficiaries_institution_idx;
-- alter table public.beneficiaries drop column if exists institution_id;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000008_csr.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #7 — Corporate CSR donor profiles
-- =============================================================================
-- Branches an existing donors row into a CORPORATE donor (company metadata + an
-- optional implementing NGO partner). It deliberately REUSES the existing donor
-- spine — donors, campaigns and donations.financial_year — rather than building a
-- parallel corporate-donation model. CSR reporting (lib/services/csr.ts) then
-- aggregates donations for these corporate donors and stores the result by
-- REUSING compliance_reports with report_type='csr' (already in the report_type
-- enum — no new enum value, no new report table).
--
-- 80G UTILIZATION CERTIFICATES ARE OUT OF SCOPE for Phase-1: they need an 80G
-- registration + an email/PDF provider (open items). The feature is gated behind
-- system_config.csr_80g_certificates_enabled (seeded false in 20260630000002).
-- This migration adds NO certificate storage; the app only shows a disabled
-- affordance + a marked TODO until those open items are resolved.
--
-- Depends on M15 (donors, current_donor_id), M13 (ngo_partners), M02 (users,
-- set_updated_at). Apply order: … → 20260630000007 → 20260630000008.
-- =============================================================================

begin;

create table public.corporate_csr_profiles (
    id                  uuid primary key default gen_random_uuid(),
    -- One CSR profile per donor: this BRANCHES a donors row into a corporate donor.
    donor_id            uuid not null unique references public.donors (id) on delete cascade,
    company_name        text not null,
    cin                 text,                                   -- Corporate Identification Number (optional)
    registration_number text,
    csr_focus_area      text,
    -- Optional implementing partner the company channels its CSR through.
    ngo_partner_id      uuid references public.ngo_partners (id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table public.corporate_csr_profiles is
    'Corporate CSR donor profile (addon #7). Branches a donors row into a company donor; reuses donors/campaigns/donations.financial_year. 80G certificates are gated off (csr_80g_certificates_enabled).';
comment on column public.corporate_csr_profiles.cin is
    'Corporate Identification Number. Optional; no 80G utilization-certificate logic is built yet (blocked on 80G registration + email/PDF provider).';

create index corporate_csr_profiles_ngo_idx
    on public.corporate_csr_profiles (ngo_partner_id) where ngo_partner_id is not null;

create trigger corporate_csr_profiles_set_updated_at
    before update on public.corporate_csr_profiles
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — mirrors the donors policies: the owning donor reads their own profile;
-- admin has full CRUD; compliance reads. The donor self-service write goes
-- through a server route on the service-role client AFTER the matrix check
-- (same discipline as donor/profile), so there is no anon write surface.
-- =============================================================================
alter table public.corporate_csr_profiles enable row level security;

create policy corporate_csr_select_own on public.corporate_csr_profiles for select to authenticated
    using (donor_id = public.current_donor_id());
create policy corporate_csr_select_staff on public.corporate_csr_profiles for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
-- The donor may create/update their own profile directly (RLS-scoped); the
-- server route still runs the matrix check first.
create policy corporate_csr_modify_own on public.corporate_csr_profiles for all to authenticated
    using (donor_id = public.current_donor_id())
    with check (donor_id = public.current_donor_id());
create policy corporate_csr_write_admin on public.corporate_csr_profiles for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.corporate_csr_profiles cascade;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000009_proof_integrity.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #10 — settlement duplicate-proof detection + random settlement audit
-- =============================================================================
-- Two net-new pieces of audit machinery, both behind admin-tunable system_config
-- thresholds (lib/system-config.ts; soft-skip while unset — AGENTS.md hard rule):
--
--   1. token_redemptions.proof_photo_phash — a perceptual hash of the uploaded
--      plate photo, computed at proof-upload time (lib/services/proofIntegrity.ts).
--      A duplicate photo (Hamming distance <= proof_phash_dup_distance against an
--      existing proof) is the signal that the same plate is being re-used across
--      redemptions. On a hit the upload route holds the related settlement(s) and
--      raises a fraud flag (REUSING flag_type 'vendor_anomaly' — no new enum value,
--      ALTER TYPE ADD VALUE is irreversible).
--
--   2. settlement_audit_queue — settlements pulled for human review, either
--      RANDOMLY (settlement_random_audit_rate sampling in runSettlement) or because
--      a duplicate-proof / anomaly flagged them. The admin clears or flags each.
--
-- RLS: internal audit surface — admin + compliance only (mirrors fraud_flags m11).
--
-- Apply AFTER m17 (token_redemptions, settlement_line_items), m10
-- (vendor_settlements) and m02 (users, current_app_role). Idempotent.
-- =============================================================================

begin;

-- --- 1. perceptual hash on the proof photo -----------------------------------
alter table public.token_redemptions
    add column if not exists proof_photo_phash text;

comment on column public.token_redemptions.proof_photo_phash is
    'Perceptual (average) hash of the uploaded plate photo, hex-encoded. Used to detect duplicate proof photos re-used across redemptions (addon #10). NULL until proof is uploaded.';

-- Partial index: only the rows that actually carry a hash participate in the
-- duplicate scan (the vast majority are NULL until proof upload).
create index if not exists token_redemptions_proof_phash_idx
    on public.token_redemptions (proof_photo_phash)
    where proof_photo_phash is not null;

-- --- 2. settlement audit queue -----------------------------------------------
create table if not exists public.settlement_audit_queue (
    id            uuid primary key default gen_random_uuid(),
    settlement_id uuid not null references public.vendor_settlements (id) on delete cascade,
    reason        text,                                   -- 'random_sample' | 'duplicate_proof' | free text
    status        text not null default 'pending'
        check (status in ('pending', 'cleared', 'flagged')),
    selected_at   timestamptz default now(),
    reviewed_by   uuid references public.users (id) on delete set null,
    reviewed_at   timestamptz
);

comment on table public.settlement_audit_queue is
    'Settlements pulled for human audit (addon #10) — randomly sampled (settlement_random_audit_rate) or flagged by duplicate-proof/anomaly detection. Admin clears or flags each before payout release.';

create index if not exists settlement_audit_queue_settlement_idx
    on public.settlement_audit_queue (settlement_id);
create index if not exists settlement_audit_queue_status_idx
    on public.settlement_audit_queue (status);

-- =============================================================================
-- RLS — internal audit surface: read AND manage by admin + compliance only.
-- (The detection/sampling services insert via the service-role client, which
--  bypasses RLS.)
-- =============================================================================
alter table public.settlement_audit_queue enable row level security;

create policy settlement_audit_select_staff on public.settlement_audit_queue for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy settlement_audit_insert_staff on public.settlement_audit_queue for insert to authenticated
    with check (public.current_app_role() in ('admin', 'compliance'));

create policy settlement_audit_update_staff on public.settlement_audit_queue for update to authenticated
    using (public.current_app_role() in ('admin', 'compliance'))
    with check (public.current_app_role() in ('admin', 'compliance'));

-- DELETE: admin only (compliance reviews but does not erase the audit trail).
create policy settlement_audit_delete_admin on public.settlement_audit_queue for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.settlement_audit_queue cascade;
-- drop index if exists public.token_redemptions_proof_phash_idx;
-- alter table public.token_redemptions drop column if exists proof_photo_phash;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000010_volunteer_activity.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #13 — volunteer area assignment + field-activity log
-- =============================================================================
-- Gives a volunteer a geographic zone (assigned_area) plus an approval audit
-- trail (approved_by/approved_at), and records each on-ground action they take in
-- an append-only volunteer_activity_log. Activity is keyed by the EXISTING enum
-- public.volunteer_activity_type (Wave 0, m20260630000001): 'token_distributed' |
-- 'registration_assisted'. The zone feature is gated at the app layer by
-- system_config volunteer_zones_enabled (soft-skip while off).
--
-- The new volunteers columns are STAFF-SET: the guard_volunteer_controlled_cols
-- trigger (m09) is extended so a volunteer editing their own profile can never set
-- their own zone or approval fields (same discipline as status/user_id).
--
-- RLS: staff read all activity; a volunteer reads only their own rows.
--
-- Apply AFTER m09 (volunteers + guard trigger), the volunteer_status_pending
-- widening, and the addon enums migration (volunteer_activity_type). Idempotent.
-- =============================================================================

begin;

-- --- 1. volunteer zone + approval audit columns ------------------------------
alter table public.volunteers
    add column if not exists assigned_area text,
    add column if not exists approved_by   uuid references public.users (id) on delete set null,
    add column if not exists approved_at   timestamptz;

comment on column public.volunteers.assigned_area is
    'Geographic zone a volunteer is assigned to (addon #13). Staff-set; gated by system_config volunteer_zones_enabled.';
comment on column public.volunteers.approved_by is
    'The staff user who approved this volunteer (addon #13). Staff-set.';

-- --- 2. extend the controlled-column guard to the new staff-set columns -------
-- A volunteer may edit their own profile (RLS volunteers_update_own) but must not
-- self-assign a zone or forge approval fields. Re-create the m09 guard with the
-- three new columns added to the staff-only set.
--
-- RECONCILIATION (vs m09): the allow-branch now ALSO passes when current_app_role()
-- IS NULL — i.e. the trusted service-role/system context that every admin route
-- uses (createAdminClient bypasses RLS but triggers still fire, and a service-role
-- JWT carries no sub, so current_app_role() is null). The admin status/zone/approval
-- mutations all flow through that path. An AUTHENTICATED volunteer still has
-- role='volunteer' (non-null) and remains blocked; anon cannot update volunteers at
-- all (no RLS policy). So this only trusts the backend, never widens user access.
create or replace function public.guard_volunteer_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() is null
       or public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status        is distinct from old.status
       or new.user_id       is distinct from old.user_id
       or new.assigned_area is distinct from old.assigned_area
       or new.approved_by   is distinct from old.approved_by
       or new.approved_at   is distinct from old.approved_at then
        raise exception 'only admin/vendor_manager may change volunteer status, user_id, zone or approval fields';
    end if;
    return new;
end;
$$;

-- --- 3. volunteer_activity_log -----------------------------------------------
create table if not exists public.volunteer_activity_log (
    id            uuid primary key default gen_random_uuid(),
    volunteer_id  uuid not null references public.volunteers (id) on delete cascade,
    activity_type public.volunteer_activity_type not null,
    ref_id        uuid,                              -- the token / registration this action concerns
    created_at    timestamptz not null default now()
);

comment on table public.volunteer_activity_log is
    'Append-only log of volunteer field actions (addon #13). activity_type is the Wave-0 volunteer_activity_type enum; ref_id points at the affected token / registration (no FK — polymorphic).';

create index if not exists volunteer_activity_log_volunteer_idx
    on public.volunteer_activity_log (volunteer_id, created_at desc);
create index if not exists volunteer_activity_log_type_idx
    on public.volunteer_activity_log (activity_type);

-- =============================================================================
-- RLS — staff read all; a volunteer reads only their own activity. Inserts come
-- from the service-role client (lib/services/volunteerActivity.ts), which
-- bypasses RLS; an explicit staff insert policy is kept for completeness.
-- =============================================================================
alter table public.volunteer_activity_log enable row level security;

create policy volunteer_activity_select_staff on public.volunteer_activity_log for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));

create policy volunteer_activity_select_own on public.volunteer_activity_log for select to authenticated
    using (exists (
        select 1 from public.volunteers v
        where v.id = volunteer_id and v.user_id = auth.uid()
    ));

create policy volunteer_activity_insert_staff on public.volunteer_activity_log for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.volunteer_activity_log cascade;
-- -- restore the m09 guard (status + user_id only)
-- create or replace function public.guard_volunteer_controlled_cols()
-- returns trigger language plpgsql as $$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then
--         return new;
--     end if;
--     if new.status is distinct from old.status
--        or new.user_id is distinct from old.user_id then
--         raise exception 'only admin/vendor_manager may change volunteer status or user_id';
--     end if;
--     return new;
-- end;
-- $$;
-- alter table public.volunteers
--     drop column if exists approved_at,
--     drop column if exists approved_by,
--     drop column if exists assigned_area;
-- commit;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260630000011_transparency_fn.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- ADDON #14 — public transparency stats (aggregate-only, anon-callable)
-- =============================================================================
-- A single SECURITY DEFINER function that returns ONLY aggregate scalars — no PII,
-- no row-level data — so it can power a public transparency dashboard without
-- widening anon SELECT on any base table. The function body runs as its owner
-- (definer), reading the underlying tables; only EXECUTE on the function is
-- granted to anon/authenticated. Mirrors the m15 current_donor_id() pattern
-- (security definer + locked search_path + revoke-from-public + explicit grants).
--
-- The public route (app/api/public/transparency/route.ts) still gates the whole
-- feature behind system_config transparency_dashboard_enabled — this function is
-- the data source, not the on/off switch.
--
-- Apply AFTER m15 (donations), m17 (token_redemptions), m16 (tokens), m04
-- (vendors) and the beneficiaries table. Idempotent (create or replace).
-- =============================================================================

begin;

create or replace function public.public_transparency_stats()
returns table (
    total_donations_inr   numeric,
    meals_sponsored       bigint,
    meals_served          bigint,
    active_vendors        bigint,
    active_beneficiaries  bigint,
    cities_covered        bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        coalesce((select sum(amount_inr) from public.donations where status = 'completed'), 0)::numeric
            as total_donations_inr,
        (select count(*) from public.tokens)                                  as meals_sponsored,
        (select count(*) from public.token_redemptions)                       as meals_served,
        (select count(*) from public.vendors where status = 'approved')       as active_vendors,
        (select count(*) from public.beneficiaries where status = 'active')   as active_beneficiaries,
        (select count(distinct city) from public.vendors
            where status = 'approved' and city is not null)                   as cities_covered;
$$;

comment on function public.public_transparency_stats() is
    'Aggregate-only public transparency metrics (addon #14). SECURITY DEFINER so anon can read totals WITHOUT base-table SELECT access. Returns no PII / no row data.';

-- Lock down then re-grant: only EXECUTE is public-facing.
revoke all on function public.public_transparency_stats() from public;
grant execute on function public.public_transparency_stats() to anon, authenticated;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop function if exists public.public_transparency_stats();
-- commit;

