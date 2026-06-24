"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Vendor registration (public). Handles BOTH onboarding entry points:
 *
 *   A. Not signed in → email + password + all business fields. On submit we
 *      `supabase.auth.signUp` with { full_name, account_type: 'vendor' } metadata.
 *      - session returned (email-confirm OFF) → POST /api/vendor/register → /vendor
 *      - no session (email-confirm ON)        → "check your email" notice
 *
 *   B. Signed in but no vendor record yet (the post-confirmation path) → only the
 *      business-fields form → POST /api/vendor/register → /vendor.
 *
 * The signed-in vs. signed-out decision is made via supabase.auth.getSession().
 */

/* ---- Business fields shared by both branches ------------------------------- */

interface BusinessFields {
  name: string;
  legal_name: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  email: string;
  emergency_contact: string;
  fssai_license: string;
  gst_number: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  geo_lat: number | null;
  geo_lng: number | null;
}

const EMPTY_BUSINESS: BusinessFields = {
  name: "",
  legal_name: "",
  address: "",
  city: "",
  pincode: "",
  phone: "",
  email: "",
  emergency_contact: "",
  fssai_license: "",
  gst_number: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  geo_lat: null,
  geo_lng: null,
};

/** Strips empty strings so the API receives only the fields actually filled in. */
function businessPayload(b: BusinessFields): Record<string, unknown> {
  const out: Record<string, unknown> = { name: b.name.trim() };
  const optional: (keyof BusinessFields)[] = [
    "legal_name",
    "address",
    "city",
    "pincode",
    "phone",
    "email",
    "emergency_contact",
    "fssai_license",
    "gst_number",
    "bank_account_name",
    "bank_account_number",
    "bank_ifsc",
  ];
  for (const k of optional) {
    const v = b[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  if (b.geo_lat != null && b.geo_lng != null) {
    out.geo_lat = b.geo_lat;
    out.geo_lng = b.geo_lng;
  }
  return out;
}

export default function VendorRegisterPage() {
  const router = useRouter();

  // "loading" while we resolve the session; then "signup" (A) or "complete" (B).
  const [mode, setMode] = useState<"loading" | "signup" | "complete">("loading");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState<BusinessFields>(EMPTY_BUSINESS);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Decide which branch to render from the current session.
  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setMode(data.session ? "complete" : "signup");
    })();
    return () => {
      active = false;
    };
  }, []);

  function setField<K extends keyof BusinessFields>(key: K, value: BusinessFields[K]) {
    setBusiness((b) => ({ ...b, [key]: value }));
  }

  function useMyLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation isn’t available in this browser.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusiness((b) => ({ ...b, geo_lat: pos.coords.latitude, geo_lng: pos.coords.longitude }));
        setGeoBusy(false);
      },
      (err) => {
        setGeoError(err.message || "Couldn’t get your location.");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /** POST the business fields to create the pending vendor, then go to the app. */
  async function registerVendor(): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch("/api/vendor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(businessPayload(business)),
      });
    } catch {
      setError("Network error — please try again.");
      return false;
    }
    if (res.status === 401) {
      router.push("/vendor/login?redirect=/vendor/register");
      return false;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Registration failed (${res.status}).`);
      return false;
    }
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!business.name.trim()) {
      setError("Business name is required.");
      return;
    }

    setLoading(true);

    // Branch B — already signed in, just create the vendor record.
    if (mode === "complete") {
      const ok = await registerVendor();
      if (!ok) {
        setLoading(false);
        return;
      }
      router.push("/vendor");
      router.refresh();
      return;
    }

    // Branch A — create the auth account first.
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: business.name.trim(), account_type: "vendor" } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Email confirmation ON → no session yet; finish after they confirm + sign in.
    if (!data.session) {
      setConfirmSent(true);
      setLoading(false);
      return;
    }

    // Session present → create the vendor right away and enter the app.
    const ok = await registerVendor();
    if (!ok) {
      setLoading(false);
      return;
    }
    router.push("/vendor");
    router.refresh();
  }

  /* ---- Render states ------------------------------------------------------- */

  if (mode === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </main>
    );
  }

  if (confirmSent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We sent a confirmation link to <span className="font-medium text-slate-700">{email}</span>.
            Confirm it, then sign in to finish your application.
          </p>
          <Link
            href="/vendor/login?redirect=/vendor/register"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {mode === "complete" ? "Complete your vendor application" : "Become a pApAmA vendor"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "complete"
              ? "Tell us about your business to finish your application."
              : "Create an account and tell us about your business."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Account credentials — sign-up branch only. */}
          {mode === "signup" && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Account
              </legend>
              <Field
                id="email"
                label="Email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
              />
              <Field
                id="password"
                label="Password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                placeholder="At least 6 characters"
              />
            </fieldset>
          )}

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Business
            </legend>

            <Field
              id="name"
              label="Business name"
              required
              value={business.name}
              onChange={(v) => setField("name", v)}
              placeholder="e.g. Amma’s Kitchen"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="legal_name"
                label="Legal name"
                value={business.legal_name}
                onChange={(v) => setField("legal_name", v)}
              />
              <Field
                id="phone"
                label="Phone"
                type="tel"
                autoComplete="tel"
                value={business.phone}
                onChange={(v) => setField("phone", v)}
              />
            </div>

            <Field
              id="address"
              label="Address"
              value={business.address}
              onChange={(v) => setField("address", v)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="city" label="City" value={business.city} onChange={(v) => setField("city", v)} />
              <Field
                id="pincode"
                label="Pincode"
                value={business.pincode}
                onChange={(v) => setField("pincode", v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="vendor_email"
                label="Contact email"
                type="email"
                value={business.email}
                onChange={(v) => setField("email", v)}
                placeholder="Where we reach your business"
              />
              <Field
                id="emergency_contact"
                label="Emergency contact"
                value={business.emergency_contact}
                onChange={(v) => setField("emergency_contact", v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="fssai_license"
                label="FSSAI license #"
                value={business.fssai_license}
                onChange={(v) => setField("fssai_license", v)}
              />
              <Field
                id="gst_number"
                label="GST number"
                value={business.gst_number}
                onChange={(v) => setField("gst_number", v)}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Bank account
            </legend>
            <Field
              id="bank_account_name"
              label="Account holder name"
              value={business.bank_account_name}
              onChange={(v) => setField("bank_account_name", v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="bank_account_number"
                label="Account number"
                value={business.bank_account_number}
                onChange={(v) => setField("bank_account_number", v)}
              />
              <Field
                id="bank_ifsc"
                label="IFSC"
                value={business.bank_ifsc}
                onChange={(v) => setField("bank_ifsc", v)}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Location
            </legend>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoBusy}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {geoBusy
                ? "Locating…"
                : business.geo_lat != null
                  ? "Update my location"
                  : "Use my location"}
            </button>
            {business.geo_lat != null && business.geo_lng != null && (
              <p className="text-xs text-slate-500">
                {business.geo_lat.toFixed(4)}, {business.geo_lng.toFixed(4)}
              </p>
            )}
            {geoError && <p className="text-xs text-red-600">{geoError}</p>}
          </fieldset>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Submitting…"
              : mode === "complete"
                ? "Submit application"
                : "Create account & apply"}
          </button>

          {mode === "signup" && (
            <p className="text-center text-sm text-slate-500">
              Already have a vendor account?{" "}
              <Link
                href="/vendor/login"
                className="font-medium text-slate-900 hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

/* ---- Reusable labelled input ----------------------------------------------- */

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  minLength,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
      />
    </div>
  );
}
