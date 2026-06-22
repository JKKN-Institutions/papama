import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { ComplianceReportResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/reports — generated compliance/CSR reports (contract §10).
 *
 * Gated by `audit_reports/read` (admin + compliance). `params`/`summary` are
 * jsonb objects; `period_start`/`period_end` are dates (YYYY-MM-DD). Newest first.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("compliance_reports")
        .select(
            "id, report_type, title, params, summary, file_url, period_start, period_end, generated_by, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const reports: ComplianceReportResponse[] = (data ?? []).map((r) => ({
        id: r.id,
        report_type: r.report_type,
        title: r.title,
        params: r.params ?? {},
        summary: r.summary ?? {},
        file_url: r.file_url,
        period_start: r.period_start,
        period_end: r.period_end,
        generated_by: r.generated_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }));

    return { reports, total: reports.length };
});
