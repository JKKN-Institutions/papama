-- =============================================================================
-- Lock search_path on enforce_token_value_floor() (security advisor 0011)
-- =============================================================================
-- The Supabase security advisor `function_search_path_mutable` flags
-- public.enforce_token_value_floor() (the BEFORE-INSERT backstop on tokens added
-- in m27_token_value_floor) for having a role-mutable search_path. The function
-- references public.system_config unqualified, so a pinned search_path removes
-- the linter warning and the (low, since the function is NOT security-definer)
-- search-path-shadowing surface.
--
-- Idempotent: ALTER FUNCTION just sets the attribute; safe to re-run.
-- Apply AFTER m27 (20260625000009_m27_token_value_floor) which creates the func.
-- =============================================================================

begin;

alter function public.enforce_token_value_floor()
    set search_path = public, pg_temp;

commit;

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- alter function public.enforce_token_value_floor() reset search_path;
-- commit;
