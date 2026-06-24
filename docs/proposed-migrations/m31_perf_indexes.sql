-- ============================================================================
-- Migration m31 — performance indexes (PROPOSED — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply via Supabase MCP AFTER review. No data mutations; index-only changes
-- are safe to apply online with CONCURRENTLY (avoid table lock).
--
-- Purpose: supports the settlement engine's per-status, date-ordered scan of
-- token_redemptions (payment_status='released' ORDER BY redeemed_at ASC).
-- Without this index Postgres must full-scan the table on every settlement run.
--
-- Additional context: the settlement anti-join (LEFT JOIN settlement_line_items)
-- already benefits from the FK index on settlement_line_items.redemption_id
-- created by the foreign key constraint. This index covers the OTHER side —
-- the probe on token_redemptions — making the plan:
--   Index Scan on token_redemptions (payment_status, redeemed_at)
--   → Hash Anti-Join on settlement_line_items.redemption_id (FK index)
-- instead of:
--   Seq Scan on token_redemptions → Hash Anti-Join
-- ============================================================================

-- UP

create index concurrently if not exists
    idx_token_redemptions_status_redeemed_at
    on public.token_redemptions (payment_status, redeemed_at asc);

-- Optional: partial index (smaller, faster for the settlement hot path only).
-- Uncomment and use in place of the full index above if table is large.
-- create index concurrently if not exists
--     idx_token_redemptions_released_redeemed_at
--     on public.token_redemptions (redeemed_at asc)
--     where payment_status = 'released';

-- DOWN

drop index concurrently if exists public.idx_token_redemptions_status_redeemed_at;
-- drop index concurrently if exists public.idx_token_redemptions_released_redeemed_at;

-- ============================================================================
-- APPLY NOTE
-- Apply with:
--   supabase db push   (local)
-- or via MCP apply_migration on project qxdxefofeykzvegykitt.
-- CONCURRENTLY means no ACCESS EXCLUSIVE lock; reads/writes proceed normally
-- during index build. Do NOT wrap in BEGIN/COMMIT (CONCURRENTLY can't run in
-- a transaction).
-- ============================================================================
