import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { getTransparencyStats } from "@/lib/services/transparency";

/**
 * GET /api/admin/transparency — admin view of the public transparency dashboard
 * (addon #14). Gated by `audit_reports/read` (admin, compliance). Returns the
 * same aggregate stats as the public route PLUS the published flag, so the admin
 * can preview the numbers even while the public dashboard is switched off. No PII.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const admin = createAdminClient();

    let enabled = false;
    try {
        enabled = await getBoolean("transparency_dashboard_enabled", admin as never);
    } catch {
        enabled = false;
    }

    const stats = await getTransparencyStats(admin);
    return { enabled, stats };
});
