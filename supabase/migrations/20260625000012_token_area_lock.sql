-- =============================================================================
-- Printed-token area-lock — optional region restriction for printed tokens
-- =============================================================================
-- DIST-5 / owner §4.3 "Printed Token Handling": printed tokens may be
-- AREA-LOCKED (city / locality / PIN code) so a token printed for one
-- distribution region cannot be misused outside it. This adds a NULLABLE
-- per-token `area_lock` column plus a system_config default that the printed
-- token view surfaces:
--
--   tokens.area_lock                   — per-token override (city / locality /
--                                        PIN), NULL = no per-token lock
--   system_config.printed_token_area_lock_default
--                                      — the org-wide default region shown on a
--                                        printed token when the token has none
--
-- NULLABLE + nullable default: area-lock is OPT-IN ("where feasible", owner
-- §4.3). A token with no per-token lock and no configured default prints
-- WITHOUT an area-lock line — we never invent a region. The redemption
-- city-lock (system_config.city_lock_enabled, m03) is the ENFORCEMENT side;
-- this column is the per-token DECLARATION printed on the physical token.
--
-- Apply AFTER m16 (tokens) and m03 (system_config). Idempotent.
-- =============================================================================

begin;

alter table public.tokens
    add column if not exists area_lock text;

comment on column public.tokens.area_lock is
    'Optional printed-token area restriction (city / locality / PIN code), owner §4.3 / DIST-5. '
    'NULL = no per-token lock; the printed view then falls back to '
    'system_config.printed_token_area_lock_default (also nullable).';

-- Org-wide default region for printed tokens. Intentionally NULL: no region is
-- invented — an unset default simply prints no area-lock line. Admin sets it.
insert into public.system_config (key, value, value_type, description) values
    ('printed_token_area_lock_default', null, 'string',
     'Default area-lock region (city / locality / PIN) printed on tokens that have no per-token tokens.area_lock. NULL = unset; no area-lock line is printed.')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- delete from public.system_config where key = 'printed_token_area_lock_default';
-- alter table public.tokens drop column if exists area_lock;
-- commit;
