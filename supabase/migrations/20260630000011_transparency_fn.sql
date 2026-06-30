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
