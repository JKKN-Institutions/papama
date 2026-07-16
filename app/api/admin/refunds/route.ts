import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/refunds — list refund requests (admin/compliance; a donor's
 * own rows are visible too via RLS, but this route is mounted under /admin
 * for staff use). Gated by `refunds_failed_payments/read`.
 */
export const GET = defineRoute({ feature: "refunds_failed_payments", action: "read" }, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("refunds")
        .select(
            "id, donor_id, payment_failure_id, amount_inr, reason, requested_by, status, decided_by, decided_at, decision_note, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);
    return { refunds: data ?? [] };
});
