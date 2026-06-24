import { defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    reportGenerateRequestSchema,
    type ComplianceReportResponse,
} from "@/lib/validation/schemas";

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

/**
 * POST /api/admin/reports — generate a report (contract §10).
 *
 * Gated by `audit_reports/create` — admin only (compliance is read-only in the
 * matrix). Aggregates live data into a `compliance_reports.summary` jsonb over an
 * optional [period_start, period_end] window. File export to storage is a later
 * slice. Records `generated_by` and audits the generation.
 */
type Admin = SupabaseClient;

/** Inclusive timestamp bounds derived from the optional YYYY-MM-DD period. */
function bounds(start?: string, end?: string) {
    return {
        startTs: start ? `${start}T00:00:00.000Z` : null,
        endTs: end ? `${end}T23:59:59.999Z` : null,
    };
}

async function countRows(
    admin: Admin,
    table: string,
    tsCol: string,
    startTs: string | null,
    endTs: string | null,
    eq?: { col: string; val: string }
): Promise<number> {
    let q = admin.from(table).select("*", { count: "exact", head: true });
    if (startTs) q = q.gte(tsCol, startTs);
    if (endTs) q = q.lte(tsCol, endTs);
    if (eq) q = q.eq(eq.col, eq.val);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
}

async function sumColumn(
    admin: Admin,
    table: string,
    col: string,
    tsCol: string,
    startTs: string | null,
    endTs: string | null
): Promise<number> {
    let q = admin.from(table).select(col);
    if (startTs) q = q.gte(tsCol, startTs);
    if (endTs) q = q.lte(tsCol, endTs);
    const { data, error } = await q.returns<Record<string, unknown>[]>();
    if (error) throw new Error(error.message);
    return (data ?? []).reduce(
        (sum, row) => sum + (Number(row[col]) || 0),
        0
    );
}

async function buildSummary(
    admin: Admin,
    type: ComplianceReportResponse["report_type"],
    startTs: string | null,
    endTs: string | null
): Promise<Record<string, number>> {
    switch (type) {
        case "donation":
            return {
                donations: await countRows(admin, "donations", "created_at", startTs, endTs),
                total_inr: await sumColumn(admin, "donations", "amount_inr", "created_at", startTs, endTs),
                tokens_funded: await sumColumn(admin, "donations", "token_amount", "created_at", startTs, endTs),
            };
        case "redemption":
            return {
                redemptions: await countRows(admin, "token_redemptions", "redeemed_at", startTs, endTs),
                token_value_inr: await sumColumn(admin, "token_redemptions", "token_value_inr", "redeemed_at", startTs, endTs),
                co_pay_inr: await sumColumn(admin, "token_redemptions", "co_pay_inr", "redeemed_at", startTs, endTs),
            };
        case "settlement":
            return {
                settlements: await countRows(admin, "vendor_settlements", "created_at", startTs, endTs),
                total_amount: await sumColumn(admin, "vendor_settlements", "amount", "created_at", startTs, endTs),
                paid: await countRows(admin, "vendor_settlements", "created_at", startTs, endTs, { col: "status", val: "paid" }),
            };
        case "audit":
            return {
                audit_events: await countRows(admin, "audit_logs", "created_at", startTs, endTs),
            };
        case "compliance":
            return {
                donations: await countRows(admin, "donations", "created_at", startTs, endTs),
                redemptions: await countRows(admin, "token_redemptions", "redeemed_at", startTs, endTs),
                settlements: await countRows(admin, "vendor_settlements", "created_at", startTs, endTs),
                open_fraud_flags: await countRows(admin, "fraud_flags", "created_at", startTs, endTs, { col: "status", val: "open" }),
            };
        case "csr":
            return {
                total_donated_inr: await sumColumn(admin, "donations", "amount_inr", "created_at", startTs, endTs),
                meals_served: await countRows(admin, "token_redemptions", "redeemed_at", startTs, endTs),
                tokens_funded: await sumColumn(admin, "donations", "token_amount", "created_at", startTs, endTs),
            };
        default:
            return {};
    }
}

export const POST = defineRoute(
    { feature: "audit_reports", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, reportGenerateRequestSchema);
        const admin = createAdminClient();

        const { startTs, endTs } = bounds(body.period_start, body.period_end);
        const summary = await buildSummary(admin, body.report_type, startTs, endTs);

        const title =
            body.title ??
            `${body.report_type[0].toUpperCase()}${body.report_type.slice(1)} report`;

        const { data, error } = await admin
            .from("compliance_reports")
            .insert({
                report_type: body.report_type,
                title,
                params: { period_start: body.period_start ?? null, period_end: body.period_end ?? null },
                summary,
                period_start: body.period_start ?? null,
                period_end: body.period_end ?? null,
                generated_by: user.id,
            })
            .select("id")
            .single();

        if (error || !data) throw new Error(error?.message ?? "failed to create report");
        const id = (data as { id: string }).id;

        await audit({
            action: "report.generate",
            entity_table: "compliance_reports",
            entity_id: id,
            summary: `generated ${body.report_type} report${
                body.period_start || body.period_end
                    ? ` (${body.period_start ?? "…"} → ${body.period_end ?? "…"})`
                    : ""
            }`,
            metadata: { report_type: body.report_type, summary },
        });

        return { ok: true, id, report_type: body.report_type, summary };
    }
);
