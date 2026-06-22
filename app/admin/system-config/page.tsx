"use client";

import type { SystemConfigRow } from "@/lib/validation/schemas";

import { AdminPageHeader, Dash, ListStates, TableHead, TableShell, useAdminList } from "../_ui";

/**
 * Admin system-config page — admin-tunable rules read at runtime (contract §1).
 * A null `value` is intentional ("unset", e.g. max_tokens_per_volunteer pending
 * the mentor's number) and is rendered as such — never as a guessed default.
 */
export default function AdminSystemConfigPage() {
    const { items, state, errorMsg } = useAdminList<SystemConfigRow>(
        "/api/admin/system-config",
        "config",
        "/admin/system-config"
    );

    return (
        <div>
            <AdminPageHeader
                title="System config"
                subtitle="Admin-tunable rules read at runtime. Unset values are shown, never guessed."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="config rows"
                emptyHint="Configuration rows will appear here once they are seeded."
                table={
                    <TableShell>
                        <TableHead columns={["Key", "Value", "Type", "Description", "Updated"]} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((c) => (
                                <tr key={c.key} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                                        {c.key}
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        {c.value == null ? (
                                            <span className="text-xs italic text-amber-600">unset</span>
                                        ) : (
                                            <span className="font-medium">{c.value}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{c.value_type}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{c.description}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(c.updated_at).toLocaleDateString()}
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
