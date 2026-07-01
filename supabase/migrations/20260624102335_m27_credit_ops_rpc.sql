-- RECOVERED from live DB (already applied under ledger version 20260624102335 / m27_credit_ops_rpc).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- SECURITY DEFINER credit-ledger RPCs (service_role only). Verbatim from live pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.papama_add_donor_credit(p_donor_id uuid, p_amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.papama_deduct_donor_credit(p_donor_id uuid, p_amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.donor_credits
     set balance_inr = balance_inr - p_amount,
         updated_at  = now()
   where donor_id = p_donor_id
     and balance_inr >= p_amount
  returning balance_inr into v_balance;
  if not found then
    raise exception 'insufficient credit' using errcode = 'check_violation';
  end if;
  return v_balance;
end;
$function$;

revoke all on function public.papama_add_donor_credit(uuid, numeric) from public, anon, authenticated;
revoke all on function public.papama_deduct_donor_credit(uuid, numeric) from public, anon, authenticated;
grant execute on function public.papama_add_donor_credit(uuid, numeric) to service_role;
grant execute on function public.papama_deduct_donor_credit(uuid, numeric) to service_role;
