-- =============================================================================
-- operating_city config — bound city for the city-lock redemption rule (PRD §6/§7)
-- =============================================================================
-- `city_lock_enabled` (seeded true in m03) is a documented admin "beneficiary
-- protection rule", but the redemption engine had nothing to lock AGAINST: there
-- is no per-token or per-beneficiary city column in the schema. This adds the
-- authoritative bound city as a system_config row — the single city pApAmA is
-- operating in for Phase 1.
--
-- At redemption (lib/services/redemption.ts) the engine, when city_lock_enabled is
-- true, compares the vendor's `city` to this value (case-insensitive) as a HARD
-- check. It is intentionally seeded NULL (not a guessed city): until the admin sets
-- the operating city, the city-lock rule SOFT-skips rather than locking against a
-- made-up value — same "never invent a default" discipline as the other configs.
-- Set it from the admin system-config screen before relying on city lock.
--
-- value_type 'string' matches lib/system-config.ts getString(). Idempotent.
-- Apply AFTER m03 (system_config). DO NOT need any table change — config row only.
-- =============================================================================

begin;

insert into public.system_config (key, value, value_type, description) values
    ('operating_city', null, 'string',
     'The city pApAmA operates in; the bound city for the city_lock_enabled redemption rule. '
     'NULL until the admin sets it (city lock soft-skips while unset). Compared case-insensitively to vendors.city.')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- delete from public.system_config where key = 'operating_city';
-- commit;
