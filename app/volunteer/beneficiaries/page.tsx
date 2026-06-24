"use client";

import { useState } from "react";

import {
  Dash,
  ListStates,
  Notice,
  PageHeader,
  StatusBadge,
  TableHead,
  TableShell,
  useVolunteerFetch,
  useVolunteerPost,
} from "../_ui";

/** A beneficiary registration this volunteer has submitted (assisted). */
interface AssistedRegistration {
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
}

/** The four registrable categories (mirrors the route's Zod enum). */
const CATEGORIES: { value: string; label: string }[] = [
  { value: "pregnant_women", label: "Pregnant women" },
  { value: "patient", label: "Patient" },
  { value: "disability", label: "Disability" },
  { value: "disaster_affected", label: "Disaster affected" },
];

/**
 * Volunteer "assist beneficiary registration" page (owner-scope §3 / Q16).
 * A volunteer submits a registration on a beneficiary's behalf — it lands as
 * `pending` for an admin to approve. Volunteers can NOT approve (enforced by the
 * permission matrix + RLS); this page only submits and tracks their own queue.
 */
export default function VolunteerBeneficiariesPage() {
  // GET /api/volunteer/beneficiary-registrations → only this volunteer's own.
  const regs = useVolunteerFetch<AssistedRegistration[]>(
    "/api/volunteer/beneficiary-registrations",
    "registrations",
    "/volunteer/beneficiaries"
  );

  const list = regs.data ?? [];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Assist beneficiary registration"
        subtitle="Register a beneficiary on their behalf. The admin reviews and approves before any token can be redeemed."
      />

      <RegisterSection onSubmitted={regs.reload} />

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">My submissions</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Registrations you have submitted, with their approval status.
          </p>
        </div>
        <ListStates
          state={regs.state}
          errorMsg={regs.errorMsg}
          isEmpty={list.length === 0}
          resourceLabel="registrations"
          emptyHint="Submit a registration above and it will appear here with its status."
        >
          <TableShell>
            <TableHead
              columns={["Name", "Category", "Contact", "Location", "ID proof", "Status", "Submitted"]}
            />
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900">
                    <Dash>{r.full_name}</Dash>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">
                    {r.category.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Dash>{r.contact}</Dash>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Dash>{r.location_hint}</Dash>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.aadhaar_present ? "Aadhaar" : r.face_hash_present ? "Face" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </ListStates>
      </section>
    </div>
  );
}

/* ── register form ─────────────────────────────────────────────────────────── */

function RegisterSection({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const { post } = useVolunteerPost();
  const [fullName, setFullName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [contact, setContact] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [aadhaarHash, setAadhaarHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { category };
      if (fullName.trim()) body.full_name = fullName.trim();
      if (contact.trim()) body.contact = contact.trim();
      if (locationHint.trim()) body.location_hint = locationHint.trim();
      if (aadhaarHash.trim()) body.aadhaar_hash = aadhaarHash.trim();
      await post<{ id: string; status: string }>(
        "/api/volunteer/beneficiary-registrations",
        body
      );
      setMsg("Registration submitted — pending admin approval.");
      setFullName("");
      setContact("");
      setLocationHint("");
      setAadhaarHash("");
      setCategory(CATEGORIES[0].value);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">New registration</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Only the category is required. Add what the beneficiary can provide.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <Field label="Full name (optional)">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Lakshmi R"
            className={INPUT}
          />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact (optional)">
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Phone or alternate contact"
            className={INPUT}
          />
        </Field>
        <Field label="Location hint (optional)">
          <input
            value={locationHint}
            onChange={(e) => setLocationHint(e.target.value)}
            placeholder="e.g. Relief camp 3"
            className={INPUT}
          />
        </Field>
        <Field label="Aadhaar reference (optional)">
          <input
            value={aadhaarHash}
            onChange={(e) => setAadhaarHash(e.target.value)}
            placeholder="Aadhaar is non-mandatory"
            className={INPUT}
          />
        </Field>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit registration"}
          </button>
          {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
          {error && <span className="text-xs font-medium text-red-700">{error}</span>}
        </div>
        <div className="sm:col-span-2">
          <Notice tone="info" title="Approval is admin-only">
            You can submit registrations; an admin reviews each one and approves eligibility.
            Aadhaar is non-mandatory — never insist on it.
          </Notice>
        </div>
      </form>
    </section>
  );
}

const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}
