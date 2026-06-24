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

            {canScan && <RunFraudScanBar onDone={reload} />}

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

/** Admin control to run the vendor volume-anomaly sweep. */
function RunFraudScanBar({ onDone }: { onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function scan() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/fraud/scan", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg(
                data.flags_created > 0
                    ? `Sweep raised ${data.flags_created} new vendor-anomaly flag(s).`
                    : "No vendor volume anomalies detected."
            );
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Scan failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">Vendor anomaly sweep:</span>
            <button
                type="button"
                onClick={scan}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
                {busy ? "Scanning…" : "Run fraud scan"}
            </button>
            {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
            {err && <span className="text-xs font-medium text-red-700">{err}</span>}
        </div>
    );
}
