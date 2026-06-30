import { z } from "zod";

import { BadRequestError, parseBody, toErrorResponse } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordFeedback, autoSuspendBelowThreshold } from "@/lib/services/vendorRating";

/**
 * POST /api/beneficiary/feedback — PUBLIC beneficiary feedback on a vendor (addon #9).
 *
 * Beneficiaries are largely non-app users (see m05 / the public beneficiary
 * self-registration route), so this is a hand-written PUBLIC POST on the
 * service-role client — the same shape as /api/beneficiary/register: no session
 * required, no defineRoute (which would 401 a guest). The vendor_feedback RLS
 * (create-by-own-beneficiary + staff read) still governs any direct/authenticated
 * access; this server route is the mediated public path.
 *
 * It records the feedback, recomputes the vendor's rating_avg/quality_score, and
 * then runs the auto-suspend check — which is a NO-OP unless an admin has both
 * enabled `vendor_auto_suspend_enabled` and configured the thresholds.
 */
const schema = z.object({
    vendor_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    is_complaint: z.boolean().optional(),
    // Optional links proving the feedback ties to a real visit / identity.
    redemption_id: z.string().uuid().optional(),
    beneficiary_id: z.string().uuid().optional(),
});

export async function POST(req: Request) {
    try {
        const body = await parseBody(req as never, schema);
        const admin = createAdminClient();

        // Guard against feedback for a non-existent vendor.
        const { data: vendor, error: vendorErr } = await admin
            .from("vendors")
            .select("id")
            .eq("id", body.vendor_id)
            .maybeSingle();
        if (vendorErr) throw new Error(vendorErr.message);
        if (!vendor) throw new BadRequestError("vendor not found");

        const { feedback_id } = await recordFeedback(admin, {
            vendor_id: body.vendor_id,
            rating: body.rating,
            comment: body.comment ?? null,
            is_complaint: body.is_complaint ?? false,
            redemption_id: body.redemption_id ?? null,
            beneficiary_id: body.beneficiary_id ?? null,
        });

        // Best-effort: an auto-suspend evaluation must never fail the feedback write.
        let autoSuspend: { suspended: boolean; reason: string } | null = null;
        try {
            autoSuspend = await autoSuspendBelowThreshold(admin, body.vendor_id);
        } catch (e) {
            console.error("feedback: auto-suspend check failed", e);
        }

        return new Response(
            JSON.stringify({ id: feedback_id, auto_suspended: autoSuspend?.suspended ?? false }),
            { status: 200, headers: { "content-type": "application/json" } }
        );
    } catch (err) {
        return toErrorResponse(err);
    }
}
