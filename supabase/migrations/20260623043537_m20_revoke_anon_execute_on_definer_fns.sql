-- RECOVERED from live DB (already applied under ledger version 20260623043537 / m20_revoke_anon_execute_on_definer_fns).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- Duplicate-intent of m19_advisor_fixes (the live ledger has BOTH entries; their combined
-- effect is the same revoke). Re-asserted idempotently for faithful ledger reproduction.

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
