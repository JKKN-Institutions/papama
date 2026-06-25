-- =============================================================================
-- courier_dispatches — courier delivery for high-value batches (DIST-7)
-- =============================================================================
-- PRD DIST-7 + system_config.courier_batch_min_value (default ₹5,000) require a
-- token batch whose total value exceeds the threshold to be delivered by COURIER
-- instead of digitally. The lifecycle audit found the threshold configured but
-- never consumed and NO place to record a courier hand-off.
--
-- This table is the dispatch record. It is written by
-- lib/distribution/courier.ts (evaluateBatchForCourier), which the
-- batch-distribution path calls once a batch is assembled; when the batch value
-- exceeds the threshold it inserts a 'pending' row here and notifies the donor.
--
-- NOTE: there is currently no batch-distribution route to call the helper from —
-- this lays the table + helper so the courier branch is ready to wire in. RLS
-- mirrors token_batches: staff read, admin full write.
--
-- Apply AFTER M16 (token_batches) and M02 (current_app_role). Idempotent-ish
-- (guarded create); RLS policies use create-if-absent via drop/recreate.
-- =============================================================================

begin;

create table if not exists public.courier_dispatches (
    id               uuid primary key default gen_random_uuid(),
    batch_id         uuid references public.token_batches (id) on delete cascade,
    batch_value_inr  integer not null check (batch_value_inr > 0),
    delivery_address text,
    -- pending → dispatched → delivered (or cancelled). Mirrors the text-status
    -- convention used by token_batches / scheduled_redemption_dates.
    status           text not null default 'pending'
        check (status in ('pending', 'dispatched', 'delivered', 'cancelled')),
    courier_ref      text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists courier_dispatches_batch_idx on public.courier_dispatches (batch_id);
create index if not exists courier_dispatches_status_idx on public.courier_dispatches (status);

alter table public.courier_dispatches enable row level security;

-- Staff (admin/compliance/vendor_manager) may read; admin has full write. The
-- helper runs on the service-role client, which bypasses RLS, so these policies
-- govern only direct authenticated reads (e.g. an admin console list).
drop policy if exists courier_dispatches_select_staff on public.courier_dispatches;
create policy courier_dispatches_select_staff on public.courier_dispatches for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

drop policy if exists courier_dispatches_write_admin on public.courier_dispatches;
create policy courier_dispatches_write_admin on public.courier_dispatches for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- Keep updated_at fresh (set_updated_at defined in M02).
drop trigger if exists courier_dispatches_set_updated_at on public.courier_dispatches;
create trigger courier_dispatches_set_updated_at
    before update on public.courier_dispatches
    for each row execute function public.set_updated_at();

commit;

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- drop table if exists public.courier_dispatches cascade;
-- commit;
