-- =============================================================================
-- ADDON #17 (Phase-1 batch 2026-07-16) — token 'blocked' status
-- =============================================================================
-- Spec §3.2 Token rules [M2-5]: lost-token handling — old token is blocked
-- instantly upon report, a replacement is minted referencing
-- `replacement_for_token_id` (column already exists, added as a seam earlier).
-- `lib/types/enums.ts` TOKEN_STATUSES already declares 'blocked'; this
-- migration makes the live enum match it.
--
-- Apply AFTER 20260702100432.
-- =============================================================================

alter type public.token_status add value if not exists 'blocked';

-- =============================================================================
-- DOWN
-- =============================================================================
-- Postgres cannot remove an enum value once added.
