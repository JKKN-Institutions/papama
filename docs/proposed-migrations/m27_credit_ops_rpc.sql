-- ============================================================================
-- Migration m27 — atomic donor-credit primitives (PROPOSED — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply via Supabase MCP AFTER review (CLAUDE.md: never auto-apply migrations).
--
-- WHY: the token-mint deduction (app/api/tokens/convert/route.ts) and the
-- donation credit increment (app/api/_lib/recordDonation.ts) were read-modify-
-- write on donor_credits.balance_inr with no atomic guard — two concurrent
-- requests could double-spend / lose an update. The application has since been
-- hardened with a compare-and-swap retry loop (no migration required). These
-- SECURITY DEFINER functions are the FULLER fix: a single atomic
-- `balance = balance ± amount` expression the routes can call instead of the CAS
-- loop, eliminating the race window entirely.
--
-- Depends on: donor_credits (donor_id UNIQUE — present), balance_inr CHECK >= 0.
-- Grants: service_role ONLY (the routes already use the service-role client).
-- ============================================================================

create or replace function public.papama_add_donor_credit(p_donor_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  insert into public.donor_credits (donor_id, balance_inr)
       values (p_donor_id, p_amount)
  on conflict (donor_id)
       do update set balance_inr = public.donor_credits.balance_inr + excluded.balance_inr,
                     updated_at  = now()
  returning balance_inr into v_balance;
  return v_balance;
end;
$$;

create or replace function public.papama_deduct_donor_credit(p_donor_id uuid, p_amount numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.donor_credits
     set balance_inr = balance_inr - p_amount,
         updated_at  = now()
   where donor_id = p_donor_id
     and balance_inr >= p_amount        -- atomic guard: never go negative
  returning balance_inr into v_balance;
  if not found then
    raise exception 'insufficient credit' using errcode = 'check_violation';
  end if;
  return v_balance;
end;
$$;

revoke all on function public.papama_add_donor_credit(uuid, numeric)    from public, anon, authenticated;
revoke all on function public.papama_deduct_donor_credit(uuid, numeric) from public, anon, authenticated;
grant execute on function public.papama_add_donor_credit(uuid, numeric)    to service_role;
grant execute on function public.papama_deduct_donor_credit(uuid, numeric) to service_role;

-- ----------------------------------------------------------------------------
-- DOWN
-- drop function if exists public.papama_add_donor_credit(uuid, numeric);
-- drop function if exists public.papama_deduct_donor_credit(uuid, numeric);
-- ============================================================================
