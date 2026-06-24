import { defineRoute, parseQuery } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { AuditLogResponse } from "@/lib/validation/schemas";
import { z } from "zod";

// audit_logs is append-only and unbounded — apply a stricter cap than other
// admin list routes (the trail grows with every admin action).
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const auditLogQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/admin/audit-logs — the append-only audit trail (contract §10).
 *
 * Gated by `audit_reports/read` (admin + compliance). Read-only by nature; the
 * trail is immutable (M08 trigger). Newest first. Paginated: `?limit=` (max 500,
 * default 100) + `?offset=` to page through the full trail without full-scanning.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async ({ req }) => {
    const { limit = DEFAULT_LIMIT, offset = 0 } = parseQuery(
        req.nextUrl.searchParams,
        auditLogQuerySchema
    );
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, actor_role, action, entity_table, entity_id, summary, metadata, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

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

    return { audit_logs, total: audit_logs.length, limit, offset };
});
