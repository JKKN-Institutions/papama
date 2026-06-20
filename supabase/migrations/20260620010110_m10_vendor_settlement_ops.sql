-- =============================================================================
-- M10 — vendor settlement & ops: vendor_settlements, vendor_communication_history,
--       vendor_escalations (Developer 2)   [Group A: zero Dev-1 references]
-- =============================================================================
-- Net-new tables extending the vendor vertical (contract §4 + §8):
--   * vendor_settlements           — HEADER-ONLY settlement records (one per
--                                    vendor per payout window). period/status/amount.
--   * vendor_communication_history — log of contact with a vendor (calls, emails, notes)
--   * vendor_escalations           — vendor disputes/appeals/tickets (contract §4)
--
-- Boundary (Section A): references ONLY public.vendors and public.users.
--   * vendor_settlements is HEADER-ONLY. `amount` is computed LATER from
--     settlement_line_items (which references token_redemptions → Dev-1 token →
--     Section-A-blocked). NO redemption FK and NO line-item FK at this stage;
--     `amount` defaults to 0 and `line_item_count` to 0 until that lands.
--   * No token / redemption / Dev-1 references anywhere in this file.
--
-- Enums: settlement_cycle, settlement_status (M01); escalation_status (M07).
-- Depends on M02 (users), M04 (vendors), M07 (escalation_status). Apply: … M09 -> M10.
-- =============================================================================

begin;

-- --- vendor_settlements (header-only) ----------------------------------------
create table public.vendor_settlements (
    id              uuid primary key default gen_random_uuid(),
    vendor_id       uuid not null references public.vendors (id) on delete cascade,
    period          public.settlement_cycle  not null,             -- daily | twice_weekly | weekly
    status          public.settlement_status not null default 'pending', -- pending | locked | reconciled | paid
    period_start    date,                                          -- payout window (nullable until scheduled)
    period_end      date,
    amount          numeric(12, 2) not null default 0 check (amount >= 0), -- computed later from line items
    line_item_count integer not null default 0 check (line_item_count >= 0), -- maintained when settlement_line_items lands (Section-A-blocked)
    settled_at      timestamptz,                                   -- null until paid (matches contract §8)
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint vendor_settlements_period_order
        check (period_start is null or period_end is null or period_start <= period_end)
);

comment on table  public.vendor_settlements is 'Header-only settlement records (contract §8). amount/line_item_count are computed from settlement_line_items once that table lands (Section-A-blocked on Dev-1 token ref).';
comment on column public.vendor_settlements.amount is 'Computed payout total. Defaults to 0; populated by the settlement service from line items later.';

create index vendor_settlements_vendor_idx on public.vendor_settlements (vendor_id);
create index vendor_settlements_status_idx on public.vendor_settlements (status);
create index vendor_settlements_period_idx on public.vendor_settlements (period_start, period_end);

create trigger vendor_settlements_set_updated_at
    before update on public.vendor_settlements
    for each row execute function public.set_updated_at();

-- --- vendor_communication_history --------------------------------------------
create table public.vendor_communication_history (
    id            uuid primary key default gen_random_uuid(),
    vendor_id     uuid not null references public.vendors (id) on delete cascade,
    staff_user_id uuid references public.users (id) on delete set null, -- who logged/sent it; null if user removed
    channel       text not null,                       -- e.g. call | email | sms | in_app | note
    direction     text not null default 'outbound'
        check (direction in ('inbound', 'outbound', 'internal_note')),
    subject       text,
    body          text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table  public.vendor_communication_history is 'Log of communication with a vendor (contract §4). internal_note rows are staff-only and never visible to the vendor.';

create index vendor_communication_history_vendor_idx  on public.vendor_communication_history (vendor_id);
create index vendor_communication_history_created_idx on public.vendor_communication_history (created_at desc);

create trigger vendor_communication_history_set_updated_at
    before update on public.vendor_communication_history
    for each row execute function public.set_updated_at();

-- --- vendor_escalations ------------------------------------------------------
create table public.vendor_escalations (
    id           uuid primary key default gen_random_uuid(),
    vendor_id    uuid not null references public.vendors (id) on delete cascade,
    raised_by    uuid references public.users (id) on delete set null, -- vendor (appeal) or staff (issue)
    assigned_to  uuid references public.users (id) on delete set null, -- staff handling; nullable
    subject      text not null,
    description  text,
    status       public.escalation_status not null default 'open',     -- open | in_progress | resolved | closed
    resolution   text,
    resolved_at  timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

comment on table public.vendor_escalations is 'Vendor disputes / appeals / support tickets (contract §4 "Vendor appeals"). A vendor may raise own; staff triage and resolve.';

create index vendor_escalations_vendor_idx   on public.vendor_escalations (vendor_id);
create index vendor_escalations_status_idx   on public.vendor_escalations (status);
create index vendor_escalations_assigned_idx on public.vendor_escalations (assigned_to) where assigned_to is not null;

create trigger vendor_escalations_set_updated_at
    before update on public.vendor_escalations
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS (spec §6). compliance is READ-ONLY oversight; vendor_manager manages the
-- vendor vertical; settlements (financial) are admin/compliance-write only.
-- =============================================================================
alter table public.vendor_settlements           enable row level security;
alter table public.vendor_communication_history enable row level security;
alter table public.vendor_escalations           enable row level security;

-- --- vendor_settlements ------------------------------------------------------
-- SELECT: staff read all; a vendor reads only their own settlements.
create policy vendor_settlements_select_staff on public.vendor_settlements for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy vendor_settlements_select_own on public.vendor_settlements for select to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

-- WRITE: financial — ADMIN ONLY. Separation of duties: compliance AUDITS
-- settlements (SELECT via the staff policy above) but must not EDIT them, so it
-- is intentionally excluded from insert/update/delete. vendor_manager does not
-- settle money either.
create policy vendor_settlements_insert_admin on public.vendor_settlements for insert to authenticated
    with check (public.current_app_role() = 'admin');
create policy vendor_settlements_update_admin on public.vendor_settlements for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');
create policy vendor_settlements_delete_admin on public.vendor_settlements for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- vendor_communication_history --------------------------------------------
-- SELECT: staff read all; a vendor reads own EXCEPT internal_note rows.
create policy vendor_comm_select_staff on public.vendor_communication_history for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy vendor_comm_select_own on public.vendor_communication_history for select to authenticated
    using (
        direction <> 'internal_note'
        and exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    );

-- WRITE: admin/vendor_manager log/maintain; delete admin only.
create policy vendor_comm_insert_staff on public.vendor_communication_history for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_comm_update_staff on public.vendor_communication_history for update to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_comm_delete_admin on public.vendor_communication_history for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- vendor_escalations ------------------------------------------------------
-- SELECT: staff read all; a vendor reads only their own escalations.
create policy vendor_escalations_select_staff on public.vendor_escalations for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy vendor_escalations_select_own on public.vendor_escalations for select to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

-- INSERT: staff open any; a vendor may raise a CLEAN OPEN appeal for their own
-- shop (cannot self-assign or self-resolve).
create policy vendor_escalations_insert_staff on public.vendor_escalations for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_escalations_insert_own on public.vendor_escalations for insert to authenticated
    with check (
        status = 'open'
        and assigned_to is null
        and resolved_at is null
        and raised_by = auth.uid()
        and exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    );

-- UPDATE (triage / assign / resolve): staff only — vendor cannot change status/resolution.
create policy vendor_escalations_update_staff on public.vendor_escalations for update to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'vendor_manager'));

-- DELETE: admin only.
create policy vendor_escalations_delete_admin on public.vendor_escalations for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.vendor_escalations           cascade;
-- drop table if exists public.vendor_communication_history cascade;
-- drop table if exists public.vendor_settlements           cascade;
-- commit;
