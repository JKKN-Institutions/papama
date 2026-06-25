-- =============================================================================
-- Proof review gate — admin verifies proof-of-service before payment releases
-- =============================================================================
-- Before this migration the vendor proof upload flipped payment_status
-- 'locked' → 'released' by itself, so an unreviewed proof was immediately
-- payable and rolled straight into settlement. This adds an admin review step
-- BETWEEN upload and release:
--
--   vendor uploads proof  → proof_status='submitted', payment stays 'locked'
--   admin approves        → proof_status='approved',  payment → 'released'
--   admin rejects (+note) → proof_status='rejected',  payment stays 'locked'
--                           (vendor may re-upload; this clears the rejection)
--
-- The settlement engine already keys off payment_status='released', so a meal is
-- only ever paid once its proof is approved. proof_status is intentionally a
-- SEPARATE column from payment_status (which keeps tracking the payout lock), so
-- the two state machines compose cleanly — same approach as m25 settlement hold.
--
-- Apply AFTER m17 (token_redemptions) and m02 (public.users). Idempotent.
-- =============================================================================

begin;

-- New per-redemption proof review state.
do $$ begin
    create type proof_status as enum ('submitted', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

alter table public.token_redemptions
    add column if not exists proof_status      proof_status,
    add column if not exists proof_reviewed_by uuid references public.users(id),
    add column if not exists proof_reviewed_at timestamptz,
    add column if not exists proof_review_note text;

comment on column public.token_redemptions.proof_status is
    'Admin review of the uploaded proof: null = not yet submitted, submitted = awaiting review, '
    'approved = evidence accepted (payment released), rejected = evidence rejected (vendor must re-upload).';

-- Index the admin review queue (the rows awaiting a decision), oldest first.
create index if not exists idx_token_redemptions_proof_submitted
    on public.token_redemptions (proof_uploaded_at)
    where proof_status = 'submitted';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop index if exists public.idx_token_redemptions_proof_submitted;
-- alter table public.token_redemptions
--     drop column if exists proof_review_note,
--     drop column if exists proof_reviewed_at,
--     drop column if exists proof_reviewed_by,
--     drop column if exists proof_status;
-- drop type if exists proof_status;
-- commit;
