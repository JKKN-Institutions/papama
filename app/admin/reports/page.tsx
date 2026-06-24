"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { REPORT_TYPES, type ReportType } from "@/lib/types/enums";
import type { ComplianceReportResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
} from "../_ui";

/** Admin reports page — generated compliance/CSR reports, plus a generator (contract §10). */
export default function AdminReportsPage() {
    const canGenerate = useCan("audit_reports", "create");
    const { items, state, errorMsg, reload } = useAdminList<ComplianceReportResponse>(
        "/api/admin/reports",
        "reports",
        "/admin/reports"
    );

    return (
        <div>
            <AdminPageHeader
                title="Reports"
                subtitle="Generated compliance and CSR report exports."
                count={state === "ready" ? items.length : undefined}
            />

            {canGenerate && <GeneratePanel onGenerated={reload} />}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="reports"
                emptyHint="No reports yet. Generate one above."
                table={
                    <TableShell>
                        <TableHead columns={["Type", "Title", "Period", "Summary", "File", "Created"]} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <StatusBadge value={r.report_type} />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <Dash>{r.title}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {r.period_start || r.period_end ? (
                                            <>
                                                <Dash>{r.period_start}</Dash> →{" "}
                                                <Dash>{r.period_end}</Dash>
                                            </>
                                        ) : (
                                            "All time"
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <SummaryCell summary={r.summary} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <a
                                            href={`/api/admin/reports/export?id=${r.id}`}
                                            className="text-blue-600 hover:underline"
                                        >
                                            Export CSV
                                        </a>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}

function GeneratePanel({ onGenerated }: { onGenerated: () => Promise<void> }) {
    const [reportType, setReportType] = useState<ReportType>("compliance");
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function generate() {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    report_type: reportType,
                    period_start: periodStart || undefined,
                    period_end: periodEnd || undefined,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.error ?? `Generate failed (${res.status})`);
                return;
            }
            await onGenerated();
        } finally {
            setGenerating(false);
        }
    }

    const input =
        "rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60";

    return (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-slate-700">Generate a report</p>
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                    Type
                    <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value as ReportType)}
                        disabled={generating}
                        className={`${input} capitalize`}
                    >
                        {REPORT_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                    From (optional)
                    <input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        disabled={generating}
                        className={input}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                    To (optional)
                    <input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        disabled={generating}
                        className={input}
                    />
                </label>
                <ActionButton tone="primary" disabled={generating} onClick={generate}>
                    {generating ? "Generating…" : "Generate"}
                </ActionButton>
            </div>
            {error && (
                <div className="mt-3">
                    <Notice tone="error" title="Couldn’t generate report">
                        {error}
                    </Notice>
                </div>
            )}
        </div>
    );
}

function SummaryCell({ summary }: { summary: Record<string, unknown> }) {
    const entries = Object.entries(summary ?? {});
    if (entries.length === 0) return <span className="text-slate-400">—</span>;
    return (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {entries.map(([k, v]) => (
                <span key={k} className="whitespace-nowrap">
                    <span className="text-slate-400">{k.replace(/_/g, " ")}:</span>{" "}
                    <span className="font-medium text-slate-700">{String(v)}</span>
                </span>
            ))}
        </div>
    );
}
