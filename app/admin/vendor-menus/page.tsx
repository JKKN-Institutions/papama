"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";

import {
    AdminPageHeader,
    Dash,
    ListStates,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
} from "../_ui";

/**
 * Admin vendor-menu approval queue. Vendors propose menu items; staff with
 * vendor_management/update approve or reject each pending row. Approving a
 * special-care-equivalent item carries `special_care_equivalent: true` so the
 * decide route records the equivalence approval. Mirrors the
 * beneficiary-registrations decision-queue style.
 */

type MenuRow = {
    id: string;
    vendor_id: string;
    vendor_name: string;
    item_name: string;
    price: number | null;
    nutrition_category: string | null;
    is_special_care_equivalent: boolean;
    special_care_equivalent_approved: boolean;
    approval_status: string;
    created_at: string;
};

export default function AdminVendorMenusPage() {
    const canManage = useCan("vendor_management", "update");
    const { items, state, errorMsg, reload } = useAdminList<MenuRow>(
        "/api/admin/vendor-menus",
        "menus",
        "/admin/vendor-menus"
    );

    const columns = ["Vendor", "Item", "Price", "Category", "Special-care", "Status"];
    if (canManage) columns.push("Decision");

    return (
        <div>
            <AdminPageHeader
                title="Vendor menus"
                subtitle="Approve vendor-proposed menu items. Approving a Special-Care-equivalent item records the equivalence approval."
                count={state === "ready" ? items.length : undefined}
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="menu items"
                emptyHint="Menu items proposed by vendors will appear here for review."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((m) => (
                                <tr key={m.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <Dash>{m.vendor_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-800">
                                        <Dash>{m.item_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {m.price != null ? `₹${m.price}` : "—"}
                                    </td>
                                    <td className="px-4 py-3 capitalize text-slate-700">
                                        <Dash>{m.nutrition_category?.replace(/_/g, " ")}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {m.is_special_care_equivalent
                                            ? m.special_care_equivalent_approved
                                                ? "equiv ✓ approved"
                                                : "equiv (pending)"
                                            : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={m.approval_status} />
                                    </td>
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            {m.approval_status === "pending" ? (
                                                <DecisionButtons
                                                    id={m.id}
                                                    isSpecialCareEquivalent={m.is_special_care_equivalent}
                                                    onDone={reload}
                                                />
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

function DecisionButtons({
    id,
    isSpecialCareEquivalent,
    onDone,
}: {
    id: string;
    isSpecialCareEquivalent: boolean;
    onDone: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function decide(decision: "approve" | "reject") {
        setBusy(true);
        setErr(null);
        try {
            const body: { decision: "approve" | "reject"; special_care_equivalent?: boolean } = {
                decision,
            };
            // Only carry the equivalence flag when approving an equivalent item.
            if (decision === "approve" && isSpecialCareEquivalent) {
                body.special_care_equivalent = true;
            }
            const res = await fetch(`/api/admin/vendor-menus/${id}/decide`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed.");
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <button
                type="button"
                onClick={() => decide("approve")}
                disabled={busy}
                className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
            >
                Approve
            </button>
            <button
                type="button"
                onClick={() => decide("reject")}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
                Reject
            </button>
            {err && <span className="text-[10px] text-red-700">{err}</span>}
        </div>
    );
}
