import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { requestRefund } from "@/lib/services/refund";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/donor/refund-request — donor self-initiates a refund against an
 * existing, still-open payment_failures row (addon #20). Gated by
 * `refunds_failed_payments/create` scope own. The service writes its own
 * audit row.
 */
export const POST = defineRoute(
    { feature: "refunds_failed_payments", action: "create", scope: "own" },
    async ({ req, user }) => {
        const body = await parseBody(req, refundRequestSchema);
        const admin = createAdminClient();

        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        return requestRefund(
            admin,
            {
                paymentFailureId: body.payment_failure_id,
                donorId,
                amountInr: body.amount_inr,
                reason: body.reason,
            },
            user
        );
    }
);
