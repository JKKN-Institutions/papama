-- RECOVERED from live DB (already applied under ledger version 20260623043445 / m19_advisor_fixes).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- Revokes EXECUTE on the SECURITY DEFINER role-helper functions from anon and PUBLIC
-- (Supabase advisor hardening). Schema-agnostic + guarded: at this ledger position the
-- helpers live in `public`; m34 (later) moves them to `private`. Guarded so it is a no-op
-- if the target function is absent.

do $$
begin
  if to_regprocedure('public.current_app_role()') is not null then
    execute 'revoke execute on function public.current_app_role() from anon';
    execute 'revoke execute on function public.current_app_role() from public';
  end if;
  if to_regprocedure('public.current_donor_id()') is not null then
    execute 'revoke execute on function public.current_donor_id() from anon';
    execute 'revoke execute on function public.current_donor_id() from public';
  end if;
end $$;
