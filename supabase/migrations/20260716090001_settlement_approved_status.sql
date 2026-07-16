-- =============================================================================
-- ADDON #16 (Phase-1 batch 2026-07-16) — settlement 'approved' status
-- =============================================================================
-- Spec §3.1 F-2 [M2-4]: settlement approval step between locked and reconciled.
-- 'held' is deliberately NOT added here — the hold facility [M1-10] is already
-- implemented as the orthogonal `on_hold`/`hold_note` boolean pair added in
-- 20260625000002_settlement_hold.sql (see that file's own design-decision
-- comment). Only 'approved' is a real new lifecycle state.
--
-- Lifecycle becomes: pending -> locked -> approved -> reconciled -> paid,
-- with on_hold/hold_note togglable at any point before paid (unchanged).
--
-- Apply AFTER 20260702100432 (latest at time of writing).
-- =============================================================================

alter type public.settlement_status add value if not exists 'approved';

-- =============================================================================
-- DOWN
-- =============================================================================
-- Postgres cannot remove an enum value once added. There is no rollback for
-- this migration short of recreating the type and every column that uses it.
