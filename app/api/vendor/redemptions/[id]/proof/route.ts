import { BadRequestError, NotFoundError, defineRoute } from "@/lib/api/handler";
import { resolveVendorId } from "@/lib/vendor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/vendor/redemptions/[id]/proof — submit proof of service (PROOF-1..4).
 *
 * Gated by `proof_of_service/create` (scope own). The vendor uploads the proof
 * IMAGES (plate photo + receipt) for a redemption they own; this stores the
 * binaries in the private `vendor-proofs` Storage bucket under a
 * `<vendor_id>/<redemption_id>/...` prefix, records the resulting object paths,
 * and only then flips payment_status 'locked' → 'released' so the redemption can
 * roll into a settlement. Ownership is verified server-side (the redemption's
 * vendor_id must match the resolved vendor) — a vendor cannot release someone
 * else's payment.
 *
 * PROOF GATING (closes the audit gap): BOTH the plate photo and the receipt are
 * REQUIRED. An empty / partial submission is rejected with a 400 and the payment
 * stays locked — no proof, no release. The binaries are accepted as
 * multipart/form-data (`photo`, `receipt`); we never trust client-supplied refs.
 *
 * Storage lives in the `vendor-proofs` bucket (proposed in m26). Until that
 * migration is applied the upload fails; we surface that as a clear 400
 * ("apply m26") rather than a 500.
 */
const BUCKET = "vendor-proofs";

export const POST = defineRoute<{ id: string }>(
    { feature: "proof_of_service", action: "create", scope: "own" },
    async ({ req, user, params, audit }) => {
        const redemptionId = params.id;

        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            throw new BadRequestError(
                "expected multipart/form-data with 'photo' and 'receipt' image fields"
            );
        }

        const photo = form.get("photo");
        const receipt = form.get("receipt");

        // Proof gate: both images are mandatory before any payment is released.
        if (!(photo instanceof File) || photo.size === 0) {
            throw new BadRequestError("a plate photo image is required to release payment");
        }
        if (!(receipt instanceof File) || receipt.size === 0) {
            throw new BadRequestError("a receipt image is required to release payment");
        }

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const { data: existing } = await admin
            .from("token_redemptions")
            .select("id, vendor_id, payment_status")
            .eq("id", redemptionId)
            .maybeSingle();

        const redemption = existing as
            | { id: string; vendor_id: string; payment_status: string }
            | null;

        // Not found OR not this vendor's → 404 (never leak another vendor's row).
        if (!redemption || redemption.vendor_id !== vendorId) {
            throw new NotFoundError("redemption not found");
        }

        // Upload both binaries before touching payment_status. If either fails, the
        // payment stays locked.
        const prefix = `${vendorId}/${redemptionId}`;
        const photoPath = `${prefix}/plate-${Date.now()}`;
        const receiptPath = `${prefix}/receipt-${Date.now()}`;

        const photoUp = await admin.storage
            .from(BUCKET)
            .upload(photoPath, photo, { upsert: false, contentType: photo.type || "image/jpeg" });
        if (photoUp.error) {
            // Most likely the bucket does not exist yet (m24 unapplied).
            throw new BadRequestError("proof storage not configured (apply m26)");
        }

        const receiptUp = await admin.storage
            .from(BUCKET)
            .upload(receiptPath, receipt, {
                upsert: false,
                contentType: receipt.type || "image/jpeg",
            });
        if (receiptUp.error) {
            throw new BadRequestError("proof storage not configured (apply m26)");
        }

        const nowIso = new Date().toISOString();
        const { error } = await admin
            .from("token_redemptions")
            .update({
                proof_photo_ref: photoPath,
                proof_receipt_ref: receiptPath,
                proof_uploaded_at: nowIso,
                payment_status: "released",
            })
            .eq("id", redemptionId)
            .eq("vendor_id", vendorId);

        if (error) throw new Error(error.message);

        await audit({
            action: "proof.submit",
            entity_table: "token_redemptions",
            entity_id: redemptionId,
            summary: `proof submitted (photo + receipt); payment released for redemption ${redemptionId}`,
            metadata: {
                proof_photo_ref: photoPath,
                proof_receipt_ref: receiptPath,
            },
        });

        return { redemption_id: redemptionId, payment_status: "released" };
    }
);
