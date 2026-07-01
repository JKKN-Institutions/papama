-- RECOVERED from live DB (already applied under ledger version 20260623051707 / m19_donor_provisioning).
-- Source reconstructed for db-reset reproducibility. Idempotent. TRIGGER ONLY.
--
-- The handle_new_user() function is already in the repo
-- (20260620010119_m19_donor_provisioning.sql); only the trigger wiring on auth.users was
-- missing from source. Recovered verbatim from pg_get_triggerdef. Creating a trigger on
-- auth.users requires the postgres role (fine under `supabase db reset`).

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
