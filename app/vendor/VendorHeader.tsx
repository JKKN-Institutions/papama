"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/vendor/scan", label: "Scan" },
  { href: "/vendor/redemptions", label: "Redemptions" },
  { href: "/vendor/menu", label: "Menu" },
  { href: "/vendor/settlements", label: "Settlements" },
  { href: "/vendor/profile", label: "Profile" },
];

/** Vendor top bar: brand, nav links, and a sign-out action. Client component. */
export function VendorHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push("/vendor/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:flex-none sm:flex-nowrap sm:gap-6">
          <Link href="/vendor" className="flex shrink-0 items-baseline gap-3 transition hover:opacity-80">
            <span className="text-lg font-semibold tracking-tight text-slate-900">pApAmA</span>
            <span className="text-sm text-slate-400">Vendor</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
