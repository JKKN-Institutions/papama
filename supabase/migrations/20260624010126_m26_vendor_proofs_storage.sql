-- =============================================================================
-- M26 — vendor-proofs Storage bucket + RLS (proof-of-service images)
-- =============================================================================
-- Proof of service (PROOF-1..4) requires the vendor to upload the actual plate
-- photo + receipt IMAGES before the locked payment is released. The proof route
-- (app/api/vendor/redemptions/[id]/proof) uploads both binaries here and only then
-- flips payment_status 'locked' → 'released'. Before this migration the route
-- surfaces a clear 400 ("apply m24").
--
-- PRIVATE bucket (public = false). Object path convention:
--   vendor-proofs/<vendor_id>/<redemption_id>/<plate|receipt>-<timestamp>
-- The first path segment is the owning vendor id, so the same own-prefix policy
-- shape as m22 applies. Uploads run on the SERVICE-ROLE client; these policies are
-- defence-in-depth + let staff (admin/compliance/vendor_manager) read proofs for
-- settlement reconciliation and fraud review.
--
-- Depends on M04 (vendors, current_app_role) and M17 (token_redemptions). Apply
-- AFTER them. Storage schema is provided by Supabase.
-- =============================================================================

begin;

-- --- bucket ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vendor-proofs', 'vendor-proofs', false)
on conflict (id) do nothing;

-- --- RLS on storage.objects (scoped to this bucket) --------------------------
create policy "vendor_proofs_select_own"
on storage.objects for select to authenticated
using (
    bucket_id = 'vendor-proofs'
    and exists (
        select 1 from public.vendors v
        where v.owner_id = auth.uid()
          and v.id::text = (storage.foldername(name))[1]
    )
);

create policy "vendor_proofs_select_staff"
on storage.objects for select to authenticated
using (
    bucket_id = 'vendor-proofs'
    and public.current_app_role() in ('admin', 'vendor_manager', 'compliance')
);

create policy "vendor_proofs_insert_own"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'vendor-proofs'
    and exists (
        select 1 from public.vendors v
        where v.owner_id = auth.uid()
          and v.id::text = (storage.foldername(name))[1]
    )
);

-- Proofs are write-once evidence: vendors may NOT update or delete uploaded
-- proof objects (no update/delete own policy). Only admins may clean up.
create policy "vendor_proofs_write_admin"
on storage.objects for all to authenticated
using (
    bucket_id = 'vendor-proofs'
    and public.current_app_role() = 'admin'
)
with check (
    bucket_id = 'vendor-proofs'
    and public.current_app_role() = 'admin'
);

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists "vendor_proofs_write_admin"  on storage.objects;
-- drop policy if exists "vendor_proofs_insert_own"   on storage.objects;
-- drop policy if exists "vendor_proofs_select_staff" on storage.objects;
-- drop policy if exists "vendor_proofs_select_own"   on storage.objects;
-- delete from storage.buckets where id = 'vendor-proofs';
-- commit;
