"use client";

import type { AuditLogResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, Dash, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/** Admin audit-logs page — the append-only, immutable action trail (contract §10). */
export default function AdminAuditLogsPage() {
    const { items, state, errorMsg } = useAdminList<AuditLogResponse>(
        "/api/admin/audit-logs",
        "audit_logs",
        "/admin/audit-logs"
    );

    return (
        <div>
            <AdminPageHeader
                title="Audit logs"
                subtitle="Append-only, immutable trail of every admin action. Newest first."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="audit logs"
                emptyHint="Audit entries will appear here as admin actions are recorded."
                table={
                    <TableShell>
                        <TableHead columns={["Action", "Actor role", "Entity", "Summary", "When"]} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((a) => (
                                <tr key={a.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        {a.action}
                                    </td>
                                    <td className="px-4 py-3">
                                        {a.actor_role ? (
                                            <StatusBadge value={a.actor_role} />
                                        ) : (
                                            <span className="text-xs text-slate-400">system</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {a.entity_table}
                                        {a.entity_id && (
                                            <span className="ml-1 font-mono text-xs text-slate-400">
                                                {a.entity_id}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{a.summary}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(a.created_at).toLocaleString()}
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
