import type { ReactNode } from "react";

import Link from "next/link";

import { getAppUser } from "@/lib/auth";

import { VolunteerHeader } from "./VolunteerHeader";

/**
 * Shell for every /volunteer page.
 *   - not signed in           → render the page bare (this layout also wraps
 *     /volunteer/login; the proxy already redirects unauthenticated hits to the
 *     GATED pages, so a null user here means we are on the login page —
 *     redirecting would loop it onto itself)
 *   - signed in, not volunteer → "not a volunteer account" notice (no chrome)
 *   - volunteer               → render the app with the header
 * Per-feature authorization still runs in each API route and in RLS.
 */
export default async function VolunteerLayout({ children }: { children: ReactNode }) {
  const user = await getAppUser();

  if (!user) {
    return <>{children}</>;
  }

  if (user.role !== "volunteer") {
    return <NotVolunteer role={user.role} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <VolunteerHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

function NotVolunteer({ role }: { role: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Not a volunteer account</h1>
        <p className="mt-2 text-sm text-slate-500">
          The volunteer app is restricted to volunteer accounts. Your role
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
