-- RECOVERED from live DB (already applied under ledger version 20260624102352 / m29_upi_transaction_id_unique).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- UTR uniqueness backstop on the UPI intent table: prevents the same bank UTR
-- (upi_transaction_id) minting pool credit twice. Partial so NULLs (unconfirmed intents)
-- do not collide. Distinct from the m24 transaction_ref unique index.

create unique index if not exists upi_qr_payments_utr_key
  on public.upi_qr_payments using btree (upi_transaction_id)
  where (upi_transaction_id is not null);
