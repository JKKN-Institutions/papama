import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/vendor-capacity — vendor availability + today's served counts
 * for the admin console (addon #4).
 *
 * Gated by `vendor_management/read`. Runs on the session (RLS) client; the
 * vendor_capacity_usage staff-read policy scopes the usage rows. Merges each
 * vendor's availability columns with today's usage row (if any).
 */
function todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const GET = defineRoute({ feature: "vendor_management", action: "read" }, async () => {
    const supabase = await createClient();

    const [{ data: vendorData, error: vendorErr }, { data: usageData, error: usageErr }] =
        await Promise.all([
            supabase
                .from("vendors")
                .select("id, name, status, is_open, stock_exhausted, temporary_closure_until, daily_meal_capacity")
                .order("name", { ascending: true }),
            supabase
                .from("vendor_capacity_usage")
                .select("vendor_id, meals_served")
                .eq("usage_date", todayIso()),
        ]);

    if (vendorErr) throw new Error(vendorErr.message);
    // usage table may be empty / not yet migrated — tolerate.
    const servedByVendor = new Map<string, number>();
    if (!usageErr && usageData) {
        for (const u of usageData as { vendor_id: string; meals_served: number }[]) {
            servedByVendor.set(u.vendor_id, u.meals_served);
        }
    }

    const vendors = ((vendorData as Record<string, unknown>[] | null) ?? []).map((v) => {
        const id = v.id as string;
        const cap = v.daily_meal_capacity != null ? Number(v.daily_meal_capacity) : null;
        const served = servedByVendor.get(id) ?? 0;
        return {
            vendor_id: id,
            name: v.name as string,
            status: v.status as string,
            is_open: (v.is_open as boolean | null) ?? true,
            stock_exhausted: (v.stock_exhausted as boolean | null) ?? false,
            temporary_closure_until: (v.temporary_closure_until as string | null) ?? null,
            daily_meal_capacity: cap,
            served_today: served,
            remaining_today: cap == null ? null : Math.max(0, cap - served),
        };
    });

    return { vendors, total: vendors.length };
});
