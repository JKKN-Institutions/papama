import { defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    mealWindowCreateRequestSchema,
    type MealWindowResponse,
} from "@/lib/validation/schemas";

/**
 * Meal-window admin API (addon #1) — the per-slot serving windows the redemption
 * engine enforces when `meal_window_enforcement_enabled` is on. Multi-level: a
 * NULL vendor_id row is the GLOBAL default for a slot; a vendor_id row overrides
 * the global window for that vendor.
 *
 * READS are gated by `token_redemption/read` — these windows ARE redemption rules
 * (matches the adminSections nav cell), and the table's RLS lets any authenticated
 * role read. WRITES are gated by `audit_reports/{create,update,delete}` (admin
 * only — the table's RLS is admin-write), so a non-admin can view but not change
 * the windows. Mutations run on the service-role client AFTER the matrix check.
 */

/**
 * GET /api/admin/meal-windows — every configured window (global + per-vendor),
 * newest first, with the vendor name resolved for per-vendor overrides.
 */
export const GET = defineRoute({ feature: "token_redemption", action: "read" }, async () => {
    const admin = createAdminClient();

    const { data, error } = await admin
        .from("meal_windows")
        .select("id, meal_type, vendor_id, start_time, end_time, is_active, created_at, updated_at")
        .order("vendor_id", { ascending: true, nullsFirst: true })
        .order("start_time", { ascending: true });

    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Resolve per-vendor overrides to a readable name (raw vendor_id is opaque).
    const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean) as string[])];
    const nameById = new Map<string, string>();
    if (vendorIds.length > 0) {
        const { data: vendors } = await admin
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds);
        for (const v of (vendors ?? []) as { id: string; name: string }[]) {
            nameById.set(v.id, v.name);
        }
    }

    const windows: MealWindowResponse[] = rows.map((r) => ({
        id: r.id,
        meal_type: r.meal_type,
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_id ? nameById.get(r.vendor_id) ?? null : null,
        start_time: r.start_time,
        end_time: r.end_time,
        is_active: r.is_active,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }));

    return { windows, total: windows.length };
});

/**
 * POST /api/admin/meal-windows — create one serving window (admin only). A null/
 * omitted vendor_id creates a global default; a vendor_id creates a per-vendor
 * override. start < end is enforced by the schema AND the DB CHECK.
 */
export const POST = defineRoute({ feature: "audit_reports", action: "create" }, async ({ req, audit }) => {
    const body = await parseBody(req, mealWindowCreateRequestSchema);
    const admin = createAdminClient();

    const { data, error } = await admin
        .from("meal_windows")
        .insert({
            meal_type: body.meal_type,
            vendor_id: body.vendor_id ?? null,
            start_time: body.start_time,
            end_time: body.end_time,
            is_active: body.is_active ?? true,
        })
        .select("id, meal_type, vendor_id, start_time, end_time, is_active, created_at, updated_at")
        .single();

    if (error || !data) throw new Error(error?.message ?? "failed to create meal window");

    await audit({
        action: "meal_window.create",
        entity_table: "meal_windows",
        entity_id: data.id,
        summary: `${data.meal_type} window ${data.start_time}–${data.end_time}${
            data.vendor_id ? " (vendor override)" : " (global)"
        }, ${data.is_active ? "active" : "inactive"}`,
        metadata: {
            meal_type: data.meal_type,
            vendor_id: data.vendor_id,
            start_time: data.start_time,
            end_time: data.end_time,
            is_active: data.is_active,
        },
    });

    return { window: data };
});
