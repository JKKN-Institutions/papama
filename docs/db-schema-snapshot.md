# Database Schema Snapshot

Project ref: `qxdxefofeykzvegykitt` (auxilium/pApAmA). Generated from live DB via the Management API.
Schema: `public`. **RLS is enabled on every table.**

> Snapshot only — the live DB is the source of truth. Use the `supabase-papama` read-only MCP to re-inspect.

> **STALENESS NOTE (updated 2026-07-02).** The per-table sections below capture
> the original **33 base tables**. Later migration waves added more tables that are
> NOT detailed below — re-inspect the live schema (or `supabase/migrations/`) for
> their columns/policies:
>
> - **Phase-1 addon wave** (`20260624*`–`20260630*`): `face_embeddings`,
>   `upi_qr_payments`, `courier_dispatches`, `vendor_capacity_usage`,
>   `vendor_feedback`, `surprise_inspections`, `meal_windows`,
>   `emergency_token_grants`, `institution_token_allocations`,
>   `corporate_csr_profiles`, `settlement_audit_queue`, `volunteer_activity_log`,
>   plus columns on `vendors`, `tokens`, `beneficiaries`, `token_redemptions`.
> - **addon2 wave** (`20260702*`): `notification_templates` (A2),
>   `consent_records` (A7); complaint-lifecycle columns on `vendor_feedback` (A3);
>   `credit_transaction_type += 'refund_reversal'` (A6); `system_config` key
>   `audit_log_retention_days` (A7). See `docs/addon2-scope-mapping.md`.

## `audit_logs`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `actor_id` | uuid | yes |  |
| `actor_role` | user_role (enum) | yes |  |
| `action` | text | no |  |
| `entity_table` | text | no |  |
| `entity_id` | text | yes |  |
| `summary` | text | yes |  |
| `metadata` | jsonb | no | `'{}'::jsonb` |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `audit_logs_insert_self` | INSERT | authenticated |  | `(actor_id = ( SELECT auth.uid() AS uid))` |
| `audit_logs_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `beneficiaries`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | yes |  |
| `full_name` | text | yes |  |
| `category` | beneficiary_category (enum) | no |  |
| `eligibility_status` | eligibility_status (enum) | no | `'pending'::eligibility_status` |
| `face_hash` | text | yes |  |
| `aadhaar_hash` | text | yes |  |
| `eligibility_expires_at` | timestamp with time zone | yes |  |
| `registered_by` | uuid | yes |  |
| `status` | beneficiary_status (enum) | no | `'active'::beneficiary_status` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `beneficiaries_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `beneficiaries_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `beneficiaries_select_own` | SELECT | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` |  |
| `beneficiaries_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role]))` |  |
| `beneficiaries_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `beneficiary_registrations`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `full_name` | text | yes |  |
| `category` | beneficiary_category (enum) | no |  |
| `face_hash` | text | yes |  |
| `aadhaar_hash` | text | yes |  |
| `contact` | text | yes |  |
| `location_hint` | text | yes |  |
| `document_refs` | ARRAY | no | `'{}'::text[]` |
| `registration_status` | registration_status (enum) | no | `'pending'::registration_status` |
| `submitted_by` | uuid | yes |  |
| `reviewed_by` | uuid | yes |  |
| `review_notes` | text | yes |  |
| `beneficiary_id` | uuid | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `registrations_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `registrations_insert_authenticated` | INSERT | authenticated |  | `((current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role])) OR ((registration_status = 'pending'::registration_status) AND (reviewed_by IS NULL) AND (beneficiary_id IS NULL)))` |
| `registrations_select_own` | SELECT | authenticated | `(submitted_by = ( SELECT auth.uid() AS uid))` |  |
| `registrations_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role]))` |  |
| `registrations_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `campaigns`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `title` | text | no |  |
| `description` | text | no | `''::text` |
| `organization_name` | text | no |  |
| `category` | text | no |  |
| `location` | text | yes |  |
| `image_url` | text | yes |  |
| `target_tokens` | integer | no | `0` |
| `raised_tokens` | integer | no | `0` |
| `token_price_inr` | integer | no |  |
| `status` | text | no | `'active'::text` |
| `event_campaign_id` | uuid | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `campaigns_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `campaigns_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `campaigns_select_public` | SELECT | anon,authenticated | `true` |  |
| `campaigns_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `compliance_reports`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `report_type` | report_type (enum) | no |  |
| `title` | text | yes |  |
| `params` | jsonb | no | `'{}'::jsonb` |
| `summary` | jsonb | no | `'{}'::jsonb` |
| `file_url` | text | yes |  |
| `period_start` | date | yes |  |
| `period_end` | date | yes |  |
| `generated_by` | uuid | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `compliance_reports_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `compliance_reports_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |
| `compliance_reports_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |
| `compliance_reports_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |

## `credit_transactions`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `donor_id` | uuid | no |  |
| `amount_inr` | integer | no |  |
| `type` | credit_transaction_type (enum) | no |  |
| `description` | text | no | `''::text` |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `credit_tx_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `credit_tx_select_own` | SELECT | authenticated | `(donor_id = current_donor_id())` |  |
| `credit_tx_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `donations`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `donor_id` | uuid | yes |  |
| `campaign_id` | uuid | yes |  |
| `amount_inr` | integer | no |  |
| `token_amount` | integer | no | `0` |
| `status` | donation_status (enum) | no | `'pending'::donation_status` |
| `payment_ref` | text | yes |  |
| `financial_year` | text | yes |  |
| `event_campaign_id` | uuid | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `donations_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `donations_select_own` | SELECT | authenticated | `(donor_id = current_donor_id())` |  |
| `donations_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `donor_credits`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `donor_id` | uuid | no |  |
| `balance_inr` | integer | no | `0` |
| `reserved_balance_inr` | integer | no | `0` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `donor_credits_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `donor_credits_select_own` | SELECT | authenticated | `(donor_id = current_donor_id())` |  |
| `donor_credits_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `donors`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | yes |  |
| `name` | text | yes |  |
| `email` | text | yes |  |
| `avatar_url` | text | yes |  |
| `pan_number` | text | yes |  |
| `impact_score` | integer | no | `0` |
| `total_donated_tokens` | integer | no | `0` |
| `joined_date` | date | no | `CURRENT_DATE` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `donors_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `donors_select_own` | SELECT | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` |  |
| `donors_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |
| `donors_update_own` | UPDATE | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

## `forfeited_balances`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `token_id` | uuid | yes |  |
| `redemption_id` | uuid | yes |  |
| `forfeited_inr` | integer | no |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `forfeited_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `forfeited_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `fraud_flags`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `flag_type` | fraud_flag_type (enum) | no |  |
| `severity` | fraud_severity (enum) | no |  |
| `status` | fraud_status (enum) | no | `'open'::fraud_status` |
| `detection_method` | fraud_detection_method (enum) | yes |  |
| `entity` | jsonb | no |  |
| `blocked` | boolean | no | `false` |
| `resolved_by` | uuid | yes |  |
| `resolution_notes` | text | yes |  |
| `resolved_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `fraud_flags_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `fraud_flags_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |
| `fraud_flags_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |
| `fraud_flags_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |

## `ngo_partners`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `name` | text | no |  |
| `registration_number` | text | yes |  |
| `focus_area` | text | yes |  |
| `contact_person` | text | yes |  |
| `contact_email` | text | yes |  |
| `contact_phone` | text | yes |  |
| `address` | text | yes |  |
| `city` | text | yes |  |
| `contact_user_id` | uuid | yes |  |
| `status` | text | no | `'active'::text` |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `ngo_partners_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `ngo_partners_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `ngo_partners_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |
| `ngo_partners_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `notifications`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `donor_id` | uuid | yes |  |
| `kind` | text | no | `'system'::text` |
| `channel` | notification_channel (enum) | no | `'in_app'::notification_channel` |
| `title` | text | no |  |
| `message` | text | no |  |
| `metadata` | jsonb | no | `'{}'::jsonb` |
| `status` | notification_status (enum) | no | `'unread'::notification_status` |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `notifications_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `notifications_select_own` | SELECT | authenticated | `(donor_id = current_donor_id())` |  |
| `notifications_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |
| `notifications_update_own` | UPDATE | authenticated | `(donor_id = current_donor_id())` | `(donor_id = current_donor_id())` |

## `payment_methods`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `donor_id` | uuid | no |  |
| `provider` | text | no |  |
| `method_type` | text | no |  |
| `display_name` | text | no |  |
| `is_default` | boolean | no | `false` |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `payment_methods_modify_own` | ALL | authenticated | `(donor_id = current_donor_id())` | `(donor_id = current_donor_id())` |
| `payment_methods_select_own` | SELECT | authenticated | `(donor_id = current_donor_id())` |  |
| `payment_methods_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `redemption_cooldown_log`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `beneficiary_id` | uuid | yes |  |
| `face_hash` | text | yes |  |
| `token_id` | uuid | yes |  |
| `vendor_id` | uuid | yes |  |
| `redeemed_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `cooldown_insert_vendor` | INSERT | authenticated |  | `((current_app_role() = 'admin'::user_role) OR (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = redemption_cooldown_log.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))))` |
| `cooldown_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `scheduled_redemption_dates`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `token_id` | uuid | yes |  |
| `campaign_id` | uuid | yes |  |
| `scheduled_for` | date | no |  |
| `location` | text | yes |  |
| `status` | text | no | `'scheduled'::text` |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `sched_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `sched_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM tokens t
  WHERE ((t.id = scheduled_redemption_dates.token_id) AND (t.donor_id = current_donor_id()))))` |  |
| `sched_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role]))` |  |

## `settlement_line_items`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `settlement_id` | uuid | no |  |
| `redemption_id` | uuid | no |  |
| `amount_inr` | numeric | no |  |
| `created_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `settlement_lines_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `settlement_lines_select_own_vendor` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM (vendor_settlements s
     JOIN vendors v ON ((v.id = s.vendor_id)))
  WHERE ((s.id = settlement_line_items.settlement_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `settlement_lines_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role]))` |  |

## `system_config`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `key` | text | no |  |
| `value` | text | yes |  |
| `value_type` | text | no |  |
| `description` | text | yes |  |
| `updated_by` | uuid | yes |  |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `system_config_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `system_config_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `system_config_select_authenticated` | SELECT | authenticated | `true` |  |
| `system_config_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `token_authorisations`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `token_id` | uuid | no |  |
| `authorised_by` | uuid | yes |  |
| `status` | text | no | `'authorised'::text` |
| `notes` | text | yes |  |
| `authorised_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `token_auth_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `token_auth_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role]))` |  |

## `token_batches`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `donation_id` | uuid | yes |  |
| `campaign_id` | uuid | yes |  |
| `token_count` | integer | no |  |
| `status` | text | no | `'minted'::text` |
| `minted_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `token_batches_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `token_batches_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM donations d
  WHERE ((d.id = token_batches.donation_id) AND (d.donor_id = current_donor_id()))))` |  |
| `token_batches_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role]))` |  |

## `token_distribution_records`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `token_id` | uuid | no |  |
| `beneficiary_id` | uuid | yes |  |
| `distributed_by` | uuid | yes |  |
| `channel` | distribution_channel (enum) | yes |  |
| `distribution_location` | text | yes |  |
| `notes` | text | yes |  |
| `distributed_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `token_dist_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `token_dist_insert_distributor` | INSERT | authenticated |  | `((current_app_role() = ANY (ARRAY['admin'::user_role, 'volunteer'::user_role])) OR (EXISTS ( SELECT 1
   FROM tokens t
  WHERE ((t.id = token_distribution_records.token_id) AND (t.donor_id = current_donor_id())))))` |
| `token_dist_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM tokens t
  WHERE ((t.id = token_distribution_records.token_id) AND (t.donor_id = current_donor_id()))))` |  |
| `token_dist_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role]))` |  |

## `token_redemptions`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `token_id` | uuid | no |  |
| `beneficiary_id` | uuid | yes |  |
| `vendor_id` | uuid | no |  |
| `token_value_inr` | integer | no |  |
| `menu_value_inr` | integer | no |  |
| `difference_paid_inr` | integer | no | `0` |
| `co_pay_inr` | integer | no | `0` |
| `geo_lat` | numeric | yes |  |
| `geo_lng` | numeric | yes |  |
| `face_hash_checked` | boolean | no | `false` |
| `proof_photo_ref` | text | yes |  |
| `proof_receipt_ref` | text | yes |  |
| `proof_uploaded_at` | timestamp with time zone | yes |  |
| `payment_status` | payment_status (enum) | no | `'locked'::payment_status` |
| `redeemed_at` | timestamp with time zone | no | `now()` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `redemptions_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `redemptions_insert_own_vendor` | INSERT | authenticated |  | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |
| `redemptions_select_own_vendor` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `redemptions_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role]))` |  |
| `redemptions_update_own_vendor` | UPDATE | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = token_redemptions.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |

## `token_types`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `code` | token_type (enum) | no |  |
| `label` | text | no |  |
| `description` | text | no | `''::text` |
| `is_restricted` | boolean | no | `false` |
| `allowed_nutrition_categories` | ARRAY | no | `'{}'::text[]` |
| `requires_eligibility` | boolean | no | `false` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `token_types_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `token_types_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `token_types_select_authenticated` | SELECT | authenticated | `true` |  |
| `token_types_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `tokens`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `serial_number` | text | no |  |
| `qr_hash` | text | yes |  |
| `token_type` | token_type (enum) | no | `'standard'::token_type` |
| `value_inr` | integer | no |  |
| `status` | token_status (enum) | no | `'generated'::token_status` |
| `donor_id` | uuid | yes |  |
| `donation_id` | uuid | yes |  |
| `campaign_id` | uuid | yes |  |
| `batch_id` | uuid | yes |  |
| `beneficiary_id` | uuid | yes |  |
| `special_instructions` | text | yes |  |
| `replacement_for_token_id` | uuid | yes |  |
| `expires_at` | timestamp with time zone | yes |  |
| `minted_at` | timestamp with time zone | no | `now()` |
| `distributed_at` | timestamp with time zone | yes |  |
| `redeemed_at` | timestamp with time zone | yes |  |
| `expired_at` | timestamp with time zone | yes |  |
| `cancelled_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `tokens_write_admin` | ALL | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |
| `tokens_insert_own` | INSERT | authenticated |  | `(donor_id = current_donor_id())` |
| `tokens_select_own` | SELECT | authenticated | `(donor_id = current_donor_id())` |  |
| `tokens_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'compliance'::user_role, 'vendor_manager'::user_role, 'volunteer'::user_role]))` |  |
| `tokens_update_own` | UPDATE | authenticated | `(donor_id = current_donor_id())` | `(donor_id = current_donor_id())` |

## `users`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no |  |
| `role` | user_role (enum) | no | `'donor'::user_role` |
| `donor_id` | text | yes |  |
| `email` | text | yes |  |
| `full_name` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `users_delete_admin` | DELETE | public | `(current_app_role() = 'admin'::user_role)` |  |
| `users_insert_admin` | INSERT | public |  | `(current_app_role() = 'admin'::user_role)` |
| `users_select_admin` | SELECT | public | `(current_app_role() = 'admin'::user_role)` |  |
| `users_select_own` | SELECT | public | `(id = ( SELECT auth.uid() AS uid))` |  |
| `users_update_admin` | UPDATE | public | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `vendor_communication_history`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | uuid | no |  |
| `staff_user_id` | uuid | yes |  |
| `channel` | text | no |  |
| `direction` | text | no | `'outbound'::text` |
| `subject` | text | yes |  |
| `body` | text | no |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vendor_comm_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `vendor_comm_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `vendor_comm_select_own` | SELECT | authenticated | `((direction <> 'internal_note'::text) AND (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_communication_history.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))))` |  |
| `vendor_comm_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `vendor_comm_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |

## `vendor_documents`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | uuid | no |  |
| `doc_type` | text | no |  |
| `url` | text | no |  |
| `verification_status` | kyc_status (enum) | no | `'pending'::kyc_status` |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vendor_documents_delete_staff` | DELETE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |  |
| `vendor_documents_insert_own` | INSERT | authenticated |  | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_documents.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |
| `vendor_documents_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `vendor_documents_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_documents.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `vendor_documents_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `vendor_documents_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |

## `vendor_escalations`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | uuid | no |  |
| `raised_by` | uuid | yes |  |
| `assigned_to` | uuid | yes |  |
| `subject` | text | no |  |
| `description` | text | yes |  |
| `status` | escalation_status (enum) | no | `'open'::escalation_status` |
| `resolution` | text | yes |  |
| `resolved_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vendor_escalations_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `vendor_escalations_insert_own` | INSERT | authenticated |  | `((status = 'open'::escalation_status) AND (assigned_to IS NULL) AND (resolved_at IS NULL) AND (raised_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_escalations.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))))` |
| `vendor_escalations_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `vendor_escalations_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_escalations.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `vendor_escalations_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `vendor_escalations_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |

## `vendor_menus`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | uuid | no |  |
| `item_name` | text | no |  |
| `price` | numeric | no |  |
| `nutrition_category` | text | yes |  |
| `is_special_care_equivalent` | boolean | no | `false` |
| `special_care_equivalent_approved` | boolean | no | `false` |
| `approval_status` | registration_status (enum) | no | `'pending'::registration_status` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vendor_menus_delete_own` | DELETE | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `vendor_menus_delete_staff` | DELETE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |  |
| `vendor_menus_insert_own` | INSERT | authenticated |  | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |
| `vendor_menus_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `vendor_menus_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `vendor_menus_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `vendor_menus_update_own` | UPDATE | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_menus.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |
| `vendor_menus_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |

## `vendor_settlements`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `vendor_id` | uuid | no |  |
| `period` | settlement_cycle (enum) | no |  |
| `status` | settlement_status (enum) | no | `'pending'::settlement_status` |
| `period_start` | date | yes |  |
| `period_end` | date | yes |  |
| `amount` | numeric | no | `0` |
| `line_item_count` | integer | no | `0` |
| `settled_at` | timestamp with time zone | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vendor_settlements_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `vendor_settlements_insert_admin` | INSERT | authenticated |  | `(current_app_role() = 'admin'::user_role)` |
| `vendor_settlements_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM vendors v
  WHERE ((v.id = vendor_settlements.vendor_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))` |  |
| `vendor_settlements_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `vendor_settlements_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `vendors`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `owner_id` | uuid | yes |  |
| `name` | text | no |  |
| `legal_name` | text | yes |  |
| `address` | text | yes |  |
| `city` | text | yes |  |
| `pincode` | text | yes |  |
| `phone` | text | yes |  |
| `email` | text | yes |  |
| `emergency_contact` | text | yes |  |
| `fssai_license` | text | yes |  |
| `gst_number` | text | yes |  |
| `bank_account_name` | text | yes |  |
| `bank_account_number` | text | yes |  |
| `bank_ifsc` | text | yes |  |
| `geo_lat` | numeric | yes |  |
| `geo_lng` | numeric | yes |  |
| `hygiene_rating` | smallint | yes |  |
| `status` | vendor_status (enum) | no | `'pending'::vendor_status` |
| `kyc_status` | kyc_status (enum) | no | `'pending'::kyc_status` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vendors_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `vendors_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `vendors_select_own` | SELECT | authenticated | `(owner_id = ( SELECT auth.uid() AS uid))` |  |
| `vendors_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role, 'volunteer'::user_role]))` |  |
| `vendors_update_own` | UPDATE | authenticated | `(owner_id = ( SELECT auth.uid() AS uid))` | `(owner_id = ( SELECT auth.uid() AS uid))` |
| `vendors_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |

## `volunteer_token_requests`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `volunteer_id` | uuid | no |  |
| `requested_count` | integer | no |  |
| `status` | volunteer_request_status (enum) | no | `'pending'::volunteer_request_status` |
| `decided_by` | uuid | yes |  |
| `decided_count` | integer | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `vtr_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `vtr_insert_own` | INSERT | authenticated |  | `((status = 'pending'::volunteer_request_status) AND (decided_by IS NULL) AND (decided_count IS NULL) AND (EXISTS ( SELECT 1
   FROM volunteers v
  WHERE ((v.id = volunteer_token_requests.volunteer_id) AND (v.user_id = ( SELECT auth.uid() AS uid))))))` |
| `vtr_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `vtr_select_own` | SELECT | authenticated | `(EXISTS ( SELECT 1
   FROM volunteers v
  WHERE ((v.id = volunteer_token_requests.volunteer_id) AND (v.user_id = ( SELECT auth.uid() AS uid)))))` |  |
| `vtr_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `vtr_update_admin` | UPDATE | authenticated | `(current_app_role() = 'admin'::user_role)` | `(current_app_role() = 'admin'::user_role)` |

## `volunteers`

RLS: enabled

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `user_id` | uuid | no |  |
| `full_name` | text | yes |  |
| `phone` | text | yes |  |
| `email` | text | yes |  |
| `status` | text | no | `'active'::text` |
| `created_at` | timestamp with time zone | no | `now()` |
| `updated_at` | timestamp with time zone | no | `now()` |

**Policies:**

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `volunteers_delete_admin` | DELETE | authenticated | `(current_app_role() = 'admin'::user_role)` |  |
| `volunteers_insert_staff` | INSERT | authenticated |  | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |
| `volunteers_select_own` | SELECT | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` |  |
| `volunteers_select_staff` | SELECT | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role, 'compliance'::user_role]))` |  |
| `volunteers_update_own` | UPDATE | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |
| `volunteers_update_staff` | UPDATE | authenticated | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` | `(current_app_role() = ANY (ARRAY['admin'::user_role, 'vendor_manager'::user_role]))` |


