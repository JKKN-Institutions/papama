-- =============================================================================
-- M13 — ngo_partners (Developer 2)   [Group A: zero Dev-1 references]
-- =============================================================================
-- Net-new. Registry of partner NGOs / organisations pApAmA works with (Phase-1
-- table list, spec §5). The last buildable-now Group-A table — closes the
-- Group-A schema set. No collision with Developer 1's 12 tables; references only
-- public.users. No Section-A decision.
--
-- Sensitivity: holds partner contact PII but no beneficiary/financial data, so
-- it is admin-managed with compliance read-only oversight (matrix §6 "Audit &
-- Reports" altitude: admin CRUD, compliance R).
--
-- status uses text + CHECK for now (no ngo_status enum in the types layer yet) —
-- FLAG: propose an `ngo_status` enum in a later slice, the same way M05->M06
-- promoted beneficiaries.status and as flagged for volunteers.status.
--
-- Depends on M02 (users, current_app_role, set_updated_at). Apply: … M12 -> M13.
-- =============================================================================

begin;

-- --- table -------------------------------------------------------------------
create table public.ngo_partners (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    registration_number text,                                -- NGO registration / 12A / 80G / FCRA ref
    focus_area          text,                                -- what the partner does (e.g. maternal health, disaster relief)
    contact_person      text,
    contact_email       text,
    contact_phone       text,
    address             text,
    city                text,
    contact_user_id     uuid references public.users (id) on delete set null, -- optional app login link
    status              text not null default 'active'
        check (status in ('active', 'inactive', 'suspended')),
    notes               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table  public.ngo_partners is 'Registry of partner NGOs/organisations (spec §5). Admin-managed reference data; compliance read-only.';
comment on column public.ngo_partners.contact_user_id is 'Optional link to a users row if the partner has an app login. Nullable; no role assumption.';

create index ngo_partners_status_idx     on public.ngo_partners (status);
create index ngo_partners_contact_user_idx on public.ngo_partners (contact_user_id) where contact_user_id is not null;

create trigger ngo_partners_set_updated_at
    before update on public.ngo_partners
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — admin manages; compliance reads (matrix §6 admin CRUD / compliance R).
-- =============================================================================
alter table public.ngo_partners enable row level security;

create policy ngo_partners_select_staff on public.ngo_partners for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy ngo_partners_insert_admin on public.ngo_partners for insert to authenticated
    with check (public.current_app_role() = 'admin');

create policy ngo_partners_update_admin on public.ngo_partners for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

create policy ngo_partners_delete_admin on public.ngo_partners for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.ngo_partners cascade;
-- commit;
