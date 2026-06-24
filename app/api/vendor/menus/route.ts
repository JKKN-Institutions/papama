import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/vendor/menus — the signed-in vendor's own menu items.
 *
 * Gated by `vendor_menu_pricing/read` (scope own). Read through the session
 * (RLS) client; the `vendor_menus_select_own` policy scopes rows to this
 * vendor's outlet. Includes the special-care equivalent flags + approval_status
 * so the till UI can show which items a special-care token may redeem against.
 */
export const GET = defineRoute(
    { feature: "vendor_menu_pricing", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("vendor_menus")
            .select(
                "id, vendor_id, item_name, price, nutrition_category, is_special_care_equivalent, special_care_equivalent_approved, approval_status, created_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        const menus = (data ?? []).map((m) => ({
            ...m,
            price: Math.round(Number(m.price)),
        }));

        return { menus, total: menus.length };
    }
);
