"use client";

import { useCan } from "@/components/auth/AppUserProvider";
import type { FraudFlagDetailResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    BoolBadge,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/** Admin fraud page — fraud flags with severity, detection method and block state (contract §9). */
export default function AdminFraudPage() {
    const canManage = useCan("fraud_monitoring", "update");
    const { items, state, errorMsg, reload } = useAdminList<FraudFlagDetailResponse>(
        "/api/admin/fraud",
        "fraud_flags",
        "/admin/fraud"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/fraud", reload);

    const columns = [
        "Type",
        "Severity",
        "Status",
        "Detection",
        "Entity",
        "Blocked",
        "Created",
    ];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Fraud"
                subtitle="Flagged tokens, beneficiaries and vendors for review."
                count={state === "ready" ? items.length : undefined}
            />

            {actionError && (
                <div className="mb-4">
                    <Notice tone="error" title="Action failed">
                        {actionError}
                    </Notice>
                </div>
            )}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="fraud flags"
                emptyHint="Fraud flags will appear here as detections are raised."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
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
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            {f.status === "open" ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={busyId === f.id}
                                                        onClick={() =>
                                                            run(f.id, {
                                                                flag_id: f.id,
                                                                action: "resolve",
                                                            })
                                                        }
                                                    >
                                                        Resolve
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={busyId === f.id}
                                                        onClick={() =>
                                                            run(
                                                                f.id,
                                                                { flag_id: f.id, action: "dismiss" },
                                                                "Dismiss this flag as a false positive? Any block it set will be lifted."
                                                            )
                                                        }
                                                    >
                                                        Dismiss
                                                    </ActionButton>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
