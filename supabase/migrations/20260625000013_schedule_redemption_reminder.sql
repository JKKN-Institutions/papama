-- =============================================================================
-- Scheduled-occasion 7-day reminder (DIST-6) — pg_cron
-- =============================================================================
-- token-flow / PRD DIST-6 require a donor to be able to schedule a token for a
-- future occasion and receive a reminder 7 days out. The donor-facing schedule
-- write/read lives in app/api/donor/tokens/[id]/schedule + the
-- scheduled_redemption_dates table; this migration adds the unattended reminder.
--
-- It installs a SQL reminder function (mirrors
-- app/api/admin/scheduled-reminders/sweep/route.ts) and a daily pg_cron job:
-- for every scheduled_redemption_dates row still 'scheduled' whose scheduled_for
-- is exactly 7 days out, insert one in-app notification to the token's donor and
-- flip the row to 'reminded' (so the same occasion is never reminded twice).
--
-- NOTE: pg_cron may need enabling in the Supabase dashboard (Database →
-- Extensions) before this applies. Mirrors the expire-sweep pattern in
-- 20260625000003_schedule_expire_sweep.sql.
--
-- Apply AFTER m16 (tokens), the migration that creates scheduled_redemption_dates,
-- the notifications table migration, and m08 (audit_logs). Idempotent.
-- =============================================================================

begin;

create extension if not exists pg_cron;

-- The reminder marks a schedule 'reminded' (so the same occasion is never
-- reminded twice), and the donor schedule service supersedes via 'cancelled'.
-- The original scheduled_redemption_dates status CHECK only allowed
-- scheduled|completed|cancelled, so widen it to include 'reminded' or the
-- UPDATE below (and lib/scheduling/scheduled-redemption.ts) would violate it.
alter table public.scheduled_redemption_dates
    drop constraint if exists scheduled_redemption_dates_status_check;
alter table public.scheduled_redemption_dates
    add constraint scheduled_redemption_dates_status_check
    check (status in ('scheduled', 'reminded', 'completed', 'cancelled'));

-- Mirror of the route: notify donors of schedules 7 days out, mark them reminded,
-- write one system audit row, return the count. SECURITY DEFINER so the cron job
-- (runs as the cron owner) can read tokens, insert notifications + the audit row,
-- and update the schedule rows.
create or replace function public.send_scheduled_redemption_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_target date := (now() at time zone 'utc')::date + 7;
    v_count  integer := 0;
    r        record;
begin
    for r in
        select s.id            as schedule_id,
               s.token_id       as token_id,
               s.scheduled_for  as scheduled_for,
               s.location       as location,
               t.donor_id       as donor_id,
               t.value_inr      as value_inr
        from public.scheduled_redemption_dates s
        join public.tokens t on t.id = s.token_id
        where s.status = 'scheduled'
          and s.scheduled_for = v_target
          and t.donor_id is not null
    loop
        insert into public.notifications (donor_id, kind, title, message, metadata)
        values (
            r.donor_id,
            'redemption_reminder',
            'Your scheduled meal is in 7 days',
            format('A ₹%s token you scheduled is set for %s%s. It will be ready to redeem then.',
                   coalesce(r.value_inr::text, ''),
                   r.scheduled_for,
                   case when r.location is not null then ' at ' || r.location else '' end),
            jsonb_build_object('token_id', r.token_id, 'scheduled_for', r.scheduled_for,
                               'location', r.location, 'source', 'pg_cron')
        );

        update public.scheduled_redemption_dates
            set status = 'reminded'
            where id = r.schedule_id
              and status = 'scheduled';

        v_count := v_count + 1;
    end loop;

    if v_count > 0 then
        insert into public.audit_logs (actor_id, actor_role, action, entity_table, entity_id, summary, metadata)
        values (null, null, 'token.schedule_reminder', 'scheduled_redemption_dates', null,
                format('dispatched %s T-7d scheduled-redemption reminder(s) [cron]', v_count),
                jsonb_build_object('count', v_count, 'target_date', v_target, 'source', 'pg_cron'));
    end if;

    return v_count;
end;
$$;

revoke all on function public.send_scheduled_redemption_reminders() from public, anon, authenticated;
grant execute on function public.send_scheduled_redemption_reminders() to service_role;

-- Daily at 03:00 UTC (after the 02:00 expire-sweep). Unschedule any prior job of
-- the same name first (idempotent).
select cron.unschedule('papama-scheduled-redemption-reminders')
    where exists (select 1 from cron.job where jobname = 'papama-scheduled-redemption-reminders');
select cron.schedule('papama-scheduled-redemption-reminders', '0 3 * * *',
                     'select public.send_scheduled_redemption_reminders();');

commit;

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- select cron.unschedule('papama-scheduled-redemption-reminders');
-- drop function if exists public.send_scheduled_redemption_reminders();
-- commit;
