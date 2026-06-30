import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth";
import { getBoolean } from "@/lib/system-config";

/**
 * Corporate CSR service (addon #7).
 *
 * generateCsrReport aggregates donations made by CORPORATE donors (those with a
 * corporate_csr_profiles row) by company / campaign / financial_year, and STORES
 * the result by REUSING compliance_reports with report_type='csr' — no new enum
 * value, no new report table. It only reads the canonical donor spine
 * (corporate_csr_profiles, donors, donations, campaigns); the report row holds
 * computed aggregates in `summary` (never a shadow copy of source rows).
 *
 * 80G utilization certificates are BLOCKED (need 80G registration + an email/PDF
 * provider) → see csr80gCertificatesEnabled / the marked TODO below. No
 * certificate generation is built.
 */

type Admin = SupabaseClient;

export interface CsrReportParams {
    /** Optional single corporate donor to scope the report to. */
    donor_id?: string | null;
    /** Inclusive YYYY-MM-DD window (optional). */
    period_start?: string | null;
    period_end?: string | null;
    /** Optional report title; defaults to a generated one. */
    title?: string | null;
}

interface CompanyAgg {
    donor_id: string;
    company_name: string;
    total_inr: number;
    donations: number;
    tokens_funded: number;
}

export interface CsrReportSummary {
    by_company: CompanyAgg[];
    by_campaign: { campaign_id: string | null; title: string; total_inr: number }[];
    by_financial_year: { financial_year: string; total_inr: number }[];
    totals: { total_inr: number; donations: number; tokens_funded: number; companies: number };
}

export interface CsrReportResult {
    id: string;
    summary: CsrReportSummary;
}

/** Whether 80G CSR certificates are enabled (seeded false; blocked feature). */
export async function csr80gCertificatesEnabled(admin: Admin): Promise<boolean> {
    return getBoolean("csr_80g_certificates_enabled", admin as never);
}

/**
 * Aggregate corporate-donor donations and persist a compliance_reports row with
 * report_type='csr'. Returns the new row id + the computed summary.
 */
export async function generateCsrReport(
    params: CsrReportParams,
    admin: Admin,
    actor: AppUser
): Promise<CsrReportResult> {
    const startTs = params.period_start ? `${params.period_start}T00:00:00.000Z` : null;
    const endTs = params.period_end ? `${params.period_end}T23:59:59.999Z` : null;

    // 1. Which donors are corporate (and their company names).
    let profileQ = admin
        .from("corporate_csr_profiles")
        .select("donor_id, company_name");
    if (params.donor_id) profileQ = profileQ.eq("donor_id", params.donor_id);
    const { data: profiles, error: profileErr } = await profileQ.returns<
        { donor_id: string; company_name: string }[]
    >();
    if (profileErr) throw new Error(profileErr.message);

    const companyByDonor = new Map<string, string>();
    for (const p of profiles ?? []) companyByDonor.set(p.donor_id, p.company_name);
    const donorIds = [...companyByDonor.keys()];

    const summary: CsrReportSummary = {
        by_company: [],
        by_campaign: [],
        by_financial_year: [],
        totals: { total_inr: 0, donations: 0, tokens_funded: 0, companies: donorIds.length },
    };

    if (donorIds.length > 0) {
        // 2. Their donations in the window.
        let donQ = admin
            .from("donations")
            .select("donor_id, campaign_id, amount_inr, token_amount, financial_year")
            .in("donor_id", donorIds);
        if (startTs) donQ = donQ.gte("created_at", startTs);
        if (endTs) donQ = donQ.lte("created_at", endTs);
        const { data: donations, error: donErr } = await donQ.returns<
            {
                donor_id: string | null;
                campaign_id: string | null;
                amount_inr: number | null;
                token_amount: number | null;
                financial_year: string | null;
            }[]
        >();
        if (donErr) throw new Error(donErr.message);

        const byCompany = new Map<string, CompanyAgg>();
        const byCampaign = new Map<string, { campaign_id: string | null; total_inr: number }>();
        const byFy = new Map<string, number>();

        for (const d of donations ?? []) {
            const amount = Number(d.amount_inr) || 0;
            const tokens = Number(d.token_amount) || 0;
            summary.totals.total_inr += amount;
            summary.totals.tokens_funded += tokens;
            summary.totals.donations += 1;

            if (d.donor_id) {
                const company = companyByDonor.get(d.donor_id) ?? "Unknown company";
                const c = byCompany.get(d.donor_id) ?? {
                    donor_id: d.donor_id,
                    company_name: company,
                    total_inr: 0,
                    donations: 0,
                    tokens_funded: 0,
                };
                c.total_inr += amount;
                c.donations += 1;
                c.tokens_funded += tokens;
                byCompany.set(d.donor_id, c);
            }

            const campKey = d.campaign_id ?? "__none__";
            const camp = byCampaign.get(campKey) ?? { campaign_id: d.campaign_id, total_inr: 0 };
            camp.total_inr += amount;
            byCampaign.set(campKey, camp);

            const fy = d.financial_year ?? "Unspecified";
            byFy.set(fy, (byFy.get(fy) ?? 0) + amount);
        }

        // 3. Resolve campaign titles for the campaign breakdown.
        const campaignIds = [...byCampaign.values()]
            .map((c) => c.campaign_id)
            .filter((id): id is string => !!id);
        const titleById = new Map<string, string>();
        if (campaignIds.length > 0) {
            const { data: camps, error: campErr } = await admin
                .from("campaigns")
                .select("id, title")
                .in("id", campaignIds)
                .returns<{ id: string; title: string }[]>();
            if (campErr) throw new Error(campErr.message);
            for (const c of camps ?? []) titleById.set(c.id, c.title);
        }

        summary.by_company = [...byCompany.values()].sort((a, b) => b.total_inr - a.total_inr);
        summary.by_campaign = [...byCampaign.values()]
            .map((c) => ({
                campaign_id: c.campaign_id,
                title: c.campaign_id ? titleById.get(c.campaign_id) ?? "Unknown campaign" : "Unattributed",
                total_inr: c.total_inr,
            }))
            .sort((a, b) => b.total_inr - a.total_inr);
        summary.by_financial_year = [...byFy.entries()]
            .map(([financial_year, total_inr]) => ({ financial_year, total_inr }))
            .sort((a, b) => a.financial_year.localeCompare(b.financial_year));
    }

    // 4. Persist the report row (report_type='csr'; summary = aggregates only).
    const title =
        params.title ??
        (params.donor_id
            ? `CSR report — ${companyByDonor.get(params.donor_id) ?? "company"}`
            : "Corporate CSR report");

    const { data: inserted, error: insertErr } = await admin
        .from("compliance_reports")
        .insert({
            report_type: "csr",
            title,
            params: {
                donor_id: params.donor_id ?? null,
                period_start: params.period_start ?? null,
                period_end: params.period_end ?? null,
            },
            summary,
            period_start: params.period_start ?? null,
            period_end: params.period_end ?? null,
            generated_by: actor.id,
        })
        .select("id")
        .single();
    if (insertErr || !inserted) {
        throw new Error(insertErr?.message ?? "failed to create CSR report");
    }

    return { id: (inserted as { id: string }).id, summary };
}

// TODO(80G certificates, addon #7 — BLOCKED): issuing 80G utilization
// certificates needs (a) the entity's 80G registration number and (b) an
// email/PDF provider to render + deliver the certificate. Both are open items.
// Build certificate generation here ONLY after csr80gCertificatesEnabled() is
// true and those providers are wired. Until then the UI shows a disabled
// affordance and this stays unimplemented (never invent the provider — AGENTS.md).
