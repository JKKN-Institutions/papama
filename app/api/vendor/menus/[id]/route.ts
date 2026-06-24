import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH + DELETE /api/vendor/menus/[id] — the signed-in vendor edits / removes
 * one of their own menu items.
 *
 * PATCH is gated by `vendor_menu_pricing/update` (own), DELETE by `.../delete`
 * (own). Both run on the session (RLS) client so the
 * `vendor_menus_update_own` / `vendor_menus_delete_own` policies scope to the
 * vendor's outlet (matched via vendors.owner_id) and `guard_menu_controlled_cols`
 * blocks any attempt to touch the approval columns. The PATCH schema only admits
 * the editable fields; editing an item leaves its approval_status untouched
 * (re-approval, if needed, is a staff action).
 */
const menuPatchSchema = z
    .object({
        item_name: z.string().trim().min(1).optional(),
        price: z.number().nonnegative().optional(),
        nutrition_category: z.string().trim().nullable().optional(),
        is_special_care_equivalent: z.boolean().optional(),
    })
    .strict();

export const PATCH = defineRoute<{ id: string }>(
    { feature: "vendor_menu_pricing", action: "update", scope: "own" },
    async ({ req, params, audit }) => {
        const body = await parseBody(req, menuPatchSchema);

        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) update[key] = value;
        }
        if (Object.keys(update).length === 0) {
            throw new BadRequestError("no editable fields supplied");
        }

        // Session client → vendor_menus_update_own (own outlet) + column guard.
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("vendor_menus")
            .update(update)
            .eq("id", params.id)
            .select(
                "id, vendor_id, item_name, price, nutrition_category, is_special_care_equivalent, special_care_equivalent_approved, approval_status"
            )
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new NotFoundError("menu item not found");

        await audit({
            action: "vendor.menu.update",
            entity_table: "vendor_menus",
            entity_id: params.id,
            summary: "vendor updated a menu item",
            metadata: { fields: Object.keys(update) },
        });

        return { menu: { ...data, price: Math.round(Number(data.price)) } };
    }
);

export const DELETE = defineRoute<{ id: string }>(
    { feature: "vendor_menu_pricing", action: "delete", scope: "own" },
    async ({ params, audit }) => {
        // Session client → vendor_menus_delete_own scopes to this vendor's outlet.
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("vendor_menus")
            .delete()
            .eq("id", params.id)
            .select("id")
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new NotFoundError("menu item not found");

        await audit({
            action: "vendor.menu.delete",
            entity_table: "vendor_menus",
            entity_id: params.id,
            summary: "vendor removed a menu item",
        });

        return { id: params.id, deleted: true };
    }
);
