-- =============================================================================
-- ADDON #18 (Phase-1 batch 2026-07-16) — triple-ledger financial architecture
-- =============================================================================
-- Spec §3.1 F-10, §5 [M1-12]: every money movement posts to one of three
-- ledgers (donation / vendor_payable / revenue). Settlement reconciliation
-- reports derive from this table, not ad-hoc queries. "Every rupee must be
-- traceable" — reconciliation invariant: donation == vendor_payable + revenue,
-- checked by lib/services/ledger.ts::reconcileLedgers().
--
-- Append-only (no update/delete policy, mirrors audit_logs discipline) — a
-- correction is a new offsetting entry, never an edit.
--
-- Apply AFTER 20260716090003.
-- =============================================================================

create table public.ledger_entries (
    id             uuid primary key default gen_random_uuid(),
    ledger         text not null check (ledger in ('donation', 'vendor_payable', 'revenue')),
    amount         numeric(12, 2) not null, -- positive = credit, negative = debit
    reference_type text not null,           -- 'donation' | 'redemption' | 'settlement' | 'refund' | 'credit_transaction'
    reference_id   uuid not null,
    description    text,
    created_at     timestamptz not null default now()
);

comment on table public.ledger_entries is
    'Triple-ledger financial trail (spec §3.1 F-10, addon #18) — donation / vendor_payable / revenue. Append-only. amount sign convention: credit=+, debit=-.';

create index ledger_entries_ledger_idx on public.ledger_entries (ledger, created_at desc);
create index ledger_entries_reference_idx on public.ledger_entries (reference_type, reference_id);

alter table public.ledger_entries enable row level security;

create policy ledger_entries_select_admin_compliance on public.ledger_entries
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));

create policy ledger_entries_select_vendor_own on public.ledger_entries
    for select to authenticated
    using (
        private.current_app_role() = 'vendor'
        and ledger = 'vendor_payable'
        and reference_type = 'redemption'
        and reference_id in (
            select id from public.token_redemptions
            where vendor_id = (select id from public.vendors where owner_id = auth.uid())
        )
    );

create policy ledger_entries_insert_admin on public.ledger_entries
    for insert to authenticated
    with check (private.current_app_role() = 'admin');

-- Append-only: no update/delete policy at all.

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.ledger_entries cascade;
-- commit;
