import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveVendorId } from "@/lib/vendor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/vendor/redemptions/[id]/proof — submit proof of service (PROOF-1..4).
 *
 * Gated by `proof_of_service/create` (scope own). The vendor uploads the proof
 * references (photo + receipt) for a redemption they own; this records them and
 * flips payment_status 'locked' → 'released' so the redemption can roll into a
 * settlement. Ownership is verified server-side (the redemption's vendor_id must
 * match the resolved vendor) — a vendor cannot release someone else's payment.
 *
 * Proof refs are text for now (storage keys). Once the m22 storage bucket is
 * applied, a separate upload route will produce real binary refs to pass here.
 */
const proofSchema = z.object({
    proof_photo_ref: z.string().min(1).optional(),
    proof_receipt_ref: z.string().min(1).optional(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "proof_of_service", action: "create", scope: "own" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, proofSchema);
        const redemptionId = params.id;

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

        const nowIso = new Date().toISOString();
        const { error } = await admin
            .from("token_redemptions")
            .update({
                proof_photo_ref: body.proof_photo_ref ?? null,
                proof_receipt_ref: body.proof_receipt_ref ?? null,
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
            summary: `proof submitted; payment released for redemption ${redemptionId}`,
            metadata: {
                proof_photo_ref: body.proof_photo_ref ?? null,
                proof_receipt_ref: body.proof_receipt_ref ?? null,
            },
        });

        return { redemption_id: redemptionId, payment_status: "released" };
    }
);
