-- =============================================================================
-- M03 — system_config table + seed (Developer 2)
-- =============================================================================
-- Net-new. No collision with Developer 1's 12 tables, no Section-A decision.
--
-- Every tunable rule in pApAmA is a row here (spec §7 / AGENTS.md hard rule):
-- running code reads these at runtime via lib/system-config.ts and NEVER
-- hard-codes them. `value` is stored as text and coerced by value_type.
--
-- Depends on M02 (public.users + current_app_role() for RLS). Apply M01→M02→M03.
-- =============================================================================

begin;

-- --- table -------------------------------------------------------------------
create table public.system_config (
    key         text primary key,
    value       text,                       -- nullable: an unset row (e.g. TBD) is valid
    value_type  text not null
        check (value_type in ('number', 'boolean', 'string')),
    description text,
    updated_by  uuid references public.users (id) on delete set null,
    updated_at  timestamptz not null default now()
);

comment on table  public.system_config is 'Admin-tunable rules; read at runtime via lib/system-config.ts. Never hard-coded.';
comment on column public.system_config.value is 'Stored as text, coerced per value_type. NULL = intentionally unset (e.g. pending mentor input).';

-- reuse public.set_updated_at() from M02
create trigger system_config_set_updated_at
    before update on public.system_config
    for each row execute function public.set_updated_at();

-- --- RLS: any authenticated user reads; only admin writes --------------------
alter table public.system_config enable row level security;

create policy system_config_select_authenticated
    on public.system_config for select
    to authenticated
    using (true);

create policy system_config_insert_admin
    on public.system_config for insert
    to authenticated
    with check (public.current_app_role() = 'admin');

create policy system_config_update_admin
    on public.system_config for update
    to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

create policy system_config_delete_admin
    on public.system_config for delete
    to authenticated
    using (public.current_app_role() = 'admin');

-- --- seed: client-confirmed §7 defaults --------------------------------------
insert into public.system_config (key, value, value_type, description) values
    ('standard_token_value',             '50',   'number',  'Standard food token value in INR (threshold for minting).'),
    ('special_care_multiplier',          '2',    'number',  'Special Care token value as a multiple of standard (up to 2x).'),
    ('special_care_post_delivery_months','6',    'number',  'Post-delivery eligibility window for pregnancy category, in months [client Q10].'),
    ('token_expiry_days',                '90',   'number',  'Days until an unredeemed token auto-expires.'),
    ('meal_cooldown_hours',              '6',    'number',  'Minimum gap between redemptions for the same beneficiary, in hours.'),
    ('max_meals_per_day',                '2',    'number',  'Maximum meals per beneficiary per day (client-confirmed).'),
    ('redemption_radius_km',             '20',   'number',  'Allowed redemption radius in km.'),
    ('city_lock_enabled',                'true', 'boolean', 'Restrict redemption to the token''s city when enabled.'),
    ('co_contribution_max',              '5',    'number',  'Max optional beneficiary co-pay in INR (0 always allowed).'),
    ('courier_batch_min_value',          '5000', 'number',  'Minimum batch value (INR) to dispatch printed tokens by courier.'),
    ('vendor_min_rating',                '3.5',  'number',  'Minimum vendor rating before suspension review.'),
    ('vendor_max_complaint_rate',        '5',    'number',  'Maximum vendor complaint rate (percent) before review.');

-- OPEN ITEM (ASSUMPTIONS.md): value intentionally NULL — do NOT invent a number.
insert into public.system_config (key, value, value_type, description) values
    ('max_tokens_per_volunteer', null, 'number',
     'Concurrent undistributed-token holding limit per volunteer. TBD — mentor must set.');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists system_config_delete_admin          on public.system_config;
-- drop policy if exists system_config_update_admin          on public.system_config;
-- drop policy if exists system_config_insert_admin          on public.system_config;
-- drop policy if exists system_config_select_authenticated  on public.system_config;
-- drop trigger if exists system_config_set_updated_at       on public.system_config;
-- drop table if exists public.system_config;
-- commit;
