-- RECOVERED from live DB (already applied under ledger version 20260624064508 / m23_fix_signup_partial_index_arbiter).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- The repo base (m15_donors_credit_donations) created donors.user_id as a PARTIAL unique
-- index (WHERE user_id IS NOT NULL). A partial unique index cannot serve as the arbiter for
-- `ON CONFLICT (user_id)` used by handle_new_user() during signup, so this replaces it with
-- a FULL unique index (matches live).

drop index if exists public.donors_user_id_key;
create unique index if not exists donors_user_id_key on public.donors using btree (user_id);
