-- =============================================================================
-- M05 — beneficiary management foundation (Developer 2)
-- =============================================================================
-- Net-new tables: beneficiaries, beneficiary_registrations. No collision with
-- Developer 1's 12 tables; references only public.users. No Section-A decision.
--
-- PRIVACY (F-5 / owner §4.6 / §5.2) — the most sensitive data in the system:
--   * Store ONLY non-reversible hashes, NEVER a raw photo or raw Aadhaar number.
--   * face_hash is the PRIMARY identity signal; aadhaar_hash is OPTIONAL and
--     therefore NULLABLE (Aadhaar is never mandatory).
--   * No permanent identity/profile storage beyond these hashes.
--
-- Enums (M01): beneficiary_category, eligibility_status, registration_status.
-- Depends on M01 (enums) and M02 (users, current_app_role, set_updated_at).
-- Apply order: M01 → M02 → M03 → M04 → M05.
-- =============================================================================

begin;

-- --- beneficiaries (approved/active records) ---------------------------------
create table public.beneficiaries (
    id                    uuid primary key default gen_random_uuid(),
    user_id               uuid references public.users (id) on delete set null, -- nullable: most beneficiaries are non-app users
    full_name             text,                  -- nullable; kept minimal for dignity/privacy
    category              public.beneficiary_category not null,
    eligibility_status    public.eligibility_status   not null default 'pending',
    -- PRIMARY identity: non-reversible enrolment hash (never a raw image). May be
    -- null when captured later at first redemption. Indexed for duplicate detection.
    face_hash             text,
    -- OPTIONAL only, NEVER mandatory (F-5): non-reversible hash, never the raw number.
    aadhaar_hash          text,
    -- Auto-expiry: pregnancy post-delivery window / patient treatment end (owner §2.2.1).
    eligibility_expires_at timestamptz,
    registered_by         uuid references public.users (id) on delete set null,
    -- Record state for suspension/blocking (owner §4.6). Text+CHECK for now —
    -- FLAG: propose adding a `beneficiary_status` enum to M01/types in a later slice.
    status                text not null default 'active'
        check (status in ('active', 'suspended', 'blocked')),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

comment on table  public.beneficiaries is 'Approved beneficiaries. Privacy-critical: only non-reversible hashes stored, never raw photo/Aadhaar.';
comment on column public.beneficiaries.face_hash is 'PRIMARY non-reversible identity hash. Never a raw image.';
comment on column public.beneficiaries.aadhaar_hash is 'OPTIONAL only (F-5). Non-reversible hash, never the raw Aadhaar number. Nullable by design.';

create index beneficiaries_face_hash_idx on public.beneficiaries (face_hash) where face_hash is not null;
create index beneficiaries_category_idx  on public.beneficiaries (category);
create index beneficiaries_user_idx      on public.beneficiaries (user_id) where user_id is not null;

create trigger beneficiaries_set_updated_at
    before update on public.beneficiaries
    for each row execute function public.set_updated_at();

-- --- beneficiary_registrations (the approval queue) --------------------------
create table public.beneficiary_registrations (
    id                  uuid primary key default gen_random_uuid(),
    full_name           text,
    category            public.beneficiary_category not null,
    -- Hashes only (same privacy rule). Both nullable at submission time.
    face_hash           text,
    aadhaar_hash        text,
    contact             text,
    location_hint       text,
    document_refs       text[] not null default '{}',  -- storage references (medical cert / antenatal card / hospital ref)
    registration_status public.registration_status not null default 'pending',
    submitted_by        uuid references public.users (id) on delete set null, -- volunteer (assist) or self; null for anon guest
    reviewed_by         uuid references public.users (id) on delete set null,
    review_notes        text,
    beneficiary_id      uuid references public.beneficiaries (id) on delete set null, -- set when approved
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table public.beneficiary_registrations is 'System-driven approval queue (owner §2.2.1). Approval is admin-only; volunteers may assist (create) but NOT approve.';

create index beneficiary_registrations_status_idx   on public.beneficiary_registrations (registration_status);
create index beneficiary_registrations_category_idx on public.beneficiary_registrations (category);
create index beneficiary_registrations_face_hash_idx on public.beneficiary_registrations (face_hash) where face_hash is not null;

create trigger beneficiary_registrations_set_updated_at
    before update on public.beneficiary_registrations
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS (spec §6 "Beneficiary Registration")
-- =============================================================================
alter table public.beneficiaries             enable row level security;
alter table public.beneficiary_registrations enable row level security;

-- --- beneficiaries: admin manages; compliance/vendor_manager read; own read --
-- (Volunteers have NO direct access to approved beneficiaries — their access is
--  registration-scoped only. Minimizes exposure of the most sensitive table.)
create policy beneficiaries_select_staff on public.beneficiaries for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy beneficiaries_select_own on public.beneficiaries for select to authenticated
    using (user_id = auth.uid());

create policy beneficiaries_insert_admin on public.beneficiaries for insert to authenticated
    with check (public.current_app_role() = 'admin');
create policy beneficiaries_update_admin on public.beneficiaries for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');
create policy beneficiaries_delete_admin on public.beneficiaries for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- beneficiary_registrations -----------------------------------------------
-- SELECT: admin/compliance/vendor_manager read all; a submitter reads only the
-- rows they submitted (covers a volunteer's assisted rows and a self-registrant).
create policy registrations_select_staff on public.beneficiary_registrations for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy registrations_select_own on public.beneficiary_registrations for select to authenticated
    using (submitted_by = auth.uid());

-- INSERT (authenticated): staff may create anything; everyone else (volunteer
-- assist, beneficiary self) may create only a clean PENDING row.
-- NOTE: guest self-registration does NOT use an anon RLS policy — it goes through
-- a server route using the service-role client (bypasses RLS), matching the
-- "no direct client DB writes" rule and avoiding a public write surface.
create policy registrations_insert_authenticated on public.beneficiary_registrations for insert to authenticated
    with check (
        public.current_app_role() in ('admin', 'vendor_manager')
        or (
            registration_status = 'pending'
            and reviewed_by is null
            and beneficiary_id is null
        )
    );

-- UPDATE / DELETE (review, approve, reject): ADMIN ONLY. Volunteers and
-- vendor_managers cannot approve eligibility (matrix + owner §2.2.1).
create policy registrations_update_admin on public.beneficiary_registrations for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');
create policy registrations_delete_admin on public.beneficiary_registrations for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.beneficiary_registrations cascade;
-- drop table if exists public.beneficiaries             cascade;
-- commit;
