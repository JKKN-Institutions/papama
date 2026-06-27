-- =============================================================================
-- Fix — atomic volunteer-request decision (close the double-grant TOCTOU)
-- =============================================================================
-- VULNERABILITY (audit 2026-06-27, finding #2 — unbounded over-allocation):
--   app/api/admin/volunteer-requests/[id]/decide/route.ts did:
--     (1) read request, assert status='pending'   -- time-of-check
--     (2) allocatePooledTokens(count)              -- IRREVERSIBLE side effect
--     (3) UPDATE ... WHERE status='pending'        -- time-of-use (too late)
--   The pending guard sat AFTER the allocation, and step (3)'s zero-rows-updated
--   case was not detected (only `updateError` was checked). Two concurrent decides
--   on the same request (admin double-click, two admins, or a retried POST) both
--   passed (1), both ran (2) -> 2x tokens left the admin pool for one request,
--   while decided_count recorded the count once. With max_tokens_per_volunteer
--   unset (NULL = no cap, the default), the over-grant is unbounded: it silently
--   drains the pool, over-holds a volunteer, and desyncs the request ledger from
--   the token_distribution_records audit chain.
--
-- FIX: do the claim + allocation in ONE transaction, serialised by a row lock.
--   decide_volunteer_request() SELECT ... FOR UPDATEs the request row first, so a
--   second concurrent decide for the same request BLOCKS until the first commits,
--   then sees status<>'pending' and raises 'already decided' (allocating nothing).
--   The allocation runs via the existing allocate_pooled_tokens() in the SAME
--   transaction, so if it raises (inactive volunteer / over cap / pool too small)
--   the whole decision rolls back and the request stays pending & actionable.
--   No partial/over states, no crash window between claim and allocate.
--
-- Returns exactly ONE row (token_ids[], volunteer_user_id, granted_count) so the
-- route can build its audit entry. Mirrors allocate_pooled_tokens: SECURITY
-- DEFINER + locked search_path, executable only by service_role (the API layer
-- runs the RBAC matrix before calling). Apply AFTER 20260625000004
-- (allocate_pooled_tokens) and m09 (volunteer_token_requests). Idempotent.
-- =============================================================================

begin;

create or replace function public.decide_volunteer_request(
    p_request_id    uuid,
    p_decision      text,     -- 'granted' | 'partially_granted' | 'denied'
    p_decided_count integer,  -- NULL for denied / full grant; the count for a partial
    p_admin_id      uuid
)
returns table (token_ids uuid[], volunteer_user_id uuid, granted_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_volunteer_id uuid;
    v_requested    integer;
    v_status       public.volunteer_request_status;
    v_count        integer;
    v_user_id      uuid;
    v_moved        uuid[];
begin
    if p_decision not in ('granted', 'partially_granted', 'denied') then
        raise exception 'invalid decision: %', p_decision;
    end if;

    -- 1. Lock the request row. Concurrent decides for the SAME request serialise
    --    here; the loser proceeds only after the winner commits and then trips the
    --    pending check below — so it allocates nothing.
    select volunteer_id, requested_count, status
        into v_volunteer_id, v_requested, v_status
        from public.volunteer_token_requests
        where id = p_request_id
        for update;

    if not found then
        raise exception 'request not found';
    end if;
    if v_status <> 'pending' then
        raise exception 'request has already been decided';
    end if;

    -- 2. DENY — finalise with no token movement.
    if p_decision = 'denied' then
        update public.volunteer_token_requests
            set status = 'denied', decided_by = p_admin_id, decided_count = 0, updated_at = now()
            where id = p_request_id;
        return query
            select '{}'::uuid[],
                   (select user_id from public.volunteers where id = v_volunteer_id),
                   0;
        return;
    end if;

    -- 3. Resolve + validate the count against what was requested (a full grant can
    --    never exceed requested_count; a partial is strictly inside 1..requested-1).
    if p_decision = 'granted' then
        if p_decided_count is not null and p_decided_count <> v_requested then
            raise exception
                'a full grant allocates exactly the requested count (%) — use partially_granted for fewer',
                v_requested;
        end if;
        v_count := v_requested;
    else  -- partially_granted
        if p_decided_count is null then
            raise exception 'partially_granted requires decided_count';
        end if;
        if p_decided_count < 1 or p_decided_count >= v_requested then
            raise exception
                'decided_count must be between 1 and % for a partial grant', v_requested - 1;
        end if;
        v_count := p_decided_count;
    end if;

    -- 4. Allocate in the SAME transaction. allocate_pooled_tokens re-checks the
    --    active gate + concurrent cap under its own locks and raises on any
    --    failure; a raise here aborts this whole decision (request stays pending).
    select array_agg(a.token_id) into v_moved
        from public.allocate_pooled_tokens(v_volunteer_id, v_count, 'volunteer_request_grant') a;

    -- 5. Finalise the request now that the tokens are committed-in-this-txn.
    update public.volunteer_token_requests
        set status = p_decision::public.volunteer_request_status,
            decided_by = p_admin_id, decided_count = v_count, updated_at = now()
        where id = p_request_id;

    select user_id into v_user_id from public.volunteers where id = v_volunteer_id;

    return query select v_moved, v_user_id, v_count;
end;
$$;

comment on function public.decide_volunteer_request(uuid, text, integer, uuid) is
    'Atomic volunteer-request decision (token-flow §3b): row-locks the request, validates count vs requested, allocates via allocate_pooled_tokens, and finalises status in ONE transaction. Closes the double-grant TOCTOU. Called by app/api/admin/volunteer-requests/[id]/decide.';

-- Only the service-role API layer (post-RBAC) may invoke this.
revoke all on function public.decide_volunteer_request(uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.decide_volunteer_request(uuid, text, integer, uuid) to service_role;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop function if exists public.decide_volunteer_request(uuid, text, integer, uuid);
-- commit;
