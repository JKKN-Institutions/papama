-- =============================================================================
-- Phase-1 batch 2026-07-16 — config seeds for #9, #16, #21, #22
-- =============================================================================
-- Boolean flags ship OFF (false) so every addon behaviour stays dark until an
-- admin opts in (same convention as 20260630000002_addon_config_seed.sql).
-- Numeric thresholds seed NULL — never invent a value (AGENTS.md hard rule);
-- soft-skip until an admin sets one.
--
-- token_revalidation_allowed: spec §7 suggests a default of `true`, but every
-- other addon boolean in this codebase ships OFF by convention. Seeded
-- `false` here — flagged in ASSUMPTIONS.md as a one-line, easily reversible
-- decision point if the client/spec owner wants `true` at launch instead.
--
-- Apply AFTER 20260716090005.
-- =============================================================================

insert into public.system_config (key, value, value_type, description) values
    ('token_revalidation_allowed', 'false', 'boolean', 'Admin may revalidate/extend an expired token (spec §3.2/§7, addon #22). Seeded OFF pending client confirmation of the spec-suggested `true` default — see ASSUMPTIONS.md.')
on conflict (key) do nothing;

insert into public.system_config (key, value, value_type, description) values
    ('vendor_inspection_fail_penalty',        null, 'number', 'Quality-score points deducted per failed surprise inspection (addon #16). NULL = feature off (soft-skip).'),
    ('meal_cooldown_hours_pregnant_women',    null, 'number', 'Category-level cooldown override for pregnant_women (spec §3.1 F-9, addon #21). NULL = falls back to meal_cooldown_hours.'),
    ('meal_cooldown_hours_patient',           null, 'number', 'Category-level cooldown override for patient (addon #21). NULL = falls back to meal_cooldown_hours.'),
    ('meal_cooldown_hours_disability',        null, 'number', 'Category-level cooldown override for disability (addon #21). NULL = falls back to meal_cooldown_hours.'),
    ('meal_cooldown_hours_disaster_affected', null, 'number', 'Category-level cooldown override for disaster_affected (addon #21). NULL = falls back to meal_cooldown_hours.'),
    ('emergency_mode_max_duration_days',      null, 'number', 'Auto-revert window (days) for emergency_mode_enabled and active emergency_overrides rows (spec §7, addon #9). NULL = no auto-revert (soft-skip).')
on conflict (key) do nothing;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- delete from public.system_config where key in (
--     'token_revalidation_allowed', 'vendor_inspection_fail_penalty',
--     'meal_cooldown_hours_pregnant_women', 'meal_cooldown_hours_patient',
--     'meal_cooldown_hours_disability', 'meal_cooldown_hours_disaster_affected',
--     'emergency_mode_max_duration_days'
-- );
-- commit;
