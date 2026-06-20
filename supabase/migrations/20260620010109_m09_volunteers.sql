-- =============================================================================
-- M09 — volunteers registry + volunteer_token_requests queue (Developer 2)
--       [Group A: zero Dev-1 references]
-- =============================================================================
-- Net-new tables for the Path-B distribution flow (docs/token-flow.md §3–§4):
--   * volunteers               — registry of users who may hold/distribute tokens
--   * volunteer_token_requests — the §3b "volunteer requests N tokens" queue the
--                                admin acts on (grant/partial/deny)
--
-- Boundary (Section A): references ONLY public.users and public.volunteers.
--   * NO foreign key to any token row. A request is purely "volunteer wants N
--     tokens"; the actual allocation/grant that writes token_distribution_records
--     (a Dev-1 prototype table) is DEFERRED Section-A service work, not modelled here.
--   * The concurrent-holding limit (max_tokens_per_volunteer) lives in
--     system_config (admin-editable, currently NULL = unset) and is enforced by
--     the allocation service at grant time — it is intentionally NOT a column here.
--
-- Enums (M01): volunteer_request_status (pending|granted|partially_granted|denied).
-- volunteers.status uses text + CHECK for now (no volunteer_status enum in the
-- types layer yet) — FLAG: propose a `volunteer_status` enum in a later slice,
-- the same way M05->M06 promoted beneficiaries.status.
--
-- Depends on M01 (enums) and M02 (users, current_app_role, set_updated_at).
-- Apply order: … M08 -> M09.
-- =============================================================================

begin;

-- --- volunteers --------------------------------------------------------------
create table public.volunteers (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null unique references public.users (id) on delete cascade, -- the volunteer's login (one volunteer per user)
    full_name   text,
    phone       text,
    email       text,
    -- Record state. text+CHECK until a volunteer_status enum is added to the types layer.
    status      text not null default 'active'
        check (status in ('active', 'inactive', 'suspended')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table  public.volunteers is 'Registry of volunteers (Path-B distribution, token-flow §3–§4). Holds/distributes tokens; concurrent limit is enforced from system_config, not stored here.';
comment on column public.volunteers.user_id is 'The users row (role volunteer) this registry entry belongs to. Unique: one volunteer per login.';

create index volunteers_status_idx on public.volunteers (status);

create trigger volunteers_set_updated_at
    before update on public.volunteers
    for each row execute function public.set_updated_at();

-- --- volunteer_token_requests ------------------------------------------------
create table public.volunteer_token_requests (
    id              uuid primary key default gen_random_uuid(),
    volunteer_id    uuid not null references public.volunteers (id) on delete cascade,
    requested_count integer not null check (requested_count > 0),
    status          public.volunteer_request_status not null default 'pending',
    decided_by      uuid references public.users (id) on delete set null, -- admin who decided; null while pending
    decided_count   integer check (decided_count is null or decided_count >= 0),
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- a partial/full grant can never exceed what was requested
    constraint volunteer_token_requests_decided_lte_requested
        check (decided_count is null or decided_count <= requested_count)
);

comment on table  public.volunteer_token_requests is 'Queue of volunteer token requests (token-flow §3b). "Volunteer wants N tokens"; resolved at grant time. NO token FK — grant writes token_distribution_records via deferred Section-A service.';
comment on column public.volunteer_token_requests.decided_count is 'Tokens actually granted (<= requested_count). NULL while pending/denied-without-count.';

create index volunteer_token_requests_volunteer_idx on public.volunteer_token_requests (volunteer_id);
create index volunteer_token_requests_status_idx    on public.volunteer_token_requests (status);
create index volunteer_token_requests_decided_by_idx on public.volunteer_token_requests (decided_by) where decided_by is not null;

create trigger volunteer_token_requests_set_updated_at
    before update on public.volunteer_token_requests
    for each row execute function public.set_updated_at();

-- --- controlled-column guard on volunteers -----------------------------------
-- RLS lets a volunteer update their OWN profile row, but they must not flip their
-- own status or re-point user_id. Non-staff updates to controlled cols are blocked.
create or replace function public.guard_volunteer_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status  is distinct from old.status
       or new.user_id is distinct from old.user_id then
        raise exception 'only admin/vendor_manager may change volunteer status or user_id';
    end if;
    return new;
end;
$$;

create trigger volunteers_guard_controlled_cols
    before update on public.volunteers
    for each row execute function public.guard_volunteer_controlled_cols();

-- =============================================================================
-- RLS (token-flow §6: volunteers receive/hold/distribute + assist registration;
-- they may NOT approve eligibility, change rules, or release payments.)
-- =============================================================================
alter table public.volunteers              enable row level security;
alter table public.volunteer_token_requests enable row level security;

-- --- volunteers --------------------------------------------------------------
-- SELECT: staff read all; a volunteer reads only their own registry row.
create policy volunteers_select_staff on public.volunteers for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy volunteers_select_own on public.volunteers for select to authenticated
    using (user_id = auth.uid());

-- INSERT: only admin/vendor_manager provision a volunteer (a user is upgraded, not self-enrolled).
create policy volunteers_insert_staff on public.volunteers for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));

-- UPDATE: staff manage any; a volunteer edits own profile (status/user_id blocked by trigger).
create policy volunteers_update_staff on public.volunteers for update to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager'))
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy volunteers_update_own on public.volunteers for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- DELETE: admin only.
create policy volunteers_delete_admin on public.volunteers for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- volunteer_token_requests ------------------------------------------------
-- SELECT: staff read all; a volunteer reads only their own requests.
create policy vtr_select_staff on public.volunteer_token_requests for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));
create policy vtr_select_own on public.volunteer_token_requests for select to authenticated
    using (exists (
        select 1 from public.volunteers v
        where v.id = volunteer_id and v.user_id = auth.uid()
    ));

-- INSERT: staff may create any; a volunteer may create only a CLEAN PENDING
-- request for their OWN registry row (cannot pre-decide or grant themselves).
create policy vtr_insert_staff on public.volunteer_token_requests for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));
create policy vtr_insert_own on public.volunteer_token_requests for insert to authenticated
    with check (
        status = 'pending'
        and decided_by is null
        and decided_count is null
        and exists (
            select 1 from public.volunteers v
            where v.id = volunteer_id and v.user_id = auth.uid()
        )
    );

-- UPDATE (the decision: grant / partial / deny): ADMIN ONLY (token-flow §3b/§6).
-- Volunteers cannot edit a request once submitted; vendor_managers do not decide.
create policy vtr_update_admin on public.volunteer_token_requests for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- DELETE: admin only.
create policy vtr_delete_admin on public.volunteer_token_requests for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.volunteer_token_requests cascade;
-- drop table if exists public.volunteers               cascade;
-- drop function if exists public.guard_volunteer_controlled_cols();
-- commit;
