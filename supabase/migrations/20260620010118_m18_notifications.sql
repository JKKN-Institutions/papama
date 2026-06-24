-- =============================================================================
-- M18 — notifications (donor transparency + alerts, TRANS-1..4)
-- =============================================================================
-- Unifies the donor module's simplified notifications table into the model with
-- proper channel/status enums and real RLS. Powers credit-threshold alerts and
-- redemption alerts (time/vendor/location/meal/beneficiary-category, Q20).
--
-- Enums used (M01): notification_channel, notification_status.
-- Depends on M15 (donors), M02 (current_app_role).
-- Apply order: … → M17 → M18.
-- =============================================================================

begin;

create table public.notifications (
    id           uuid primary key default gen_random_uuid(),
    donor_id     uuid references public.donors (id) on delete cascade,
    -- broad category for client rendering (donation_success | threshold |
    -- token_generated | redemption | thank_you | system)
    kind         text not null default 'system',
    channel      public.notification_channel not null default 'in_app',
    title        text not null,
    message      text not null,
    -- structured payload for redemption alerts: { vendor, location, meal,
    -- beneficiary_category, redeemed_at } — keeps TRANS fields without columns.
    metadata     jsonb not null default '{}'::jsonb,
    status       public.notification_status not null default 'unread',
    created_at   timestamptz not null default now()
);

comment on table public.notifications is 'Donor-facing alerts (TRANS). metadata carries redemption detail (vendor/location/meal/category, Q20).';

create index notifications_donor_idx on public.notifications (donor_id, created_at desc)
    where donor_id is not null;
create index notifications_status_idx on public.notifications (status);

-- =============================================================================
-- RLS — a donor reads/updates (mark-read) only their own; admin/compliance read;
-- inserts come from server routes (service role) or admin.
-- =============================================================================
alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications for select to authenticated
    using (donor_id = public.current_donor_id());
create policy notifications_select_staff on public.notifications for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

-- A donor may mark their own notifications read (status only; full row check both sides).
create policy notifications_update_own on public.notifications for update to authenticated
    using (donor_id = public.current_donor_id())
    with check (donor_id = public.current_donor_id());

create policy notifications_write_admin on public.notifications for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.notifications cascade;
-- commit;
