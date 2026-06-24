-- =============================================================================
-- Scheduled token expire-sweep (TOK-6) — pg_cron
-- =============================================================================
-- The admin Tokens page now has a manual "Run expire-sweep" button, but expiry
-- should also run unattended. This installs a SQL expiry function (mirrors
-- app/api/admin/tokens/expire-sweep/route.ts) and a daily pg_cron job.
--
-- NOTE: pg_cron may need enabling in the Supabase dashboard (Database → Extensions)
-- before this applies. Fraud-scan scheduling is intentionally NOT included — its
-- anomaly logic lives in TypeScript (lib/services/fraud.ts); scheduling it would
-- need either a SQL port or a pg_net HTTP call to the route (follow-up).
--
-- Apply AFTER m16 (tokens) and m08 (audit_logs). Idempotent.
-- =============================================================================

begin;

create extension if not exists pg_cron;

-- Mirror of the route: flip any still-active token past its expiry to `expired`,
-- write one system audit row, return the count. SECURITY DEFINER so the cron job
-- (runs as the cron owner) can update tokens + insert the audit row.
create or replace function public.expire_tokens()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    update public.tokens
        set status = 'expired', expired_at = now()
        where expires_at is not null
          and expires_at < now()
          and status in ('generated', 'live', 'in_admin_pool', 'assigned_to_volunteer', 'distributed');
    get diagnostics v_count = row_count;

    if v_count > 0 then
        insert into public.audit_logs (actor_id, actor_role, action, entity_table, entity_id, summary, metadata)
        values (null, null, 'token.expire_sweep', 'tokens', null,
                format('auto-invalidated %s expired token(s) [cron]', v_count),
                jsonb_build_object('count', v_count, 'source', 'pg_cron'));
    end if;

    return v_count;
end;
$$;

revoke all on function public.expire_tokens() from public, anon, authenticated;
grant execute on function public.expire_tokens() to service_role;

-- Daily at 02:00 UTC. Unschedule any prior job of the same name first (idempotent).
select cron.unschedule('papama-expire-tokens')
    where exists (select 1 from cron.job where jobname = 'papama-expire-tokens');
select cron.schedule('papama-expire-tokens', '0 2 * * *', 'select public.expire_tokens();');

commit;

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- select cron.unschedule('papama-expire-tokens');
-- drop function if exists public.expire_tokens();
-- commit;
