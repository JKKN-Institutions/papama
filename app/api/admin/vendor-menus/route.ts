import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/vendor-menus — staff review queue of all vendor menu items
 * (contract: vendor_menu_pricing read → admin / compliance / vendor_manager).
 *
 * Gated by `vendor_menu_pricing/read`. Runs on the service-role client (staff
 * read across all vendors) and joins the owning vendor's name with a second
 * lookup (no FK embed needed). Never null body — empty list on no rows.
 */
export const GET = defineRoute(
    { feature: "vendor_menu_pricing", action: "read" },
    async () => {
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("vendor_menus")
            .select(
                "id, vendor_id, item_name, price, nutrition_category, is_special_care_equivalent, special_care_equivalent_approved, approval_status, created_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        const rows = data ?? [];

        // Resolve vendor names in one lookup over the distinct vendor ids.
        const vendorIds = [...new Set(rows.map((r) => r.vendor_id as string))];
        const nameById = new Map<string, string>();
        if (vendorIds.length > 0) {
            const { data: vendors, error: vendorError } = await admin
                .from("vendors")
                .select("id, name")
                .in("id", vendorIds);
            if (vendorError) throw new Error(vendorError.message);
            for (const v of vendors ?? []) {
                nameById.set(v.id as string, v.name as string);
            }
        }

        const menus = rows.map((m) => ({
            id: m.id,
            vendor_id: m.vendor_id,
            vendor_name: nameById.get(m.vendor_id as string) ?? null,
            item_name: m.item_name,
            price: Math.round(Number(m.price)),
            nutrition_category: m.nutrition_category,
            is_special_care_equivalent: m.is_special_care_equivalent,
            special_care_equivalent_approved: m.special_care_equivalent_approved,
            approval_status: m.approval_status,
            created_at: m.created_at,
        }));

        return { menus, total: menus.length };
    }
);
