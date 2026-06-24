import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanVendorAnomalies } from "@/lib/services/fraud";

/**
 * POST /api/admin/fraud/scan — run the vendor volume-anomaly sweep (SEC, demo
 * step 9). Gated by `fraud_monitoring/create` (admin). Flags vendors whose
 * redemptions today are statistical outliers; de-duplicated against open flags.
 * Repeat-beneficiary and duplicate-token signals are raised in real time by the
 * redemption route, so the dashboard fills both live and on-demand.
 */
export const POST = defineRoute(
    { feature: "fraud_monitoring", action: "create" },
    async ({ audit }) => {
        const admin = createAdminClient();
        const created = await scanVendorAnomalies(admin);

        if (created > 0) {
            await audit({
                action: "fraud.scan",
                entity_table: "fraud_flags",
                entity_id: "vendor_anomaly_sweep",
                summary: `vendor anomaly sweep raised ${created} flag(s)`,
                metadata: { flags_created: created },
            });
        }

        return { flags_created: created };
    }
);
