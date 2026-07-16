-- =============================================================================
-- ADDON #9 (Phase-1 batch 2026-07-16) — emergency time-boxed config overrides
-- =============================================================================
-- Spec §3.3 [M1-8, M2-9]: disaster/emergency mode — temporary config overrides
-- (meal limits, cooldown) that auto-revert after emergency_mode_max_duration_days
-- (seeded in 20260716090006_addon_config_seed_batch2.sql). The emergency_mode
-- TOGGLE itself needs no new code (PATCH /api/admin/system-config is already
-- admin-only and audited — single-admin authority, spec §11.2 #5 default).
--
-- Mirrors the pg_cron dual SQL-function + admin-route sweep pattern from
-- 20260625000003_schedule_expire_sweep.sql (expire_tokens()).
--
-- Apply AFTER 20260716090006.
-- =============================================================================

begin;

create table public.emergency_overrides (
    id           uuid primary key default gen_random_uuid(),
    config_key   text not null,
    override_value text not null,
    reason       text,
    activated_by uuid references public.users (id) on delete set null,
    activated_at timestamptz not null default now(),
    expires_at   timestamptz,
    reverted_at  timestamptz,
    reverted_by  uuid references public.users (id) on delete set null,
    is_active    boolean not null default true
);

comment on table public.emergency_overrides is
    'Time-boxed system_config overrides activated during emergency mode (addon #9). Auto-reverts via the revert_emergency_overrides() pg_cron job when emergency_mode_max_duration_days elapses (NULL = no auto-revert, soft-skip).';

create index emergency_overrides_active_idx on public.emergency_overrides (is_active) where is_active;

alter table public.emergency_overrides enable row level security;

create policy emergency_overrides_select_staff on public.emergency_overrides
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));

create policy emergency_overrides_write_admin on public.emergency_overrides
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- Mirror of the TS sweep logic (app/api/admin/emergency/sweep/route.ts), for the
-- unattended pg_cron path — same dual-path discipline as expire_tokens().
create extension if not exists pg_cron;

create or replace function public.revert_emergency_overrides()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
    v_max_days numeric;
begin
    select case when value is null or btrim(value) = '' then null else value::numeric end
        into v_max_days
        from public.system_config
        where key = 'emergency_mode_max_duration_days';

    if v_max_days is null then
        return 0; -- no auto-revert configured — soft-skip
    end if;

    update public.emergency_overrides
        set is_active = false, reverted_at = now()
        where is_active and activated_at < now() - (v_max_days || ' days')::interval;
    get diagnostics v_count = row_count;

    if v_count > 0 then
        insert into public.audit_logs (actor_id, actor_role, action, entity_table, entity_id, summary, metadata)
        values (null, null, 'emergency.override.auto_revert', 'emergency_overrides', null,
                format('auto-reverted %s emergency override(s) [cron]', v_count),
                jsonb_build_object('count', v_count, 'source', 'pg_cron'));
    end if;

    return v_count;
end;
$$;

revoke all on function public.revert_emergency_overrides() from public, anon, authenticated;
grant execute on function public.revert_emergency_overrides() to service_role;

select cron.unschedule('papama-revert-emergency-overrides')
    where exists (select 1 from cron.job where jobname = 'papama-revert-emergency-overrides');
select cron.schedule('papama-revert-emergency-overrides', '0 3 * * *', 'select public.revert_emergency_overrides();');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- select cron.unschedule('papama-revert-emergency-overrides');
-- drop function if exists public.revert_emergency_overrides();
-- drop table if exists public.emergency_overrides cascade;
-- commit;
