-- =============================================================================
-- Atomic volunteer allocation RPC — allocate_pooled_tokens (token-flow §3a/§3b)
-- =============================================================================
-- IMPORTANT: this migration MUST be applied before volunteer allocation works at
-- runtime. lib/volunteer/allocation.ts now calls this function via
-- supabase.rpc('allocate_pooled_tokens', ...); without it, both the admin-assign
-- route (§3a) and the request-grant decide route (§3b) will fail at runtime.
--
-- WHY: the previous app-level flow read the volunteer's held count, checked it
-- against max_tokens_per_volunteer, then moved tokens in separate statements.
-- supabase-js cannot span those statements in one transaction, so two concurrent
-- allocations (or a request-grant racing an admin-assign) could both pass the
-- check and overshoot the concurrent cap. There was also NO DB backstop. This
-- function closes both gaps: everything below runs in ONE transaction with a row
-- lock that serialises concurrent allocations for the same volunteer.
--
-- It enforces, atomically:
--   1. the volunteer exists and is status='active' (suspended/inactive blocked),
--   2. the CONCURRENT max_tokens_per_volunteer cap (read from system_config;
--      NULL/unset = no limit, never invents a default — AGENTS.md hard rule),
--      counted with the EXACT held-set semantics of lib/volunteer/holdings.ts
--      (listHeldTokens): a token is "held" iff status='assigned_to_volunteer'
--      AND its LATEST token_distribution_records row (max distributed_at) is a
--      grant (channel in admin_to_volunteer, volunteer_request_grant) to that
--      volunteer's user_id,
--   3. the admin pool has >= N tokens (oldest minted_at first),
--   4. flips exactly those N from in_admin_pool -> assigned_to_volunteer, and
--   5. inserts one token_distribution_records grant row per moved token, with the
--      channel passed in (admin_to_volunteer or volunteer_request_grant),
--      attributed to the volunteer's user_id.
-- Returns the moved token ids (the caller derives count + audit from them).
--
-- Concurrency: we SELECT ... FOR UPDATE the volunteer's currently-held token rows
-- (and the volunteers row) so a second allocation for the same volunteer blocks
-- until we commit, then re-counts against the post-commit state. Different
-- volunteers don't contend. The per-token pool flip still guards on the pooled
-- status, so two volunteers racing for the SAME pool token can't both win.
--
-- SECURITY DEFINER + locked search_path; executable only by service_role (the
-- API layer already gates the RBAC matrix before calling). Apply AFTER m16
-- (tokens), m09 (volunteers, volunteer_token_requests) and m03 (system_config).
-- Idempotent (create or replace).
-- =============================================================================

begin;

create or replace function public.allocate_pooled_tokens(
    p_volunteer_id uuid,
    p_count        integer,
    p_channel      text
)
returns table (token_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id   uuid;
    v_status    text;
    v_limit     numeric;
    v_held      integer;
    v_now       timestamptz := now();
    v_moved_ids uuid[];
begin
    if p_count is null or p_count <= 0 then
        raise exception 'count must be a positive integer';
    end if;
    if p_channel not in ('admin_to_volunteer', 'volunteer_request_grant') then
        raise exception 'invalid grant channel: %', p_channel;
    end if;

    -- 1. Resolve + LOCK the volunteer row (serialises status changes vs. this
    --    allocation) and verify it is active.
    select user_id, status
        into v_user_id, v_status
        from public.volunteers
        where id = p_volunteer_id
        for update;

    if not found then
        raise exception 'volunteer not found';
    end if;
    if v_user_id is null then
        raise exception 'volunteer has no linked user account';
    end if;
    if v_status <> 'active' then
        raise exception 'cannot allocate to a % volunteer', v_status;
    end if;

    -- Lock the volunteer's currently-held token rows so a concurrent allocation
    -- for the SAME volunteer blocks here and re-counts after we commit. The held
    -- set mirrors lib/volunteer/holdings.ts exactly: status='assigned_to_volunteer'
    -- AND the LATEST distribution record (max distributed_at) for the token is a
    -- grant (admin_to_volunteer | volunteer_request_grant) to this volunteer's
    -- user. A LATERAL pulls that single latest record per token.
    perform 1
        from public.tokens t
        cross join lateral (
            select r.distributed_by, r.channel
            from public.token_distribution_records r
            where r.token_id = t.id
            order by r.distributed_at desc
            limit 1
        ) latest
        where t.status = 'assigned_to_volunteer'
          and latest.distributed_by = v_user_id
          and latest.channel in ('admin_to_volunteer', 'volunteer_request_grant')
        for update of t;

    -- 2. Concurrent-limit check. Read max_tokens_per_volunteer from system_config;
    --    NULL/unset/empty => no limit (never invent a default).
    select case
               when value is null or btrim(value) = '' then null
               else value::numeric
           end
        into v_limit
        from public.system_config
        where key = 'max_tokens_per_volunteer';

    if v_limit is not null then
        -- Re-count the held set with the same latest-record semantics as the lock.
        select count(*)
            into v_held
            from public.tokens t
            cross join lateral (
                select r.distributed_by, r.channel
                from public.token_distribution_records r
                where r.token_id = t.id
                order by r.distributed_at desc
                limit 1
            ) latest
            where t.status = 'assigned_to_volunteer'
              and latest.distributed_by = v_user_id
              and latest.channel in ('admin_to_volunteer', 'volunteer_request_grant');

        if v_held + p_count > v_limit then
            raise exception
                'allocation of % would exceed max_tokens_per_volunteer (%); volunteer already holds %',
                p_count, v_limit, v_held;
        end if;
    end if;

    -- 3 + 4. Atomically claim N oldest pooled tokens and flip them to the
    -- volunteer. SELECT ... FOR UPDATE SKIP LOCKED so two allocations pulling
    -- from the pool at once each grab distinct rows; the CTE flips exactly the
    -- claimed ids and collects them into an array.
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
            set status = 'assigned_to_volunteer'
            from claimed c
            where t.id = c.id
              and t.status = 'in_admin_pool'
            returning t.id
    )
    select array_agg(id) into v_moved_ids from moved;

    if v_moved_ids is null or array_length(v_moved_ids, 1) < p_count then
        -- Not enough claimable pool tokens — abort the whole transaction so the
        -- partial flips above roll back (nothing is left half-allocated).
        raise exception
            'admin pool has fewer than % allocatable token(s)', p_count;
    end if;

    -- 5. One grant record per moved token, attributed to the volunteer's user.
    insert into public.token_distribution_records (token_id, distributed_by, channel, distributed_at)
    select u.id, v_user_id, p_channel::public.distribution_channel, v_now
    from unnest(v_moved_ids) as u(id);

    return query select u.id as token_id from unnest(v_moved_ids) as u(id);
end;
$$;

comment on function public.allocate_pooled_tokens(uuid, integer, text) is
    'Atomic volunteer allocation (token-flow §3a/§3b): active-volunteer gate + concurrent max_tokens_per_volunteer cap + oldest-first pool pull + assigned_to_volunteer flip + grant records, in one locked transaction. Called by lib/volunteer/allocation.ts.';

-- Only the service-role API layer (which has already run the RBAC matrix check)
-- may invoke this. Never directly callable by anon/authenticated clients.
revoke all on function public.allocate_pooled_tokens(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.allocate_pooled_tokens(uuid, integer, text) to service_role;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop function if exists public.allocate_pooled_tokens(uuid, integer, text);
-- commit;
