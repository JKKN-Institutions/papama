-- =============================================================================
-- ADDON #10 — settlement duplicate-proof detection + random settlement audit
-- =============================================================================
-- Two net-new pieces of audit machinery, both behind admin-tunable system_config
-- thresholds (lib/system-config.ts; soft-skip while unset — AGENTS.md hard rule):
--
--   1. token_redemptions.proof_photo_phash — a perceptual hash of the uploaded
--      plate photo, computed at proof-upload time (lib/services/proofIntegrity.ts).
--      A duplicate photo (Hamming distance <= proof_phash_dup_distance against an
--      existing proof) is the signal that the same plate is being re-used across
--      redemptions. On a hit the upload route holds the related settlement(s) and
--      raises a fraud flag (REUSING flag_type 'vendor_anomaly' — no new enum value,
--      ALTER TYPE ADD VALUE is irreversible).
--
--   2. settlement_audit_queue — settlements pulled for human review, either
--      RANDOMLY (settlement_random_audit_rate sampling in runSettlement) or because
--      a duplicate-proof / anomaly flagged them. The admin clears or flags each.
--
-- RLS: internal audit surface — admin + compliance only (mirrors fraud_flags m11).
--
-- Apply AFTER m17 (token_redemptions, settlement_line_items), m10
-- (vendor_settlements) and m02 (users, current_app_role). Idempotent.
-- =============================================================================

begin;

-- --- 1. perceptual hash on the proof photo -----------------------------------
alter table public.token_redemptions
    add column if not exists proof_photo_phash text;

comment on column public.token_redemptions.proof_photo_phash is
    'Perceptual (average) hash of the uploaded plate photo, hex-encoded. Used to detect duplicate proof photos re-used across redemptions (addon #10). NULL until proof is uploaded.';

-- Partial index: only the rows that actually carry a hash participate in the
-- duplicate scan (the vast majority are NULL until proof upload).
create index if not exists token_redemptions_proof_phash_idx
    on public.token_redemptions (proof_photo_phash)
    where proof_photo_phash is not null;

-- --- 2. settlement audit queue -----------------------------------------------
create table if not exists public.settlement_audit_queue (
    id            uuid primary key default gen_random_uuid(),
    settlement_id uuid not null references public.vendor_settlements (id) on delete cascade,
    reason        text,                                   -- 'random_sample' | 'duplicate_proof' | free text
    status        text not null default 'pending'
        check (status in ('pending', 'cleared', 'flagged')),
    selected_at   timestamptz default now(),
    reviewed_by   uuid references public.users (id) on delete set null,
    reviewed_at   timestamptz
);

comment on table public.settlement_audit_queue is
    'Settlements pulled for human audit (addon #10) — randomly sampled (settlement_random_audit_rate) or flagged by duplicate-proof/anomaly detection. Admin clears or flags each before payout release.';

create index if not exists settlement_audit_queue_settlement_idx
    on public.settlement_audit_queue (settlement_id);
create index if not exists settlement_audit_queue_status_idx
    on public.settlement_audit_queue (status);

-- =============================================================================
-- RLS — internal audit surface: read AND manage by admin + compliance only.
-- (The detection/sampling services insert via the service-role client, which
--  bypasses RLS.)
-- =============================================================================
alter table public.settlement_audit_queue enable row level security;

create policy settlement_audit_select_staff on public.settlement_audit_queue for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy settlement_audit_insert_staff on public.settlement_audit_queue for insert to authenticated
    with check (public.current_app_role() in ('admin', 'compliance'));

create policy settlement_audit_update_staff on public.settlement_audit_queue for update to authenticated
    using (public.current_app_role() in ('admin', 'compliance'))
    with check (public.current_app_role() in ('admin', 'compliance'));

-- DELETE: admin only (compliance reviews but does not erase the audit trail).
create policy settlement_audit_delete_admin on public.settlement_audit_queue for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.settlement_audit_queue cascade;
-- drop index if exists public.token_redemptions_proof_phash_idx;
-- alter table public.token_redemptions drop column if exists proof_photo_phash;
-- commit;
