-- =============================================================================
-- ADDON #12 (Phase-1 batch 2026-07-16) — media fingerprints + duplicate_media flag
-- =============================================================================
-- Spec §3.1 F-3, §5 [M1-10]: duplicate photo detection (bill fingerprinting is
-- #13, explicitly HELD — bill_number/bill_amount_inr below are nullable
-- forward-compat columns, not populated/checked while #13 is on hold).
--
-- `lib/types/enums.ts` FRAUD_FLAG_TYPES already declares 'duplicate_media';
-- this migration makes the live fraud_flag_type enum match it, and gives the
-- existing duplicate-photo detector (lib/services/proofIntegrity.ts) a durable
-- fingerprint history table instead of only scanning
-- token_redemptions.proof_photo_phash.
--
-- Apply AFTER 20260716090002.
-- =============================================================================

alter type public.fraud_flag_type add value if not exists 'duplicate_media';

create type public.media_fingerprint_type as enum ('photo', 'bill');

create table public.media_fingerprints (
    id              uuid primary key default gen_random_uuid(),
    redemption_id   uuid not null references public.token_redemptions (id) on delete cascade,
    vendor_id       uuid not null references public.vendors (id) on delete cascade,
    type            public.media_fingerprint_type not null,
    hash            text not null,
    -- forward-compat for #13 (bill-fingerprint detection), held — nullable, unused for now:
    bill_number     text,
    bill_amount_inr numeric(12, 2),
    created_at      timestamptz not null default now()
);

comment on table public.media_fingerprints is
    'Append-only fingerprint history for proof media (addon #12). Photo rows are populated/checked now; bill_number/bill_amount_inr are forward-compat columns for #13 (bill-fingerprint detection), held.';

create index media_fingerprints_type_hash_idx on public.media_fingerprints (type, hash);
create index media_fingerprints_redemption_idx on public.media_fingerprints (redemption_id);
create index media_fingerprints_vendor_idx on public.media_fingerprints (vendor_id);

alter table public.media_fingerprints enable row level security;

create policy media_fingerprints_select_staff on public.media_fingerprints
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));

create policy media_fingerprints_insert_staff on public.media_fingerprints
    for insert to authenticated
    with check (private.current_app_role() in ('admin', 'compliance'));

-- Append-only evidence trail: no update/delete policy at all (mirrors audit_logs).

-- =============================================================================
-- DOWN (rollback) — note: fraud_flag_type's new enum value cannot be removed.
-- =============================================================================
-- begin;
-- drop table if exists public.media_fingerprints cascade;
-- drop type if exists public.media_fingerprint_type;
-- commit;
