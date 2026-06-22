import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { SettlementResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/settlements — vendor settlement headers (contract §8).
 *
 * Gated by `vendor_settlement/read` (admin, compliance, vendor_manager). These
 * are HEADER-ONLY records (M10): `amount`/`line_items` stay 0 until the
 * settlement_line_items work lands (Section-A-blocked). `amount` is numeric in
 * the DB, returned as a JS number. Newest period first.
 */
export const GET = defineRoute({ feature: "vendor_settlement", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("vendor_settlements")
        .select("id, vendor_id, period, amount, status, line_item_count, settled_at, created_at")
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const settlements: SettlementResponse[] = (data ?? []).map((s) => ({
        settlement_id: s.id,
        vendor_id: s.vendor_id,
        period: s.period,
        amount: Number(s.amount),
        status: s.status,
        line_items: s.line_item_count,
        settled_at: s.settled_at,
    }));

    return { settlements, total: settlements.length };
});
