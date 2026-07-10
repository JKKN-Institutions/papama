import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/vendors/[id]/documents — staff review a vendor's KYC +
 * onboarding documents (contract: vendor_management read → admin / compliance /
 * vendor_manager / volunteer).
 *
 * Gated by `vendor_management/read`. Runs on the service-role client and mints a
 * short-lived signed URL per document (same shape the vendor's own GET returns)
 * so the private storage path is never exposed raw. Never null body — empty list
 * for a vendor with no documents (or an unknown id).
 */
const BUCKET = "vendor-documents";
const SIGNED_URL_TTL_SECONDS = 3600;

export const GET = defineRoute<{ id: string }>(
    { feature: "document_management", action: "read" },
    async ({ params }) => {
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("vendor_documents")
            .select("id, doc_type, verification_status, url, created_at")
            .eq("vendor_id", params.id)
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
