-- =============================================================================
-- Fix — close the token_distribution_records INSERT forgery hole (RLS)
-- =============================================================================
-- VULNERABILITY (audit 2026-06-27, finding #1 — token theft / cap & audit poison):
--   The m16 policy `token_dist_insert_distributor` let ANY volunteer (or any
--   donor, for their own tokens) INSERT ANY row into token_distribution_records
--   with no pin on `distributed_by`, no channel restriction, and no custody
--   check:
--
--     create policy token_dist_insert_distributor ... for insert to authenticated
--       with check ( current_app_role() in ('admin','volunteer')
--                    or <token belongs to current donor> );
--
--   Token "holding" is DERIVED from "the latest token_distribution_records row
--   (max distributed_at) is a grant to this user" (lib/volunteer/holdings.ts,
--   mirrored in allocate_pooled_tokens). So a volunteer hitting PostgREST with
--   their own JWT could insert a forged grant row —
--     { token_id: <assigned to ANOTHER volunteer>, distributed_by: <attacker>,
--       channel: 'admin_to_volunteer', distributed_at: <future> } —
--   making themselves the "true latest" holder, then distribute a token held by
--   someone else. The same forgery skews the concurrent-cap count and corrupts
--   the immutable distribution audit chain.
--
-- WHY DROPPING IS SAFE (not a behavioural change for legitimate flows):
--   Every real writer of token_distribution_records goes through the SERVICE-ROLE
--   admin client, which BYPASSES RLS entirely:
--     • donor mint Path-A 'donor_self'      → app/api/tokens/convert/route.ts (admin client)
--     • admin/volunteer grant records       → allocate_pooled_tokens RPC (SECURITY DEFINER, service_role)
--     • volunteer→beneficiary hand-off      → app/api/volunteer/tokens/[id]/distribute/route.ts (admin client)
--     • admin revoke                        → app/api/admin/tokens/[id]/revoke/route.ts (admin client)
--   A repo-wide search confirms NO browser/user-JWT path inserts this table. The
--   `authenticated` role therefore needs no direct INSERT grant at all. Removing
--   the permissive policy denies forged inserts (fail-closed) while leaving every
--   service-role write — and the admin-manage `token_dist_write_admin` policy —
--   untouched. SELECT policies (own + staff) are unchanged.
--
-- token-flow.md §3/§4 require this hand-off be enforced "in RBAC + RLS"; the route
-- guards were already correct — this closes the RLS layer.
-- =============================================================================

begin;

drop policy if exists token_dist_insert_distributor on public.token_distribution_records;

commit;

-- =============================================================================
-- DOWN (rollback) — restores the original (vulnerable) policy. Do NOT apply
-- unless intentionally reverting; the policy this restores is the forgery hole.
-- =============================================================================
-- begin;
-- create policy token_dist_insert_distributor on public.token_distribution_records for insert to authenticated
--     with check (
--         public.current_app_role() in ('admin', 'volunteer')
--         or exists (select 1 from public.tokens t
--                    where t.id = token_id and t.donor_id = public.current_donor_id())
--     );
-- commit;
