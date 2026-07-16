-- =============================================================================
-- ADDON #14/#20 (Phase-1 batch 2026-07-16) — payment failures + refund workflow
-- =============================================================================
-- Spec §3.1 F-10, §5 [M2-4]: failed-payment handling + a policy-gated refund
-- workflow. Default applied (client Q3/§11.2 #3): refunds ONLY for
-- failed/duplicate payment-gateway cases, never voluntary withdrawal.
--
-- ENFORCED AT THE SCHEMA LEVEL, not just app logic: refunds.payment_failure_id
-- is NOT NULL with ON DELETE RESTRICT — there is no code path that creates a
-- refund without an existing open payment_failures row.
--
-- Phase 1 has no live payment-gateway webhook (ASSUMPTIONS.md — payment
-- provider still open, client Q17), so payment_failures rows are admin-logged
-- via manual reconciliation, not auto-detected by a callback.
--
-- Apply AFTER 20260716090007c.
-- =============================================================================

begin;

create type public.payment_failure_reason as enum ('gateway_failed', 'duplicate_charge', 'chargeback', 'other');
create type public.refund_status as enum ('pending', 'approved', 'rejected', 'completed');

create table public.payment_failures (
    id           uuid primary key default gen_random_uuid(),
    donation_id  uuid references public.donations (id) on delete set null,
    donor_id     uuid references public.donors (id) on delete set null,
    amount_inr   numeric(12, 2) not null check (amount_inr > 0),
    reason       public.payment_failure_reason not null,
    detected_by  uuid references public.users (id) on delete set null,
    retry_count  integer not null default 0,
    max_retries  integer,
    status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
    notes        text,
    created_at   timestamptz not null default now(),
    resolved_at  timestamptz
);

comment on table public.payment_failures is
    'Admin-logged payment failure/duplicate-charge records (addon #14). Phase 1 has NO live payment-gateway webhook, so rows are created manually via admin reconciliation (POST /api/admin/payment-failures) — documented seam for a future gateway integration.';

create table public.refunds (
    id                 uuid primary key default gen_random_uuid(),
    donor_id           uuid not null references public.donors (id) on delete cascade,
    payment_failure_id uuid not null references public.payment_failures (id) on delete restrict,
    amount_inr         numeric(12, 2) not null check (amount_inr > 0),
    reason             text not null,
    requested_by       uuid references public.users (id) on delete set null,
    status             public.refund_status not null default 'pending',
    decided_by         uuid references public.users (id) on delete set null,
    decided_at         timestamptz,
    decision_note      text,
    created_at         timestamptz not null default now()
);

comment on table public.refunds is
    'Refund requests (addon #14/#20). payment_failure_id is NOT NULL BY DESIGN — schema-level enforcement of "refunds only for failed/duplicate payment cases, never voluntary withdrawal" (client Q3/§11.2 #3).';

create index payment_failures_donor_idx on public.payment_failures (donor_id);
create index payment_failures_status_idx on public.payment_failures (status);
create index refunds_donor_idx on public.refunds (donor_id);
create index refunds_status_idx on public.refunds (status);
create index refunds_payment_failure_idx on public.refunds (payment_failure_id);

alter table public.payment_failures enable row level security;
create policy payment_failures_select_staff on public.payment_failures
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));
create policy payment_failures_write_admin on public.payment_failures
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

alter table public.refunds enable row level security;
create policy refunds_select_staff_or_own on public.refunds
    for select to authenticated
    using (
        private.current_app_role() in ('admin', 'compliance')
        or donor_id = (select id from public.donors where user_id = auth.uid())
    );
create policy refunds_insert_own_or_admin on public.refunds
    for insert to authenticated
    with check (
        private.current_app_role() = 'admin'
        or donor_id = (select id from public.donors where user_id = auth.uid())
    );
create policy refunds_update_admin on public.refunds
    for update to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.refunds cascade;
-- drop table if exists public.payment_failures cascade;
-- drop type if exists public.refund_status;
-- drop type if exists public.payment_failure_reason;
-- commit;
