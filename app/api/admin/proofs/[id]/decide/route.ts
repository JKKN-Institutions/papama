import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/proofs/[id]/decide — admin verdict on a submitted proof
 * (proof_of_service/update).
 *
 * This is the gate the settlement loop was missing: a redemption's payment stays
 * 'locked' after the vendor uploads proof, and only an APPROVE here releases it.
 *   - approve → proof_status='approved', payment_status 'locked' → 'released'
 *               (the settlement engine then picks it up).
 *   - reject  → proof_status='rejected' + a required note; payment STAYS 'locked'
 *               so the meal is never paid on bad evidence. The vendor may re-upload,
 *               which clears the rejection and starts a fresh review.
 *
 * Only a redemption currently `proof_status='submitted'` may be decided; the
 * UPDATE is CAS-guarded on that so two admins can't double-decide. Every verdict
 * is audited (the reviewer + note live in the trail and on the row).
 */
const decideSchema = z
    .object({
        decision: z.enum(["approve", "reject"]),
        note: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((b) => b.decision !== "reject" || (b.note && b.note.length > 0), {
        message: "a note explaining the rejection is required",
        path: ["note"],
    });

export const PATCH = defineRoute<{ id: string }>(
    { feature: "proof_of_service", action: "update" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, decideSchema);
        const admin = createAdminClient();

        const { data: current, error: fetchError } = await admin
            .from("token_redemptions")
            .select(
                "id, vendor_id, proof_status, payment_status, token_id, beneficiary_id, menu_value_inr, redeemed_at, proof_photo_ref"
            )
            .eq("id", params.id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!current) throw new NotFoundError("redemption not found");
        if (current.proof_status !== "submitted") {
            throw new BadRequestError(
                `proof is '${current.proof_status ?? "not submitted"}', not awaiting review`
            );
        }

        const nowIso = new Date().toISOString();
        const update: Record<string, unknown> =
            body.decision === "approve"
                ? {
                      proof_status: "approved",
                      proof_reviewed_by: user.id,
                      proof_reviewed_at: nowIso,
                      proof_review_note: body.note ?? null,
                      // Releasing the locked payment is the whole point of approval.
                      payment_status: "released",
                  }
                : {
                      proof_status: "rejected",
                      proof_reviewed_by: user.id,
                      proof_reviewed_at: nowIso,
                      proof_review_note: body.note,
                      // payment_status intentionally left 'locked' — a rejected proof
                      // must never be payable.
                  };

        const { data, error } = await admin
            .from("token_redemptions")
            .update(update)
            .eq("id", params.id)
            .eq("proof_status", "submitted") // CAS: lose cleanly if decided concurrently
            .select("id, proof_status, payment_status")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new BadRequestError("proof was decided concurrently");

        await audit({
            action: `proof.${body.decision}`,
            entity_table: "token_redemptions",
            entity_id: params.id,
            summary:
                body.decision === "approve"
                    ? `proof approved; payment released for redemption ${params.id}`
                    : `proof rejected for redemption ${params.id} (${body.note})`,
            metadata: {
                decision: body.decision,
                note: body.note ?? null,
                vendor_id: current.vendor_id,
            },
        });

        // Donor transparency (addon2 A5): once the proof is APPROVED the meal photo
        // is verified, so notify the funding donor with a signed photo URL + the
        // token reference. Best-effort — a notification failure must never undo the
        // approval/payment release above.
        if (body.decision === "approve") {
            try {
                await notifyDonorMealPhoto(admin, {
                    redemptionId: params.id,
                    tokenId: current.token_id as string,
                    vendorId: current.vendor_id as string,
                    beneficiaryId: (current.beneficiary_id as string | null) ?? null,
                    menuValue: current.menu_value_inr as number,
                    redeemedAt: current.redeemed_at as string,
                    proofPhotoRef: (current.proof_photo_ref as string | null) ?? null,
                });
            } catch (err) {
                console.error("[proofs] meal-photo donor notification failed:", err);
            }
        }

        return {
            redemption_id: data.id,
            proof_status: data.proof_status,
            payment_status: data.payment_status,
        };
    }
);

const PROOF_BUCKET = "vendor-proofs";
const PHOTO_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Send the donor who funded a token the verified meal photo + transparency detail
 * (addon2 A5). Reuses the redemption metadata shape so the donor UI can render it;
 * the meal photo is a short-lived signed URL over the private vendor-proofs bucket.
 */
async function notifyDonorMealPhoto(
    admin: ReturnType<typeof createAdminClient>,
    r: {
        redemptionId: string;
        tokenId: string;
        vendorId: string;
        beneficiaryId: string | null;
        menuValue: number;
        redeemedAt: string;
        proofPhotoRef: string | null;
    }
): Promise<void> {
    const { data: token } = await admin
        .from("tokens")
        .select("donor_id, serial_number")
        .eq("id", r.tokenId)
        .maybeSingle();
    if (!token?.donor_id) return; // no funding donor to notify (e.g. guest-pool token)

    const { data: vendor } = await admin
        .from("vendors")
        .select("name, city")
        .eq("id", r.vendorId)
        .maybeSingle();

    let category: string | null = null;
    if (r.beneficiaryId) {
        const { data: b } = await admin
            .from("beneficiaries")
            .select("category")
            .eq("id", r.beneficiaryId)
            .maybeSingle();
        category = (b?.category as string | null) ?? null;
    }

    let mealPhotoUrl: string | null = null;
    if (r.proofPhotoRef) {
        const { data: signed } = await admin.storage
            .from(PROOF_BUCKET)
            .createSignedUrl(r.proofPhotoRef, PHOTO_URL_TTL_SECONDS);
        mealPhotoUrl = signed?.signedUrl ?? null;
    }

    await dispatchNotification(admin, {
        donorId: token.donor_id as string,
        kind: "meal_photo",
        title: "The meal you funded is confirmed",
        message: `The meal you funded at ${vendor?.name ?? "a partner vendor"} has been verified. Here's the photo.`,
        metadata: {
            vendor_name: vendor?.name ?? null,
            location: vendor?.city ?? null,
            time: r.redeemedAt,
            redeemed_at: r.redeemedAt,
            value_inr: r.menuValue,
            beneficiary_category: category,
            token_reference: (token.serial_number as string | null) ?? null,
            meal_photo_url: mealPhotoUrl,
        },
    });
}
