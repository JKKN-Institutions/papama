"use client";

import Link from "next/link";

import { useVendorFetch, PageHeader, Notice, StatusBadge, Dash } from "./_ui";

interface VendorProfile {
  name: string;
  status: string;
  kyc_status: string;
  city: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
}

const QUICK_LINKS = [
  { href: "/vendor/scan", title: "Scan & redeem", desc: "Validate a token and serve a meal." },
  { href: "/vendor/menu", title: "My menu", desc: "Review your menu items and approval status." },
  { href: "/vendor/settlements", title: "Settlements", desc: "Track payouts from completed redemptions." },
];

export default function VendorDashboardPage() {
  // GET /api/vendor/profile → { vendor: { name, status, kyc_status, city, geo_lat, geo_lng } }
  const { data: vendor, state, errorMsg } = useVendorFetch<VendorProfile>(
    "/api/vendor/profile",
    "vendor",
    "/vendor"
  );

  return (
    <div>
      <PageHeader title="Vendor dashboard" subtitle="Your onboarding status and quick actions." />

      {state === "loading" && (
        <div className="h-28 animate-pulse rounded-xl bg-slate-200/60" />
      )}

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

      {state === "ready" && vendor && <OnboardingBanner vendor={vendor} />}

      {state === "ready" && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            <Dash>{vendor?.name}</Dash>
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Status">
              {vendor?.status ? <StatusBadge value={vendor.status} /> : <Dash>{null}</Dash>}
            </Field>
            <Field label="KYC">
              {vendor?.kyc_status ? <StatusBadge value={vendor.kyc_status} /> : <Dash>{null}</Dash>}
            </Field>
            <Field label="City">
              <Dash>{vendor?.city}</Dash>
            </Field>
            <Field label="Location">
              {vendor?.geo_lat != null && vendor?.geo_lng != null ? (
                <span className="text-sm text-slate-700">
                  {vendor.geo_lat.toFixed(4)}, {vendor.geo_lng.toFixed(4)}
                </span>
              ) : (
                <Dash>{null}</Dash>
              )}
            </Field>
          </dl>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <p className="font-medium text-slate-900 group-hover:text-slate-700">{link.title}</p>
            <p className="mt-1 text-sm text-slate-500">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Onboarding status banner driven by the vendor's status + kyc_status:
 *   - status !== 'approved'     → "under review"
 *   - approved but kyc unverified → prompt to upload documents (→ /vendor/profile)
 *   - approved + verified         → "active"
 */
function OnboardingBanner({ vendor }: { vendor: VendorProfile }) {
  if (vendor.status !== "approved") {
    return (
      <Notice tone="warn" title="Application under review">
        Your vendor application is pending. We’ll let you know once it’s approved — you can prepare your
        menu and documents in the meantime.
      </Notice>
    );
  }

  if (vendor.kyc_status !== "verified") {
    return (
      <Notice tone="warn" title="Verify your documents">
        Your application is approved, but your KYC isn’t verified yet.{" "}
        <Link href="/vendor/profile" className="font-medium text-amber-900 underline">
          Upload your documents
        </Link>{" "}
        to start serving meals.
      </Notice>
    );
  }

  return (
    <Notice tone="info" title="Active">
      Your account is approved and verified. You’re all set to scan tokens and serve meals.
    </Notice>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
