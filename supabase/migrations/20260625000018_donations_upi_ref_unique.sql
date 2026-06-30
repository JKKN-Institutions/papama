-- =============================================================================
-- Fix — hard money-ledger backstop against UPI UTR double-credit
-- =============================================================================
-- AUDIT CONTEXT (2026-06-27, finding #3 — UPI UTR double-credit):
--   The original finding said the real bank UTR was unconstrained, letting one
--   payment credit the Guest Pool once per PENDING intent. That premise was
--   STALE: m29 (live version 20260624102352, source since removed from the repo)
--   already added a partial unique index on upi_qr_payments.upi_transaction_id
--   (upi_qr_payments_utr_key, WHERE upi_transaction_id IS NOT NULL). So the same
--   UTR confirming two distinct intents is already blocked at the INTENT table —
--   the second confirm's PENDING->PAID UPDATE violates that index and records
--   nothing.
--
-- WHAT WAS STILL MISSING:
--   The guarantee lived only on upi_qr_payments, not on `donations` — the actual
--   money ledger. Any path that writes a donation with an already-used UPI ref
--   (a future code path, a backfill, a manual fix) would double-credit with no DB
--   backstop. This migration adds that backstop directly on the ledger.
--
-- DESIGN:
--   The UPI confirm route writes donations.payment_ref = 'upi:<UTR>' (see
--   app/api/payment/upi-qr/confirm/route.ts -> recordDonation). A partial UNIQUE
--   index scoped to 'upi:%' makes a second donation row for the same real UTR
--   impossible. Scope matters: guest/mock donations use
--   'mock:guest:<method>:<iso-ms>' refs (app/api/donations/create-guest) which
--   are NOT guaranteed unique (two gifts in the same millisecond collide), so a
--   blanket unique-where-not-null would wrongly reject legitimate guest gifts.
--   Restricting to the real-money 'upi:' refs constrains exactly the path that
--   moves real money. Mock refs are a flagged non-money seam (ASSUMPTIONS.md).
--
-- DATA-SAFE: verified live before applying — 0 rows with payment_ref LIKE 'upi:%'
--   and 0 duplicate upi: refs, so the index builds without conflict.
--
-- NOTE (separate concern, NOT closed here): the UTR is donor-self-asserted and
--   still NOT verified against a bank/PSP feed, so a *fabricated but unique* UTR
--   can mint pool credit once. That is an authenticity gap (needs admin
--   reconciliation before the pool credit is mintable), distinct from the
--   double-credit gap this index closes.
-- =============================================================================

begin;

create unique index if not exists donations_upi_payment_ref_key
    on public.donations (payment_ref)
    where payment_ref like 'upi:%';

comment on index public.donations_upi_payment_ref_key is
    'Backstop against UPI UTR double-credit (audit #3): one donation row per real upi:<UTR> ref. Scoped to upi: refs so mock/guest refs (not guaranteed unique) are unaffected. Complements upi_qr_payments_utr_key on the intent table.';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop index if exists public.donations_upi_payment_ref_key;
-- commit;
