"use client";

import { useCan } from "@/components/auth/AppUserProvider";
import type { BeneficiaryResponse } from "@/lib/validation/schemas";

import {
    ActionButton,
    AdminPageHeader,
    BoolBadge,
    ListStates,
    Notice,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
    useRowAction,
} from "../_ui";

/**
 * Admin beneficiaries page. Privacy-first by design: the route returns only the
 * boolean presence flags (`aadhaar_linked`, `face_hash_valid`) — never the raw
 * face/Aadhaar hashes — so this table can only ever render category, status,
 * eligibility and those two booleans. Admins can suspend/activate/block records.
 */
export default function AdminBeneficiariesPage() {
    const canManage = useCan("beneficiary_registration", "update");
    const { items, state, errorMsg, reload } = useAdminList<BeneficiaryResponse>(
        "/api/admin/beneficiaries",
        "beneficiaries",
        "/admin/beneficiaries"
    );
    const { run, busyId, actionError } = useRowAction("/api/admin/beneficiaries", reload);

    const columns = [
        "Category",
        "Status",
        "Eligibility",
        "Aadhaar linked",
        "Face hash",
        "Registered",
    ];
    if (canManage) columns.push("Actions");

    return (
        <div>
            <AdminPageHeader
                title="Beneficiaries"
                subtitle="Approved beneficiary registry. Identity hashes are never shown — only presence flags."
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
                resourceLabel="beneficiaries"
                emptyHint="Beneficiaries will appear here once they are registered and approved."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((b) => (
                                <tr key={b.beneficiary_id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium capitalize text-slate-900">
                                        {b.category.replace(/_/g, " ")}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={b.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={b.eligibility} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <BoolBadge value={b.aadhaar_linked} yes="Linked" no="No" />
                                    </td>
                                    <td className="px-4 py-3">
                                        <BoolBadge value={b.face_hash_valid} yes="Valid" no="Missing" />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(b.registered_at).toLocaleDateString()}
                                    </td>
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            <BeneficiaryActions
                                                id={b.beneficiary_id}
                                                status={b.status}
                                                busy={busyId === b.beneficiary_id}
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

function BeneficiaryActions({
    id,
    status,
    busy,
    run,
}: {
    id: string;
    status: BeneficiaryResponse["status"];
    busy: boolean;
    run: (rowId: string, payload: Record<string, unknown>, confirmText?: string) => void;
}) {
    if (status === "blocked") return <span className="text-xs text-slate-400">—</span>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {status === "suspended" ? (
                <ActionButton
                    tone="primary"
                    disabled={busy}
                    onClick={() => run(id, { beneficiary_id: id, action: "activate" })}
                >
                    Activate
                </ActionButton>
            ) : (
                <ActionButton
                    tone="warn"
                    disabled={busy}
                    onClick={() =>
                        run(
                            id,
                            { beneficiary_id: id, action: "suspend" },
                            "Suspend this beneficiary? They cannot redeem while suspended."
                        )
                    }
                >
                    Suspend
                </ActionButton>
            )}
            <ActionButton
                tone="danger"
                disabled={busy}
                onClick={() =>
                    run(
                        id,
                        { beneficiary_id: id, action: "block" },
                        "Block this beneficiary permanently? This cannot be undone here."
                    )
                }
            >
                Block
            </ActionButton>
        </div>
    );
}
