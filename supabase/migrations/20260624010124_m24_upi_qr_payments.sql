-- =============================================================================
-- M24 — upi_qr_payments (self-hosted UPI QR manual-confirm flow)
-- =============================================================================
-- Records each UPI QR donation intent so the static-VPA "scan & pay" flow has a
-- server-authoritative lifecycle: PENDING -> PAID / EXPIRED / FAILED, 15-minute
-- expiry, manual UTR capture. Static-VPA UPI has no webhook, so confirmation is
-- MANUAL by design (the donor enters their UTR after paying). This replaces the
-- old fake "type any 6+ char UTR" donate/qr confirm.
--
-- Adapted from the upi-qr-payment-gateway skill for pApAmA's schema:
--   - no businesses/sales/profiles FKs (this app is single-tenant for donations);
--   - `donation_id` back-links to public.donations once a payment is confirmed
--     and credited (replaces the skill's sale_id);
--   - generate/confirm run on the SERVICE-ROLE client (guest, no auth), so the
--     only RLS surface is admin/compliance read for support. No anon/auth writes.
--
-- Depends on M15 (public.donations) and M02 (current_app_role). Apply after M23.
-- =============================================================================

begin;

create table public.upi_qr_payments (
    id               uuid primary key default gen_random_uuid(),
    transaction_ref  text unique not null,            -- our generated tr= reference
    upi_string       text not null,                   -- the upi://pay deep link
    amount_inr       integer not null check (amount_inr > 0),
    status           text not null default 'PENDING'
        check (status in ('PENDING', 'PAID', 'EXPIRED', 'FAILED')),

    -- Payment details captured at manual confirm time.
    upi_transaction_id text,                          -- UTR the payer enters
    payer_vpa          text,

    -- Linkage to the credited donation (set after confirm credits the donation).
    donation_id      uuid references public.donations (id) on delete set null,

    paid_at          timestamptz,
    expires_at       timestamptz not null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.upi_qr_payments is 'UPI QR donation intents (PENDING->PAID/EXPIRED/FAILED, 15-min expiry, manual UTR). generate/confirm run on service-role; manual confirm by design (static-VPA UPI has no webhook).';

create index upi_qr_payments_ref_idx     on public.upi_qr_payments (transaction_ref);
create index upi_qr_payments_status_idx  on public.upi_qr_payments (status);
create index upi_qr_payments_created_idx on public.upi_qr_payments (created_at desc);
create index upi_qr_payments_expires_idx on public.upi_qr_payments (expires_at);

-- reuse public.set_updated_at() from M02
create trigger upi_qr_payments_set_updated_at
    before update on public.upi_qr_payments
    for each row execute function public.set_updated_at();

-- --- RLS ---------------------------------------------------------------------
-- The generate/confirm routes use the service-role client (RLS-bypassing) so the
-- guest flow needs NO anon/authenticated write surface. Admin/compliance may read
-- for support/reconciliation. No client-side write policy is granted by design.
alter table public.upi_qr_payments enable row level security;

create policy upi_qr_payments_select_staff on public.upi_qr_payments for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists upi_qr_payments_select_staff on public.upi_qr_payments;
-- drop trigger if exists upi_qr_payments_set_updated_at on public.upi_qr_payments;
-- drop table if exists public.upi_qr_payments cascade;
-- commit;
