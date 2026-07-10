import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getBoolean } from "@/lib/system-config";
import { volunteerActivitySummaries } from "@/lib/services/volunteerActivity";

/**
 * Volunteer area + field-activity console (addon #13).
 *
 * GET — list volunteers with their assigned zone, approval stamp, and a rolled-up
 * activity summary (tokens distributed + registrations assisted). Gated by
 * `token_distribution/read` (admin, compliance, vendor_manager). Also reports
 * whether the zones feature is enabled (system_config volunteer_zones_enabled) so
 * the UI can label the zone controls.
 *
 * PATCH — assign / clear a volunteer's geographic zone. Gated by
 * `token_distribution/update` (admin). Sets volunteers.assigned_area and stamps
 * the reviewing staff (approved_by/approved_at). Audited.
 */
export const GET = defineRoute({ feature: "volunteer_management", action: "read" }, async () => {
    const supabase = await createClient();
    const admin = createAdminClient();

    let zonesEnabled = false;
    try {
        zonesEnabled = await getBoolean("volunteer_zones_enabled", supabase as never);
    } catch {
        zonesEnabled = false; // unset/missing → feature off
    }

    const { data, error } = await supabase
        .from("volunteers")
        .select("id, full_name, email, phone, status, assigned_area, approved_at, created_at")
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        status: string;
        assigned_area: string | null;
        approved_at: string | null;
        created_at: string;
    }[];

    const summaries = await volunteerActivitySummaries(
        rows.map((r) => r.id),
        admin
    );

    const volunteers = rows.map((r) => {
        const s = summaries.get(r.id);
        return {
            id: r.id,
            full_name: r.full_name,
            email: r.email,
            phone: r.phone,
            status: r.status,
            assigned_area: r.assigned_area,
            approved_at: r.approved_at,
            created_at: r.created_at,
            tokens_distributed: s?.tokens_distributed ?? 0,
            registrations_assisted: s?.registrations_assisted ?? 0,
            activity_total: s?.total ?? 0,
            active_days: s?.active_days ?? 0,
            last_active_at: s?.last_active_at ?? null,
        };
    });

    return { volunteers, total: volunteers.length, zones_enabled: zonesEnabled };
});

const patchSchema = z.object({
    volunteer_id: z.string().uuid(),
    // Empty string / null clears the zone.
    assigned_area: z.string().max(120).nullable(),
});

export const PATCH = defineRoute(
    { feature: "volunteer_management", action: "update" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, patchSchema);
        const admin = createAdminClient();

        const { data: existing, error: fetchErr } = await admin
            .from("volunteers")
            .select("id, full_name, assigned_area")
            .eq("id", body.volunteer_id)
            .maybeSingle();
        if (fetchErr) throw new Error(fetchErr.message);
        const volunteer = existing as
            | { id: string; full_name: string | null; assigned_area: string | null }
            | null;
        if (!volunteer) throw new NotFoundError("volunteer not found");

        const area = body.assigned_area && body.assigned_area.trim() !== "" ? body.assigned_area.trim() : null;
        const nowIso = new Date().toISOString();

        const { error: updErr } = await admin
            .from("volunteers")
            .update({
                assigned_area: area,
                approved_by: user.id,
                approved_at: nowIso,
                updated_at: nowIso,
            })
            .eq("id", body.volunteer_id);
        if (updErr) throw new Error(updErr.message);

        await audit({
            action: "volunteer.assign_zone",
            entity_table: "volunteers",
            entity_id: body.volunteer_id,
            summary: `${volunteer.full_name ?? "volunteer"} zone: ${
                volunteer.assigned_area ?? "—"
            } → ${area ?? "—"}`,
            metadata: { from: volunteer.assigned_area, to: area },
        });

        return { ok: true, id: body.volunteer_id, assigned_area: area };
    }
);
