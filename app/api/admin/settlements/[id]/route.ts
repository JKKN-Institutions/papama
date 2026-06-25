import { defineRoute, NotFoundError } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/settlements/[id] — one settlement header + its line items, each
 * resolved to the redemption it pays for (contract §8). Powers the settlement
 * DetailDrawer so an admin can see WHAT a payout is made of — the rolled-up
 * redemptions, the per-line amounts, and the payout math reconciling to the
 * header `amount` — before locking/paying. Gated by `vendor_settlement/read`.
 */
export const GET = defineRoute<{ id: string }>(
    { feature: "vendor_settlement", action: "read" },
    async ({ params }) => {
        const admin = createAdminClient();
        const id = params.id;

        const { data: s, error } = await admin
            .from("vendor_settlements")
            .select(
                "id, vendor_id, period, status, period_start, period_end, amount, line_item_count, settled_at, notes, on_hold, hold_note, created_at"
            )
            .eq("id", id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!s) throw new NotFoundError("settlement not found");

        const { data: vendor } = await admin
            .from("vendors")
            .select("name")
            .eq("id", s.vendor_id)
            .maybeSingle();

        const { data: lines, error: lineError } = await admin
            .from("settlement_line_items")
            .select("id, redemption_id, amount_inr, created_at")
            .eq("settlement_id", id)
            .order("created_at", { ascending: true });
        if (lineError) throw new Error(lineError.message);

        // Resolve each line's redemption (menu value / difference / co-pay) in one batch.
        const redemptionIds = (lines ?? []).map((l) => l.redemption_id).filter(Boolean) as string[];
        const redemptionById = new Map<string, Record<string, unknown>>();
        if (redemptionIds.length > 0) {
            const { data: reds } = await admin
                .from("token_redemptions")
                .select("id, token_value_inr, menu_value_inr, difference_paid_inr, co_pay_inr, redeemed_at")
                .in("id", redemptionIds);
            for (const r of (reds ?? []) as { id: string }[]) redemptionById.set(r.id, r);
        }

        const lineRows = (lines ?? []).map((l) => {
            const r = redemptionById.get(l.redemption_id as string) ?? {};
            return {
                line_id: l.id,
                redemption_id: l.redemption_id,
                amount_inr: Number(l.amount_inr),
                redeemed_at: (r.redeemed_at as string) ?? null,
                menu_value_inr: (r.menu_value_inr as number) ?? null,
                difference_paid_inr: (r.difference_paid_inr as number) ?? null,
                co_pay_inr: (r.co_pay_inr as number) ?? null,
            };
        });
        const payoutTotal = lineRows.reduce((sum, l) => sum + l.amount_inr, 0);

        return {
            settlement: {
                settlement_id: s.id,
                vendor_id: s.vendor_id,
                vendor_name: vendor?.name ?? null,
                period: s.period,
                amount: Number(s.amount),
                status: s.status,
                on_hold: s.on_hold ?? false,
                hold_note: s.hold_note ?? null,
                line_items: s.line_item_count,
                period_start: s.period_start ?? null,
                period_end: s.period_end ?? null,
                settled_at: s.settled_at,
                created_at: s.created_at,
            },
            lines: lineRows,
            payout_total: payoutTotal,
        };
    }
);
