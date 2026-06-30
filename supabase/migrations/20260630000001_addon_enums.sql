-- =============================================================================
-- ADDON — Phase-1 addon enum types
-- =============================================================================
-- Mirrors lib/types/enums.ts exactly (single source of truth for allowed values):
--   MEAL_TYPES               -> public.meal_type
--   VOLUNTEER_ACTIVITY_TYPES -> public.volunteer_activity_type
--
-- Net-new TYPES for the Phase-1 addon (meal windows #1, volunteer activity #13).
-- They do NOT touch any existing table. Follows the m01 named-type pattern.
--
-- Apply this file as-is. To roll back, run the DOWN block at the bottom (after
-- rolling back any later addon migration that references these types first).
-- =============================================================================

begin;

create type public.meal_type as enum (
    'breakfast', 'lunch', 'dinner', 'snack'
);

create type public.volunteer_activity_type as enum (
    'token_distributed', 'registration_assisted'
);

commit;

-- =============================================================================
-- DOWN (rollback) — drop in reverse dependency order.
-- =============================================================================
-- begin;
-- drop type if exists public.volunteer_activity_type;
-- drop type if exists public.meal_type;
-- commit;
