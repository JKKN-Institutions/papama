-- =============================================================================
-- ADDON2 A3 — complaint-management lifecycle on vendor_feedback
-- =============================================================================
-- vendor_feedback already carries beneficiary complaints (is_complaint) but had
-- no workflow. This adds a lifecycle (open -> investigating -> resolved/dismissed)
-- so staff can triage and close complaints. We deliberately EXTEND vendor_feedback
-- rather than add a duplicate `complaints` table — the beneficiary-complaint path
-- lives here; vendor-RAISED disputes stay in vendor_escalations (separate concern).
--
-- complaint_status is meaningful only for complaint rows: a CHECK keeps it NULL
-- unless is_complaint = true. Existing complaint rows are backfilled to 'open'.
--
-- Depends on 20260630000004 (vendor_feedback), 20260702000001 (complaint_status),
-- M02 (users, current_app_role). snake_case · RLS · reversible DOWN.
-- =============================================================================

begin;

alter table public.vendor_feedback
    add column if not exists complaint_status public.complaint_status,
    add column if not exists resolution       text,
    add column if not exists resolved_by       uuid references public.users (id) on delete set null,
    add column if not exists resolved_at        timestamptz;

comment on column public.vendor_feedback.complaint_status is
    'Triage lifecycle for complaint rows (open/investigating/resolved/dismissed). NULL for non-complaint feedback.';

-- Only complaint rows may carry a status.
alter table public.vendor_feedback
    add constraint vendor_feedback_complaint_status_only_when_complaint
        check (complaint_status is null or is_complaint = true);

-- Backfill existing open complaints so the queue is populated.
update public.vendor_feedback
    set complaint_status = 'open'
    where is_complaint = true and complaint_status is null;

create index vendor_feedback_complaint_status_idx on public.vendor_feedback (complaint_status, created_at desc)
    where is_complaint = true;

-- --- RLS: let quality staff (not just admin) work the complaint queue --------
-- The m-9 migration granted admin "for all" + staff SELECT. Broaden UPDATE to
-- vendor_manager/compliance so they can triage; the decide route also checks the
-- vendor_management/update permission cell (defense-in-depth).
create policy vendor_feedback_update_staff on public.vendor_feedback
    for update to authenticated
    using (private.current_app_role() in ('admin', 'vendor_manager', 'compliance'))
    with check (private.current_app_role() in ('admin', 'vendor_manager', 'compliance'));

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists vendor_feedback_update_staff on public.vendor_feedback;
-- drop index if exists public.vendor_feedback_complaint_status_idx;
-- alter table public.vendor_feedback
--     drop constraint if exists vendor_feedback_complaint_status_only_when_complaint;
-- alter table public.vendor_feedback
--     drop column if exists resolved_at,
--     drop column if exists resolved_by,
--     drop column if exists resolution,
--     drop column if exists complaint_status;
-- commit;
