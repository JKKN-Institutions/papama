-- =============================================================================
-- ADDON #9 — vendor rating, feedback & surprise inspections
-- =============================================================================
-- Adds the staff-trust quality signals on the vendor record (rating_avg,
-- feedback_count, complaint_count, quality_score), a beneficiary feedback log,
-- and a surprise-inspection log. The rating/quality columns are STAFF-ONLY:
-- vendors must not be able to rate themselves, so this migration EXTENDS the
-- existing guard_vendor_controlled_cols() trigger (defined in m04) to block a
-- non-staff vendor from moving any of the four new columns through
-- vendors_update_own.
--
-- Auto-suspend is OFF by default (vendor_auto_suspend_enabled = 'false') and its
-- thresholds (vendor_min_feedback_count / vendor_min_rating /
-- vendor_max_complaint_rate) are read at runtime via lib/system-config; an unset
-- threshold SOFT-skips the rule (no invented value) — see
-- lib/services/vendorRating.ts.
--
-- Depends on M04 (vendors + guard trigger), M05 (beneficiaries), M02 (users),
-- M17 (token_redemptions). Apply AFTER 20260630000003.
-- snake_case · RLS on every new table · reversible DOWN at the bottom.
-- =============================================================================

begin;

-- --- vendors quality columns (STAFF-ONLY) -----------------------------------
alter table public.vendors
    add column if not exists rating_avg      numeric(3, 2),
    add column if not exists feedback_count  integer not null default 0,
    add column if not exists complaint_count integer not null default 0,
    add column if not exists quality_score   numeric(5, 2);

alter table public.vendors
    add constraint vendors_feedback_count_nonneg  check (feedback_count >= 0),
    add constraint vendors_complaint_count_nonneg check (complaint_count >= 0),
    add constraint vendors_rating_avg_range
        check (rating_avg is null or (rating_avg >= 0 and rating_avg <= 5));

comment on column public.vendors.rating_avg is
    'Mean beneficiary rating (1..5), recomputed on each feedback. Staff-controlled; vendors cannot self-rate.';
comment on column public.vendors.feedback_count is 'Total feedback rows recorded for this vendor.';
comment on column public.vendors.complaint_count is 'Subset of feedback flagged as a complaint.';
comment on column public.vendors.quality_score is
    'Derived 0..100 quality index (rating + complaint-rate penalty). Staff-controlled.';

-- --- EXTEND guard_vendor_controlled_cols() to cover the new trust columns ----
-- Mirrors the m04 definition and ADDS rating_avg / feedback_count /
-- complaint_count / quality_score to the guarded set. Admin & vendor_manager
-- bypass; any other role attempting to change a guarded column is rejected.
create or replace function public.guard_vendor_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status          is distinct from old.status
       or new.kyc_status      is distinct from old.kyc_status
       or new.hygiene_rating  is distinct from old.hygiene_rating
       or new.owner_id        is distinct from old.owner_id
       or new.rating_avg      is distinct from old.rating_avg
       or new.feedback_count  is distinct from old.feedback_count
       or new.complaint_count is distinct from old.complaint_count
       or new.quality_score   is distinct from old.quality_score then
        raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, owner, rating_avg, feedback_count, complaint_count, or quality_score';
    end if;
    return new;
end;
$$;

-- --- vendor_feedback ---------------------------------------------------------
create table if not exists public.vendor_feedback (
    id             uuid primary key default gen_random_uuid(),
    vendor_id      uuid not null references public.vendors (id) on delete cascade,
    redemption_id  uuid references public.token_redemptions (id) on delete set null,
    beneficiary_id uuid references public.beneficiaries (id) on delete set null,
    rating         smallint not null check (rating between 1 and 5),
    comment        text,
    is_complaint   boolean not null default false,
    created_at     timestamptz not null default now()
);

comment on table public.vendor_feedback is
    'Beneficiary feedback on a vendor (1..5 rating + optional comment/complaint). Aggregated into vendors.rating_avg / quality_score by lib/services/vendorRating.ts.';

create index vendor_feedback_vendor_created_idx on public.vendor_feedback (vendor_id, created_at desc);

-- --- surprise_inspections ----------------------------------------------------
create table if not exists public.surprise_inspections (
    id               uuid primary key default gen_random_uuid(),
    vendor_id        uuid not null references public.vendors (id) on delete cascade,
    inspector_user_id uuid references public.users (id) on delete set null,
    inspection_date  date not null default current_date,
    hygiene_score    smallint check (hygiene_score between 1 and 5),
    passed           boolean,
    notes            text,
    created_at       timestamptz not null default now()
);

comment on table public.surprise_inspections is
    'Staff-recorded surprise hygiene/quality inspections of a vendor outlet (addon #9).';

create index surprise_inspections_vendor_idx on public.surprise_inspections (vendor_id, inspection_date desc);

-- =============================================================================
-- RLS
--   vendor_feedback     — staff read all; a beneficiary creates feedback tied to
--                         their OWN beneficiary row; admin full. (The public
--                         feedback route uses the service-role client, like
--                         /api/beneficiary/register, so anonymous submissions are
--                         server-mediated; these policies cover authenticated /
--                         direct access + defense-in-depth.)
--   surprise_inspections — admin/compliance/vendor_manager only (staff control).
-- =============================================================================
alter table public.vendor_feedback       enable row level security;
alter table public.surprise_inspections  enable row level security;

-- --- vendor_feedback ---------------------------------------------------------
create policy vendor_feedback_select_staff on public.vendor_feedback
    for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy vendor_feedback_insert_own_beneficiary on public.vendor_feedback
    for insert to authenticated
    with check (
        beneficiary_id is not null
        and exists (select 1 from public.beneficiaries b where b.id = beneficiary_id and b.user_id = auth.uid())
    );

create policy vendor_feedback_write_admin on public.vendor_feedback
    for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- surprise_inspections ----------------------------------------------------
create policy surprise_inspections_select_staff on public.surprise_inspections
    for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy surprise_inspections_insert_staff on public.surprise_inspections
    for insert to authenticated
    with check (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy surprise_inspections_update_staff on public.surprise_inspections
    for update to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

create policy surprise_inspections_delete_admin on public.surprise_inspections
    for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.surprise_inspections cascade;
-- drop table if exists public.vendor_feedback      cascade;
-- -- restore the m04 guard_vendor_controlled_cols() (without the #9 columns):
-- create or replace function public.guard_vendor_controlled_cols()
-- returns trigger language plpgsql as $$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then
--         return new;
--     end if;
--     if new.status is distinct from old.status
--        or new.kyc_status is distinct from old.kyc_status
--        or new.hygiene_rating is distinct from old.hygiene_rating
--        or new.owner_id is distinct from old.owner_id then
--         raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, or owner';
--     end if;
--     return new;
-- end;
-- $$;
-- alter table public.vendors drop constraint if exists vendors_rating_avg_range;
-- alter table public.vendors drop constraint if exists vendors_complaint_count_nonneg;
-- alter table public.vendors drop constraint if exists vendors_feedback_count_nonneg;
-- alter table public.vendors
--     drop column if exists rating_avg,
--     drop column if exists feedback_count,
--     drop column if exists complaint_count,
--     drop column if exists quality_score;
-- commit;
