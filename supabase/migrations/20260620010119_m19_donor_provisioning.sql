-- =============================================================================
-- M19 — auto-provision donor profile on signup (Phase 3: real donor auth)
-- =============================================================================
-- Extends M02's handle_new_user() so that when a new auth user is created (which
-- defaults to role 'donor'), a matching public.donors row + donor_credits ledger
-- are created atomically. This replaces the donor module's hardcoded 'donor_001'
-- identity with a real per-user donor row keyed to auth.users.
--
-- Also keeps users.donor_id (the M02 soft-link) pointing at the new donors.id,
-- and backfills donors/donor_credits for any donor-role users that predate this.
--
-- Depends on M02 (users, handle_new_user), M15 (donors, donor_credits).
-- Apply order: … → M18 → M19.
-- =============================================================================

begin;

-- --- replace handle_new_user to also provision a donor profile ----------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_donor_id uuid;
begin
    -- 1. app profile (unchanged: self-signups default to donor)
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

comment on function public.handle_new_user() is 'Auto-provisions users + donors + donor_credits on auth signup (M19). Donor identity is now per-user, not the legacy donor_001.';

-- --- backfill existing donor-role users without a donors row ------------------
do $$
declare
    u record;
    d_id uuid;
begin
    for u in
        select usr.id, usr.email
        from public.users usr
        left join public.donors don on don.user_id = usr.id
        where usr.role = 'donor' and don.id is null
    loop
        insert into public.donors (user_id, email)
        values (u.id, u.email)
        returning id into d_id;

        insert into public.donor_credits (donor_id, balance_inr)
        values (d_id, 0)
        on conflict (donor_id) do nothing;

        update public.users set donor_id = d_id::text where id = u.id;
    end loop;
end;
$$;

commit;

-- =============================================================================
-- DOWN (rollback) — restores the M02 version of handle_new_user.
-- =============================================================================
-- begin;
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--     insert into public.users (id, email, role)
--     values (new.id, new.email, 'donor') on conflict (id) do nothing;
--     return new;
-- end; $$;
-- commit;
