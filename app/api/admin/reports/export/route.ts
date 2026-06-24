import { NextResponse } from "next/server";

import { BadRequestError, NotFoundError, defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/reports/export?id=<reportId> — download a generated report as CSV
 * (contract §10, DoD "CSR report exports"). Gated by `audit_reports/read`. Renders
 * the report metadata + its summary metrics on the fly (no storage bucket needed)
 * and streams it as a `text/csv` attachment.
 */
function csv(v: unknown): string {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async ({ req }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new BadRequestError("id query param is required");

    const admin = createAdminClient();
    const { data, error } = await admin
        .from("compliance_reports")
        .select("id, report_type, title, summary, period_start, period_end, created_at")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError("report not found");

    const r = data as {
        id: string;
        report_type: string;
        title: string | null;
        summary: Record<string, unknown> | null;
        period_start: string | null;
        period_end: string | null;
        created_at: string;
    };

    const rows: string[] = [];
    rows.push(["Field", "Value"].map(csv).join(","));
    rows.push(["Report ID", r.id].map(csv).join(","));
    rows.push(["Type", r.report_type].map(csv).join(","));
    rows.push(["Title", r.title ?? ""].map(csv).join(","));
    rows.push(["Period start", r.period_start ?? "all time"].map(csv).join(","));
    rows.push(["Period end", r.period_end ?? "all time"].map(csv).join(","));
    rows.push(["Generated", r.created_at].map(csv).join(","));
    rows.push("");
    rows.push(["Metric", "Value"].map(csv).join(","));
    for (const [k, v] of Object.entries(r.summary ?? {})) {
        rows.push([k.replace(/_/g, " "), v].map(csv).join(","));
    }

    return new NextResponse(rows.join("\n"), {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="papama-${r.report_type}-report-${r.id.slice(0, 8)}.csv"`,
        },
    });
});
