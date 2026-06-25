import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
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
            .select("id, vendor_id, proof_status, payment_status")
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

        return {
            redemption_id: data.id,
            proof_status: data.proof_status,
            payment_status: data.payment_status,
        };
    }
);
