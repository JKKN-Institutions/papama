-- =============================================================================
-- ⚠️ SUPERSEDED 2026-06-24 — DO NOT APPLY THIS FILE.
-- This hand-written version is INCOMPLETE/BUGGY: it misses vendor_menus_select_staff
-- and the 4 storage.objects bucket policies, and omits GRANT USAGE ON SCHEMA private
-- (which would deny all RLS). The relocation was instead done via a programmatic
-- DO-block transform of the live policies (complete + faithful) and applied live.
-- See docs/root-cause-report-2026-06-24.md §4 and the pre-apply snapshot
-- docs/proposed-migrations/m34_pre_apply_policy_snapshot.sql. Kept for reference.
-- =============================================================================
-- M34 — relocate SECURITY DEFINER helpers to a private schema
-- =============================================================================
-- Audit ref:  §5 "DEFINER FN RPC-EXPOSURE (advisor 0029)"
-- Severity:   L (low real risk — functions are parameterless, return only the
--             caller's own role/donor_id; but they are callable via REST PostgREST
--             /rpc/current_app_role by any authenticated user)
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- HIGH-RISK MIGRATION — DO NOT APPLY WITHOUT TESTING ON A BRANCH FIRST
-- This migration drops and recreates functions that are referenced in 30+ live
-- RLS policies. If anything goes wrong during the policy-repoint step, ALL
-- access to the affected tables will fail (RLS defaults to deny).
-- RECOMMENDED: apply on a Supabase branch (`supabase branch create`), run the
-- full test suite, confirm all portals work, THEN merge to main.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- Root cause:
--   current_app_role() and current_donor_id() live in the public schema, which
--   PostgREST exposes as /rpc/* to all authenticated callers. They cannot be
--   removed from authenticated's EXECUTE without breaking RLS (policies call them
--   as the row-owning role, which is `authenticated`). The cleanest fix is to
--   move them to a schema that PostgREST does not expose.
--
-- Approach:
--   1. Create schema `private` (not in PostgREST's exposed schema list).
--   2. Recreate both functions in private schema.
--   3. Repoint every dependent RLS policy to call private.current_app_role() /
--      private.current_donor_id().
--   4. Drop the public-schema originals.
--   5. Revoke REST exposure (PostgREST only exposes schemas in
--      supabase_functions.get_schema_cache — private is not in that list by default).
--
-- Dependent policies verified live (2026-06-24) — ALL policies referencing these fns:
--
--   current_app_role() referenced by:
--     audit_logs:          audit_logs_select_staff
--     beneficiaries:       beneficiaries_delete_admin, beneficiaries_insert_admin,
--                          beneficiaries_select_staff, beneficiaries_update_admin
--     beneficiary_registrations: registrations_delete_admin, registrations_insert_authenticated,
--                          registrations_select_staff, registrations_update_admin
--     campaigns:           campaigns_delete_admin, campaigns_insert_admin,
--                          campaigns_select_public (anon+authenticated), campaigns_update_admin
--     compliance_reports:  compliance_reports_delete_admin, compliance_reports_insert_staff,
--                          compliance_reports_select_staff, compliance_reports_update_staff
--     credit_transactions: credit_tx_insert_admin, credit_tx_select_staff
--     donations:           donations_select_staff, donations_write_admin
--     donor_credits:       donor_credits_select_staff, donor_credits_write_admin
--     donors:              donors_select_staff, donors_write_admin
--     forfeited_balances:  forfeited_select_staff, forfeited_write_admin
--     fraud_flags:         fraud_flags_delete_admin, fraud_flags_insert_staff,
--                          fraud_flags_select_staff, fraud_flags_update_staff
--     ngo_partners:        ngo_partners_delete_admin, ngo_partners_insert_admin,
--                          ngo_partners_select_staff, ngo_partners_update_admin
--     notifications:       notifications_select_staff, notifications_write_admin
--     payment_methods:     payment_methods_select_staff
--     redemption_cooldown_log: cooldown_insert_vendor, cooldown_select_staff
--     scheduled_redemption_dates: sched_select_staff, sched_write_admin
--     settlement_line_items: settlement_lines_select_staff, settlement_lines_write_admin
--     system_config:       system_config_delete_admin, system_config_insert_admin,
--                          system_config_select_staff, system_config_update_admin
--     token_authorisations: token_auth_select_staff, token_auth_write_admin
--     token_batches:       token_batches_select_staff, token_batches_write_admin
--     token_distribution_records: token_dist_insert_distributor, token_dist_select_staff,
--                          token_dist_write_admin
--     token_redemptions:   redemptions_select_staff, redemptions_write_admin
--     token_types:         token_types_delete_admin, token_types_insert_admin,
--                          token_types_select_authenticated (true — no fn call),
--                          token_types_update_admin
--     tokens:              tokens_insert_own, tokens_select_staff, tokens_update_own,
--                          tokens_write_admin
--     upi_qr_payments:     upi_qr_payments_select_staff
--     users:               users_delete_admin, users_insert_admin, users_select_admin,
--                          users_update_admin
--     vendor_communication_history: vendor_comm_delete_admin, vendor_comm_insert_staff,
--                          vendor_comm_select_staff, vendor_comm_update_staff
--     vendor_documents:    vendor_documents_delete_staff, vendor_documents_insert_staff,
--                          vendor_documents_update_staff
--     vendor_escalations:  vendor_escalations_delete_admin, vendor_escalations_insert_staff,
--                          vendor_escalations_update_staff
--     vendor_menus:        vendor_menus_delete_staff, vendor_menus_insert_staff,
--                          vendor_menus_update_staff
--     vendor_settlements:  vendor_settlements_delete_admin, vendor_settlements_insert_admin,
--                          vendor_settlements_update_admin
--     vendors:             vendors_delete_admin, vendors_insert_staff, vendors_select_staff,
--                          vendors_update_staff
--     volunteer_token_requests: vtr_delete_admin, vtr_insert_staff, vtr_select_staff,
--                          vtr_update_admin
--     volunteers:          volunteers_delete_admin, volunteers_insert_staff,
--                          volunteers_update_staff
--
--   current_donor_id() referenced by:
--     credit_transactions: credit_tx_select_own
--     donations:           donations_select_own
--     donor_credits:       donor_credits_select_own
--     donors:              (via user_id = auth.uid() — does NOT call current_donor_id)
--     notifications:       notifications_select_own, notifications_update_own
--     payment_methods:     payment_methods_modify_own, payment_methods_select_own
--     scheduled_redemption_dates: sched_select_own (calls current_donor_id via token join)
--     token_batches:       token_batches_select_own
--     token_distribution_records: token_dist_insert_distributor, token_dist_select_own
--     token_redemptions:   (does NOT call current_donor_id — uses vendor owner_id)
--     tokens:              tokens_insert_own, tokens_select_own, tokens_update_own
--
-- Total affected policies: ~65. Every DROP/CREATE POLICY pair below must be inside a
-- single transaction. If the transaction rolls back, the old public-schema functions
-- remain and all policies are intact.
--
-- Idempotent: CREATE SCHEMA IF NOT EXISTS; CREATE OR REPLACE FUNCTION.
--             Policy recreation uses DROP IF EXISTS + CREATE (not CREATE OR REPLACE).
-- =============================================================================
--
-- STATUS: DEFERRED — do not apply to production without branch testing.
-- The public-schema functions carry low real risk (return only the caller's own
-- context; cannot be used to escalate privileges). Ship this when a test branch
-- cycle is available.
--
-- =============================================================================

begin;

-- --- 1. Create private schema (not exposed by PostgREST) ----------------------
create schema if not exists private;
comment on schema private is
    'Internal helpers not exposed via PostgREST /rpc. '
    'Do not add this schema to supabase_functions.get_schema_cache or postgrest config.';

-- --- 2. Recreate helper functions in private schema ---------------------------
create or replace function private.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.users where id = auth.uid();
$$;

create or replace function private.current_donor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id from public.donors where user_id = auth.uid();
$$;

-- Grant EXECUTE to authenticated (needed by RLS policy evaluation).
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.current_donor_id()  to authenticated;
grant execute on function private.current_app_role() to service_role;
grant execute on function private.current_donor_id()  to service_role;

-- --- 3. Repoint ALL dependent RLS policies ------------------------------------
-- Pattern: drop the old policy, recreate it calling private.* instead of public.*.
-- Each pair is grouped by table for readability. The entire block is in the same
-- transaction so partial failure = full rollback.

-- audit_logs
drop policy if exists audit_logs_select_staff on public.audit_logs;
create policy audit_logs_select_staff on public.audit_logs for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role, 'compliance'::user_role]));

-- beneficiaries
drop policy if exists beneficiaries_delete_admin on public.beneficiaries;
create policy beneficiaries_delete_admin on public.beneficiaries for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists beneficiaries_insert_admin on public.beneficiaries;
create policy beneficiaries_insert_admin on public.beneficiaries for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists beneficiaries_select_staff on public.beneficiaries;
create policy beneficiaries_select_staff on public.beneficiaries for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role]));
drop policy if exists beneficiaries_update_admin on public.beneficiaries;
create policy beneficiaries_update_admin on public.beneficiaries for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- beneficiary_registrations
drop policy if exists registrations_delete_admin on public.beneficiary_registrations;
create policy registrations_delete_admin on public.beneficiary_registrations for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists registrations_insert_authenticated on public.beneficiary_registrations;
create policy registrations_insert_authenticated on public.beneficiary_registrations for insert to authenticated
    with check (
        (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
        or ((registration_status = 'pending'::registration_status)
            and (reviewed_by is null) and (beneficiary_id is null))
    );
drop policy if exists registrations_select_staff on public.beneficiary_registrations;
create policy registrations_select_staff on public.beneficiary_registrations for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role]));
drop policy if exists registrations_update_admin on public.beneficiary_registrations;
create policy registrations_update_admin on public.beneficiary_registrations for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- campaigns
drop policy if exists campaigns_delete_admin on public.campaigns;
create policy campaigns_delete_admin on public.campaigns for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists campaigns_insert_admin on public.campaigns;
create policy campaigns_insert_admin on public.campaigns for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists campaigns_update_admin on public.campaigns;
create policy campaigns_update_admin on public.campaigns for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);
-- campaigns_select_public: uses `true` — no fn call, leave as-is.

-- compliance_reports
drop policy if exists compliance_reports_delete_admin on public.compliance_reports;
create policy compliance_reports_delete_admin on public.compliance_reports for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists compliance_reports_insert_staff on public.compliance_reports;
create policy compliance_reports_insert_staff on public.compliance_reports for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists compliance_reports_select_staff on public.compliance_reports;
create policy compliance_reports_select_staff on public.compliance_reports for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists compliance_reports_update_staff on public.compliance_reports;
create policy compliance_reports_update_staff on public.compliance_reports for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));

-- credit_transactions
drop policy if exists credit_tx_insert_admin on public.credit_transactions;
create policy credit_tx_insert_admin on public.credit_transactions for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions for select to authenticated
    using (donor_id = private.current_donor_id());
drop policy if exists credit_tx_select_staff on public.credit_transactions;
create policy credit_tx_select_staff on public.credit_transactions for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));

-- donations
drop policy if exists donations_select_own on public.donations;
create policy donations_select_own on public.donations for select to authenticated
    using (donor_id = private.current_donor_id());
drop policy if exists donations_select_staff on public.donations;
create policy donations_select_staff on public.donations for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists donations_write_admin on public.donations;
create policy donations_write_admin on public.donations for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- donor_credits
drop policy if exists donor_credits_select_own on public.donor_credits;
create policy donor_credits_select_own on public.donor_credits for select to authenticated
    using (donor_id = private.current_donor_id());
drop policy if exists donor_credits_select_staff on public.donor_credits;
create policy donor_credits_select_staff on public.donor_credits for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists donor_credits_write_admin on public.donor_credits;
create policy donor_credits_write_admin on public.donor_credits for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- donors
drop policy if exists donors_select_staff on public.donors;
create policy donors_select_staff on public.donors for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists donors_write_admin on public.donors;
create policy donors_write_admin on public.donors for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- forfeited_balances
drop policy if exists forfeited_select_staff on public.forfeited_balances;
create policy forfeited_select_staff on public.forfeited_balances for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists forfeited_write_admin on public.forfeited_balances;
create policy forfeited_write_admin on public.forfeited_balances for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- fraud_flags
drop policy if exists fraud_flags_delete_admin on public.fraud_flags;
create policy fraud_flags_delete_admin on public.fraud_flags for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists fraud_flags_insert_staff on public.fraud_flags;
create policy fraud_flags_insert_staff on public.fraud_flags for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists fraud_flags_select_staff on public.fraud_flags;
create policy fraud_flags_select_staff on public.fraud_flags for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists fraud_flags_update_staff on public.fraud_flags;
create policy fraud_flags_update_staff on public.fraud_flags for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));

-- ngo_partners
drop policy if exists ngo_partners_delete_admin on public.ngo_partners;
create policy ngo_partners_delete_admin on public.ngo_partners for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists ngo_partners_insert_admin on public.ngo_partners;
create policy ngo_partners_insert_admin on public.ngo_partners for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists ngo_partners_select_staff on public.ngo_partners;
create policy ngo_partners_select_staff on public.ngo_partners for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists ngo_partners_update_admin on public.ngo_partners;
create policy ngo_partners_update_admin on public.ngo_partners for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
    using (donor_id = private.current_donor_id());
drop policy if exists notifications_select_staff on public.notifications;
create policy notifications_select_staff on public.notifications for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
    using (donor_id = private.current_donor_id())
    with check (donor_id = private.current_donor_id());
drop policy if exists notifications_write_admin on public.notifications;
create policy notifications_write_admin on public.notifications for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- payment_methods
drop policy if exists payment_methods_modify_own on public.payment_methods;
create policy payment_methods_modify_own on public.payment_methods for all to authenticated
    using (donor_id = private.current_donor_id())
    with check (donor_id = private.current_donor_id());
drop policy if exists payment_methods_select_own on public.payment_methods;
create policy payment_methods_select_own on public.payment_methods for select to authenticated
    using (donor_id = private.current_donor_id());
drop policy if exists payment_methods_select_staff on public.payment_methods;
create policy payment_methods_select_staff on public.payment_methods for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));

-- redemption_cooldown_log
drop policy if exists cooldown_select_staff on public.redemption_cooldown_log;
create policy cooldown_select_staff on public.redemption_cooldown_log for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
-- cooldown_insert_vendor: uses vendor owner_id check — does NOT call current_app_role directly
-- (it uses OR private.current_app_role() = 'admin') — update it too:
drop policy if exists cooldown_insert_vendor on public.redemption_cooldown_log;
create policy cooldown_insert_vendor on public.redemption_cooldown_log for insert to authenticated
    with check (
        (private.current_app_role() = 'admin'::user_role)
        or (exists (
            select 1 from vendors v
            where v.id = redemption_cooldown_log.vendor_id
              and v.owner_id = (select auth.uid())
        ))
    );

-- scheduled_redemption_dates
drop policy if exists sched_select_own on public.scheduled_redemption_dates;
create policy sched_select_own on public.scheduled_redemption_dates for select to authenticated
    using (exists (
        select 1 from tokens t
        where t.id = scheduled_redemption_dates.token_id
          and t.donor_id = private.current_donor_id()
    ));
drop policy if exists sched_select_staff on public.scheduled_redemption_dates;
create policy sched_select_staff on public.scheduled_redemption_dates for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role,'volunteer'::user_role
    ]));
drop policy if exists sched_write_admin on public.scheduled_redemption_dates;
create policy sched_write_admin on public.scheduled_redemption_dates for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- settlement_line_items
drop policy if exists settlement_lines_select_staff on public.settlement_line_items;
create policy settlement_lines_select_staff on public.settlement_line_items for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists settlement_lines_write_admin on public.settlement_line_items;
create policy settlement_lines_write_admin on public.settlement_line_items for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- system_config
drop policy if exists system_config_delete_admin on public.system_config;
create policy system_config_delete_admin on public.system_config for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists system_config_insert_admin on public.system_config;
create policy system_config_insert_admin on public.system_config for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists system_config_select_staff on public.system_config;
create policy system_config_select_staff on public.system_config for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists system_config_update_admin on public.system_config;
create policy system_config_update_admin on public.system_config for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- token_authorisations
drop policy if exists token_auth_select_staff on public.token_authorisations;
create policy token_auth_select_staff on public.token_authorisations for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role]));
drop policy if exists token_auth_write_admin on public.token_authorisations;
create policy token_auth_write_admin on public.token_authorisations for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- token_batches
drop policy if exists token_batches_select_own on public.token_batches;
create policy token_batches_select_own on public.token_batches for select to authenticated
    using (exists (
        select 1 from donations d
        where d.id = token_batches.donation_id
          and d.donor_id = private.current_donor_id()
    ));
drop policy if exists token_batches_select_staff on public.token_batches;
create policy token_batches_select_staff on public.token_batches for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role,'volunteer'::user_role
    ]));
drop policy if exists token_batches_write_admin on public.token_batches;
create policy token_batches_write_admin on public.token_batches for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- token_distribution_records
drop policy if exists token_dist_insert_distributor on public.token_distribution_records;
create policy token_dist_insert_distributor on public.token_distribution_records for insert to authenticated
    with check (
        (private.current_app_role() = any(array['admin'::user_role,'volunteer'::user_role]))
        or (exists (
            select 1 from tokens t
            where t.id = token_distribution_records.token_id
              and t.donor_id = private.current_donor_id()
        ))
    );
drop policy if exists token_dist_select_own on public.token_distribution_records;
create policy token_dist_select_own on public.token_distribution_records for select to authenticated
    using (exists (
        select 1 from tokens t
        where t.id = token_distribution_records.token_id
          and t.donor_id = private.current_donor_id()
    ));
drop policy if exists token_dist_select_staff on public.token_distribution_records;
create policy token_dist_select_staff on public.token_distribution_records for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role,'volunteer'::user_role
    ]));
drop policy if exists token_dist_write_admin on public.token_distribution_records;
create policy token_dist_write_admin on public.token_distribution_records for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- token_redemptions
drop policy if exists redemptions_select_staff on public.token_redemptions;
create policy redemptions_select_staff on public.token_redemptions for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role
    ]));
drop policy if exists redemptions_write_admin on public.token_redemptions;
create policy redemptions_write_admin on public.token_redemptions for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- token_types
drop policy if exists token_types_delete_admin on public.token_types;
create policy token_types_delete_admin on public.token_types for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists token_types_insert_admin on public.token_types;
create policy token_types_insert_admin on public.token_types for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists token_types_update_admin on public.token_types;
create policy token_types_update_admin on public.token_types for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);
-- token_types_select_authenticated: `using (true)` — no fn call, leave as-is.

-- tokens
drop policy if exists tokens_insert_own on public.tokens;
create policy tokens_insert_own on public.tokens for insert to authenticated
    with check (donor_id = private.current_donor_id());
drop policy if exists tokens_select_own on public.tokens;
create policy tokens_select_own on public.tokens for select to authenticated
    using (donor_id = private.current_donor_id());
drop policy if exists tokens_select_staff on public.tokens;
create policy tokens_select_staff on public.tokens for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'compliance'::user_role,'vendor_manager'::user_role,'volunteer'::user_role
    ]));
drop policy if exists tokens_update_own on public.tokens;
create policy tokens_update_own on public.tokens for update to authenticated
    using (donor_id = private.current_donor_id())
    with check (donor_id = private.current_donor_id());
drop policy if exists tokens_write_admin on public.tokens;
create policy tokens_write_admin on public.tokens for all to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- upi_qr_payments
drop policy if exists upi_qr_payments_select_staff on public.upi_qr_payments;
create policy upi_qr_payments_select_staff on public.upi_qr_payments for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));

-- users
drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists users_select_admin on public.users;
create policy users_select_admin on public.users for select to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);
-- users_select_own: uses `id = auth.uid()` — no fn call, leave as-is.

-- vendor_communication_history
drop policy if exists vendor_comm_delete_admin on public.vendor_communication_history;
create policy vendor_comm_delete_admin on public.vendor_communication_history for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists vendor_comm_insert_staff on public.vendor_communication_history;
create policy vendor_comm_insert_staff on public.vendor_communication_history for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendor_comm_select_staff on public.vendor_communication_history;
create policy vendor_comm_select_staff on public.vendor_communication_history for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role,'compliance'::user_role]));
drop policy if exists vendor_comm_update_staff on public.vendor_communication_history;
create policy vendor_comm_update_staff on public.vendor_communication_history for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));

-- vendor_documents
drop policy if exists vendor_documents_delete_staff on public.vendor_documents;
create policy vendor_documents_delete_staff on public.vendor_documents for delete to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendor_documents_insert_staff on public.vendor_documents;
create policy vendor_documents_insert_staff on public.vendor_documents for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendor_documents_update_staff on public.vendor_documents;
create policy vendor_documents_update_staff on public.vendor_documents for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));

-- vendor_escalations
drop policy if exists vendor_escalations_delete_admin on public.vendor_escalations;
create policy vendor_escalations_delete_admin on public.vendor_escalations for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists vendor_escalations_insert_staff on public.vendor_escalations;
create policy vendor_escalations_insert_staff on public.vendor_escalations for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendor_escalations_update_staff on public.vendor_escalations;
create policy vendor_escalations_update_staff on public.vendor_escalations for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));

-- vendor_menus
drop policy if exists vendor_menus_delete_staff on public.vendor_menus;
create policy vendor_menus_delete_staff on public.vendor_menus for delete to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendor_menus_insert_staff on public.vendor_menus;
create policy vendor_menus_insert_staff on public.vendor_menus for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendor_menus_update_staff on public.vendor_menus;
create policy vendor_menus_update_staff on public.vendor_menus for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
-- vendor_menus own-policies: use owner_id join, no fn call, leave as-is.

-- vendor_settlements
drop policy if exists vendor_settlements_delete_admin on public.vendor_settlements;
create policy vendor_settlements_delete_admin on public.vendor_settlements for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists vendor_settlements_insert_admin on public.vendor_settlements;
create policy vendor_settlements_insert_admin on public.vendor_settlements for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists vendor_settlements_select_staff on public.vendor_settlements;
create policy vendor_settlements_select_staff on public.vendor_settlements for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'vendor_manager'::user_role,'compliance'::user_role
    ]));
drop policy if exists vendor_settlements_update_admin on public.vendor_settlements;
create policy vendor_settlements_update_admin on public.vendor_settlements for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- vendors
drop policy if exists vendors_delete_admin on public.vendors;
create policy vendors_delete_admin on public.vendors for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists vendors_insert_staff on public.vendors;
create policy vendors_insert_staff on public.vendors for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists vendors_select_staff on public.vendors;
create policy vendors_select_staff on public.vendors for select to authenticated
    using (private.current_app_role() = any(array[
        'admin'::user_role,'vendor_manager'::user_role,'compliance'::user_role,'volunteer'::user_role
    ]));
drop policy if exists vendors_update_staff on public.vendors;
create policy vendors_update_staff on public.vendors for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));

-- volunteer_token_requests
drop policy if exists vtr_delete_admin on public.volunteer_token_requests;
create policy vtr_delete_admin on public.volunteer_token_requests for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists vtr_insert_staff on public.volunteer_token_requests;
create policy vtr_insert_staff on public.volunteer_token_requests for insert to authenticated
    with check (private.current_app_role() = 'admin'::user_role);
drop policy if exists vtr_select_staff on public.volunteer_token_requests;
create policy vtr_select_staff on public.volunteer_token_requests for select to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'compliance'::user_role]));
drop policy if exists vtr_update_admin on public.volunteer_token_requests;
create policy vtr_update_admin on public.volunteer_token_requests for update to authenticated
    using (private.current_app_role() = 'admin'::user_role)
    with check (private.current_app_role() = 'admin'::user_role);

-- volunteers
drop policy if exists volunteers_delete_admin on public.volunteers;
create policy volunteers_delete_admin on public.volunteers for delete to authenticated
    using (private.current_app_role() = 'admin'::user_role);
drop policy if exists volunteers_insert_staff on public.volunteers;
create policy volunteers_insert_staff on public.volunteers for insert to authenticated
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));
drop policy if exists volunteers_update_staff on public.volunteers;
create policy volunteers_update_staff on public.volunteers for update to authenticated
    using (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]))
    with check (private.current_app_role() = any(array['admin'::user_role,'vendor_manager'::user_role]));

-- --- 4. Drop the public-schema originals (now unreachable from app/RLS) -------
drop function if exists public.current_app_role();
drop function if exists public.current_donor_id();

commit;

-- =============================================================================
-- DOWN (rollback) — restores public-schema functions and repoints all policies back
-- =============================================================================
-- NOTE: The down block is intentionally abbreviated. In practice, restore from a
-- branch snapshot or run the original M02 + all policy-creating migrations in sequence.
--
-- begin;
-- create or replace function public.current_app_role() ...;  -- copy from M02
-- create or replace function public.current_donor_id()  ...;  -- copy from M02
-- grant execute on function public.current_app_role() to authenticated, service_role;
-- grant execute on function public.current_donor_id()  to authenticated, service_role;
-- -- Then re-run each policy DROP/CREATE above in reverse (swap private. → public.)
-- drop function if exists private.current_app_role();
-- drop function if exists private.current_donor_id();
-- commit;
