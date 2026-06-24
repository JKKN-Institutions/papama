-- m32_patient_eligibility_config.sql
-- PROPOSED ONLY — do NOT apply without client/mentor sign-off on the value.
--
-- Adds the `patient_eligibility_months` system_config row so that the decide
-- route can auto-compute eligibility expiry for the `patient` category when no
-- explicit `eligibility_expires_at` is supplied (mirrors the existing
-- `special_care_post_delivery_months` row for `pregnant_women`).
--
-- The numeric value is intentionally left NULL — it is an OPEN ITEM pending a
-- client decision (analogous to `max_tokens_per_volunteer`). While it remains
-- NULL the route behaves correctly: getNumber() throws, the catch block fires,
-- and expiry is left open-ended. Set the value before enabling auto-expiry.
--
-- Suggested range for client discussion: 3–12 months depending on condition
-- severity (short-term illness vs. chronic condition). Ask the client and record
-- the agreed value in papama-client-decisions.md before applying this migration.
--
-- UP

INSERT INTO public.system_config (key, value, value_type, description)
VALUES (
    'patient_eligibility_months',
    NULL,  -- OPEN ITEM: value to be confirmed with client/mentor before go-live
    'number',
    'Number of months a newly approved "patient" beneficiary remains eligible from approval date. '
    'Mirrors special_care_post_delivery_months for pregnancy. NULL = open-ended (route leaves expiry unset until this is configured).'
)
ON CONFLICT (key) DO NOTHING;

-- DOWN

DELETE FROM public.system_config WHERE key = 'patient_eligibility_months';
