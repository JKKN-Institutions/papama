import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vendor daily-capacity service (addon #4).
 *
 * A vendor may set `vendors.daily_meal_capacity`; the redemption engine throttles
 * redemptions once today's served count reaches it (only when
 * `vendor_capacity_enforcement_enabled` is on — that gate lives in
 * lib/services/redemption.ts, not here). This module owns the per-day counter
 * (public.vendor_capacity_usage) and the remaining-capacity read.
 *
 * Both functions take the SERVICE-ROLE (admin) client: incrementUsage is a
 * best-effort post-burn write on the redemption hot path (RLS would otherwise
 * scope it), and getRemainingCapacity is used by server routes after their own
 * permission check.
 */

/** Local YYYY-MM-DD for "today" in the server's timezone (matches current_date). */
function todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface RemainingCapacity {
    /** The configured cap, or null when the vendor is uncapped. */
    capacity: number | null;
    /** Meals served today. */
    served: number;
    /** capacity - served (>= 0), or null when uncapped. */
    remaining: number | null;
}

/**
 * Read a vendor's remaining daily capacity. Returns capacity=null/remaining=null
 * when the vendor has no cap configured (uncapped). Tolerant of the addon
 * migration not yet being applied — missing columns/table degrade to uncapped.
 */
export async function getRemainingCapacity(
    vendorId: string,
    admin: SupabaseClient
): Promise<RemainingCapacity> {
    let capacity: number | null = null;
    const { data: vendorRow, error: vendorErr } = await admin
        .from("vendors")
        .select("daily_meal_capacity")
        .eq("id", vendorId)
        .maybeSingle();
    if (!vendorErr && vendorRow) {
        const raw = (vendorRow as { daily_meal_capacity: number | null }).daily_meal_capacity;
        capacity = typeof raw === "number" ? raw : null;
    }

    let served = 0;
    const { data: usageRow, error: usageErr } = await admin
        .from("vendor_capacity_usage")
        .select("meals_served")
        .eq("vendor_id", vendorId)
        .eq("usage_date", todayIso())
        .maybeSingle();
    if (!usageErr && usageRow) {
        served = (usageRow as { meals_served: number | null }).meals_served ?? 0;
    }

    const remaining = capacity == null ? null : Math.max(0, capacity - served);
    return { capacity, served, remaining };
}

/**
 * Atomically bump today's served count by one and return the new total (or null
 * if the write could not be performed). Uses the SQL upsert RPC
 * `increment_vendor_capacity_usage` so concurrent redemptions never lose a
 * count. Best-effort: callers on the redemption hot path swallow failures.
 */
export async function incrementUsage(
    vendorId: string,
    admin: SupabaseClient
): Promise<number | null> {
    const { data, error } = await admin.rpc("increment_vendor_capacity_usage", {
        p_vendor_id: vendorId,
    });
    if (error) throw new Error(error.message);
    return typeof data === "number" ? data : null;
}
