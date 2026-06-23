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

const CATEGORIES = [
    { value: "pregnant_women", label: "Pregnant women" },
    { value: "patient", label: "Patient" },
    { value: "disability", label: "Disability" },
    { value: "disaster_affected", label: "Disaster-affected" },
] as const;

/** Admin beneficiary-registration queue — submit, review, approve/reject (BEN, demo step 2). */
export default function BeneficiaryRegistrationsPage() {
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

            {canManage && <RegisterForm onDone={reload} />}

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

function RegisterForm({ onDone }: { onDone: () => void }) {
    const [category, setCategory] = useState<string>("pregnant_women");
    const [fullName, setFullName] = useState("");
    const [contact, setContact] = useState("");
    const [locationHint, setLocationHint] = useState("");
    const [faceHash, setFaceHash] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function submit() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch("/api/admin/beneficiary-registrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category,
                    full_name: fullName.trim() || undefined,
                    contact: contact.trim() || undefined,
                    location_hint: locationHint.trim() || undefined,
                    face_hash: faceHash.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setMsg("Registration submitted (pending review).");
            setFullName("");
            setContact("");
            setLocationHint("");
            setFaceHash("");
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to submit.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Register a beneficiary (volunteer-assisted)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-slate-600">
                    Category
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={busy}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>
                <Field label="Full name (optional)" value={fullName} onChange={setFullName} disabled={busy} />
                <Field label="Contact (optional)" value={contact} onChange={setContact} disabled={busy} />
                <Field label="Location hint (optional)" value={locationHint} onChange={setLocationHint} disabled={busy} />
                <Field label="Face hash (enrolment)" value={faceHash} onChange={setFaceHash} disabled={busy} mono />
            </div>
            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={submit}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                    {busy ? "Submitting…" : "Submit registration"}
                </button>
                {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
                {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    disabled,
    mono,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
    mono?: boolean;
}) {
    return (
        <label className="text-xs text-slate-600">
            {label}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 ${
                    mono ? "font-mono" : ""
                }`}
            />
        </label>
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
