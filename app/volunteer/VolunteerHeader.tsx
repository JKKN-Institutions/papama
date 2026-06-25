"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/volunteer", label: "Home" },
  { href: "/volunteer/beneficiaries", label: "Register beneficiary" },
];

type VolIcon = "home" | "register" | "signout";

// Inline stroke icons for the mobile bottom bar; color inherits via currentColor.
function VolIconGlyph({ name }: { name: VolIcon }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 9.5 12 3l9 6.5M5 10v10h14V10" />
        </svg>
      );
    case "register":
      return (
        <svg {...common}>
          <path d="M18 7.5v6m3-3h-6m-2.25-2.625a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      );
    case "signout":
      return (
        <svg {...common}>
          <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
        </svg>
      );
  }
}

/** Volunteer top bar: brand, nav links, and a sign-out action. Client component. */
export function VolunteerHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push("/volunteer/login");
    router.refresh();
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:flex-none sm:flex-nowrap sm:gap-6">
            <Link href="/volunteer" className="flex shrink-0 items-baseline gap-3 transition hover:opacity-80">
              <span className="text-lg font-semibold tracking-tight text-slate-900">pApAmA</span>
              <span className="text-sm text-slate-400">Volunteer</span>
            </Link>
            {/* Desktop nav strip — the mobile bottom bar replaces it below md. */}
            <nav className="hidden flex-wrap items-center gap-1 md:flex">
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

      {/* Mobile bottom bar: Register beneficiary (the core volunteer action) as
          the center FAB, with Home and Sign out flanking it. */}
      <MobileTabBar
        fab={{
          href: "/volunteer/beneficiaries",
          label: "Register beneficiary",
          icon: <VolIconGlyph name="register" />,
        }}
        tabs={[
          { href: "/volunteer", label: "Home", icon: <VolIconGlyph name="home" /> },
          { label: "Sign out", icon: <VolIconGlyph name="signout" />, onClick: signOut },
        ]}
      />
    </>
  );
}
