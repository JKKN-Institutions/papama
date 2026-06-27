"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader, Notice, StatusBadge, Dash } from "../_ui";

/* ---- Backend contract types ------------------------------------------------ */

interface VendorProfile {
  name: string;
  legal_name: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  emergency_contact: string | null;
  fssai_license: string | null;
  gst_number: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  settlement_cycle: SettlementCycle | null;
  status: string;
  kyc_status: string;
}

type SettlementCycle = "daily" | "twice_weekly" | "weekly";

const SETTLEMENT_CYCLES: { value: SettlementCycle; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "twice_weekly", label: "Twice a week" },
  { value: "weekly", label: "Weekly" },
];

interface VendorDocument {
  id: string;
  doc_type: string;
  verification_status: string;
  signed_url: string | null;
  created_at: string;
}

// Editable string fields (status / kyc_status / geo are handled separately).
type EditableField =
  | "name"
  | "legal_name"
  | "address"
  | "city"
  | "pincode"
  | "phone"
  | "email"
  | "emergency_contact"
  | "fssai_license"
  | "gst_number"
  | "bank_account_name"
  | "bank_account_number"
  | "bank_ifsc";

const EDITABLE_FIELDS: { key: EditableField; label: string }[] = [
  { key: "name", label: "Business name" },
  { key: "legal_name", label: "Legal name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "pincode", label: "Pincode" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Contact email" },
  { key: "emergency_contact", label: "Emergency contact" },
  { key: "fssai_license", label: "FSSAI license #" },
  { key: "gst_number", label: "GST number" },
  { key: "bank_account_name", label: "Account holder name" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_ifsc", label: "IFSC" },
];

const DOC_TYPES = [
  { value: "fssai", label: "FSSAI license" },
  { value: "gst", label: "GST certificate" },
  { value: "shop_photo", label: "Shop photo" },
  { value: "kyc", label: "KYC document" },
];

type FormState = Record<EditableField, string>;

function toForm(v: VendorProfile): FormState {
  const out = {} as FormState;
  for (const { key } of EDITABLE_FIELDS) out[key] = v[key] ?? "";
  return out;
}

export default function VendorProfilePage() {
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [cycle, setCycle] = useState<SettlementCycle | "">("");
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Documents
  const [docs, setDocs] = useState<VendorDocument[]>([]);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState(DOC_TYPES[0].value);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /* ---- Loaders ------------------------------------------------------------- */

  async function loadProfile() {
    setState("loading");
    try {
      const res = await fetch("/api/vendor/profile", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/profile");
        return;
      }
      if (res.status === 403) {
        setState("forbidden");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `Request failed (${res.status})`);
        setState("error");
        return;
      }
      const body = (await res.json()) as { vendor: VendorProfile };
      setVendor(body.vendor);
      setForm(toForm(body.vendor));
      setCycle(body.vendor.settlement_cycle ?? "");
      setState("ready");
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  }

  async function loadDocuments() {
    setDocsError(null);
    try {
      const res = await fetch("/api/vendor/documents", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/profile");
        return;
      }
      if (!res.ok) {
        setDocsError(`Couldn’t load documents (${res.status}).`);
        return;
      }
      const body = (await res.json()) as { documents?: VendorDocument[] };
      setDocs(body.documents ?? []);
    } catch {
      setDocsError("Couldn’t load documents.");
    }
  }

  useEffect(() => {
    void loadProfile();
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Mutations ----------------------------------------------------------- */

  function setField(key: EditableField, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaveError(null);
    setSaved(false);

    if (!form.name.trim()) {
      setSaveError("Business name is required.");
      return;
    }

    // Send only the editable fields; trim and drop empty strings to null.
    const payload: Record<string, unknown> = {};
    for (const { key } of EDITABLE_FIELDS) {
      const v = form[key].trim();
      payload[key] = v === "" ? null : v;
    }
    // Settlement cycle is an enum (omit if unset — the column has no null value).
    if (cycle) payload.settlement_cycle = cycle;

    setSaving(true);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/profile");
        return;
      }
      if (res.status === 403) {
        setSaveError("You don’t have permission to edit this profile.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error ?? `Save failed (${res.status}).`);
        return;
      }
      const body = (await res.json()) as { vendor: VendorProfile };
      setVendor(body.vendor);
      setForm(toForm(body.vendor));
      setCycle(body.vendor.settlement_cycle ?? cycle);
      setSaved(true);
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    if (!docFile) {
      setUploadError("Choose a file to upload.");
      return;
    }
    const fd = new FormData();
    fd.append("file", docFile);
    fd.append("doc_type", docType);

    setUploading(true);
    try {
      const res = await fetch("/api/vendor/documents", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/profile");
        return;
      }
      if (res.status === 403) {
        setUploadError("You don’t have permission to upload documents.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUploadError(body.error ?? `Upload failed (${res.status}).`);
        return;
      }
      setDocFile(null);
      await loadDocuments();
    } catch {
      setUploadError("Network error — please try again.");
    } finally {
      setUploading(false);
    }
  }

  /* ---- Render -------------------------------------------------------------- */

  return (
    <div>
      <PageHeader title="My profile" subtitle="Your business details, documents, and verification status." />

      {state === "loading" && <div className="h-64 animate-pulse rounded-xl bg-slate-200/60" />}

      {state === "forbidden" && (
        <Notice tone="warn" title="Not permitted">
          Your account does not have permission to view this profile.
        </Notice>
      )}

      {state === "error" && (
        <Notice tone="error" title="Couldn’t load your profile">
          {errorMsg}
        </Notice>
      )}

      {state === "ready" && vendor && form && (
        <div className="space-y-6">
          {/* Read-only verification status */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                <div className="mt-1">
                  {vendor.status ? <StatusBadge value={vendor.status} /> : <Dash>{null}</Dash>}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">KYC</p>
                <div className="mt-1">
                  {vendor.kyc_status ? <StatusBadge value={vendor.kyc_status} /> : <Dash>{null}</Dash>}
                </div>
              </div>
            </div>
          </div>

          {/* Editable business details */}
          <form onSubmit={onSave} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Business details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Update your contact and bank information. Status and KYC are set by our team.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {EDITABLE_FIELDS.map(({ key, label }) => (
                <div key={key} className={key === "address" ? "sm:col-span-2" : ""}>
                  <label htmlFor={key} className="mb-1 block text-sm font-medium text-slate-700">
                    {label}
                    {key === "name" && <span className="text-red-500"> *</span>}
                  </label>
                  <input
                    id={key}
                    type={key === "email" ? "email" : "text"}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                  />
                </div>
              ))}
            </div>

            {/* Settlement cycle — vendor chooses how often they're paid out. */}
            <div className="mt-5">
              <label htmlFor="settlement_cycle" className="mb-1 block text-sm font-medium text-slate-700">
                Settlement cycle
              </label>
              <select
                id="settlement_cycle"
                value={cycle}
                onChange={(e) => {
                  setCycle(e.target.value as SettlementCycle | "");
                  setSaved(false);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 sm:w-1/2"
              >
                <option value="">Select a payout cadence…</option>
                {SETTLEMENT_CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                How often your proof-released redemptions are bundled into a payout.
              </p>
            </div>

            {/* Location is read-only here (captured during onboarding). */}
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Location</p>
              <p className="mt-1 text-sm text-slate-700">
                {vendor.geo_lat != null && vendor.geo_lng != null ? (
                  `${vendor.geo_lat.toFixed(4)}, ${vendor.geo_lng.toFixed(4)}`
                ) : (
                  <Dash>{null}</Dash>
                )}
              </p>
            </div>

            {saveError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {saveError}
              </p>
            )}
            {saved && (
              <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Saved.
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>

          {/* Documents */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload licenses and KYC documents for verification.
            </p>

            {docsError ? (
              <p className="mt-4 text-sm text-red-600">{docsError}</p>
            ) : docs.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No documents uploaded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium capitalize text-slate-900">
                        {d.doc_type.replace(/_/g, " ")}
                      </span>
                      {d.verification_status ? (
                        <StatusBadge value={d.verification_status} />
                      ) : (
                        <Dash>{null}</Dash>
                      )}
                    </div>
                    {d.signed_url ? (
                      <a
                        href={d.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={onUpload} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="doc_type" className="mb-1 block text-sm font-medium text-slate-700">
                    Document type
                  </label>
                  <select
                    id="doc_type"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="doc_file" className="mb-1 block text-sm font-medium text-slate-700">
                    File
                  </label>
                  <input
                    id="doc_file"
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                  />
                </div>
              </div>

              {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

              <button
                type="submit"
                disabled={uploading || !docFile}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
              >
                {uploading ? "Uploading…" : "Upload document"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
