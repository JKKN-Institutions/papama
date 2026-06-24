-- =============================================================================
-- M21 (BACKFILL) — donor auto-provisioning trigger on auth.users
-- =============================================================================
-- Live ledger entry:  version 20260623051707, name m19_donor_provisioning
--   (NOTE: the live ledger name is "m19_donor_provisioning" but its version
--    timestamp 20260623051707 places it AFTER m20_revoke_anon_execute
--    (20260623043537), so it is logically m21 in the ordering sequence.)
-- Repo status:        The repo file supabase/migrations/20260620010119_m19_donor_provisioning.sql
--                     EXISTS and covers the function body (handle_new_user replacement).
--                     HOWEVER, it does NOT create the auth trigger that fires on
--                     auth.users INSERT — that trigger was applied separately, likely
--                     via the Supabase dashboard or an out-of-band SQL session, and
--                     has no source in the migration ledger's repo-tracked file.
--
-- Root cause:  The trigger on auth.users must be created by a superuser; the Supabase
-- hosted environment wires this via the Dashboard's "Auth > Hooks" UI or via a
-- privileged migration. The repo's m19 file replaces the function body but does not
-- emit the CREATE TRIGGER statement, leaving a gap for `supabase db reset`.
--
-- What this migration does:
--   1. Replaces handle_new_user() with the Phase-3 donor-provisioning version
--      (idempotent: CREATE OR REPLACE).
--   2. Creates (or re-creates) the after-insert trigger on auth.users that calls it.
--      Note: in Supabase, triggers on auth.users require service-role / superuser
--      execution; in `supabase db reset` the postgres role has this privilege.
--
-- Verified live (2026-06-24 inspection):
--   handle_new_user() body confirmed to include donors + donor_credits insert logic.
--   The auth.users → handle_new_user trigger is present (signup creates donor rows).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--
-- Depends on: M02 (users table, original handle_new_user), M15 (donors, donor_credits),
--             M19_repo (handle_new_user function body — this file supersedes it for
--             trigger wiring purposes).
-- Apply order: ... → M20 → M21 → M22.
-- =============================================================================

begin;

-- --- 1. Ensure the donor-provisioning version of handle_new_user is in place ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_donor_id uuid;
begin
    -- 1. app profile (self-signups default to donor)
    insert into public.users (id, email, role)
    values (new.id, new.email, 'donor')
    on conflict (id) do nothing;

    -- 2. donor profile + credit ledger, linked to this auth user
    insert into public.donors (user_id, email, name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
    on conflict (user_id) do nothing
    returning id into new_donor_id;

    if new_donor_id is not null then
        insert into public.donor_credits (donor_id, balance_inr)
        values (new_donor_id, 0)
        on conflict (donor_id) do nothing;

        -- keep the M02 soft-link in sync
        update public.users set donor_id = new_donor_id::text where id = new.id;
    end if;

    return new;
end;
$$;

-- --- 2. Wire the trigger on auth.users (requires superuser / postgres role) ------
-- Drop first to make this re-runnable (idempotent).
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- --- 3. Backfill: provision donor rows for any donor-role users that pre-date this ---
-- Safe: on conflict do nothing guards against duplicates.
do $$
declare
    u record;
    new_donor_id uuid;
begin
    for u in
        select u.id, u.email
        from public.users u
        where u.role = 'donor'
          and not exists (select 1 from public.donors d where d.user_id = u.id)
    loop
        insert into public.donors (user_id, email)
        values (u.id, u.email)
        on conflict (user_id) do nothing
        returning id into new_donor_id;

        if new_donor_id is not null then
            insert into public.donor_credits (donor_id, balance_inr)
            values (new_donor_id, 0)
            on conflict (donor_id) do nothing;

            update public.users set donor_id = new_donor_id::text where id = u.id;
        end if;
    end loop;
end;
$$;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop trigger if exists on_auth_user_created on auth.users;
-- -- Restore the M02 original handle_new_user (no donor provisioning):
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path = public
-- as $$
-- begin
--     insert into public.users (id, email, role)
--     values (new.id, new.email, 'donor')
--     on conflict (id) do nothing;
--     return new;
-- end;
-- $$;
-- commit;
