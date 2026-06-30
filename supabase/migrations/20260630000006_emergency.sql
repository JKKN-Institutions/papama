-- =============================================================================
-- ADDON #8 — emergency / disaster-relief mode (token flag + grant trail)
-- =============================================================================
-- Phase-1 addon area #8 (docs/phase 1 addon.md §8: disaster relief mode,
-- temporary meal-limit increase, emergency token issuance). The RELAXED-LIMIT
-- behaviour is already wired in the redemption engine (Wave 1) which reads
-- emergency_mode_enabled / emergency_max_meals_per_day / emergency_meal_cooldown_hours
-- from system_config (seeded Wave 0). This migration adds:
--   1. tokens.is_emergency — marks a token minted as disaster relief.
--   2. emergency_token_grants — the audit trail of who issued relief tokens & why.
--
-- Depends on M16 (public.tokens), M02 (public.users, current_app_role).
-- Apply AFTER 20260620010116_m16_tokens.sql.
--
-- OPEN ITEM — DISASTER-AFFECTED PROOF RULES (client Q7): how a beneficiary
-- PROVES they are disaster-affected (and whether relief tokens require such proof
-- before redemption) is UNDECIDED. This migration does NOT implement any proof
-- gating — `reason` is a free-text note only. Do NOT add proof columns/logic here
-- until the client answers Q7 (see lib/services/emergency.ts TODO).
-- =============================================================================

begin;

-- --- 1. mark emergency-relief tokens -----------------------------------------
alter table public.tokens
    add column if not exists is_emergency boolean not null default false;

comment on column public.tokens.is_emergency is 'True when this token was minted as disaster/emergency relief (addon #8). Provenance only — relaxed redemption limits are driven by emergency_mode_enabled config, not this flag.';

-- --- 2. emergency token grant trail ------------------------------------------
create table public.emergency_token_grants (
    id          uuid primary key default gen_random_uuid(),
    -- keep the grant record even if the token is later cancelled/cleaned up.
    token_id    uuid references public.tokens (id) on delete set null,
    issued_by   uuid references public.users (id) on delete set null,
    reason      text,
    created_at  timestamptz not null default now()
);

comment on table public.emergency_token_grants is 'Audit trail of emergency/disaster relief token issuance (addon #8): which token, issued by whom, and why.';

create index emergency_token_grants_token_idx  on public.emergency_token_grants (token_id);
create index emergency_token_grants_issued_idx on public.emergency_token_grants (created_at desc);

-- --- RLS: admin writes; admin + compliance read ------------------------------
-- Issuance is an admin action; compliance may review the relief trail (read-only).
alter table public.emergency_token_grants enable row level security;

create policy emergency_grants_select_staff
    on public.emergency_token_grants for select
    to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));

create policy emergency_grants_write_admin
    on public.emergency_token_grants for all
    to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists emergency_grants_write_admin  on public.emergency_token_grants;
-- drop policy if exists emergency_grants_select_staff on public.emergency_token_grants;
-- drop table if exists public.emergency_token_grants;
-- alter table public.tokens drop column if exists is_emergency;
-- commit;
