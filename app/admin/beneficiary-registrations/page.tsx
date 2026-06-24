"use client";

import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import BeneficiaryRegisterForm from "@/components/beneficiary/BeneficiaryRegisterForm";

import {
    AdminPageHeader,
    Dash,
    ListStates,
    StatusBadge,
    TableHead,
    TableShell,
    useAdminList,
} from "../_ui";

type RegistrationRow = {
    id: string;
    full_name: string | null;
    category: string;
    contact: string | null;
    location_hint: string | null;
    status: string;
    face_hash_present: boolean;
    aadhaar_present: boolean;
    document_count: number;
    beneficiary_id: string | null;
    review_notes: string | null;
    created_at: string;
};

/** Admin beneficiary-registration queue — submit, review, approve/reject (BEN, demo step 2). */
export default function BeneficiaryRegistrationsPage() {
    // Submitting a registration is `create`; approving/rejecting is `update`.
    const canCreate = useCan("beneficiary_registration", "create");
    const canManage = useCan("beneficiary_registration", "update");
    const { items, state, errorMsg, reload } = useAdminList<RegistrationRow>(
        "/api/admin/beneficiary-registrations",
        "registrations",
        "/admin/beneficiary-registrations"
    );

    const columns = ["Name", "Category", "Contact", "Identity", "Status", "Submitted"];
    if (canManage) columns.push("Decision");

    return (
        <div>
            <AdminPageHeader
                title="Beneficiary registrations"
                subtitle="Submit and review eligibility. Approval creates an active, verified beneficiary with category-driven auto-expiry."
                count={state === "ready" ? items.length : undefined}
            />

            {canCreate && <BeneficiaryRegisterForm onDone={reload} heading="Register a beneficiary (staff)" />}

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="registrations"
                emptyHint="Submit a registration above to start the approval queue."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-slate-800">
                                        <Dash>{r.full_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 capitalize text-slate-700">
                                        {r.category.replace(/_/g, " ")}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <Dash>{r.contact}</Dash>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {r.face_hash_present ? "face ✓" : "no face"}
                                        {r.aadhaar_present ? " · aadhaar ✓" : ""}
                                        {r.document_count > 0 ? ` · ${r.document_count} doc(s)` : ""}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={r.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </td>
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            {r.status === "pending" ? (
                                                <DecisionButtons id={r.id} onDone={reload} />
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

function DecisionButtons({ id, onDone }: { id: string; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function decide(decision: "approve" | "reject") {
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/beneficiary-registrations/${id}/decide`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decision }),
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
