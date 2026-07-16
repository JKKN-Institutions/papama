-- =============================================================================
-- ADDON #9 follow-up — auto-revert sweep must restore system_config too
-- =============================================================================
-- The original revert_emergency_overrides() only flipped emergency_overrides.
-- is_active — it never restored the system_config value, so an auto-reverted
-- override left the OVERRIDDEN value live in system_config forever. This
-- reissues the function to also CAS-restore each row's previous_value.
--
-- Apply directly after 20260716090007b.
-- =============================================================================

create or replace function public.revert_emergency_overrides()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer := 0;
    v_max_days numeric;
    v_row record;
begin
    select case when value is null or btrim(value) = '' then null else value::numeric end
        into v_max_days
        from public.system_config
        where key = 'emergency_mode_max_duration_days';

    if v_max_days is null then
        return 0; -- no auto-revert configured — soft-skip
    end if;

    for v_row in
        select id, config_key, override_value, previous_value
        from public.emergency_overrides
        where is_active and activated_at < now() - (v_max_days || ' days')::interval
    loop
        update public.emergency_overrides
            set is_active = false, reverted_at = now()
            where id = v_row.id;

        -- CAS restore: only touch system_config if it still holds the override
        -- unchanged (an admin's newer intentional change is never clobbered).
        update public.system_config
            set value = v_row.previous_value, updated_at = now()
            where key = v_row.config_key
              and value = v_row.override_value;

        v_count := v_count + 1;
    end loop;

    if v_count > 0 then
        insert into public.audit_logs (actor_id, actor_role, action, entity_table, entity_id, summary, metadata)
        values (null, null, 'emergency.override.auto_revert', 'emergency_overrides', null,
                format('auto-reverted %s emergency override(s) [cron]', v_count),
                jsonb_build_object('count', v_count, 'source', 'pg_cron'));
    end if;

    return v_count;
end;
$$;

-- =============================================================================
-- DOWN
-- =============================================================================
-- Recreate the prior (non-restoring) function body from 20260716090007.sql.
