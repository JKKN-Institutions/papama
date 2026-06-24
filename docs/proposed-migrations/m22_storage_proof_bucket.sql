-- =============================================================================
-- M22 (PROPOSAL ONLY — DO NOT AUTO-APPLY) — vendor-documents storage bucket
-- =============================================================================
-- The Supabase MCP is read-only and migrations are applied by hand. This file
-- is a PROPOSAL: review, then apply it yourself in the Supabase SQL editor /
-- migration pipeline. It is NOT picked up by the local migration runner.
--
-- Purpose: a PRIVATE Storage bucket to hold real proof-of-service binaries
-- (the photo + receipt a vendor uploads at redemption, PROOF-1..4) plus the
-- vendor's onboarding KYC documents. Until this is applied, the proof route
-- (`POST /api/vendor/redemptions/[id]/proof`) accepts TEXT references only
-- (storage keys / external URLs) and never touches binary storage.
--
-- Path convention: objects live under `<vendor_id>/...` inside the bucket, e.g.
--   vendor-documents/<vendor_id>/redemptions/<redemption_id>/photo.jpg
--   vendor-documents/<vendor_id>/redemptions/<redemption_id>/receipt.jpg
-- The first path segment (name split on '/') is the owning vendor id; the RLS
-- policies below key off it.
--
-- FOLLOW-UP (once applied): add `POST /api/vendor/documents/upload` which, on
-- the service-role client, calls `storage.from('vendor-documents').upload(...)`
-- to write the real binary and returns its object path; the till then passes
-- that path as `proof_photo_ref` / `proof_receipt_ref` to the proof route.
-- =============================================================================

begin;

-- --- private bucket ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vendor-documents', 'vendor-documents', false)
on conflict (id) do nothing;

-- --- RLS on storage.objects (scoped to this bucket) --------------------------
-- storage.objects already has RLS enabled by Supabase. We add bucket-scoped
-- policies. `(storage.foldername(name))[1]` is the first path segment = vendor_id.
--
-- A vendor may write/read/update/delete only objects under their own
-- `<vendor_id>/` prefix; admin + vendor_manager may read everything (proof
-- review / settlement). No public read (bucket is private).

-- vendor: insert own
create policy "vendor_documents_insert_own"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'vendor-documents'
        and exists (
            select 1 from public.vendors v
            where v.id::text = (storage.foldername(name))[1]
              and v.owner_id = auth.uid()
        )
    );

-- vendor: read own
create policy "vendor_documents_select_own"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'vendor-documents'
        and exists (
            select 1 from public.vendors v
            where v.id::text = (storage.foldername(name))[1]
              and v.owner_id = auth.uid()
        )
    );

-- vendor: update own
create policy "vendor_documents_update_own"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'vendor-documents'
        and exists (
            select 1 from public.vendors v
            where v.id::text = (storage.foldername(name))[1]
              and v.owner_id = auth.uid()
        )
    );

-- vendor: delete own
create policy "vendor_documents_delete_own"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'vendor-documents'
        and exists (
            select 1 from public.vendors v
            where v.id::text = (storage.foldername(name))[1]
              and v.owner_id = auth.uid()
        )
    );

-- staff: read all (admin + vendor_manager for proof review). current_app_role()
-- is the SECURITY DEFINER helper defined in M02.
create policy "vendor_documents_select_staff"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'vendor-documents'
        and public.current_app_role() in ('admin', 'vendor_manager')
    );

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop policy if exists "vendor_documents_select_staff"  on storage.objects;
-- drop policy if exists "vendor_documents_delete_own"    on storage.objects;
-- drop policy if exists "vendor_documents_update_own"    on storage.objects;
-- drop policy if exists "vendor_documents_select_own"    on storage.objects;
-- drop policy if exists "vendor_documents_insert_own"    on storage.objects;
-- delete from storage.buckets where id = 'vendor-documents';
-- commit;
