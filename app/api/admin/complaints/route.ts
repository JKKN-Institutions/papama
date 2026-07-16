import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { COMPLAINT_STATUSES } from "@/lib/types/enums";

/**
 * Beneficiary complaint queue (addon2 A3) — the complaint rows of vendor_feedback
 * (is_complaint = true) with a triage lifecycle. Gated by `vendor_management`:
 * admin + vendor_manager work the queue (compliance reads the underlying feedback
 * elsewhere). Vendor-RAISED disputes live in vendor_escalations, not here.
 */

export const GET = defineRoute({ feature: "quality_feedback_complaints_inspections", action: "read" }, async () => {
    const admin = createAdminClient();

    const { data, error } = await admin
        .from("vendor_feedback")
        .select("id, vendor_id, rating, comment, complaint_status, resolution, resolved_at, created_at")
        .eq("is_complaint", true)
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean) as string[])];
    const nameById = new Map<string, string | null>();
    if (vendorIds.length > 0) {
        const { data: vendors } = await admin.from("vendors").select("id, name").in("id", vendorIds);
        for (const v of (vendors ?? []) as { id: string; name: string | null }[]) {
            nameById.set(v.id, v.name);
        }
    }

    const complaints = rows.map((r) => ({
        ...r,
        vendor_name: nameById.get(r.vendor_id as string) ?? "Unknown vendor",
    }));

    return { complaints };
});

/**
 * Legal triage transitions (addon #16). `open -> investigating -> resolved |
 * dismissed`, but `open` may also resolve/dismiss directly (a trivial
 * complaint doesn't require an investigating step). Both terminal states are
 * final — no transition out of them.
 */
const COMPLAINT_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
    open: ["investigating", "resolved", "dismissed"],
    investigating: ["resolved", "dismissed"],
    resolved: [],
    dismissed: [],
};

const decideSchema = z
    .object({
        id: z.string().uuid(),
        complaint_status: z.enum(COMPLAINT_STATUSES),
        resolution: z.string().trim().max(1000).optional(),
    })
    .strict()
    .refine(
        (b) =>
            !(b.complaint_status === "resolved" || b.complaint_status === "dismissed") ||
            (b.resolution && b.resolution.length > 0),
        { message: "a resolution note is required to resolve or dismiss", path: ["resolution"] }
    );

export const PATCH = defineRoute(
    { feature: "quality_feedback_complaints_inspections", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, decideSchema);
        const admin = createAdminClient();

        const { data: existing, error: fetchError } = await admin
            .from("vendor_feedback")
            .select("id, is_complaint, complaint_status")
            .eq("id", body.id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!existing || !existing.is_complaint) throw new NotFoundError("complaint not found");

        const from = existing.complaint_status ?? "open";
        if (!COMPLAINT_TRANSITIONS[from]?.includes(body.complaint_status)) {
            throw new BadRequestError(
                `cannot move a '${from}' complaint to '${body.complaint_status}'`
            );
        }

        const terminal = body.complaint_status === "resolved" || body.complaint_status === "dismissed";
        const { error: updateError } = await admin
            .from("vendor_feedback")
            .update({
                complaint_status: body.complaint_status,
                resolution: body.resolution ?? null,
                resolved_by: terminal ? user.id : null,
                resolved_at: terminal ? new Date().toISOString() : null,
            })
            .eq("id", body.id)
            .eq("is_complaint", true);
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: "complaint.triage",
            entity_table: "vendor_feedback",
            entity_id: body.id,
            summary: `complaint ${existing.complaint_status ?? "open"} → ${body.complaint_status}`,
            metadata: { to: body.complaint_status, resolution: body.resolution ?? null },
        });

        return { ok: true, id: body.id, complaint_status: body.complaint_status };
    }
);
