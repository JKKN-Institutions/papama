-- =============================================================================
-- ADDON #11 — NGO / institution beneficiary module
-- =============================================================================
-- Links beneficiaries to a partner institution (ngo_partners) and lets an admin
-- bulk-allocate pooled tokens "toward" an institution so the institution can hand
-- them to its own beneficiaries.
--
-- Three pieces:
--   1. beneficiaries.institution_id  — optional partner an approved beneficiary
--      belongs to (admin-write table already; no RLS change needed).
--   2. institution_token_allocations — the bulk-allocation ledger (admin write,
--      admin+compliance read).
--   3. allocate_pooled_tokens_to_institution() — the atomic draw, modelled on
--      allocate_pooled_tokens (20260625000004): cap-check, pull N oldest pooled
--      tokens, flip them to 'distributed', log one distribution record each, AND
--      write the institution_token_allocations summary row — all in ONE locked
--      transaction. The service layer only writes audit_logs afterward.
--
-- RECONCILIATION NOTES:
--   * Token target state: institution-allocated tokens leave `in_admin_pool` and
--     become `distributed` (a redeemable state — REDEEMABLE_STATUSES in
--     lib/services/redemption.ts is {live, distributed}). The institution then
--     hands them to its beneficiaries who redeem at vendors. We do NOT invent a
--     new token_status enum value. The volunteer pool-pull (FOR UPDATE SKIP
--     LOCKED on in_admin_pool) and this one never double-claim the same token.
--   * distribution_channel has no 'institution' value and we deliberately do NOT
--     add one (an ALTER TYPE ADD VALUE can't share this txn). The per-token
--     token_distribution_records row is written with channel = NULL (the column
--     is nullable) + an explanatory note; the institution linkage of record is
--     the institution_token_allocations row. A NULL-channel record on a
--     `distributed` token never enters the volunteer holdings derivation (which
--     only inspects assigned_to_volunteer tokens on GRANT_CHANNELS).
--   * cap = system_config.institution_bulk_allocation_max (seeded NULL in
--     20260630000002). NULL/unset => no cap (soft-skip), never invent a default.
--
-- Depends on M05 (beneficiaries), M13 (ngo_partners), M16 (tokens,
-- token_distribution_records), M03 (system_config), M02 (users, set_updated_at).
-- Apply order: … → 20260630000002 → 20260630000007.
-- =============================================================================

begin;

-- --- 1. beneficiaries.institution_id -----------------------------------------
alter table public.beneficiaries
    add column if not exists institution_id uuid
        references public.ngo_partners (id) on delete set null;

comment on column public.beneficiaries.institution_id is
    'Optional partner institution (ngo_partners) this beneficiary belongs to (addon #11). Powers per-institution redemption reporting.';

create index if not exists beneficiaries_institution_idx
    on public.beneficiaries (institution_id) where institution_id is not null;

-- --- 2. institution_token_allocations (bulk-allocation ledger) ----------------
create table public.institution_token_allocations (
    id             uuid primary key default gen_random_uuid(),
    ngo_partner_id uuid not null references public.ngo_partners (id) on delete cascade,
    token_count    integer not null check (token_count > 0),
    allocated_by   uuid references public.users (id) on delete set null,
    status         text not null default 'pending'
        check (status in ('pending', 'allocated', 'cancelled')),
    notes          text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

comment on table public.institution_token_allocations is
    'Ledger of admin bulk token allocations toward partner institutions (addon #11). Each allocated row corresponds to N pooled tokens drawn into the field via the institution.';

create index institution_allocations_ngo_idx
    on public.institution_token_allocations (ngo_partner_id, created_at desc);
create index institution_allocations_status_idx
    on public.institution_token_allocations (status);

create trigger institution_token_allocations_set_updated_at
    before update on public.institution_token_allocations
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — admin writes; admin + compliance read (matrix §6 audit-altitude).
-- The RPC runs SECURITY DEFINER and the admin route uses the service-role client,
-- both of which bypass RLS for the actual draw/insert.
-- =============================================================================
alter table public.institution_token_allocations enable row level security;

create policy institution_allocations_select_staff on public.institution_token_allocations
    for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy institution_allocations_write_admin on public.institution_token_allocations
    for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- =============================================================================
-- 3. allocate_pooled_tokens_to_institution — atomic institution bulk draw.
-- Modelled on allocate_pooled_tokens (20260625000004). Returns the new
-- allocation id + the count actually moved (one row).
-- =============================================================================
create or replace function public.allocate_pooled_tokens_to_institution(
    p_ngo_partner_id uuid,
    p_count          integer,
    p_allocated_by   uuid,
    p_notes          text default null
)
returns table (allocation_id uuid, moved_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ngo_status   text;
    v_cap          numeric;
    v_moved_ids    uuid[];
    v_alloc_id     uuid;
    v_now          timestamptz := now();
begin
    if p_count is null or p_count <= 0 then
        raise exception 'count must be a positive integer';
    end if;

    -- Resolve the institution (and serialise concurrent allocations to the same
    -- partner by locking its row).
    select status into v_ngo_status
        from public.ngo_partners
        where id = p_ngo_partner_id
        for update;
    if not found then
        raise exception 'institution (ngo_partner) not found';
    end if;
    if v_ngo_status <> 'active' then
        raise exception 'cannot allocate to a % institution', v_ngo_status;
    end if;

    -- Per-allocation cap (addon #11). NULL/empty => no cap (soft-skip; never
    -- invent a default — AGENTS.md hard rule).
    select case
               when value is null or btrim(value) = '' then null
               else value::numeric
           end
        into v_cap
        from public.system_config
        where key = 'institution_bulk_allocation_max';

    if v_cap is not null and p_count > v_cap then
        raise exception
            'requested % exceeds institution_bulk_allocation_max (%)', p_count, v_cap;
    end if;

    -- Claim N oldest pooled tokens and flip them to 'distributed'. SKIP LOCKED so
    -- this and the volunteer pool-pull never double-claim a token; the per-token
    -- guard on in_admin_pool prevents two institution draws racing for one token.
    with claimed as (
        select t.id
        from public.tokens t
        where t.status = 'in_admin_pool'
        order by t.minted_at asc
        limit p_count
        for update skip locked
    ),
    moved as (
        update public.tokens t
            set status = 'distributed', distributed_at = v_now
            from claimed c
            where t.id = c.id
              and t.status = 'in_admin_pool'
            returning t.id
    )
    select array_agg(id) into v_moved_ids from moved;

    if v_moved_ids is null or array_length(v_moved_ids, 1) < p_count then
        raise exception
            'admin pool has fewer than % allocatable token(s)', p_count;
    end if;

    -- One distribution record per moved token (channel NULL — no institution
    -- channel value exists; the allocation row below is the institution linkage).
    insert into public.token_distribution_records (token_id, distributed_by, channel, notes, distributed_at)
    select u.id, p_allocated_by, null, 'institution bulk allocation', v_now
    from unnest(v_moved_ids) as u(id);

    -- Summary ledger row (status 'allocated' — the draw succeeded atomically).
    insert into public.institution_token_allocations
        (ngo_partner_id, token_count, allocated_by, status, notes)
    values
        (p_ngo_partner_id, array_length(v_moved_ids, 1), p_allocated_by, 'allocated', p_notes)
    returning id into v_alloc_id;

    return query select v_alloc_id, array_length(v_moved_ids, 1);
end;
$$;

comment on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) is
    'Atomic institution bulk allocation (addon #11): cap check + oldest-first pool pull + flip to distributed + per-token distribution records + institution_token_allocations summary row, in one locked transaction. Called by lib/services/institution.ts.';

revoke all on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) to service_role;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop function if exists public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text);
-- drop table if exists public.institution_token_allocations cascade;
-- drop index if exists public.beneficiaries_institution_idx;
-- alter table public.beneficiaries drop column if exists institution_id;
-- commit;
