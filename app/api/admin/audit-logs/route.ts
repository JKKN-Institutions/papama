import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { AuditLogResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/audit-logs — the append-only audit trail (contract §10).
 *
 * Gated by `audit_reports/read` (admin + compliance). Read-only by nature; the
 * trail is immutable (M08 trigger). Newest first.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, actor_role, action, entity_table, entity_id, summary, metadata, created_at")
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const audit_logs: AuditLogResponse[] = (data ?? []).map((r) => ({
        id: r.id,
        actor_id: r.actor_id,
        actor_role: r.actor_role,
        action: r.action,
        entity_table: r.entity_table,
        entity_id: r.entity_id,
        summary: r.summary,
        metadata: r.metadata ?? {},
        created_at: r.created_at,
    }));

    return { audit_logs, total: audit_logs.length };
});
