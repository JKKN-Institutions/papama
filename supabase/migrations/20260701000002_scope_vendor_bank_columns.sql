-- Finding A — vendor bank column scoping (VERIFIED against the app; safe to apply).
--
-- INVESTIGATION (live DB, read-only) + CODE TRACE (app/api/**, lib/**):
--   * public.vendors has RLS enabled. SELECT policies:
--       - vendors_select_own    : authenticated, USING (owner_id = auth.uid())
--       - vendors_select_staff  : authenticated, USING (private.current_app_role() in
--                                 admin / vendor_manager / compliance)
--     There is NO anon SELECT policy, so anon cannot read ANY vendor row.
--   * Column privileges on bank_account_number / bank_ifsc / bank_account_name currently
--     grant SELECT/INSERT/UPDATE/REFERENCES to BOTH anon and authenticated.
--   * The ONLY code paths that touch bank columns are:
--       - app/api/vendor/profile/route.ts  GET + PATCH  -> SESSION (authenticated) client,
--         scoped .eq('owner_id', user.id): the vendor owner reads/edits their OWN bank info.
--       - app/api/vendor/register/route.ts INSERT       -> SERVICE-ROLE client (public onboarding).
--     No other vendors read includes bank columns (admin/settlement selects are id,name only;
--     nothing uses select('*')). No admin/settlement UI reads bank details in-app.
--
-- CONCLUSION: the anon column grants are pure surplus (anon has no row access at all) and are
-- safe to revoke. The `authenticated` SELECT/UPDATE grants are LOAD-BEARING — the vendor
-- profile page relies on them for owner self-service — so they are intentionally LEFT INTACT.

-- SAFE hardening — remove surplus anon column privileges (defense-in-depth):
revoke select     (bank_account_number, bank_ifsc, bank_account_name) on public.vendors from anon;
revoke insert     (bank_account_number, bank_ifsc, bank_account_name) on public.vendors from anon;
revoke update     (bank_account_number, bank_ifsc, bank_account_name) on public.vendors from anon;
revoke references (bank_account_number, bank_ifsc, bank_account_name) on public.vendors from anon;

-- DO NOT revoke SELECT/UPDATE on these columns from `authenticated`: the vendor-owner
-- self-read/edit in app/api/vendor/profile runs on the authenticated (RLS) client, so
-- revoking would break vendor profile view/edit. (INSERT from authenticated is unused —
-- register inserts via service-role — so this one is optional surplus, left commented.)
-- revoke insert (bank_account_number, bank_ifsc, bank_account_name) on public.vendors from authenticated;

-- SEPARATE OPTIONAL HARDENING (not done here — needs a product decision):
-- staff (admin/vendor_manager/compliance) can read bank columns via vendors_select_staff +
-- the authenticated column grant, even though no admin UI surfaces them. If bank details
-- should be service-role-only, move any future admin bank read behind the service-role client
-- and add a RESTRICTIVE column policy — tracked, not implemented here.
