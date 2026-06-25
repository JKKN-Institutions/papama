-- =============================================================================
-- M27 — generation hardening: token_conversion ledger type + value-floor trigger
-- =============================================================================
-- Two backstops for the donor mint path (app/api/tokens/convert), found in the
-- Segment-1 generation audit:
--
--   #9  Add a dedicated DEBIT ledger type `token_conversion` to
--       credit_transaction_type. A mint draws DOWN credit (negative amount); it
--       must not be typed `donation` (an inflow). Mirrors lib/types/enums.ts.
--
--   #2  Enforce the minimum token value at the DB layer so tokens.value_inr can
--       never be below system_config.standard_token_value — even if some future
--       caller bypasses the route check. A static CHECK constraint can't read a
--       config row, so this is a BEFORE INSERT trigger.
--
-- Apply AFTER m01 (enums) + m03 (system_config) + m16 (tokens). Idempotent.
-- NOTE: `alter type ... add value` cannot run inside an explicit transaction
-- block, so the enum add is intentionally OUTSIDE begin/commit. The trigger is
-- wrapped in its own transaction below.
-- =============================================================================

-- --- #9: new credit ledger type ----------------------------------------------
alter type public.credit_transaction_type add value if not exists 'token_conversion';

-- --- #2: DB-level minimum-token-value backstop --------------------------------
begin;

create or replace function public.enforce_token_value_floor()
returns trigger
language plpgsql
as $$
declare
    floor_inr integer;
begin
    -- Read the configured floor. NULL/unset or non-numeric => block the mint
    -- rather than allow a sub-threshold token (fail closed, matching the route).
    select nullif(value, '')::integer
        into floor_inr
        from public.system_config
        where key = 'standard_token_value';

    if floor_inr is null then
        raise exception
            'standard_token_value is unset or non-numeric; cannot mint a token'
            using errcode = 'check_violation';
    end if;

    if new.value_inr < floor_inr then
        raise exception
            'token value % is below the configured floor %', new.value_inr, floor_inr
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

comment on function public.enforce_token_value_floor() is
    'BEFORE INSERT on tokens: rejects value_inr below system_config.standard_token_value. '
    'Backstops the route-level floor in app/api/tokens/convert (audit #2). Fails closed when unset.';

drop trigger if exists tokens_enforce_value_floor on public.tokens;
create trigger tokens_enforce_value_floor
    before insert on public.tokens
    for each row execute function public.enforce_token_value_floor();

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop trigger if exists tokens_enforce_value_floor on public.tokens;
-- drop function if exists public.enforce_token_value_floor();
-- commit;
-- NOTE: an enum value cannot be removed from credit_transaction_type without
-- recreating the type; `token_conversion` is additive and safe to leave in place.
