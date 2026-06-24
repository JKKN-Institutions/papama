import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
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

        // Only a still-`pending` item may be decided — no re-flipping a settled
        // approval/rejection (matches every other lifecycle route's state guard).
        const { data: current, error: fetchError } = await admin
            .from("vendor_menus")
            .select("id, approval_status")
            .eq("id", params.id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!current) throw new NotFoundError("menu item not found");
        if (current.approval_status !== "pending") {
            throw new BadRequestError(`menu item is already '${current.approval_status}'`);
        }

        const approvalStatus = body.decision === "approve" ? "approved" : "rejected";
        const update: Record<string, unknown> = { approval_status: approvalStatus };
        // On approve, set the special-care flag as requested. On reject, explicitly
        // CLEAR it so a rejected item can never carry a stale approved equivalence.
        update.special_care_equivalent_approved =
            body.decision === "approve" ? (body.special_care_equivalent ?? false) : false;

        const { data, error } = await admin
            .from("vendor_menus")
            .update(update)
            .eq("id", params.id)
            .eq("approval_status", "pending") // race guard: lose cleanly if decided concurrently
            .select("id, approval_status, special_care_equivalent_approved")
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new BadRequestError("menu item was decided concurrently");

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
