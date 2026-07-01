-- RECOVERED from live DB — full RLS policy state (originates at ledger version
-- 20260624102403 / m30_rls_hardening, consolidated with every later policy change).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- SNAPSHOT of ALL 170 public.* RLS policies as they exist live, each emitted as
-- DROP POLICY IF EXISTS + CREATE POLICY. Whole-state reassertion, not a targeted diff —
-- safe to re-run; it SUPERSEDES any policy defined in earlier migrations.
--
-- ORDERING (why this file is numbered 20260630000012, NOT its m30 ledger version):
-- the policies reference (a) private.current_app_role()/current_donor_id() created by m34
-- (20260624110138) and (b) addon tables created by the 20260630* migrations
-- (corporate_csr_profiles, meal_windows, vendor_capacity_usage, institution_token_allocations,
-- emergency_token_grants, vendor_feedback, surprise_inspections, volunteer_activity_log,
-- settlement_audit_queue). CREATE POLICY validates those refs at creation, so this MUST run
-- AFTER all of them — i.e. last among the schema-building migrations.

drop policy if exists audit_logs_select_staff on public.audit_logs;
create policy audit_logs_select_staff on public.audit_logs as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists beneficiaries_delete_admin on public.beneficiaries;
create policy beneficiaries_delete_admin on public.beneficiaries as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists beneficiaries_insert_admin on public.beneficiaries;
create policy beneficiaries_insert_admin on public.beneficiaries as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists beneficiaries_select_own on public.beneficiaries;
create policy beneficiaries_select_own on public.beneficiaries as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists beneficiaries_select_staff on public.beneficiaries;
create policy beneficiaries_select_staff on public.beneficiaries as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists beneficiaries_update_admin on public.beneficiaries;
create policy beneficiaries_update_admin on public.beneficiaries as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists registrations_delete_admin on public.beneficiary_registrations;
create policy registrations_delete_admin on public.beneficiary_registrations as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists registrations_insert_authenticated on public.beneficiary_registrations;
create policy registrations_insert_authenticated on public.beneficiary_registrations as PERMISSIVE for INSERT to authenticated
  with check (((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])) OR ((registration_status = 'pending'::registration_status) AND (reviewed_by IS NULL) AND (beneficiary_id IS NULL))));

drop policy if exists registrations_select_own on public.beneficiary_registrations;
create policy registrations_select_own on public.beneficiary_registrations as PERMISSIVE for SELECT to authenticated
  using ((submitted_by = ( SELECT auth.uid() AS uid)));

drop policy if exists registrations_select_staff on public.beneficiary_registrations;
create policy registrations_select_staff on public.beneficiary_registrations as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists registrations_update_admin on public.beneficiary_registrations;
create policy registrations_update_admin on public.beneficiary_registrations as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists campaigns_delete_admin on public.campaigns;
create policy campaigns_delete_admin on public.campaigns as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists campaigns_insert_admin on public.campaigns;
create policy campaigns_insert_admin on public.campaigns as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists campaigns_select_public on public.campaigns;
create policy campaigns_select_public on public.campaigns as PERMISSIVE for SELECT to anon, authenticated
  using (true);

drop policy if exists campaigns_update_admin on public.campaigns;
create policy campaigns_update_admin on public.campaigns as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists compliance_reports_delete_admin on public.compliance_reports;
create policy compliance_reports_delete_admin on public.compliance_reports as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists compliance_reports_insert_staff on public.compliance_reports;
create policy compliance_reports_insert_staff on public.compliance_reports as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists compliance_reports_select_staff on public.compliance_reports;
create policy compliance_reports_select_staff on public.compliance_reports as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists compliance_reports_update_staff on public.compliance_reports;
create policy compliance_reports_update_staff on public.compliance_reports as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists corporate_csr_modify_own on public.corporate_csr_profiles;
create policy corporate_csr_modify_own on public.corporate_csr_profiles as PERMISSIVE for ALL to authenticated
  using ((donor_id = private.current_donor_id()))
  with check ((donor_id = private.current_donor_id()));

drop policy if exists corporate_csr_select_own on public.corporate_csr_profiles;
create policy corporate_csr_select_own on public.corporate_csr_profiles as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists corporate_csr_select_staff on public.corporate_csr_profiles;
create policy corporate_csr_select_staff on public.corporate_csr_profiles as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists corporate_csr_write_admin on public.corporate_csr_profiles;
create policy corporate_csr_write_admin on public.corporate_csr_profiles as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists courier_dispatches_select_staff on public.courier_dispatches;
create policy courier_dispatches_select_staff on public.courier_dispatches as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists courier_dispatches_write_admin on public.courier_dispatches;
create policy courier_dispatches_write_admin on public.courier_dispatches as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists credit_tx_insert_admin on public.credit_transactions;
create policy credit_tx_insert_admin on public.credit_transactions as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists credit_tx_select_staff on public.credit_transactions;
create policy credit_tx_select_staff on public.credit_transactions as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists donations_select_own on public.donations;
create policy donations_select_own on public.donations as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists donations_select_staff on public.donations;
create policy donations_select_staff on public.donations as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists donations_write_admin on public.donations;
create policy donations_write_admin on public.donations as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists donor_credits_select_own on public.donor_credits;
create policy donor_credits_select_own on public.donor_credits as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists donor_credits_select_staff on public.donor_credits;
create policy donor_credits_select_staff on public.donor_credits as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists donor_credits_write_admin on public.donor_credits;
create policy donor_credits_write_admin on public.donor_credits as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists donors_select_own on public.donors;
create policy donors_select_own on public.donors as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists donors_select_staff on public.donors;
create policy donors_select_staff on public.donors as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists donors_update_own on public.donors;
create policy donors_update_own on public.donors as PERMISSIVE for UPDATE to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists donors_write_admin on public.donors;
create policy donors_write_admin on public.donors as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists emergency_grants_select_staff on public.emergency_token_grants;
create policy emergency_grants_select_staff on public.emergency_token_grants as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists emergency_grants_write_admin on public.emergency_token_grants;
create policy emergency_grants_write_admin on public.emergency_token_grants as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists forfeited_select_staff on public.forfeited_balances;
create policy forfeited_select_staff on public.forfeited_balances as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists forfeited_write_admin on public.forfeited_balances;
create policy forfeited_write_admin on public.forfeited_balances as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists fraud_flags_delete_admin on public.fraud_flags;
create policy fraud_flags_delete_admin on public.fraud_flags as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists fraud_flags_insert_staff on public.fraud_flags;
create policy fraud_flags_insert_staff on public.fraud_flags as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists fraud_flags_select_staff on public.fraud_flags;
create policy fraud_flags_select_staff on public.fraud_flags as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists fraud_flags_update_staff on public.fraud_flags;
create policy fraud_flags_update_staff on public.fraud_flags as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists institution_allocations_select_staff on public.institution_token_allocations;
create policy institution_allocations_select_staff on public.institution_token_allocations as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists institution_allocations_write_admin on public.institution_token_allocations;
create policy institution_allocations_write_admin on public.institution_token_allocations as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists meal_windows_delete_admin on public.meal_windows;
create policy meal_windows_delete_admin on public.meal_windows as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists meal_windows_insert_admin on public.meal_windows;
create policy meal_windows_insert_admin on public.meal_windows as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists meal_windows_select_authenticated on public.meal_windows;
create policy meal_windows_select_authenticated on public.meal_windows as PERMISSIVE for SELECT to authenticated
  using (true);

drop policy if exists meal_windows_update_admin on public.meal_windows;
create policy meal_windows_update_admin on public.meal_windows as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists ngo_partners_delete_admin on public.ngo_partners;
create policy ngo_partners_delete_admin on public.ngo_partners as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists ngo_partners_insert_admin on public.ngo_partners;
create policy ngo_partners_insert_admin on public.ngo_partners as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists ngo_partners_select_staff on public.ngo_partners;
create policy ngo_partners_select_staff on public.ngo_partners as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists ngo_partners_update_admin on public.ngo_partners;
create policy ngo_partners_update_admin on public.ngo_partners as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists notifications_select_staff on public.notifications;
create policy notifications_select_staff on public.notifications as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications as PERMISSIVE for UPDATE to authenticated
  using ((donor_id = private.current_donor_id()))
  with check ((donor_id = private.current_donor_id()));

drop policy if exists notifications_write_admin on public.notifications;
create policy notifications_write_admin on public.notifications as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists payment_methods_modify_own on public.payment_methods;
create policy payment_methods_modify_own on public.payment_methods as PERMISSIVE for ALL to authenticated
  using ((donor_id = private.current_donor_id()))
  with check ((donor_id = private.current_donor_id()));

drop policy if exists payment_methods_select_own on public.payment_methods;
create policy payment_methods_select_own on public.payment_methods as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists payment_methods_select_staff on public.payment_methods;
create policy payment_methods_select_staff on public.payment_methods as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists cooldown_insert_vendor on public.redemption_cooldown_log;
create policy cooldown_insert_vendor on public.redemption_cooldown_log as PERMISSIVE for INSERT to authenticated
  with check (((private.current_app_role() = 'admin'::user_role) OR (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = redemption_cooldown_log.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists cooldown_select_staff on public.redemption_cooldown_log;
create policy cooldown_select_staff on public.redemption_cooldown_log as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists sched_select_own on public.scheduled_redemption_dates;
create policy sched_select_own on public.scheduled_redemption_dates as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM tokens t
  WHERE ((t.id = scheduled_redemption_dates.token_id) AND (t.donor_id = private.current_donor_id())))));

drop policy if exists sched_select_staff on public.scheduled_redemption_dates;
create policy sched_select_staff on public.scheduled_redemption_dates as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role])));

drop policy if exists sched_write_admin on public.scheduled_redemption_dates;
create policy sched_write_admin on public.scheduled_redemption_dates as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists settlement_audit_delete_admin on public.settlement_audit_queue;
create policy settlement_audit_delete_admin on public.settlement_audit_queue as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists settlement_audit_insert_staff on public.settlement_audit_queue;
create policy settlement_audit_insert_staff on public.settlement_audit_queue as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists settlement_audit_select_staff on public.settlement_audit_queue;
create policy settlement_audit_select_staff on public.settlement_audit_queue as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists settlement_audit_update_staff on public.settlement_audit_queue;
create policy settlement_audit_update_staff on public.settlement_audit_queue as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists settlement_lines_select_own_vendor on public.settlement_line_items;
create policy settlement_lines_select_own_vendor on public.settlement_line_items as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM (vendor_settlements s
     JOIN vendors v ON ((v.id = s.vendor_id)))
  WHERE ((s.id = settlement_line_items.settlement_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists settlement_lines_select_staff on public.settlement_line_items;
create policy settlement_lines_select_staff on public.settlement_line_items as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists settlement_lines_write_admin on public.settlement_line_items;
create policy settlement_lines_write_admin on public.settlement_line_items as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists surprise_inspections_delete_admin on public.surprise_inspections;
create policy surprise_inspections_delete_admin on public.surprise_inspections as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists surprise_inspections_insert_staff on public.surprise_inspections;
create policy surprise_inspections_insert_staff on public.surprise_inspections as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists surprise_inspections_select_staff on public.surprise_inspections;
create policy surprise_inspections_select_staff on public.surprise_inspections as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists surprise_inspections_update_staff on public.surprise_inspections;
create policy surprise_inspections_update_staff on public.surprise_inspections as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists system_config_delete_admin on public.system_config;
create policy system_config_delete_admin on public.system_config as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists system_config_insert_admin on public.system_config;
create policy system_config_insert_admin on public.system_config as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists system_config_select_staff on public.system_config;
create policy system_config_select_staff on public.system_config as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists system_config_update_admin on public.system_config;
create policy system_config_update_admin on public.system_config as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists token_auth_select_staff on public.token_authorisations;
create policy token_auth_select_staff on public.token_authorisations as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists token_auth_write_admin on public.token_authorisations;
create policy token_auth_write_admin on public.token_authorisations as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists token_batches_select_own on public.token_batches;
create policy token_batches_select_own on public.token_batches as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM donations d
  WHERE ((d.id = token_batches.donation_id) AND (d.donor_id = private.current_donor_id())))));

drop policy if exists token_batches_select_staff on public.token_batches;
create policy token_batches_select_staff on public.token_batches as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role])));

drop policy if exists token_batches_write_admin on public.token_batches;
create policy token_batches_write_admin on public.token_batches as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists token_dist_select_own on public.token_distribution_records;
create policy token_dist_select_own on public.token_distribution_records as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM tokens t
  WHERE ((t.id = token_distribution_records.token_id) AND (t.donor_id = private.current_donor_id())))));

drop policy if exists token_dist_select_staff on public.token_distribution_records;
create policy token_dist_select_staff on public.token_distribution_records as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role])));

drop policy if exists token_dist_write_admin on public.token_distribution_records;
create policy token_dist_write_admin on public.token_distribution_records as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists redemptions_insert_own_vendor on public.token_redemptions;
create policy redemptions_insert_own_vendor on public.token_redemptions as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists redemptions_select_own_vendor on public.token_redemptions;
create policy redemptions_select_own_vendor on public.token_redemptions as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists redemptions_select_staff on public.token_redemptions;
create policy redemptions_select_staff on public.token_redemptions as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists redemptions_update_own_vendor on public.token_redemptions;
create policy redemptions_update_own_vendor on public.token_redemptions as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists redemptions_write_admin on public.token_redemptions;
create policy redemptions_write_admin on public.token_redemptions as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists token_types_delete_admin on public.token_types;
create policy token_types_delete_admin on public.token_types as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists token_types_insert_admin on public.token_types;
create policy token_types_insert_admin on public.token_types as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists token_types_select_authenticated on public.token_types;
create policy token_types_select_authenticated on public.token_types as PERMISSIVE for SELECT to authenticated
  using (true);

drop policy if exists token_types_update_admin on public.token_types;
create policy token_types_update_admin on public.token_types as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists tokens_insert_own on public.tokens;
create policy tokens_insert_own on public.tokens as PERMISSIVE for INSERT to authenticated
  with check ((donor_id = private.current_donor_id()));

drop policy if exists tokens_select_own on public.tokens;
create policy tokens_select_own on public.tokens as PERMISSIVE for SELECT to authenticated
  using ((donor_id = private.current_donor_id()));

drop policy if exists tokens_select_staff on public.tokens;
create policy tokens_select_staff on public.tokens as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists tokens_update_own on public.tokens;
create policy tokens_update_own on public.tokens as PERMISSIVE for UPDATE to authenticated
  using ((donor_id = private.current_donor_id()))
  with check ((donor_id = private.current_donor_id()));

drop policy if exists tokens_write_admin on public.tokens;
create policy tokens_write_admin on public.tokens as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists upi_qr_payments_select_staff on public.upi_qr_payments;
create policy upi_qr_payments_select_staff on public.upi_qr_payments as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists users_select_admin on public.users;
create policy users_select_admin on public.users as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users as PERMISSIVE for SELECT to authenticated
  using ((id = ( SELECT auth.uid() AS uid)));

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_capacity_usage_insert_own_vendor on public.vendor_capacity_usage;
create policy vendor_capacity_usage_insert_own_vendor on public.vendor_capacity_usage as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_capacity_usage.vendor_id) AND (v.owner_id = auth.uid())))));

drop policy if exists vendor_capacity_usage_select_own_vendor on public.vendor_capacity_usage;
create policy vendor_capacity_usage_select_own_vendor on public.vendor_capacity_usage as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_capacity_usage.vendor_id) AND (v.owner_id = auth.uid())))));

drop policy if exists vendor_capacity_usage_select_staff on public.vendor_capacity_usage;
create policy vendor_capacity_usage_select_staff on public.vendor_capacity_usage as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_capacity_usage_update_own_vendor on public.vendor_capacity_usage;
create policy vendor_capacity_usage_update_own_vendor on public.vendor_capacity_usage as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_capacity_usage.vendor_id) AND (v.owner_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_capacity_usage.vendor_id) AND (v.owner_id = auth.uid())))));

drop policy if exists vendor_capacity_usage_write_admin on public.vendor_capacity_usage;
create policy vendor_capacity_usage_write_admin on public.vendor_capacity_usage as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_comm_delete_admin on public.vendor_communication_history;
create policy vendor_comm_delete_admin on public.vendor_communication_history as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_comm_insert_staff on public.vendor_communication_history;
create policy vendor_comm_insert_staff on public.vendor_communication_history as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_comm_select_own on public.vendor_communication_history;
create policy vendor_comm_select_own on public.vendor_communication_history as PERMISSIVE for SELECT to authenticated
  using (((direction <> 'internal_note'::text) AND (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_communication_history.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists vendor_comm_select_staff on public.vendor_communication_history;
create policy vendor_comm_select_staff on public.vendor_communication_history as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vendor_comm_update_staff on public.vendor_communication_history;
create policy vendor_comm_update_staff on public.vendor_communication_history as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_documents_delete_staff on public.vendor_documents;
create policy vendor_documents_delete_staff on public.vendor_documents as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_documents_insert_own on public.vendor_documents;
create policy vendor_documents_insert_own on public.vendor_documents as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_documents.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_documents_insert_staff on public.vendor_documents;
create policy vendor_documents_insert_staff on public.vendor_documents as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_documents_select_own on public.vendor_documents;
create policy vendor_documents_select_own on public.vendor_documents as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_documents.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_documents_select_staff on public.vendor_documents;
create policy vendor_documents_select_staff on public.vendor_documents as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vendor_documents_update_staff on public.vendor_documents;
create policy vendor_documents_update_staff on public.vendor_documents as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_escalations_delete_admin on public.vendor_escalations;
create policy vendor_escalations_delete_admin on public.vendor_escalations as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_escalations_insert_own on public.vendor_escalations;
create policy vendor_escalations_insert_own on public.vendor_escalations as PERMISSIVE for INSERT to authenticated
  with check (((status = 'open'::escalation_status) AND (assigned_to IS NULL) AND (resolved_at IS NULL) AND (raised_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_escalations.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists vendor_escalations_insert_staff on public.vendor_escalations;
create policy vendor_escalations_insert_staff on public.vendor_escalations as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_escalations_select_own on public.vendor_escalations;
create policy vendor_escalations_select_own on public.vendor_escalations as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_escalations.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_escalations_select_staff on public.vendor_escalations;
create policy vendor_escalations_select_staff on public.vendor_escalations as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vendor_escalations_update_staff on public.vendor_escalations;
create policy vendor_escalations_update_staff on public.vendor_escalations as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_feedback_insert_own_beneficiary on public.vendor_feedback;
create policy vendor_feedback_insert_own_beneficiary on public.vendor_feedback as PERMISSIVE for INSERT to authenticated
  with check (((beneficiary_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM beneficiaries b
  WHERE ((b.id = vendor_feedback.beneficiary_id) AND (b.user_id = auth.uid()))))));

drop policy if exists vendor_feedback_select_staff on public.vendor_feedback;
create policy vendor_feedback_select_staff on public.vendor_feedback as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_feedback_write_admin on public.vendor_feedback;
create policy vendor_feedback_write_admin on public.vendor_feedback as PERMISSIVE for ALL to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_menus_delete_own on public.vendor_menus;
create policy vendor_menus_delete_own on public.vendor_menus as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_menus_delete_staff on public.vendor_menus;
create policy vendor_menus_delete_staff on public.vendor_menus as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_menus_insert_own on public.vendor_menus;
create policy vendor_menus_insert_own on public.vendor_menus as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_menus_insert_staff on public.vendor_menus;
create policy vendor_menus_insert_staff on public.vendor_menus as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_menus_select_own on public.vendor_menus;
create policy vendor_menus_select_own on public.vendor_menus as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_menus_select_staff on public.vendor_menus;
create policy vendor_menus_select_staff on public.vendor_menus as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vendor_menus_update_own on public.vendor_menus;
create policy vendor_menus_update_own on public.vendor_menus as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_menus_update_staff on public.vendor_menus;
create policy vendor_menus_update_staff on public.vendor_menus as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendor_settlements_delete_admin on public.vendor_settlements;
create policy vendor_settlements_delete_admin on public.vendor_settlements as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_settlements_insert_admin on public.vendor_settlements;
create policy vendor_settlements_insert_admin on public.vendor_settlements as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendor_settlements_select_own on public.vendor_settlements;
create policy vendor_settlements_select_own on public.vendor_settlements as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_settlements.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vendor_settlements_select_staff on public.vendor_settlements;
create policy vendor_settlements_select_staff on public.vendor_settlements as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vendor_settlements_update_admin on public.vendor_settlements;
create policy vendor_settlements_update_admin on public.vendor_settlements as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendors_delete_admin on public.vendors;
create policy vendors_delete_admin on public.vendors as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vendors_insert_staff on public.vendors;
create policy vendors_insert_staff on public.vendors as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists vendors_select_own on public.vendors;
create policy vendors_select_own on public.vendors as PERMISSIVE for SELECT to authenticated
  using ((owner_id = ( SELECT auth.uid() AS uid)));

drop policy if exists vendors_select_staff on public.vendors;
create policy vendors_select_staff on public.vendors as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vendors_update_own on public.vendors;
create policy vendors_update_own on public.vendors as PERMISSIVE for UPDATE to authenticated
  using ((owner_id = ( SELECT auth.uid() AS uid)))
  with check ((owner_id = ( SELECT auth.uid() AS uid)));

drop policy if exists vendors_update_staff on public.vendors;
create policy vendors_update_staff on public.vendors as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists volunteer_activity_insert_staff on public.volunteer_activity_log;
create policy volunteer_activity_insert_staff on public.volunteer_activity_log as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists volunteer_activity_select_own on public.volunteer_activity_log;
create policy volunteer_activity_select_own on public.volunteer_activity_log as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM volunteers v
  WHERE ((v.id = volunteer_activity_log.volunteer_id) AND (v.user_id = auth.uid())))));

drop policy if exists volunteer_activity_select_staff on public.volunteer_activity_log;
create policy volunteer_activity_select_staff on public.volunteer_activity_log as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists vtr_delete_admin on public.volunteer_token_requests;
create policy vtr_delete_admin on public.volunteer_token_requests as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vtr_insert_own on public.volunteer_token_requests;
create policy vtr_insert_own on public.volunteer_token_requests as PERMISSIVE for INSERT to authenticated
  with check (((status = 'pending'::volunteer_request_status) AND (decided_by IS NULL) AND (decided_count IS NULL) AND (EXISTS ( SELECT 1
   FROM volunteers v
  WHERE ((v.id = volunteer_token_requests.volunteer_id) AND (v.user_id = ( SELECT auth.uid() AS uid)))))));

drop policy if exists vtr_insert_staff on public.volunteer_token_requests;
create policy vtr_insert_staff on public.volunteer_token_requests as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists vtr_select_own on public.volunteer_token_requests;
create policy vtr_select_own on public.volunteer_token_requests as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM volunteers v
  WHERE ((v.id = volunteer_token_requests.volunteer_id) AND (v.user_id = ( SELECT auth.uid() AS uid))))));

drop policy if exists vtr_select_staff on public.volunteer_token_requests;
create policy vtr_select_staff on public.volunteer_token_requests as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role])));

drop policy if exists vtr_update_admin on public.volunteer_token_requests;
create policy vtr_update_admin on public.volunteer_token_requests as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = 'admin'::user_role))
  with check ((private.current_app_role() = 'admin'::user_role));

drop policy if exists volunteers_delete_admin on public.volunteers;
create policy volunteers_delete_admin on public.volunteers as PERMISSIVE for DELETE to authenticated
  using ((private.current_app_role() = 'admin'::user_role));

drop policy if exists volunteers_insert_staff on public.volunteers;
create policy volunteers_insert_staff on public.volunteers as PERMISSIVE for INSERT to authenticated
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));

drop policy if exists volunteers_select_own on public.volunteers;
create policy volunteers_select_own on public.volunteers as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists volunteers_select_staff on public.volunteers;
create policy volunteers_select_staff on public.volunteers as PERMISSIVE for SELECT to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role])));

drop policy if exists volunteers_update_own on public.volunteers;
create policy volunteers_update_own on public.volunteers as PERMISSIVE for UPDATE to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists volunteers_update_staff on public.volunteers;
create policy volunteers_update_staff on public.volunteers as PERMISSIVE for UPDATE to authenticated
  using ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])))
  with check ((private.current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])));
