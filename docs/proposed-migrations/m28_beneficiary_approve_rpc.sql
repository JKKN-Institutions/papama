-- ============================================================================
-- Migration m28 — atomic beneficiary approval (PROPOSED — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply via Supabase MCP AFTER review.
--
-- WHY (audit M — admin): the approve path in
-- app/api/admin/beneficiary-registrations/[id]/decide/route.ts runs TWO writes —
-- insert the beneficiaries row, then update the registration to link it. If the
-- second write fails, the beneficiary row is orphaned and the registration stays
-- 'pending', so a re-approval creates a DUPLICATE beneficiary. A function body is
-- a single transaction (both succeed or both roll back), and the FOR UPDATE lock
-- serializes concurrent decisions on the same registration.
--
-- Column list mirrors the decide route exactly (verified against the route).
-- The route would call: select papama_approve_beneficiary(reg_id, user_id, notes, expires_at)
-- and use the returned beneficiary id; the category-driven expiry is still
-- computed in the route and passed in as p_expires_at.
-- ============================================================================

create or replace function public.papama_approve_beneficiary(
  p_registration_id uuid,
  p_reviewer        uuid,
  p_review_notes    text,
  p_expires_at      timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_benef_id uuid;
begin
  select id, full_name, category, face_hash, face_embedding, aadhaar_hash, registration_status
    into r
    from public.beneficiary_registrations
   where id = p_registration_id
   for update;                                   -- serialize concurrent decisions
  if not found then
    raise exception 'registration not found' using errcode = 'no_data_found';
  end if;
  if r.registration_status <> 'pending' then
    raise exception 'registration already %', r.registration_status using errcode = 'check_violation';
  end if;

  insert into public.beneficiaries
    (full_name, category, eligibility_status, face_hash, face_embedding,
     aadhaar_hash, eligibility_expires_at, registered_by, status)
  values
    (r.full_name, r.category, 'verified', r.face_hash, r.face_embedding,
     r.aadhaar_hash, p_expires_at, p_reviewer, 'active')
  returning id into v_benef_id;

  update public.beneficiary_registrations
     set registration_status = 'approved',
         reviewed_by         = p_reviewer,
         review_notes        = p_review_notes,
         beneficiary_id      = v_benef_id,
         updated_at          = now()
   where id = p_registration_id;

  return v_benef_id;
end;
$$;

revoke all on function public.papama_approve_beneficiary(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.papama_approve_beneficiary(uuid, uuid, text, timestamptz) to service_role;

-- ----------------------------------------------------------------------------
-- DOWN
-- drop function if exists public.papama_approve_beneficiary(uuid, uuid, text, timestamptz);
-- ============================================================================
