import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/vendor/settlements — the signed-in vendor's own settlement headers.
 *
 * Gated by `vendor_settlement/read` (scope own). Read through the session (RLS)
 * client; the `vendor_settlements` own-vendor select policy scopes rows to this
 * outlet. May be empty until the admin runs a settlement cycle. Read-only — a
 * vendor never mutates a settlement.
 */
export const GET = defineRoute(
    { feature: "vendor_settlement", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("vendor_settlements")
            .select("id, period, status, period_start, period_end, amount, line_item_count, settled_at, created_at")
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        const settlements = (data ?? []).map((s) => ({
            ...s,
            amount: Number(s.amount),
        }));

        return { settlements, total: settlements.length };
    }
);
