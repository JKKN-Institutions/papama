-- =============================================================================
-- ADDON #15 (Phase-1 batch 2026-07-16) — institution allocation traceability
-- =============================================================================
-- Spec §3.1 F-12 [M1-11]: "bulk redemption tracking" per institution. Today
-- institution_token_allocations has no FK path to tokens/token_redemptions at
-- all, so "tokens allocated vs redeemed vs pending vs expired" is unbuildable
-- as literally worded. This adds a minimal traceable column to the per-token
-- distribution record written by allocate_pooled_tokens_to_institution(), and
-- reissues that function to stamp it.
--
-- Apply AFTER 20260716090004. Depends on 20260630000007 (institution module).
-- =============================================================================

alter table public.token_distribution_records
    add column if not exists ngo_partner_id uuid references public.ngo_partners (id) on delete set null;

comment on column public.token_distribution_records.ngo_partner_id is
    'Institution this hand-off was part of a bulk allocation for (addon #11/#15). NULL for every non-institution channel.';

create index if not exists token_distribution_records_ngo_idx
    on public.token_distribution_records (ngo_partner_id) where ngo_partner_id is not null;

-- Reissue allocate_pooled_tokens_to_institution() — identical body to
-- 20260630000007, except the distribution_records insert now also sets
-- ngo_partner_id = p_ngo_partner_id.
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

    -- One distribution record per moved token, now stamped with ngo_partner_id
    -- so #15's per-institution report can trace allocated -> redeemed/pending/
    -- expired/blocked precisely.
    insert into public.token_distribution_records
        (token_id, distributed_by, channel, notes, distributed_at, ngo_partner_id)
    select u.id, p_allocated_by, null, 'institution bulk allocation', v_now, p_ngo_partner_id
    from unnest(v_moved_ids) as u(id);

    insert into public.institution_token_allocations
        (ngo_partner_id, token_count, allocated_by, status, notes)
    values
        (p_ngo_partner_id, array_length(v_moved_ids, 1), p_allocated_by, 'allocated', p_notes)
    returning id into v_alloc_id;

    return query select v_alloc_id, array_length(v_moved_ids, 1);
end;
$$;

comment on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) is
    'Atomic institution bulk allocation (addon #11, retraced addon #15): cap check + oldest-first pool pull + flip to distributed + per-token distribution records (now ngo_partner_id-stamped) + institution_token_allocations summary row, in one locked transaction.';

revoke all on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.allocate_pooled_tokens_to_institution(uuid, integer, uuid, text) to service_role;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- (recreate the pre-#15 function body from 20260630000007 here)
-- drop index if exists public.token_distribution_records_ngo_idx;
-- alter table public.token_distribution_records drop column if exists ngo_partner_id;
-- commit;
