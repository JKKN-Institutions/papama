"use client";

import type { SettlementResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, Dash, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/** Admin settlements page — vendor settlement headers and payout status (contract §8). */
export default function AdminSettlementsPage() {
    const { items, state, errorMsg } = useAdminList<SettlementResponse>(
        "/api/admin/settlements",
        "settlements",
        "/admin/settlements"
    );

    return (
        <div>
            <AdminPageHeader
                title="Settlements"
                subtitle="Vendor settlement headers. Amounts populate once line items land."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="settlements"
                emptyHint="Settlements will appear here once settlement cycles run."
                table={
                    <TableShell>
                        <TableHead
                            columns={["Vendor", "Period", "Amount", "Status", "Line items", "Settled"]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((s) => (
                                <tr key={s.settlement_id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                        {s.vendor_id}
                                    </td>
                                    <td className="px-4 py-3 capitalize text-slate-700">
                                        {s.period.replace(/_/g, " ")}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        ₹{s.amount.toLocaleString("en-IN")}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={s.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{s.line_items}</td>
                                    <td className="px-4 py-3 text-slate-500">
                                        <Dash>
                                            {s.settled_at
                                                ? new Date(s.settled_at).toLocaleDateString()
                                                : null}
                                        </Dash>
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
