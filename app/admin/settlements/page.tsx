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
    RunJobBar,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/** Admin settlements page — vendor settlement headers, payout status and lifecycle actions (contract §8). */
export default function AdminSettlementsPage() {
    const canManage = useCan("vendor_settlement", "update");
    const canRun = useCan("vendor_settlement", "create"); // the /run route requires `create`
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

            {canRun && <RunSettlementBar onDone={reload} />}

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
                                        {s.on_hold && (
                                            <span className="ml-1.5 inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
                                                held
                                            </span>
                                        )}
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
                                                onHold={s.on_hold}
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
    onHold,
    amount,
    busy,
    run,
}: {
    id: string;
    status: SettlementResponse["status"];
    onHold: boolean;
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
                    disabled={busy || onHold}
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
            {/* Admin override (owner §4.8): hold/delay any non-paid settlement, release to resume. */}
            {status !== "paid" &&
                (onHold ? (
                    <ActionButton tone="primary" disabled={busy} onClick={() => act("release")}>
                        Release
                    </ActionButton>
                ) : (
                    <ActionButton
                        tone="neutral"
                        disabled={busy}
                        onClick={() => act("hold", "Hold this settlement? It can't be paid until released.")}
                    >
                        Hold
                    </ActionButton>
                ))}
            {status === "paid" && <span className="text-xs text-slate-400">—</span>}
        </div>
    );
}

/** Admin control to run a settlement cycle — aggregates released redemptions into payouts. */
function RunSettlementBar({ onDone }: { onDone: () => void }) {
    const [period, setPeriod] = useState<"daily" | "twice_weekly" | "weekly">("weekly");

    return (
        <RunJobBar
            label="Run settlement cycle:"
            endpoint="/api/admin/settlements/run"
            buttonText="Run settlement"
            busyText="Running…"
            body={() => ({ period })}
            successMessage={(d) =>
                Number(d.settlements_created) > 0
                    ? `Created ${d.settlements_created} settlement(s) totalling ₹${Number(
                          d.total_amount
                      ).toLocaleString("en-IN")} across ${d.line_items} redemption(s).`
                    : "No proof-released redemptions are awaiting settlement."
            }
            onDone={onDone}
        >
            <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
                <option value="daily">Daily</option>
                <option value="twice_weekly">Twice weekly</option>
                <option value="weekly">Weekly</option>
            </select>
        </RunJobBar>
    );
}
