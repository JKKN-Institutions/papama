-- =============================================================================
-- M22 — vendor-documents Storage bucket + RLS (KYC / onboarding doc uploads)
-- =============================================================================
-- The audit found migrations jump m19 → m23, so the `vendor-documents` bucket the
-- doc-upload route relies on was never created — every KYC upload failed by design
-- with 400 "apply m22" (app/api/vendor/documents/route.ts). This creates it.
--
-- The route uploads/lists/signs on the SERVICE-ROLE client (which bypasses RLS),
-- so these storage policies are defence-in-depth: even a direct authenticated
-- client can only touch files under its OWN vendor prefix `<vendor_id>/...`, and
-- staff (admin/vendor_manager/compliance) can read all for verification.
--
-- The bucket is PRIVATE (public = false): objects are only ever served via the
-- short-lived signed URLs the GET route mints. Object path convention:
--   vendor-documents/<vendor_id>/<doc_type>-<timestamp>
--
-- Depends on M04 (vendors, current_app_role). Apply AFTER M04 (and before m23 is
-- fine — no ordering dependency on the face slice). Storage schema is provided by
-- Supabase.
-- =============================================================================

begin;

-- --- bucket ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vendor-documents', 'vendor-documents', false)
on conflict (id) do nothing;

-- --- helper: first path segment is the owning vendor id ----------------------
-- storage.foldername(name) returns the path segments; element [1] is <vendor_id>.

-- --- RLS on storage.objects (scoped to this bucket) --------------------------
-- A vendor may read/insert/update/delete objects only under their own vendor
-- prefix. Ownership is proven by joining the path's first segment to a vendor row
-- the caller owns.

create policy "vendor_documents_select_own"
on storage.objects for select to authenticated
using (
    bucket_id = 'vendor-documents'
    and exists (
        select 1 from public.vendors v
        where v.owner_id = auth.uid()
          and v.id::text = (storage.foldername(name))[1]
    )
);

create policy "vendor_documents_select_staff"
on storage.objects for select to authenticated
using (
    bucket_id = 'vendor-documents'
    and public.current_app_role() in ('admin', 'vendor_manager', 'compliance')
);

create policy "vendor_documents_insert_own"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'vendor-documents'
    and exists (
        select 1 from public.vendors v
        where v.owner_id = auth.uid()
          and v.id::text = (storage.foldername(name))[1]
    )
);

create policy "vendor_documents_update_own"
on storage.objects for update to authenticated
using (
    bucket_id = 'vendor-documents'
    and exists (
        select 1 from public.vendors v
        where v.owner_id = auth.uid()
          and v.id::text = (storage.foldername(name))[1]
    )
);

create policy "vendor_documents_delete_own"
on storage.objects for delete to authenticated
using (
    bucket_id = 'vendor-documents'
    and exists (
        select 1 from public.vendors v
        where v.owner_id = auth.uid()
          and v.id::text = (storage.foldername(name))[1]
    )
);

create policy "vendor_documents_write_staff"
on storage.objects for all to authenticated
using (
    bucket_id = 'vendor-documents'
    and public.current_app_role() in ('admin', 'vendor_manager')
)
with check (
    bucket_id = 'vendor-documents'
    and public.current_app_role() in ('admin', 'vendor_manager')
);

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists "vendor_documents_write_staff"  on storage.objects;
-- drop policy if exists "vendor_documents_delete_own"   on storage.objects;
-- drop policy if exists "vendor_documents_update_own"   on storage.objects;
-- drop policy if exists "vendor_documents_insert_own"   on storage.objects;
-- drop policy if exists "vendor_documents_select_staff" on storage.objects;
-- drop policy if exists "vendor_documents_select_own"   on storage.objects;
-- delete from storage.buckets where id = 'vendor-documents';
-- commit;
