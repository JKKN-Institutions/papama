"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/vendor/scan", label: "Scan" },
  { href: "/vendor/redemptions", label: "Redemptions" },
  { href: "/vendor/menu", label: "Menu" },
  { href: "/vendor/availability", label: "Availability" },
  { href: "/vendor/settlements", label: "Settlements" },
  { href: "/vendor/profile", label: "Profile" },
];

type VendorIcon = "scan" | "redemptions" | "menu" | "availability" | "settlements" | "profile";

// Inline stroke icons for the mobile bottom bar; color inherits via currentColor.
function VIcon({ name }: { name: VendorIcon }) {
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
    case "scan":
      return (
        <svg {...common}>
          <path d="M4.5 7.5V5.25A.75.75 0 0 1 5.25 4.5H7.5M16.5 4.5h2.25a.75.75 0 0 1 .75.75V7.5M19.5 16.5v2.25a.75.75 0 0 1-.75.75H16.5M7.5 19.5H5.25a.75.75 0 0 1-.75-.75V16.5M3.75 12h16.5" />
        </svg>
      );
    case "redemptions":
      return (
        <svg {...common}>
          <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      );
    case "availability":
      return (
        <svg {...common}>
          <path d="M12 6v6l3.75 2.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "settlements":
      return (
        <svg {...common}>
          <path d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      );
  }
}

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
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:flex-none sm:flex-nowrap sm:gap-6">
            <Link href="/vendor" className="flex shrink-0 items-baseline gap-3 transition hover:opacity-80">
              <span className="bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-xl font-bold tracking-tight text-transparent">pApAmA</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vendor</span>
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
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[.98] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Mobile bottom bar: Scan (the core vendor action) as the center FAB. */}
      <MobileTabBar
        fab={{ href: "/vendor/scan", label: "Scan", icon: <VIcon name="scan" /> }}
        tabs={[
          { href: "/vendor/redemptions", label: "Redemptions", icon: <VIcon name="redemptions" /> },
          { href: "/vendor/availability", label: "Hours", icon: <VIcon name="availability" /> },
          { href: "/vendor/settlements", label: "Settle", icon: <VIcon name="settlements" /> },
          { href: "/vendor/profile", label: "Profile", icon: <VIcon name="profile" /> },
        ]}
      />
    </>
  );
}
