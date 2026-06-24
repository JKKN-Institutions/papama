-- ============================================================================
-- ROLLBACK SNAPSHOT — captured live 2026-06-24 immediately BEFORE the harmonized
-- m33+m34 apply (definer fns → private schema; volunteer dropped from
-- vendors_select_staff). This is the authoritative BEFORE state of every public
-- RLS policy, plus the public-schema function definitions.
--
-- TO ROLL BACK the harmonized apply:
--   1. Recreate the public functions (below).
--   2. Re-run every CREATE POLICY below (drop the private-referencing version
--      first: `drop policy <name> on public.<table>;`).
--   3. drop schema private cascade;   -- removes the private.* copies + the view's deps if any
-- ============================================================================

-- --- public function definitions (pre-move) ---------------------------------
create or replace function public.current_app_role()
    returns public.user_role language sql stable security definer set search_path = public
    as $$ select role from public.users where id = auth.uid(); $$;
create or replace function public.current_donor_id()
    returns uuid language sql stable security definer set search_path = public
    as $$ select id from public.donors where user_id = auth.uid(); $$;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.current_donor_id() to authenticated, service_role;

-- --- all public RLS policies (pre-move) -------------------------------------
create policy audit_logs_select_staff on public.audit_logs for select to authenticated using ((current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));
create policy beneficiaries_delete_admin on public.beneficiaries for delete to authenticated using ((current_app_role() = 'admin'::user_role));
create policy beneficiaries_insert_admin on public.beneficiaries for insert to authenticated with check ((current_app_role() = 'admin'::user_role));
create policy beneficiaries_select_own on public.beneficiaries for select to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy beneficiaries_select_staff on public.beneficiaries for select to authenticated using ((current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));
create policy beneficiaries_update_admin on public.beneficiaries for update to authenticated using ((current_app_role() = 'admin'::user_role)) with check ((current_app_role() = 'admin'::user_role));
create policy registrations_delete_admin on public.beneficiary_registrations for delete to authenticated using ((current_app_role() = 'admin'::user_role));
create policy registrations_insert_authenticated on public.beneficiary_registrations for insert to authenticated with check (((current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])) OR ((registration_status = 'pending'::registration_status) AND (reviewed_by IS NULL) AND (beneficiary_id IS NULL))));
create policy registrations_select_own on public.beneficiary_registrations for select to authenticated using ((submitted_by = ( SELECT auth.uid() AS uid)));
create policy registrations_select_staff on public.beneficiary_registrations for select to authenticated using ((current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));
create policy registrations_update_admin on public.beneficiary_registrations for update to authenticated using ((current_app_role() = 'admin'::user_role)) with check ((current_app_role() = 'admin'::user_role));
create policy vendors_select_staff on public.vendors for select to authenticated using ((current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role, 'volunteer'::user_role])));
-- NOTE: the FULL set of ~120 policies was captured in the apply session transcript.
-- The DO-block apply transforms ONLY the function references (public→private) and
-- removes 'volunteer' from vendors_select_staff; every other clause is preserved
-- byte-for-byte, so restoring from m02 + the policy-creating migrations is the
-- canonical rollback. This file records the two function defs + the two policies
-- whose ROLE LIST changed, which are the only semantic deltas.
