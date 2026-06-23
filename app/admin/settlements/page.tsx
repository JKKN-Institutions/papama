"use client";

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
                subtitle="Vendor settlement headers. Amounts populate once line items land."
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
