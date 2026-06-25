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
 * Admin proof-of-service review queue. Vendors upload a plate photo + receipt for
 * each redemption; payment stays LOCKED until an admin approves the evidence here.
 * Approving releases the payment (it then rolls into settlement); rejecting keeps
 * it locked and records a reason the vendor can act on by re-uploading.
 */

type ProofRow = {
    redemption_id: string;
    vendor_id: string;
    vendor_name: string | null;
    token_value_inr: number;
    menu_value_inr: number;
    settlement_amount_inr: number;
    payment_status: string;
    proof_status: string | null;
    proof_review_note: string | null;
    proof_uploaded_at: string | null;
    photo_url: string | null;
    receipt_url: string | null;
};

export default function AdminProofsPage() {
    const canReview = useCan("proof_of_service", "update");
    const { items, state, errorMsg, reload } = useAdminList<ProofRow>(
        "/api/admin/proofs",
        "proofs",
        "/admin/proofs"
    );

    const columns = ["Vendor", "Redemption", "Payout", "Uploaded", "Proof", "Status"];
    if (canReview) columns.push("Decision");

    return (
        <div>
            <AdminPageHeader
                title="Proof review"
                subtitle="Verify each vendor's plate photo + receipt. Approving releases the locked payment for settlement; rejecting keeps it locked until the vendor re-uploads."
                count={state === "ready" ? items.length : undefined}
            />

            <ListStates
                state={state}
                errorMsg={errorMsg}
                isEmpty={items.length === 0}
                resourceLabel="proofs awaiting review"
                emptyHint="When vendors upload proof for a redemption, it appears here for approval before any payout."
                table={
                    <TableShell>
                        <TableHead columns={columns} />
                        <tbody className="divide-y divide-slate-100">
                            {items.map((p) => (
                                <tr key={p.redemption_id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <Dash>{p.vendor_name}</Dash>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                        {p.redemption_id.slice(0, 8)}…
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                        ₹{p.settlement_amount_inr}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {p.proof_uploaded_at
                                            ? new Date(p.proof_uploaded_at).toLocaleString("en-IN")
                                            : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <ProofThumb label="Plate" url={p.photo_url} />
                                            <ProofThumb label="Receipt" url={p.receipt_url} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge value={p.proof_status ?? "—"} />
                                        {p.proof_status === "rejected" && p.proof_review_note && (
                                            <p className="mt-1 max-w-[12rem] text-[10px] text-red-600">
                                                {p.proof_review_note}
                                            </p>
                                        )}
                                    </td>
                                    {canReview && (
                                        <td className="px-4 py-3">
                                            {p.proof_status === "submitted" ? (
                                                <DecisionButtons
                                                    id={p.redemption_id}
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

/** A small clickable proof thumbnail (opens full image in a new tab). */
function ProofThumb({ label, url }: { label: string; url: string | null }) {
    if (!url) {
        return (
            <span className="flex h-14 w-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[9px] text-slate-400">
                no {label.toLowerCase()}
            </span>
        );
    }
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" title={`Open ${label}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={url}
                alt={`${label} proof`}
                className="h-14 w-14 rounded-md border border-slate-200 object-cover transition hover:ring-2 hover:ring-slate-400"
            />
        </a>
    );
}

function DecisionButtons({ id, onDone }: { id: string; onDone: () => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function decide(decision: "approve" | "reject") {
        let note: string | undefined;
        if (decision === "reject") {
            const entered = window.prompt("Reason for rejecting this proof (the vendor will see it):");
            if (entered == null) return; // cancelled
            note = entered.trim();
            if (!note) {
                setErr("A rejection reason is required.");
                return;
            }
        }
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/proofs/${id}/decide`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(note ? { decision, note } : { decision }),
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
