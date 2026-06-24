import { z } from "zod";

import { NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/admin/vendor-menus/[id]/decide — staff approve / reject a vendor's
 * proposed menu item (contract: vendor_menu_pricing update + approve cap →
 * admin / vendor_manager).
 *
 * Gated by `vendor_menu_pricing/update`. Runs on the service-role client — these
 * are exactly the approval columns the DB `guard_menu_controlled_cols` trigger
 * forbids a vendor from touching, so only staff (via this privileged path) may
 * set them. On approve, an optional `special_care_equivalent` flag also marks
 * the item as an approved special-care equivalent. Every decision is audited.
 */
const decideSchema = z
    .object({
        decision: z.enum(["approve", "reject"]),
        special_care_equivalent: z.boolean().optional(),
    })
    .strict();

export const PATCH = defineRoute<{ id: string }>(
    { feature: "vendor_menu_pricing", action: "update" },
    async ({ req, params, audit }) => {
        const body = await parseBody(req, decideSchema);

        const admin = createAdminClient();

        const approvalStatus = body.decision === "approve" ? "approved" : "rejected";
        const update: Record<string, unknown> = { approval_status: approvalStatus };
        if (body.decision === "approve" && body.special_care_equivalent !== undefined) {
            update.special_care_equivalent_approved = body.special_care_equivalent;
        }

        const { data, error } = await admin
            .from("vendor_menus")
            .update(update)
            .eq("id", params.id)
            .select("id, approval_status, special_care_equivalent_approved")
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new NotFoundError("menu item not found");

        await audit({
            action: `vendor.menu.${body.decision}`,
            entity_table: "vendor_menus",
            entity_id: params.id,
            summary: `menu item ${approvalStatus}`,
            metadata: {
                decision: body.decision,
                special_care_equivalent: body.special_care_equivalent ?? null,
            },
        });

        return { id: data.id, approval_status: data.approval_status };
    }
);
