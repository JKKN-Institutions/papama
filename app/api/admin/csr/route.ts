import { defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { csr80gCertificatesEnabled, generateCsrReport } from "@/lib/services/csr";
import {
    csrReportGenerateRequestSchema,
    type ComplianceReportResponse,
    type CorporateCsrProfileResponse,
} from "@/lib/validation/schemas";

/**
 * Corporate CSR admin view (addon #7). Thin route over generateCsrReport, which
 * stores results by reusing compliance_reports with report_type='csr'.
 *
 * Gated by `audit_reports` (admin generates, compliance reads) — same altitude as
 * the generic reports family. 80G certificates remain BLOCKED: the GET returns
 * the feature flag so the UI can show a disabled affordance.
 */

export const GET = defineRoute({ feature: "csr_module", action: "read" }, async () => {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Corporate donor profiles (for the company picker) — admin+compliance read.
    const { data: profileData, error: profileErr } = await supabase
        .from("corporate_csr_profiles")
        .select(
            "id, donor_id, company_name, cin, registration_number, csr_focus_area, ngo_partner_id, created_at, updated_at"
        )
        .order("created_at", { ascending: false });
    if (profileErr) throw new Error(profileErr.message);

    // Previously generated CSR reports.
    const { data: reportData, error: reportErr } = await supabase
        .from("compliance_reports")
        .select(
            "id, report_type, title, params, summary, file_url, period_start, period_end, generated_by, created_at, updated_at"
        )
        .eq("report_type", "csr")
        .order("created_at", { ascending: false });
    if (reportErr) throw new Error(reportErr.message);

    const profiles = (profileData ?? []) as CorporateCsrProfileResponse[];
    const reports: ComplianceReportResponse[] = (reportData ?? []).map((r) => ({
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

    return {
        profiles,
        reports,
        total: reports.length,
        certificates_enabled: await csr80gCertificatesEnabled(admin),
    };
});

export const POST = defineRoute(
    { feature: "csr_module", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, csrReportGenerateRequestSchema);
        const admin = createAdminClient();

        const { id, summary } = await generateCsrReport(
            {
                donor_id: body.donor_id ?? null,
                period_start: body.period_start ?? null,
                period_end: body.period_end ?? null,
                title: body.title ?? null,
            },
            admin,
            user
        );

        await audit({
            action: "report.generate",
            entity_table: "compliance_reports",
            entity_id: id,
            summary: `generated corporate CSR report${
                body.period_start || body.period_end
                    ? ` (${body.period_start ?? "…"} → ${body.period_end ?? "…"})`
                    : ""
            }`,
            metadata: { report_type: "csr", donor_id: body.donor_id ?? null, totals: summary.totals },
        });

        return { ok: true, id, summary };
    }
);
