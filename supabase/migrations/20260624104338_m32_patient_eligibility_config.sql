-- RECOVERED from live DB (already applied under ledger version 20260624104338 / m32_patient_eligibility_config).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- Seeds the patient-eligibility window config key. Live value is NULL (OPEN ITEM pending
-- client decision) — preserved as NULL, never guessed. ON CONFLICT DO NOTHING so it will
-- not clobber an admin-set value.

insert into public.system_config (key, value, value_type, description) values
  ('patient_eligibility_months', NULL, 'number',
   'Number of months a newly approved patient beneficiary stays eligible from approval. Mirrors special_care_post_delivery_months for pregnancy. NULL = open-ended (route leaves expiry unset until configured) — OPEN ITEM pending client decision.')
on conflict (key) do nothing;
