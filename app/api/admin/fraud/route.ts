import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { FraudFlagDetailResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/fraud — fraud flags for the admin console (contract §9).
 *
 * Gated by `fraud_monitoring/read` (admin, compliance, vendor_manager). Returns
 * the richer detail shape (detection_method + resolution columns) the console
 * needs. `entity` is the polymorphic jsonb target { kind, id }. Newest first.
 */
export const GET = defineRoute({ feature: "fraud_monitoring", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("fraud_flags")
        .select(
            "id, flag_type, severity, status, detection_method, entity, blocked, resolved_by, resolution_notes, resolved_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const fraud_flags: FraudFlagDetailResponse[] = (data ?? []).map((f) => ({
        id: f.id,
        flag_type: f.flag_type,
        severity: f.severity,
        status: f.status,
        detection_method: f.detection_method,
        entity: f.entity,
        blocked: f.blocked,
        resolved_by: f.resolved_by,
        resolution_notes: f.resolution_notes,
        resolved_at: f.resolved_at,
        created_at: f.created_at,
        updated_at: f.updated_at,
    }));

    return { fraud_flags, total: fraud_flags.length };
});
