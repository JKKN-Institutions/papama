-- RECOVERED from live DB (already applied under ledger version 20260624104336 / m31_perf_index_token_redemptions).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- Performance index for settlement/report scans over redemptions by payment state + time.
-- (The proof-submitted partial index is already defined in the repo's proof_review_gate
-- migration, so it is intentionally NOT repeated here.)

create index if not exists idx_token_redemptions_status_redeemed_at
  on public.token_redemptions using btree (payment_status, redeemed_at);
