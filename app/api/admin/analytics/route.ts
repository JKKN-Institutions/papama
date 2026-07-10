import { defineRoute } from "@/lib/api/handler";
import { getAnalytics } from "@/lib/services/analytics";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/analytics — rolled-up platform analytics (addon2 A1): meals
 * served, donation trends, vendor performance, token utilisation, financial and
 * fraud summaries, plus city / beneficiary-category breakdowns.
 *
 * Gated by `audit_reports/read` (admin + compliance) — same cell as reports /
 * system-config. Aggregation runs on the service-role client (reads across
 * vendors/beneficiaries/settlements the caller's own RLS would scope out); the
 * matrix check above is the authorization gate.
 */
export const GET = defineRoute({ feature: "analytics_dashboard", action: "read" }, async () => {
    const admin = createAdminClient();
    const analytics = await getAnalytics(admin);
    return { analytics };
});
