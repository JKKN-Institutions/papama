-- =============================================================================
-- Settlement admin override (hold/delay) — owner §4.8, PRD demo step 7
-- =============================================================================
-- Adds an orthogonal `on_hold` flag (+ optional note) to vendor_settlements so an
-- admin can HOLD/DELAY a payout independently of the lock→reconcile→pay lifecycle.
-- The PATCH route blocks `pay` while on_hold is true; `release` clears it. Chosen
-- over a new settlement_status enum value so it composes cleanly with the existing
-- state machine. (The per-redemption `payment_status='held'` enum is left for a
-- future finer-grained hold.)
--
-- Apply AFTER m10 (vendor_settlements). Idempotent.
-- =============================================================================

begin;

alter table public.vendor_settlements
    add column if not exists on_hold   boolean not null default false,
    add column if not exists hold_note text;

comment on column public.vendor_settlements.on_hold is
    'Admin override (owner §4.8): when true the payout is held/delayed and `pay` is blocked until released.';

commit;

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- alter table public.vendor_settlements
--   drop column if exists hold_note,
--   drop column if exists on_hold;
-- commit;
