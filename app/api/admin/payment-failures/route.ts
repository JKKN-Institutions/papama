import { defineRoute, parseBody } from "@/lib/api/handler";
import { logPaymentFailure } from "@/lib/services/refund";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { paymentFailureCreateRequestSchema } from "@/lib/validation/schemas";

/**
 * GET/POST /api/admin/payment-failures — admin-logged failed/duplicate
 * payments (spec §3.1 F-10 [M2-4], addon #14). Phase 1 has no live gateway
 * webhook (ASSUMPTIONS.md, client Q17), so this is a manual reconciliation
 * entry point. Gated by `refunds_failed_payments` (admin CRUD, compliance
 * read-only). The service writes its own audit row on POST.
 */
export const GET = defineRoute({ feature: "refunds_failed_payments", action: "read" }, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("payment_failures")
        .select(
            "id, donation_id, donor_id, amount_inr, reason, retry_count, max_retries, status, notes, created_at, resolved_at"
        )
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);
    return { payment_failures: data ?? [] };
});

export const POST = defineRoute(
    { feature: "refunds_failed_payments", action: "create" },
    async ({ req, user }) => {
        const body = await parseBody(req, paymentFailureCreateRequestSchema);
        const admin = createAdminClient();

        return logPaymentFailure(
            admin,
            {
                donationId: body.donation_id ?? null,
                donorId: body.donor_id,
                amountInr: body.amount_inr,
                reason: body.reason,
                maxRetries: body.max_retries ?? null,
                notes: body.notes ?? null,
            },
            user
        );
    }
);
