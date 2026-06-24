-- ============================================================================
-- Migration m29 — UNIQUE(upi_transaction_id) on upi_qr_payments (PROPOSED — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply via Supabase MCP AFTER review.
--
-- VERIFIED LIVE (2026-06-24): upi_qr_payments has NO unique constraint on
-- upi_transaction_id (0 found). The confirm route now claims PENDING->PAID before
-- recording the donation, which closes the same-QR double-confirm race; this
-- partial unique index is the DURABLE guard so a single UTR can never confirm two
-- DIFFERENT payment QRs (UTR reuse). Partial (WHERE NOT NULL) so the many PENDING
-- rows whose UTR is still NULL are unaffected.
--
-- Pre-apply check: confirm there are no existing duplicate non-null UTRs:
--   select upi_transaction_id, count(*) from public.upi_qr_payments
--    where upi_transaction_id is not null
--    group by 1 having count(*) > 1;
-- ============================================================================

create unique index if not exists upi_qr_payments_utr_key
  on public.upi_qr_payments (upi_transaction_id)
  where upi_transaction_id is not null;

-- ----------------------------------------------------------------------------
-- DOWN
-- drop index if exists public.upi_qr_payments_utr_key;
-- ============================================================================
