-- =============================================================================
-- ⚠️ SUPERSEDED 2026-06-24 — DO NOT APPLY THIS FILE.
-- The vendor-bank exposure was closed by removing `volunteer` from
-- vendors_select_staff inside the harmonized m33+m34 migration (applied live).
-- The view below was NOT created (no consumer; security_invoker + removed base
-- policy = 0 rows for volunteers anyway). Kept for reference only.
-- See docs/root-cause-report-2026-06-24.md §4.
-- =============================================================================
-- M33 — restrict volunteer read access to vendor bank columns
-- =============================================================================
-- Audit ref:  §5 "Volunteer vendor-bank exposure"
-- Severity:   M (spec violation — no API route exposes bank data, but a volunteer
--             with direct Supabase client access can SELECT all vendors rows
--             including bank_account_number and bank_ifsc via vendors_select_staff).
--
-- Root cause:
--   vendors_select_staff USING current_app_role() IN
--     ('admin','vendor_manager','compliance','volunteer')
--   This grants volunteers full row + column SELECT on public.vendors. Postgres RLS
--   is row-level only; it cannot restrict individual columns. So volunteers can
--   read bank_account_number and bank_ifsc today.
--
-- Options considered:
--   A. Column-level GRANT REVOKE  — Postgres column-level privileges work for
--      non-RLS access but do NOT interact with RLS policies. Once a row passes RLS,
--      column grants on the TABLE role (authenticated) are the only gate, and
--      revoking a column from 'authenticated' breaks every other role too. NOT viable.
--
--   B. Separate volunteer-facing VIEW (recommended here) — Create
--      public.vendors_volunteer_view that selects all columns EXCEPT the three bank
--      columns. Replace the volunteer branch of vendors_select_staff with a SELECT
--      policy on this view. The base table policy drops 'volunteer'.
--      Pros: clean separation, no app-code change for admin/staff paths, view is
--            cheap (no aggregation). Cons: volunteers must query the view, not the
--            table — the volunteer portal code must be verified to use the view.
--      NOTE: The live volunteer portal reads vendors via the Supabase client; update
--            those queries to target vendors_volunteer_view instead of vendors.
--
--   C. Move bank columns to a separate vendors_banking table (admin-only) — cleanest
--      long-term but a larger schema refactor; deferred to Phase 2.
--
-- This migration implements Option B (view-based scoping).
--
-- IMPORTANT — volunteer portal code change required (NOT in this migration):
--   Anywhere the volunteer Supabase client queries `vendors`, change to
--   `vendors_volunteer_view`. The view is RLS-protected (inherits table RLS for the
--   non-volunteer policies; has its own policy for volunteers).
--   Affected file pattern: app/volunteer/**  (grep for `.from('vendors')`).
--
-- Verified live (2026-06-24):
--   vendors.bank_account_number, bank_account_name, bank_ifsc all exist as text cols.
--   vendors_select_staff policy: roles={authenticated}, qual includes 'volunteer'.
--   No existing view named vendors_volunteer_view.
--
-- Idempotent: uses CREATE OR REPLACE VIEW + DROP/CREATE POLICY with IF EXISTS guards.
-- Depends on: M04 (vendors table + RLS).
-- =============================================================================

begin;

-- --- 1. Create the volunteer-safe view (bank columns excluded) -----------------
create or replace view public.vendors_volunteer_view
    with (security_invoker = true)   -- runs as the calling role, so RLS on the
                                     -- underlying table still applies
as
select
    id,
    owner_id,
    name,
    legal_name,
    address,
    city,
    pincode,
    phone,
    email,
    emergency_contact,
    fssai_license,
    gst_number,
    -- bank_account_name, bank_account_number, bank_ifsc intentionally excluded
    geo_lat,
    geo_lng,
    hygiene_rating,
    status,
    kyc_status,
    settlement_cycle,
    created_at,
    updated_at
from public.vendors;

comment on view public.vendors_volunteer_view is
    'Volunteer-safe projection of vendors — bank_account_name/number/ifsc are omitted. '
    'Use this view in the volunteer portal instead of the vendors base table.';

-- Grant SELECT on the view to authenticated (volunteers access via RLS on the view).
grant select on public.vendors_volunteer_view to authenticated;

-- --- 2. Enable RLS on the view and add a volunteer-scoped SELECT policy --------
-- Note: security_invoker = true means the view's underlying table RLS fires on behalf
-- of the calling role. A volunteer hitting the view will pass through the table's
-- vendors_select_staff policy (which includes 'volunteer'). We also add an explicit
-- view-level policy for clarity and forward-safety.
alter view public.vendors_volunteer_view owner to postgres;  -- owner must be privileged

-- RLS on views requires a security barrier view in older Postgres; in PG15+ on
-- Supabase, security_invoker does the job. We confirm with a row-security enable on
-- the view (no-op if the underlying table RLS is sufficient — belt-and-suspenders).
-- Note: ALTER TABLE ... ENABLE ROW LEVEL SECURITY applies to base tables only; views
-- inherit from the base table when security_invoker=true. No separate ALTER needed.

-- --- 3. Narrow the base-table policy: remove 'volunteer' from vendors_select_staff --
-- Volunteers now read through the view; they should not access the base table directly.
drop policy if exists vendors_select_staff on public.vendors;

create policy vendors_select_staff on public.vendors
    for select to authenticated
    using (
        current_app_role() = any(array[
            'admin'::user_role,
            'vendor_manager'::user_role,
            'compliance'::user_role
            -- 'volunteer' intentionally removed; volunteers use vendors_volunteer_view
        ])
    );

-- vendors_select_own stays as-is (vendor reads their own row, which includes bank cols
-- they entered themselves — acceptable).

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- -- Restore original vendors_select_staff (volunteer included):
-- drop policy if exists vendors_select_staff on public.vendors;
-- create policy vendors_select_staff on public.vendors for select to authenticated
--     using (current_app_role() = any(array[
--         'admin'::user_role, 'vendor_manager'::user_role,
--         'compliance'::user_role, 'volunteer'::user_role
--     ]));
-- drop view if exists public.vendors_volunteer_view;
-- commit;
--
-- After rollback: revert volunteer portal queries from vendors_volunteer_view → vendors.

-- =============================================================================
-- Residual risk after applying this migration:
--   - A volunteer who has previously cached or observed bank data is unaffected
--     (data already leaked; migration is not retroactive).
--   - The volunteer portal code MUST be updated to query vendors_volunteer_view;
--     until that code change ships, volunteers hitting the old .from('vendors') path
--     will get a 0-row result (base table policy now excludes them) — which is a
--     visible regression. COORDINATE the code change with this migration.
--   - Option C (separate vendors_banking table) should be pursued in Phase 2 as
--     a cleaner long-term fix.
-- =============================================================================
