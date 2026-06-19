-- =============================================================================
-- M02 — users table + auth/authorization foundation (Developer 2)
-- =============================================================================
-- Net-new. Developer 1 has NO users table, so this needs no Section-A decision
-- and touches none of their 12 tables.
--
-- Creates:
--   * public.users           — app profile keyed to auth.users(id) (uuid)
--   * public.current_app_role() — RLS helper, returns the caller's role
--   * RLS                     — a user reads only their own row; admin writes all
--   * public.handle_new_user() + trigger — auto-creates a users row on signup
--   * public.set_updated_at() + trigger — maintains updated_at
--
-- Depends on M01 (user_role enum). Apply M01 first.
-- Note: the trigger on auth.users must be created with sufficient privileges
-- (run in the Supabase SQL editor as the postgres role, or via service role).
-- =============================================================================

begin;

-- --- table -------------------------------------------------------------------
create table public.users (
    id          uuid primary key references auth.users (id) on delete cascade,
    role        public.user_role not null default 'donor',
    -- Optional soft link to Developer 1's text-keyed donors.id. Intentionally
    -- NOT a foreign key: cross-table coupling to Dev-1 is a Section-A decision.
    donor_id    text,
    email       text,
    full_name   text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

comment on table  public.users is 'Developer-2 app users; 1:1 with auth.users. Role drives RBAC/RLS.';
comment on column public.users.donor_id is 'Optional soft link to Dev-1 donors.id (text). No FK (Section A).';

create index users_role_idx on public.users (role);
create index users_donor_id_idx on public.users (donor_id) where donor_id is not null;

-- --- role helper (SECURITY DEFINER bypasses RLS → no recursion in policies) ---
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.users where id = auth.uid();
$$;

comment on function public.current_app_role() is 'Returns the calling user''s role for use in RLS. SECURITY DEFINER to avoid policy recursion on public.users.';

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated, service_role;

-- --- RLS ---------------------------------------------------------------------
alter table public.users enable row level security;

-- A user can read only their own row.
create policy users_select_own
    on public.users for select
    using (id = auth.uid());

-- Admins can read every row.
create policy users_select_admin
    on public.users for select
    using (public.current_app_role() = 'admin');

-- Only admins may write (insert/update/delete). Signups are handled by the
-- SECURITY DEFINER trigger below, which bypasses RLS.
create policy users_insert_admin
    on public.users for insert
    with check (public.current_app_role() = 'admin');

create policy users_update_admin
    on public.users for update
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

create policy users_delete_admin
    on public.users for delete
    using (public.current_app_role() = 'admin');

-- --- updated_at maintenance --------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger users_set_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();

-- --- auto-provision a users row on Supabase Auth signup ----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id, email, role)
    values (new.id, new.email, 'donor') -- self-signups default to donor; admins provisioned manually
    on conflict (id) do nothing;
    return new;
end;
$$;

comment on function public.handle_new_user() is 'Auto-creates a public.users row when a new auth.users row is inserted.';

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

commit;

-- =============================================================================
-- DOWN (rollback) — run this BEFORE M01 DOWN.
-- =============================================================================
-- begin;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_user();
-- drop trigger if exists users_set_updated_at on public.users;
-- drop function if exists public.set_updated_at();
-- drop policy if exists users_delete_admin on public.users;
-- drop policy if exists users_update_admin on public.users;
-- drop policy if exists users_insert_admin on public.users;
-- drop policy if exists users_select_admin on public.users;
-- drop policy if exists users_select_own on public.users;
-- drop function if exists public.current_app_role();
-- drop table if exists public.users;
-- commit;
