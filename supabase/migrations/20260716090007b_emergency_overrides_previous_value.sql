-- =============================================================================
-- ADDON #9 follow-up — capture the pre-override system_config value
-- =============================================================================
-- `emergency_overrides` needs the ORIGINAL value to restore on revert (manual
-- or auto). Without it, a revert can only null the key out, which is wrong
-- for a config that had a real prior value. Apply directly after
-- 20260716090007_emergency_overrides.sql.
-- =============================================================================

alter table public.emergency_overrides
    add column if not exists previous_value text;

comment on column public.emergency_overrides.previous_value is
    'system_config.value captured at activation time, restored on revert (addon #9). NULL if the key had no prior value.';

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- alter table public.emergency_overrides drop column if exists previous_value;
-- commit;
