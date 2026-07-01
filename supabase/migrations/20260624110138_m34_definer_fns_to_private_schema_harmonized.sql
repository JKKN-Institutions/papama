-- RECOVERED from live DB (already applied under ledger version 20260624110138 / m34_definer_fns_to_private_schema_harmonized).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- Moves the SECURITY DEFINER role-helpers into a locked-down `private` schema so they are
-- never exposed on the public API surface. RLS policies reference private.current_app_role()
-- / private.current_donor_id(), so this MUST run BEFORE the m30 RLS snapshot
-- (20260624102403_m30_rls_hardening.sql).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_app_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.users where id = auth.uid(); $function$;

CREATE OR REPLACE FUNCTION private.current_donor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select id from public.donors where user_id = auth.uid(); $function$;

revoke all on function private.current_app_role() from public;
revoke all on function private.current_donor_id() from public;
revoke execute on function private.current_app_role() from anon;
revoke execute on function private.current_donor_id() from anon;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.current_donor_id() to authenticated, service_role;

-- The old public copies are dropped live. Dropping them here would break EARLIER migrations
-- that still reference public.current_app_role() (e.g. the m31_guard menu function recovered
-- as-is at 20260624105730). Left commented; the forward fix 20260701000001 repoints the menu
-- guard to private.* so these can be safely dropped afterward if desired:
-- drop function if exists public.current_app_role();
-- drop function if exists public.current_donor_id();
