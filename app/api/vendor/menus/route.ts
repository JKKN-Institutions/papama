import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveVendorId } from "@/lib/vendor/server-identity";

/**
 * GET + POST /api/vendor/menus — the signed-in vendor lists / proposes their own
 * menu items.
 *
 * GET is gated by `vendor_menu_pricing/read` (own), POST by `.../create` (own).
 * Read + insert run on the session (RLS) client; the `vendor_menus_select_own` /
 * `vendor_menus_insert_own` policies scope rows to this vendor's outlet, and the
 * DB `guard_menu_controlled_cols` trigger keeps the vendor from setting the
 * approval columns (approval_status / special_care_equivalent_approved) — those
 * stay 'pending'/false until staff decide. The GET payload exposes the
 * special-care equivalent flags + approval_status so the till UI can show which
 * items a special-care token may redeem against.
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

/** A vendor-proposed menu item. Approval columns are DB-controlled, not here. */
const menuCreateSchema = z
    .object({
        item_name: z.string().trim().min(1, "item_name is required"),
        price: z.number().nonnegative("price must be ≥ 0"),
        nutrition_category: z.string().trim().nullable().optional(),
        is_special_care_equivalent: z.boolean().optional(),
    })
    .strict();

export const POST = defineRoute(
    { feature: "vendor_menu_pricing", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, menuCreateSchema);

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        // Session client → vendor_menus_insert_own + guard_menu_controlled_cols.
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("vendor_menus")
            .insert({
                vendor_id: vendorId,
                item_name: body.item_name,
                price: body.price,
                nutrition_category: body.nutrition_category ?? null,
                is_special_care_equivalent: body.is_special_care_equivalent ?? false,
            })
            .select("id")
            .single();

        if (error || !data) throw new Error(error?.message ?? "failed to add menu item");

        await audit({
            action: "vendor.menu.create",
            entity_table: "vendor_menus",
            entity_id: data.id as string,
            summary: `vendor proposed menu item '${body.item_name}'`,
            metadata: { vendor_id: vendorId, price: body.price },
        });

        return { id: data.id };
    }
);
