"use client";

import type { FraudFlagDetailResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, BoolBadge, Dash, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/** Admin fraud page — fraud flags with severity, detection method and block state (contract §9). */
export default function AdminFraudPage() {
    const { items, state, errorMsg } = useAdminList<FraudFlagDetailResponse>(
        "/api/admin/fraud",
        "fraud_flags",
        "/admin/fraud"
    );

    return (
        <div>
            <AdminPageHeader
                title="Fraud"
                subtitle="Flagged tokens, beneficiaries and vendors for review."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="fraud flags"
                emptyHint="Fraud flags will appear here as detections are raised."
                table={
                    <TableShell>
                        <TableHead
                            columns={[
                                "Type",
                                "Severity",
                                "Status",
                                "Detection",
                                "Entity",
                                "Blocked",
                                "Created",
                            ]}
                        />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((f) => (
                                <tr key={f.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium capitalize text-slate-900">
                                        {f.flag_type.replace(/_/g, " ")}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={f.severity} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={f.status} />
                                    </td>
                                    <td className="px-4 py-3 capitalize text-slate-600">
                                        <Dash>{f.detection_method?.replace(/_/g, " ")}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <span className="capitalize">{f.entity.kind}</span>{" "}
                                        <span className="font-mono text-xs text-slate-400">
                                            {f.entity.id}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <BoolBadge value={f.blocked} danger yes="Blocked" no="No" />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(f.created_at).toLocaleDateString()}
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
