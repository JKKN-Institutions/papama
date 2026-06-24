-- =============================================================================
-- M20 (BACKFILL) — revoke anon EXECUTE on SECURITY DEFINER helper functions
-- =============================================================================
-- Live ledger entry:  version 20260623043537, name m20_revoke_anon_execute_on_definer_fns
-- Repo status:        ABSENT from supabase/migrations/ — this file reconstructs it.
--
-- Root cause:  When current_app_role() and current_donor_id() were created in M02
-- they received the Supabase default PUBLIC EXECUTE grant, which includes `anon`.
-- Since both functions are SECURITY DEFINER and call auth.uid(), an unauthenticated
-- caller gets NULL back (safe in practice) but the grant still widens the RPC
-- attack surface unnecessarily.
--
-- What this migration does:
--   1. Revokes EXECUTE on both functions from the `anon` role.
--   2. Confirms `authenticated` retains EXECUTE (needed by every RLS policy that
--      calls these functions).
--
-- Verified live (2026-06-24 inspection):
--   current_app_role(): anon=false, authenticated=true  ← already in desired state
--   current_donor_id(): anon=false, authenticated=true  ← already in desired state
-- The live DB is already in the post-migration state; this file is needed only so
-- `supabase db reset` can reproduce that state without drift.
--
-- Idempotent: REVOKE on a privilege that is not held is a no-op in Postgres.
--
-- Depends on: M02 (creates both functions).
-- Apply order: ... → M19 → M20 → M21.
-- =============================================================================

begin;

revoke execute on function public.current_app_role() from anon;
revoke execute on function public.current_donor_id()  from anon;

-- Ensure authenticated retains the grant (belt-and-suspenders; should already hold).
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_donor_id()  to authenticated;

commit;

-- =============================================================================
-- DOWN (rollback) — restores the overly-broad default
-- =============================================================================
-- begin;
-- grant execute on function public.current_app_role() to anon;
-- grant execute on function public.current_donor_id()  to anon;
-- commit;
