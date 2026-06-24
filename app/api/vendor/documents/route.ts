import { BadRequestError, defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVendorId } from "@/lib/vendor/server-identity";

/**
 * POST + GET /api/vendor/documents — the signed-in vendor uploads / lists their
 * own KYC + onboarding documents.
 *
 * Both gated by `vendor_management/update|read` (own). The binary lives in the
 * private `vendor-documents` Storage bucket under a `<vendor_id>/...` prefix
 * (proposed in m22). We upload + sign on the SERVICE-ROLE client: the bucket and
 * its RLS are only present once m22 is applied, so until then the storage call
 * fails — we surface that as a clear 400 ("apply m22") rather than a 500.
 *
 * `vendor_documents.url` stores the storage object PATH (not a URL); GET mints a
 * short-lived signed URL per row so the path is never exposed raw.
 */
const BUCKET = "vendor-documents";
const SIGNED_URL_TTL_SECONDS = 3600;

export const POST = defineRoute(
    { feature: "vendor_management", action: "update", scope: "own" },
    async ({ req, user, audit }) => {
        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            throw new BadRequestError("expected multipart/form-data with a 'file' field");
        }

        const file = form.get("file");
        const docType = form.get("doc_type");

        if (!(file instanceof File)) {
            throw new BadRequestError("'file' is required");
        }
        if (typeof docType !== "string" || docType.trim() === "") {
            throw new BadRequestError("'doc_type' is required");
        }

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const path = `${vendorId}/${docType.trim()}-${Date.now()}`;

        const { error: uploadError } = await admin.storage
            .from(BUCKET)
            .upload(path, file, { upsert: false });

        if (uploadError) {
            // Most likely the bucket does not exist yet (m22 unapplied).
            throw new BadRequestError("document storage not configured (apply m22)");
        }

        const { data, error } = await admin
            .from("vendor_documents")
            .insert({
                vendor_id: vendorId,
                doc_type: docType.trim(),
                url: path,
                verification_status: "pending",
            })
            .select("id")
            .single();

        if (error || !data) {
            throw new Error(error?.message ?? "failed to record document");
        }

        await audit({
            action: "vendor.document.upload",
            entity_table: "vendor_documents",
            entity_id: data.id as string,
            summary: `vendor uploaded a '${docType.trim()}' document`,
            metadata: { vendor_id: vendorId, doc_type: docType.trim(), path },
        });

        return { id: data.id, path };
    }
);

export const GET = defineRoute(
    { feature: "vendor_management", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const { data, error } = await admin
            .from("vendor_documents")
            .select("id, doc_type, verification_status, url, created_at")
            .eq("vendor_id", vendorId)
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        const documents = await Promise.all(
            (data ?? []).map(async (doc) => {
                const { data: signed } = await admin.storage
                    .from(BUCKET)
                    .createSignedUrl(doc.url as string, SIGNED_URL_TTL_SECONDS);
                return {
                    id: doc.id,
                    doc_type: doc.doc_type,
                    verification_status: doc.verification_status,
                    signed_url: signed?.signedUrl ?? null,
                    created_at: doc.created_at,
                };
            })
        );

        return { documents };
    }
);
