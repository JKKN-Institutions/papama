"use client";

import type { BeneficiaryResponse } from "@/lib/validation/schemas";

import { AdminPageHeader, BoolBadge, ListStates, StatusBadge, TableHead, TableShell, useAdminList } from "../_ui";

/**
 * Admin beneficiaries page. Privacy-first by design: the route returns only the
 * boolean presence flags (`aadhaar_linked`, `face_hash_valid`) — never the raw
 * face/Aadhaar hashes — so this table can only ever render category, status,
 * eligibility and those two booleans.
 */
export default function AdminBeneficiariesPage() {
    const { items, state, errorMsg } = useAdminList<BeneficiaryResponse>(
        "/api/admin/beneficiaries",
        "beneficiaries",
        "/admin/beneficiaries"
    );

    return (
        <div>
            <AdminPageHeader
                title="Beneficiaries"
                subtitle="Approved beneficiary registry. Identity hashes are never shown — only presence flags."
                count={state === "ready" ? items.length : undefined}
            />
            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="beneficiaries"
                emptyHint="Beneficiaries will appear here once they are registered and approved."
                table={
                    <TableShell>
                        <TableHead
                            columns={[
                                "Category",
                                "Status",
                                "Eligibility",
                                "Aadhaar linked",
                                "Face hash",
                                "Registered",
                            ]}
                        />
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
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                }
            />
        </div>
    );
}
