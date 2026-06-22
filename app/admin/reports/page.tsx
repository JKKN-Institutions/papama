"use client";

import type { ComplianceReportResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, Dash, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/** Admin reports page — generated compliance/CSR report exports (contract §10). */
export default function AdminReportsPage() {
    const { items, state, errorMsg } = useAdminList<ComplianceReportResponse>(
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
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="reports"
                emptyHint="Reports will appear here once they are generated."
                table={
                    <TableShell>
                        <TableHead columns={["Type", "Title", "Period", "File", "Created"]} />
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
                                            "—"
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {r.file_url ? (
                                            <a
                                                href={r.file_url}
                                                className="text-blue-600 hover:underline"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Download
                                            </a>
                                        ) : (
                                            "—"
                                        )}
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
