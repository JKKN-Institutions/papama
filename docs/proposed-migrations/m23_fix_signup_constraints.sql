-- ============================================================================
-- PROPOSED migration m23 — fix "Database error saving new user" (signup 500)
-- ----------------------------------------------------------------------------
-- STATUS: PROPOSAL. Apply in the Supabase SQL editor (or your migration flow).
-- The agent does not mutate the live DB.
--
-- ROOT CAUSE (from the auth logs):
--   500: Database error saving new user
--   ERROR: there is no unique or exclusion constraint matching the ON CONFLICT
--          specification (SQLSTATE 42P10)
--
-- The public.handle_new_user() trigger (fires on every auth.users insert) does:
--     insert into public.donors (...)        on conflict (user_id)  do nothing;
--     insert into public.donor_credits (...)  on conflict (donor_id) do nothing;
-- but neither column has a UNIQUE constraint (both tables only have PRIMARY KEY
-- (id)). ON CONFLICT (col) requires a matching unique/exclusion constraint, so
-- the whole signup transaction aborts → every signup 500s (donor AND vendor).
--
-- FIX: add the unique constraints the trigger's idempotent upsert intends —
--   one donor per auth user, one credit row per donor.
--
-- SAFE: there are no duplicate user_id / donor_id values today (verified), so the
-- constraints add cleanly. If you ever DO have duplicates, de-dupe first.
-- ============================================================================

begin;

alter table public.donors
    add constraint donors_user_id_key unique (user_id);

alter table public.donor_credits
    add constraint donor_credits_donor_id_key unique (donor_id);

commit;

-- POST-APPLY verification:
--   - Sign up a brand-new email at /vendor/register (or /donor/signup): no 500.
--   - get_logs(auth) shows POST /signup → 200 (no 42P10).
--
-- DOWN (rollback):
--   alter table public.donor_credits drop constraint donor_credits_donor_id_key;
--   alter table public.donors        drop constraint donors_user_id_key;
