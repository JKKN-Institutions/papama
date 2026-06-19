-- =============================================================================
-- M01 — Postgres enum types (Developer 2)
-- =============================================================================
-- Mirrors lib/types/enums.ts exactly (single source of truth for allowed values).
-- These TYPES are net-new and do NOT touch any of Developer 1's 12 tables.
-- Developer 1 used text + CHECK constraints, so there are no enum-name collisions.
--
-- Apply this file as-is. To roll back, run the DOWN block at the bottom
-- (after rolling back M02 first, since M02 depends on user_role).
-- =============================================================================

begin;

create type public.user_role as enum (
    'admin', 'compliance', 'vendor_manager', 'vendor',
    'volunteer', 'donor', 'beneficiary', 'guest'
);

create type public.token_type as enum ('standard', 'special_care');

create type public.token_status as enum (
    'generated', 'live', 'in_admin_pool', 'assigned_to_volunteer',
    'distributed', 'redeemed', 'expired'
);

create type public.distribution_channel as enum (
    'donor_self', 'admin_to_volunteer', 'volunteer_request_grant', 'volunteer_to_beneficiary'
);

create type public.volunteer_request_status as enum (
    'pending', 'granted', 'partially_granted', 'denied'
);

create type public.credit_transaction_type as enum (
    'purchase', 'donation', 'pooling_supplement' -- pooling_supplement = P2 seam
);

create type public.donation_status as enum ('pending', 'completed', 'failed');

create type public.beneficiary_category as enum (
    'pregnant_women', 'patient', 'disability', 'disaster_affected'
    -- disaster_affected: label only; proof/eligibility rules OPEN (client Q7)
);

create type public.eligibility_status as enum ('pending', 'verified', 'failed');

create type public.registration_status as enum ('pending', 'approved', 'rejected');

create type public.vendor_status as enum ('pending', 'approved', 'suspended', 'rejected');

create type public.kyc_status as enum ('pending', 'verified', 'failed');

create type public.settlement_cycle as enum ('daily', 'twice_weekly', 'weekly');

create type public.settlement_status as enum ('pending', 'locked', 'reconciled', 'paid');

create type public.payment_status as enum ('locked', 'released', 'held', 'failed');

create type public.fraud_flag_type as enum (
    'duplicate_token', 'cloned_qr', 'tampered_qr', 'beneficiary_duplicate', 'vendor_anomaly'
);

create type public.fraud_severity as enum ('low', 'medium', 'high');

create type public.fraud_status as enum ('open', 'resolved', 'dismissed');

create type public.fraud_detection_method as enum (
    'face_hash_repeat', 'vendor_volume_anomaly', 'token_duplication',
    'cloned_qr', 'tampered_qr', 'geofence_violation',
    'gps_integrity', 'pattern_analysis' -- last two = P2 seams
);

create type public.notification_channel as enum (
    'in_app', 'sms', 'email', 'whatsapp' -- whatsapp = P2 seam
);

create type public.notification_status as enum ('unread', 'read');

commit;

-- =============================================================================
-- DOWN (rollback) — run AFTER M02 DOWN. Drop in reverse dependency order.
-- =============================================================================
-- begin;
-- drop type if exists public.notification_status;
-- drop type if exists public.notification_channel;
-- drop type if exists public.fraud_detection_method;
-- drop type if exists public.fraud_status;
-- drop type if exists public.fraud_severity;
-- drop type if exists public.fraud_flag_type;
-- drop type if exists public.payment_status;
-- drop type if exists public.settlement_status;
-- drop type if exists public.settlement_cycle;
-- drop type if exists public.kyc_status;
-- drop type if exists public.vendor_status;
-- drop type if exists public.registration_status;
-- drop type if exists public.eligibility_status;
-- drop type if exists public.beneficiary_category;
-- drop type if exists public.donation_status;
-- drop type if exists public.credit_transaction_type;
-- drop type if exists public.volunteer_request_status;
-- drop type if exists public.distribution_channel;
-- drop type if exists public.token_status;
-- drop type if exists public.token_type;
-- drop type if exists public.user_role;
-- commit;
