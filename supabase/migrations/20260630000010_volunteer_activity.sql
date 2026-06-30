-- =============================================================================
-- ADDON #13 — volunteer area assignment + field-activity log
-- =============================================================================
-- Gives a volunteer a geographic zone (assigned_area) plus an approval audit
-- trail (approved_by/approved_at), and records each on-ground action they take in
-- an append-only volunteer_activity_log. Activity is keyed by the EXISTING enum
-- public.volunteer_activity_type (Wave 0, m20260630000001): 'token_distributed' |
-- 'registration_assisted'. The zone feature is gated at the app layer by
-- system_config volunteer_zones_enabled (soft-skip while off).
--
-- The new volunteers columns are STAFF-SET: the guard_volunteer_controlled_cols
-- trigger (m09) is extended so a volunteer editing their own profile can never set
-- their own zone or approval fields (same discipline as status/user_id).
--
-- RLS: staff read all activity; a volunteer reads only their own rows.
--
-- Apply AFTER m09 (volunteers + guard trigger), the volunteer_status_pending
-- widening, and the addon enums migration (volunteer_activity_type). Idempotent.
-- =============================================================================

begin;

-- --- 1. volunteer zone + approval audit columns ------------------------------
alter table public.volunteers
    add column if not exists assigned_area text,
    add column if not exists approved_by   uuid references public.users (id) on delete set null,
    add column if not exists approved_at   timestamptz;

comment on column public.volunteers.assigned_area is
    'Geographic zone a volunteer is assigned to (addon #13). Staff-set; gated by system_config volunteer_zones_enabled.';
comment on column public.volunteers.approved_by is
    'The staff user who approved this volunteer (addon #13). Staff-set.';

-- --- 2. extend the controlled-column guard to the new staff-set columns -------
-- A volunteer may edit their own profile (RLS volunteers_update_own) but must not
-- self-assign a zone or forge approval fields. Re-create the m09 guard with the
-- three new columns added to the staff-only set.
--
-- RECONCILIATION (vs m09): the allow-branch now ALSO passes when current_app_role()
-- IS NULL — i.e. the trusted service-role/system context that every admin route
-- uses (createAdminClient bypasses RLS but triggers still fire, and a service-role
-- JWT carries no sub, so current_app_role() is null). The admin status/zone/approval
-- mutations all flow through that path. An AUTHENTICATED volunteer still has
-- role='volunteer' (non-null) and remains blocked; anon cannot update volunteers at
-- all (no RLS policy). So this only trusts the backend, never widens user access.
create or replace function public.guard_volunteer_controlled_cols()
returns trigger
language plpgsql
as $$
begin
    if public.current_app_role() is null
       or public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status        is distinct from old.status
       or new.user_id       is distinct from old.user_id
       or new.assigned_area is distinct from old.assigned_area
       or new.approved_by   is distinct from old.approved_by
       or new.approved_at   is distinct from old.approved_at then
        raise exception 'only admin/vendor_manager may change volunteer status, user_id, zone or approval fields';
    end if;
    return new;
end;
$$;

-- --- 3. volunteer_activity_log -----------------------------------------------
create table if not exists public.volunteer_activity_log (
    id            uuid primary key default gen_random_uuid(),
    volunteer_id  uuid not null references public.volunteers (id) on delete cascade,
    activity_type public.volunteer_activity_type not null,
    ref_id        uuid,                              -- the token / registration this action concerns
    created_at    timestamptz not null default now()
);

comment on table public.volunteer_activity_log is
    'Append-only log of volunteer field actions (addon #13). activity_type is the Wave-0 volunteer_activity_type enum; ref_id points at the affected token / registration (no FK — polymorphic).';

create index if not exists volunteer_activity_log_volunteer_idx
    on public.volunteer_activity_log (volunteer_id, created_at desc);
create index if not exists volunteer_activity_log_type_idx
    on public.volunteer_activity_log (activity_type);

-- =============================================================================
-- RLS — staff read all; a volunteer reads only their own activity. Inserts come
-- from the service-role client (lib/services/volunteerActivity.ts), which
-- bypasses RLS; an explicit staff insert policy is kept for completeness.
-- =============================================================================
alter table public.volunteer_activity_log enable row level security;

create policy volunteer_activity_select_staff on public.volunteer_activity_log for select to authenticated
    using (public.current_app_role() in ('admin', 'vendor_manager', 'compliance'));

create policy volunteer_activity_select_own on public.volunteer_activity_log for select to authenticated
    using (exists (
        select 1 from public.volunteers v
        where v.id = volunteer_id and v.user_id = auth.uid()
    ));

create policy volunteer_activity_insert_staff on public.volunteer_activity_log for insert to authenticated
    with check (public.current_app_role() in ('admin', 'vendor_manager'));

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.volunteer_activity_log cascade;
-- -- restore the m09 guard (status + user_id only)
-- create or replace function public.guard_volunteer_controlled_cols()
-- returns trigger language plpgsql as $$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then
--         return new;
--     end if;
--     if new.status is distinct from old.status
--        or new.user_id is distinct from old.user_id then
--         raise exception 'only admin/vendor_manager may change volunteer status or user_id';
--     end if;
--     return new;
-- end;
-- $$;
-- alter table public.volunteers
--     drop column if exists approved_at,
--     drop column if exists approved_by,
--     drop column if exists assigned_area;
-- commit;
