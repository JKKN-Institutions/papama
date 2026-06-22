"use client";

import type { NgoPartnerResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, Dash, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/** Admin NGO partners page — partner NGO/organisation reference registry (spec §5). */
export default function AdminNgoPartnersPage() {
    const { items, state, errorMsg } = useAdminList<NgoPartnerResponse>(
        "/api/admin/ngo-partners",
        "ngo_partners",
        "/admin/ngo-partners"
    );

    return (
        <div>
            <AdminPageHeader
                title="NGO partners"
                subtitle="Partner NGOs and organisations. Admin-managed reference data."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="NGO partners"
                emptyHint="Partner NGOs will appear here once they are added."
                table={
                    <TableShell>
                        <TableHead
                            columns={["Name", "Reg. number", "Focus", "Contact", "City", "Status"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((n) => (
                                <tr key={n.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">{n.name}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{n.registration_number}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{n.focus_area}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{n.contact_person ?? n.contact_email}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{n.city}</Dash>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={n.status} />
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
