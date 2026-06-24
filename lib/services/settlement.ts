import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Settlement engine (SET-1..4, demo step 7). Aggregates proof-released,
 * not-yet-settled redemptions into one `pending` vendor_settlements row per
 * vendor (plus per-redemption `settlement_line_items`). The admin then walks the
 * existing lock → reconcile → pay lifecycle (PATCH /api/admin/settlements).
 *
 * Payout per redemption = the platform-funded portion of the meal =
 *   min(token_value, menu_value) = menu_value − difference_paid
 * (the beneficiary paid the over-value at the counter; under-value is forfeited;
 * the optional co-pay is a counter-side contribution and is NOT settled here).
 *
 * Idempotent: a redemption already on a line item (unique redemption_id) is never
 * settled twice, so re-running only picks up newly-released redemptions.
 */

export type SettlementPeriod = "daily" | "twice_weekly" | "weekly";

interface ReleasedRedemption {
    id: string;
    vendor_id: string;
    token_value_inr: number;
    menu_value_inr: number;
    difference_paid_inr: number;
    redeemed_at: string;
}

export interface SettlementRunResult {
    settlements_created: number;
    total_amount: number;
    line_items: number;
    vendors: { vendor_id: string; settlement_id: string; amount: number; count: number }[];
    /** Vendors whose settlement failed and was rolled back — the run continues past them. */
    errors: { vendor_id: string; error: string }[];
}

/** Platform-owed amount for one redemption (menu value minus beneficiary's over-pay). */
function payout(r: ReleasedRedemption): number {
    return Math.max(0, r.menu_value_inr - r.difference_paid_inr);
}

/**
 * @param fallbackPeriod cadence used for vendors that have no `settlement_cycle`
 *   set on their profile. Vendors WITH a chosen cycle are settled on THEIR cycle,
 *   honouring the PRD's per-vendor settlement preference.
 */
export async function runSettlement(
    fallbackPeriod: SettlementPeriod,
    admin: SupabaseClient
): Promise<SettlementRunResult> {
    // Proof-released redemptions NOT yet on any settlement line item.
    // Anti-join via PostgREST resource embedding: left-join settlement_line_items
    // and keep only rows where the join produced no match (null settlement_id).
    // This pushes the exclusion into a single SQL LEFT JOIN … WHERE … IS NULL
    // rather than loading the whole settlement_line_items table into JS.
    const { data: redRows, error: redErr } = await admin
        .from("token_redemptions")
        .select(
            "id, vendor_id, token_value_inr, menu_value_inr, difference_paid_inr, redeemed_at," +
            "settlement_line_items(settlement_id)"
        )
        .eq("payment_status", "released")
        .order("redeemed_at", { ascending: true });
    if (redErr) throw new Error(redErr.message);

    // Keep only redemptions that have no matching settlement_line_items row.
    const pending = (
        (redRows as unknown as (ReleasedRedemption & {
            settlement_line_items: { settlement_id: string }[];
        })[]) ?? []
    ).filter((r) => r.settlement_line_items.length === 0);

    // Group by vendor.
    const byVendor = new Map<string, ReleasedRedemption[]>();
    for (const r of pending) {
        const list = byVendor.get(r.vendor_id) ?? [];
        list.push(r);
        byVendor.set(r.vendor_id, list);
    }

    // Resolve each vendor's chosen settlement cycle in one query.
    const vendorIds = [...byVendor.keys()];
    const cycleByVendor = new Map<string, SettlementPeriod>();
    if (vendorIds.length > 0) {
        const { data: vendorRows, error: vErr } = await admin
            .from("vendors")
            .select("id, settlement_cycle")
            .in("id", vendorIds);
        if (vErr) throw new Error(vErr.message);
        for (const v of (vendorRows ?? []) as { id: string; settlement_cycle: string | null }[]) {
            if (v.settlement_cycle) {
                cycleByVendor.set(v.id, v.settlement_cycle as SettlementPeriod);
            }
        }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const result: SettlementRunResult = {
        settlements_created: 0,
        total_amount: 0,
        line_items: 0,
        vendors: [],
        errors: [],
    };

    for (const [vendorId, allReds] of byVendor) {
        // Each vendor is settled independently inside try/catch: a failure is
        // isolated (recorded in `errors`) so it can't abort the whole run, and a
        // half-built settlement is compensated (header deleted).
        try {
            // Honour the vendor's own cycle; fall back to the run's period otherwise.
            const period = cycleByVendor.get(vendorId) ?? fallbackPeriod;

            // Settle ALL of this vendor's proof-released, not-yet-settled
            // redemptions — NOT just those inside the current cadence window. The
            // old window filter permanently stranded any released redemption older
            // than one cycle (e.g. after a vendor outage): such rows never fell into
            // a future window either, so they were never paid. `period` still labels
            // the cadence; period_start/period_end below stamp the span covered.
            const reds = allReds;
            if (reds.length === 0) continue;

            const amount = reds.reduce((s, r) => s + payout(r), 0);

            const { data: settlementRow, error: insErr } = await admin
                .from("vendor_settlements")
                .insert({
                    vendor_id: vendorId,
                    period,
                    period_start: reds[0].redeemed_at, // earliest in-window (ordered asc)
                    period_end: nowIso,
                    amount,
                    line_item_count: reds.length,
                    status: "pending",
                })
                .select("id")
                .single();
            if (insErr || !settlementRow) {
                throw new Error(insErr?.message ?? "failed to create settlement header");
            }
            const settlementId = (settlementRow as { id: string }).id;

            const { error: liErr } = await admin.from("settlement_line_items").insert(
                reds.map((r) => ({
                    settlement_id: settlementId,
                    redemption_id: r.id,
                    amount_inr: payout(r),
                }))
            );
            if (liErr) {
                // Compensating cleanup: drop the just-created header so no empty/half
                // settlement is left behind.
                await admin.from("vendor_settlements").delete().eq("id", settlementId);
                throw new Error(liErr.message);
            }

            result.settlements_created += 1;
            result.total_amount += amount;
            result.line_items += reds.length;
            result.vendors.push({
                vendor_id: vendorId,
                settlement_id: settlementId,
                amount,
                count: reds.length,
            });
        } catch (e) {
            result.errors.push({
                vendor_id: vendorId,
                error: e instanceof Error ? e.message : "settlement failed",
            });
        }
    }

    return result;
}
