import type { ReactNode } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getAppUser } from "@/lib/auth";

import { VendorHeader } from "./VendorHeader";

/**
 * Shell for every /vendor page. Server-side gate, mirroring the admin layout:
 *   - not signed in       → redirect to /vendor/login
 *   - signed in, not vendor → "not a vendor account" notice (no vendor chrome)
 *   - vendor              → render the app with the header
 * Per-feature authorization still runs in each API route and in RLS.
 */
export default async function VendorLayout({ children }: { children: ReactNode }) {
  const user = await getAppUser();

  if (!user) {
    redirect("/vendor/login?redirect=/vendor");
  }

  if (user.role !== "vendor") {
    return <NotVendor role={user.role} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <VendorHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

function NotVendor({ role }: { role: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Not a vendor account</h1>
        <p className="mt-2 text-sm text-slate-500">
          The vendor app is restricted to vendor accounts. Your role
          (<span className="font-medium text-slate-700">{role}</span>) does not have access.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
