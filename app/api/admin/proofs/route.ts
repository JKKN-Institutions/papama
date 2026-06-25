import { defineRoute, parseQuery } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROOF_STATUSES } from "@/lib/types/enums";
import { z } from "zod";

/**
 * GET /api/admin/proofs — proof-of-service review queue (proof_of_service/read).
 *
 * Lists redemptions whose proof is awaiting an admin decision (default
 * `proof_status='submitted'`; pass ?status=approved|rejected to view decided
 * ones). For each row it mints short-lived SIGNED URLs for the plate photo +
 * receipt out of the PRIVATE `vendor-proofs` bucket so the reviewer can actually
 * see the evidence — the bucket is never public. Vendor names are resolved in one
 * batch. Runs on the service-role client (after the matrix gate) because signing
 * private-bucket objects requires it.
 */
const BUCKET = "vendor-proofs";
const SIGNED_URL_TTL_SECONDS = 600; // 10 min — enough to review, short enough to expire

const querySchema = z.object({
    status: z.enum(PROOF_STATUSES).optional(),
});

interface ProofRow {
    id: string;
    vendor_id: string;
    token_value_inr: number;
    menu_value_inr: number;
    difference_paid_inr: number;
    payment_status: string;
    proof_status: string | null;
    proof_photo_ref: string | null;
    proof_receipt_ref: string | null;
    proof_uploaded_at: string | null;
    proof_review_note: string | null;
    redeemed_at: string | null;
}

export const GET = defineRoute({ feature: "proof_of_service", action: "read" }, async ({ req }) => {
    const { status = "submitted" } = parseQuery(req.nextUrl.searchParams, querySchema);
    const admin = createAdminClient();

    const { data, error } = await admin
        .from("token_redemptions")
        .select(
            "id, vendor_id, token_value_inr, menu_value_inr, difference_paid_inr, payment_status," +
            "proof_status, proof_photo_ref, proof_receipt_ref, proof_uploaded_at, proof_review_note, redeemed_at"
        )
        .eq("proof_status", status)
        .order("proof_uploaded_at", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as ProofRow[];

    // Resolve vendor names in one batch (readable label instead of a raw UUID).
    const vendorIds = [...new Set(rows.map((r) => r.vendor_id))];
    const nameByVendor = new Map<string, string>();
    if (vendorIds.length > 0) {
        const { data: vendors } = await admin
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds);
        for (const v of (vendors ?? []) as { id: string; name: string }[]) {
            nameByVendor.set(v.id, v.name);
        }
    }

    // Sign both proof objects per row, in parallel. A missing/failed sign yields
    // null so the UI shows "image unavailable" rather than breaking the queue.
    async function sign(path: string | null): Promise<string | null> {
        if (!path) return null;
        const { data: signed } = await admin.storage
            .from(BUCKET)
            .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        return signed?.signedUrl ?? null;
    }

    const proofs = await Promise.all(
        rows.map(async (r) => {
            const [photo_url, receipt_url] = await Promise.all([
                sign(r.proof_photo_ref),
                sign(r.proof_receipt_ref),
            ]);
            return {
                redemption_id: r.id,
                vendor_id: r.vendor_id,
                vendor_name: nameByVendor.get(r.vendor_id) ?? null,
                token_value_inr: r.token_value_inr,
                menu_value_inr: r.menu_value_inr,
                // Platform-owed payout if approved (matches the settlement engine).
                settlement_amount_inr: Math.max(0, r.menu_value_inr - r.difference_paid_inr),
                payment_status: r.payment_status,
                proof_status: r.proof_status,
                proof_review_note: r.proof_review_note,
                proof_uploaded_at: r.proof_uploaded_at,
                redeemed_at: r.redeemed_at,
                photo_url,
                receipt_url,
            };
        })
    );

    return { proofs, total: proofs.length, status };
});
