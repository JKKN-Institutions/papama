import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { applyInspectionOutcome } from "@/lib/services/vendorRating";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET + POST /api/admin/vendor-inspections — surprise hygiene/quality inspections
 * (addon #9).
 *
 * GET is gated by `vendor_management/read`; POST by `vendor_management/create`
 * (admin + vendor_manager — compliance is read-only in the matrix). Both run on
 * the session (RLS) client, where surprise_inspections_*_staff scope to
 * admin/compliance/vendor_manager. The inspector is bound server-side to the
 * caller; every recorded inspection writes an audit row.
 */
interface InspectionRow {
    id: string;
    vendor_id: string;
    inspector_user_id: string | null;
    inspection_date: string;
    hygiene_score: number | null;
    passed: boolean | null;
    notes: string | null;
    created_at: string;
    vendors: { name: string | null } | { name: string | null }[] | null;
}

export const GET = defineRoute({ feature: "quality_feedback_complaints_inspections", action: "read" }, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("surprise_inspections")
        .select(
            "id, vendor_id, inspector_user_id, inspection_date, hygiene_score, passed, notes, created_at, vendors(name)"
        )
        .order("inspection_date", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);

    const inspections = ((data as InspectionRow[] | null) ?? []).map((r) => {
        const v = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
        return {
            id: r.id,
            vendor_id: r.vendor_id,
            vendor_name: v?.name ?? null,
            inspector_user_id: r.inspector_user_id,
            inspection_date: r.inspection_date,
            hygiene_score: r.hygiene_score,
            passed: r.passed,
            notes: r.notes,
            created_at: r.created_at,
        };
    });

    return { inspections, total: inspections.length };
});

const createSchema = z
    .object({
        vendor_id: z.string().uuid(),
        hygiene_score: z.number().int().min(1).max(5).optional(),
        passed: z.boolean().optional(),
        inspection_date: z.string().date().optional(),
        notes: z.string().trim().max(2000).optional(),
    })
    .strict();

export const POST = defineRoute(
    { feature: "quality_feedback_complaints_inspections", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);

        const supabase = await createClient();

        const { data: vendor, error: vendorErr } = await supabase
            .from("vendors")
            .select("id, name")
            .eq("id", body.vendor_id)
            .maybeSingle();
        if (vendorErr) throw new Error(vendorErr.message);
        if (!vendor) throw new NotFoundError("vendor not found");

        const { data, error } = await supabase
            .from("surprise_inspections")
            .insert({
                vendor_id: body.vendor_id,
                inspector_user_id: user.id,
                inspection_date: body.inspection_date ?? undefined,
                hygiene_score: body.hygiene_score ?? null,
                passed: body.passed ?? null,
                notes: body.notes ?? null,
            })
            .select("id, inspection_date")
            .single();
        if (error || !data) throw new BadRequestError(error?.message ?? "failed to record inspection");

        const row = data as { id: string; inspection_date: string };
        await audit({
            action: "vendor.inspection.record",
            entity_table: "surprise_inspections",
            entity_id: row.id,
            summary: `recorded a surprise inspection for ${(vendor as { name: string }).name}`,
            metadata: {
                vendor_id: body.vendor_id,
                hygiene_score: body.hygiene_score ?? null,
                passed: body.passed ?? null,
            },
        });

        // Failed-inspection quality penalty (addon #16) — best-effort, never
        // blocks the inspection record. quality_score is a staff-only guarded
        // column, so this specific write goes through the admin (service-role)
        // client rather than the session client used above.
        try {
            await applyInspectionOutcome(createAdminClient(), body.vendor_id, body.passed ?? null);
        } catch (e) {
            console.error("[vendor-inspections] quality penalty failed:", e);
        }

        return { id: row.id, inspection_date: row.inspection_date };
    }
);
