import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";

/**
 * POST /api/admin/beneficiary-registrations/[id]/decide — admin approval (BEN-4).
 *
 * Gated by `beneficiary_registration/update` (admin only; volunteers may submit
 * but never approve). APPROVE creates the eligible `beneficiaries` row (status
 * active, eligibility verified) with category-driven auto-expiry — pregnancy →
 * now + `special_care_post_delivery_months` (config, unset → no expiry, never
 * guessed); patient → an optional explicit `eligibility_expires_at`; disability/
 * disaster-affected → no expiry — and links it back to the registration. REJECT
 * just stamps the registration. Idempotent guard: only `pending` may be decided.
 */

const decideSchema = z.object({
    decision: z.enum(["approve", "reject"]),
    review_notes: z.string().trim().max(500).optional(),
    /** Optional explicit eligibility expiry (e.g. a patient's treatment-end date), ISO. */
    eligibility_expires_at: z.string().datetime().optional(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "beneficiary_registration", action: "update" },
    async ({ req, params, user, audit }) => {
        const body = await parseBody(req, decideSchema);
        const admin = createAdminClient();

        const { data: reg, error: regErr } = await admin
            .from("beneficiary_registrations")
            .select("id, full_name, category, face_hash, face_embedding, aadhaar_hash, registration_status")
            .eq("id", params.id)
            .maybeSingle();
        if (regErr) throw new Error(regErr.message);
        if (!reg) throw new NotFoundError("registration not found");
        if (reg.registration_status !== "pending") {
            throw new BadRequestError(`registration already ${reg.registration_status}`);
        }

        const nowIso = new Date().toISOString();

        // --- Reject -----------------------------------------------------------
        if (body.decision === "reject") {
            const { error } = await admin
                .from("beneficiary_registrations")
                .update({
                    registration_status: "rejected",
                    reviewed_by: user.id,
                    review_notes: body.review_notes ?? null,
                    updated_at: nowIso,
                })
                .eq("id", params.id);
            if (error) throw new Error(error.message);

            await audit({
                action: "beneficiary.reject",
                entity_table: "beneficiary_registrations",
                entity_id: params.id,
                summary: `rejected ${reg.category} registration`,
                metadata: { notes: body.review_notes ?? null },
            });
            return { id: params.id, status: "rejected", beneficiary_id: null };
        }

        // --- Approve: compute auto-expiry then create the beneficiary ---------
        let expiresAt: string | null = body.eligibility_expires_at ?? null;
        if (expiresAt == null && reg.category === "pregnant_women") {
            try {
                const months = await getNumber("special_care_post_delivery_months", admin as never);
                const d = new Date();
                d.setMonth(d.getMonth() + months);
                expiresAt = d.toISOString();
            } catch {
                // config unset — leave open-ended (no guessed window).
            }
        }

        const { data: benef, error: benefErr } = await admin
            .from("beneficiaries")
            .insert({
                full_name: reg.full_name,
                category: reg.category,
                eligibility_status: "verified",
                face_hash: reg.face_hash,
                face_embedding: reg.face_embedding, // carry the enrolled vector for 1:1 redemption match
                aadhaar_hash: reg.aadhaar_hash,
                eligibility_expires_at: expiresAt,
                registered_by: user.id,
                status: "active",
            })
            .select("id")
            .single();
        if (benefErr || !benef) throw new Error(benefErr?.message ?? "failed to create beneficiary");
        const beneficiaryId = (benef as { id: string }).id;

        const { error: linkErr } = await admin
            .from("beneficiary_registrations")
            .update({
                registration_status: "approved",
                reviewed_by: user.id,
                review_notes: body.review_notes ?? null,
                beneficiary_id: beneficiaryId,
                updated_at: nowIso,
            })
            .eq("id", params.id);
        if (linkErr) throw new Error(linkErr.message);

        await audit({
            action: "beneficiary.approve",
            entity_table: "beneficiaries",
            entity_id: beneficiaryId,
            summary: `approved ${reg.category} beneficiary${expiresAt ? ` (eligible until ${expiresAt.slice(0, 10)})` : ""}`,
            metadata: {
                registration_id: params.id,
                category: reg.category,
                eligibility_expires_at: expiresAt,
            },
        });

        return { id: params.id, status: "approved", beneficiary_id: beneficiaryId };
    }
);
