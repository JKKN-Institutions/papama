-- =============================================================================
-- M04 — vendor management foundation (Developer 2)  [plan's vendor vertical]
-- =============================================================================
-- Net-new tables: vendors, vendor_documents, vendor_menus. No collision with
-- Developer 1's 12 tables; references only public.users. No Section-A decision.
--
-- Enums used (from M01): vendor_status, kyc_status, registration_status.
-- RLS follows spec §6 (Vendor Management + Vendor Menu & Pricing rows).
-- Depends on M01 (enums) and M02 (users, current_app_role, set_updated_at).
-- Apply order: M01 → M02 → M03 → M04.
--
-- Geo note: stored as two numeric columns (geo_lat, geo_lng) for bounding-box
-- geofence queries + index. The GET /api/admin/vendors route composes the
-- contract's `geo: { lat, lng }` jsonb object from these two columns.
-- =============================================================================

begin;

-- --- vendors -----------------------------------------------------------------
create table public.vendors (
    id                   uuid primary key default gen_random_uuid(),
    owner_id             uuid references public.users (id) on delete set null, -- the vendor's login user
    name                 text not null,           -- display name
    legal_name           text,
    address              text,
    city                 text,
    pincode              text,
    phone                text,
    email                text,
    emergency_contact    text,                    -- client Q14
    fssai_license        text,                    -- client Q14
    gst_number           text,                    -- client Q14
    bank_account_name    text,
    bank_account_number  text,
    bank_ifsc            text,
    geo_lat              numeric(9, 6),           -- client Q14 (geo-location)
    geo_lng              numeric(9, 6),           -- client Q14
    hygiene_rating       smallint check (hygiene_rating between 1 and 5),
    status               public.vendor_status not null default 'pending',
    kyc_status           public.kyc_status    not null default 'pending',
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table  public.vendors is 'Approved food outlets. Onboarded/approved by admin or vendor_manager; a vendor manages only their own profile.';
comment on column public.vendors.owner_id is 'Soft owner: the users row whose role is vendor. Nullable until the login is linked.';

create index vendors_geo_idx    on public.vendors (geo_lat, geo_lng);
create index vendors_status_idx on public.vendors (status);
create index vendors_owner_idx  on public.vendors (owner_id) where owner_id is not null;

create trigger vendors_set_updated_at
    before update on public.vendors
    for each row execute function public.set_updated_at();

-- --- vendor_documents --------------------------------------------------------
create table public.vendor_documents (
    id                  uuid primary key default gen_random_uuid(),
    vendor_id           uuid not null references public.vendors (id) on delete cascade,
    doc_type            text not null,           -- e.g. kyc | fssai | gst | shop_photo | bank_proof
    url                 text not null,           -- storage reference
    verification_status public.kyc_status not null default 'pending',
    notes               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index vendor_documents_vendor_idx on public.vendor_documents (vendor_id);

create trigger vendor_documents_set_updated_at
    before update on public.vendor_documents
    for each row execute function public.set_updated_at();

-- --- vendor_menus ------------------------------------------------------------
create table public.vendor_menus (
    id                               uuid primary key default gen_random_uuid(),
    vendor_id                        uuid not null references public.vendors (id) on delete cascade,
    item_name                        text not null,
    price                            numeric(10, 2) not null check (price >= 0),
    nutrition_category               text,                       -- for Special Care menu restriction
    is_special_care_equivalent       boolean not null default false, -- vendor proposes an equivalent nutritious item (Q9)
    special_care_equivalent_approved boolean not null default false, -- admin/vendor_manager approval (Q9)
    approval_status                  public.registration_status not null default 'pending',
    created_at                       timestamptz not null default now(),
    updated_at                       timestamptz not null default now()
);

create index vendor_menus_vendor_idx on public.vendor_menus (vendor_id);

create trigger vendor_menus_set_updated_at
    before update on public.vendor_menus
    for each row execute function public.set_updated_at();

-- --- controlled-column guards (prevent self-approval / self-escalation) ------
-- RLS grants a vendor row-level write to their OWN rows, but a vendor must not
-- be able to approve themselves or their menu. These BEFORE UPDATE triggers
-- block non-staff from changing the controlled columns.

create or replace function public.guard_vendor_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status        is distinct from old.status
       or new.kyc_status is distinct from old.kyc_status
       or new.hygiene_rating is distinct from old.hygiene_rating
       or new.owner_id   is distinct from old.owner_id then
        raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, or owner';
    end if;
    return new;
end;
$$;

create trigger vendors_guard_controlled_cols
    before update on public.vendors
    for each row execute function public.guard_vendor_controlled_cols();

create or replace function public.guard_menu_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.approval_status is distinct from old.approval_status
       or new.special_care_equivalent_approved is distinct from old.special_care_equivalent_approved then
        raise exception 'only admin/vendor_manager may change menu approval_status or special-care approval';
    end if;
    return new;
end;
$$;

create trigger vendor_menus_guard_controlled_cols
    before update on public.vendor_menus
    for each row execute function public.guard_menu_controlled_cols();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.vendors          enable row level security;
alter table public.vendor_documents enable row level security;
alter table public.vendor_menus     enable row level security;

-- --- vendors (spec §6 "Vendor Management") -----------------------------------
-- SELECT: admin/vendor_manager/compliance/volunteer read all; a vendor reads own.
create policy vendors_select_staff on public.vendors for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance', 'volunteer'));
create policy vendors_select_own on public.vendors for select to authenticated
    using (owner_id = auth.uid());

-- INSERT: only admin/vendor_manager onboard a vendor (vendor cell is "Own profile" R/U, not create).
create policy vendors_insert_staff on public.vendors for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));

-- UPDATE: staff update any; a vendor updates own (controlled cols blocked by trigger).
create policy vendors_update_staff on public.vendors for update to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendors_update_own on public.vendors for update to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

-- DELETE: admin only (vendor_manager has CRU, no D).
create policy vendors_delete_admin on public.vendors for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- vendor_documents (KYC-sensitive: no volunteer read) ---------------------
create policy vendor_documents_select_staff on public.vendor_documents for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy vendor_documents_select_own on public.vendor_documents for select to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

create policy vendor_documents_insert_staff on public.vendor_documents for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_documents_insert_own on public.vendor_documents for insert to authenticated
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

-- UPDATE (verification_status etc.): staff only — a vendor cannot self-verify.
create policy vendor_documents_update_staff on public.vendor_documents for update to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'vendor_manager'));

create policy vendor_documents_delete_staff on public.vendor_documents for delete to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'));

-- --- vendor_menus (spec §6 "Vendor Menu & Pricing") --------------------------
-- SELECT: admin/vendor_manager/compliance read all; vendor reads own. (No volunteer.)
create policy vendor_menus_select_staff on public.vendor_menus for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy vendor_menus_select_own on public.vendor_menus for select to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

-- INSERT: vendor proposes own; staff may create any.
create policy vendor_menus_insert_staff on public.vendor_menus for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_menus_insert_own on public.vendor_menus for insert to authenticated
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

-- UPDATE: staff approve/any; vendor edits own proposal (approval cols blocked by trigger).
create policy vendor_menus_update_staff on public.vendor_menus for update to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_menus_update_own on public.vendor_menus for update to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()))
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

-- DELETE: staff any; vendor withdraws own proposal.
create policy vendor_menus_delete_staff on public.vendor_menus for delete to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vendor_menus_delete_own on public.vendor_menus for delete to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.vendor_menus     cascade;
-- drop table if exists public.vendor_documents cascade;
-- drop table if exists public.vendors          cascade;
-- drop function if exists public.guard_menu_controlled_cols();
-- drop function if exists public.guard_vendor_controlled_cols();
-- commit;
