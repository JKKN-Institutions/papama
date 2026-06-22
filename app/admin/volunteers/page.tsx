"use client";

import type { VolunteerResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, Dash, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/** Admin volunteers page — registry of volunteers who hold/distribute tokens (Path B). */
export default function AdminVolunteersPage() {
    const { items, state, errorMsg } = useAdminList<VolunteerResponse>(
        "/api/admin/volunteers",
        "volunteers",
        "/admin/volunteers"
    );

    return (
        <div>
            <AdminPageHeader
                title="Volunteers"
                subtitle="Volunteers who receive, hold and distribute tokens to beneficiaries."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="volunteers"
                emptyHint="Volunteers will appear here once they are registered."
                table={
                    <TableShell>
                        <TableHead columns={["Name", "Email", "Phone", "Status", "Joined"]} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((v) => (
                                <tr key={v.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <Dash>{v.full_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{v.email}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{v.phone}</Dash>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={v.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(v.created_at).toLocaleDateString()}
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
