import { z } from "zod";

import { defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSettlement } from "@/lib/services/settlement";

/**
 * POST /api/admin/settlements/run — run a settlement cycle (SET-1..4, demo step 7).
 *
 * Gated by `vendor_settlement/create` (admin). Aggregates every proof-released,
 * not-yet-settled redemption into one `pending` vendor_settlements row per vendor
 * (+ settlement_line_items), then the admin walks the existing lock→reconcile→pay
 * lifecycle. Idempotent: already-settled redemptions are skipped. One audit row
 * per created settlement.
 */
const runSchema = z.object({
    period: z.enum(["daily", "twice_weekly", "weekly"]),
});

export const POST = defineRoute(
    { feature: "vendor_settlement", action: "create" },
    async ({ req, audit }) => {
        const body = await parseBody(req, runSchema);
        const admin = createAdminClient();

        const result = await runSettlement(body.period, admin);

        for (const v of result.vendors) {
            await audit({
                action: "settlement.run",
                entity_table: "vendor_settlements",
                entity_id: v.settlement_id,
                summary: `ran ${body.period} settlement for vendor ${v.vendor_id}: ₹${v.amount} over ${v.count} redemption(s)`,
                metadata: { period: body.period, vendor_id: v.vendor_id, amount: v.amount, count: v.count },
            });
        }

        return {
            settlements_created: result.settlements_created,
            total_amount: result.total_amount,
            line_items: result.line_items,
            vendors: result.vendors,
            errors: result.errors, // vendors skipped + rolled back (run does not abort on one failure)
        };
    }
);
