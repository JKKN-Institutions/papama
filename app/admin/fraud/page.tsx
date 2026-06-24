"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { FraudFlagDetailResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    BoolBadge,
    Dash,
    ListStates,
    Notice,
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/** Admin fraud page — fraud flags with severity, detection method and block state (contract §9). */
export default function AdminFraudPage() {
    const canManage = useCan("fraud_monitoring", "update");
    const canScan = useCan("fraud_monitoring", "create");
    const { items, state, errorMsg, reload } = useAdminList<FraudFlagDetailResponse>(
        "/api/admin/fraud",
        "fraud_flags",
        "/admin/fraud"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/fraud", reload);

    // Inline notes: map of flagId → { action, draft text }. Replaces window.prompt().
    const [pendingAction, setPendingAction] = useState<
        Record<string, { action: "resolve" | "dismiss" | "unblock"; notes: string } | undefined>
    >({});

    function openNotes(id: string, action: "resolve" | "dismiss" | "unblock") {
        setPendingAction((prev) => ({ ...prev, [id]: { action, notes: "" } }));
    }

    function cancelNotes(id: string) {
        setPendingAction((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }

    function submitNotes(id: string) {
        const pending = pendingAction[id];
        if (!pending) return;
        cancelNotes(id);
        run(id, { flag_id: id, action: pending.action, notes: pending.notes.trim() || undefined });
    }

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
                subtitle="Flagged tokens, beneficiaries and vendors. Repeat-beneficiary and duplicate-token attempts flag live; run a sweep for vendor volume anomalies."
                count={state === "ready" ? items.length : undefined}
            />

            {canScan && (
                <RunJobBar
                    label="Vendor anomaly sweep:"
                    endpoint="/api/admin/fraud/scan"
                    buttonText="Run fraud scan"
                    busyText="Scanning…"
                    successMessage={(d) =>
                        Number(d.flags_created) > 0
                            ? `Sweep raised ${d.flags_created} new vendor-anomaly flag(s).`
                            : "No vendor volume anomalies detected."
                    }
                    onDone={reload}
                />
            )}

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
                                            {/* Inline notes form replaces window.prompt(). */}
                                            {pendingAction[f.id] ? (
                                                <div className="space-y-1.5">
                                                    <p className="text-[11px] font-medium text-slate-600 capitalize">
                                                        {pendingAction[f.id]!.action === "unblock"
                                                            ? "Reason for lifting the block"
                                                            : `Notes for ${pendingAction[f.id]!.action}`}{" "}
                                                        <span className="text-slate-400">(optional)</span>
                                                    </p>
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        aria-label="Resolution notes"
                                                        value={pendingAction[f.id]!.notes}
                                                        onChange={(e) =>
                                                            setPendingAction((prev) => ({
                                                                ...prev,
                                                                [f.id]: {
                                                                    ...prev[f.id]!,
                                                                    notes: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") submitNotes(f.id);
                                                            if (e.key === "Escape") cancelNotes(f.id);
                                                        }}
                                                        className="block w-full min-w-[160px] rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                        placeholder="Optional notes…"
                                                    />
                                                    <div className="flex gap-1.5">
                                                        <ActionButton
                                                            tone="primary"
                                                            disabled={busyId === f.id}
                                                            onClick={() => submitNotes(f.id)}
                                                        >
                                                            Confirm
                                                        </ActionButton>
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busyId === f.id}
                                                            onClick={() => cancelNotes(f.id)}
                                                        >
                                                            Cancel
                                                        </ActionButton>
                                                    </div>
                                                </div>
                                            ) : f.status === "open" ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    <ActionButton
                                                        tone="primary"
                                                        disabled={busyId === f.id}
                                                        onClick={() => openNotes(f.id, "resolve")}
                                                    >
                                                        Resolve
                                                    </ActionButton>
                                                    <ActionButton
                                                        tone="neutral"
                                                        disabled={busyId === f.id}
                                                        onClick={() => openNotes(f.id, "dismiss")}
                                                    >
                                                        Dismiss
                                                    </ActionButton>
                                                    {f.blocked && (
                                                        <ActionButton
                                                            tone="neutral"
                                                            disabled={busyId === f.id}
                                                            onClick={() => openNotes(f.id, "unblock")}
                                                        >
                                                            Unblock
                                                        </ActionButton>
                                                    )}
                                                </div>
                                            ) : f.blocked ? (
                                                // Resolved/dismissed but still blocked → the only lever left.
                                                <ActionButton
                                                    tone="neutral"
                                                    disabled={busyId === f.id}
                                                    onClick={() => openNotes(f.id, "unblock")}
                                                >
                                                    Unblock
                                                </ActionButton>
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

