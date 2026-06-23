"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { SettlementResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    Dash,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/** Admin settlements page — vendor settlement headers, payout status and lifecycle actions (contract §8). */
export default function AdminSettlementsPage() {
    const canManage = useCan("vendor_settlement", "update");
    const { items, state, errorMsg, reload } = useAdminList<SettlementResponse>(
        "/api/admin/settlements",
        "settlements",
        "/admin/settlements"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/settlements", reload);

    const columns = ["Vendor", "Period", "Amount", "Status", "Line items", "Settled"];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Settlements"
                subtitle="Run a cycle to aggregate proof-released redemptions into per-vendor payouts, then lock → reconcile → pay."
                count={state === "ready" ? items.length : undefined}
            />

            {canManage && <RunSettlementBar onDone={reload} />}

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
                resourceLabel="settlements"
                emptyHint="Settlements will appear here once settlement cycles run."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
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
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            <SettlementActions
                                                id={s.settlement_id}
                                                status={s.status}
                                                amount={s.amount}
                                                busy={busyId === s.settlement_id}
                                                run={run}
                                            />
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

function SettlementActions({
    id,
    status,
    amount,
    busy,
    run,
}: {
    id: string;
    status: SettlementResponse["status"];
    amount: number;
    busy: boolean;
    run: (rowId: string, payload: Record<string, unknown>, confirmText?: string) => void;
}) {
    const act = (action: string, confirmText?: string) =>
        run(id, { settlement_id: id, action }, confirmText);

    return (
        <div className="flex flex-wrap gap-1.5">
            {status === "pending" && (
                <ActionButton tone="neutral" disabled={busy} onClick={() => act("lock")}>
                    Lock
                </ActionButton>
            )}
            {status === "locked" && (
                <>
                    <ActionButton tone="primary" disabled={busy} onClick={() => act("reconcile")}>
                        Reconcile
                    </ActionButton>
                    <ActionButton tone="neutral" disabled={busy} onClick={() => act("unlock")}>
                        Unlock
                    </ActionButton>
                </>
            )}
            {status === "reconciled" && (
                <ActionButton
                    tone="primary"
                    disabled={busy}
                    onClick={() =>
                        act(
                            "pay",
                            `Mark this settlement as paid (₹${amount.toLocaleString("en-IN")})? This stamps the payout time.`
                        )
                    }
                >
                    Mark paid
                </ActionButton>
            )}
            {status === "paid" && <span className="text-xs text-slate-400">—</span>}
        </div>
    );
}

/** Admin control to run a settlement cycle — aggregates released redemptions into payouts. */
function RunSettlementBar({ onDone }: { onDone: () => void }) {
    const [period, setPeriod] = useState<"daily" | "twice_weekly" | "weekly">("weekly");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function runIt() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/settlements/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ period }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg(
                data.settlements_created > 0
                    ? `Created ${data.settlements_created} settlement(s) totalling ₹${Number(
                          data.total_amount
                      ).toLocaleString("en-IN")} across ${data.line_items} redemption(s).`
                    : "No proof-released redemptions are awaiting settlement."
            );
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to run settlement.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">Run settlement cycle:</span>
            <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
                <option value="daily">Daily</option>
                <option value="twice_weekly">Twice weekly</option>
                <option value="weekly">Weekly</option>
            </select>
            <button
                type="button"
                onClick={runIt}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
                {busy ? "Running…" : "Run settlement"}
            </button>
            {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
            {err && <span className="text-xs font-medium text-red-700">{err}</span>}
        </div>
    );
}
