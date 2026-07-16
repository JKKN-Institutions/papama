import { defineRoute, parseBody } from "@/lib/api/handler";
import { decideRefund } from "@/lib/services/refund";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundDecisionRequestSchema } from "@/lib/validation/schemas";

/**
 * PATCH /api/admin/refunds/[id] — admin approve/reject a pending refund
 * request (addon #14/#20). Approve reverses credit via refundCredit()
 * (posting the donation-ledger reversal, addon #18) and resolves the
 * underlying payment_failure; compliance stays read-only per the matrix, so
 * this is admin-only. The service writes its own audit row.
 */
export const PATCH = defineRoute<{ id: string }>(
    { feature: "refunds_failed_payments", action: "update" },
    async ({ req, user, params }) => {
        const body = await parseBody(req, refundDecisionRequestSchema);
        const admin = createAdminClient();

        const result = await decideRefund(admin, params.id, body.decision, user, body.note ?? null);
        return { ...result };
    }
);
