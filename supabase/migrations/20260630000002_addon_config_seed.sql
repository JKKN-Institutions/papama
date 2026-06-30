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
