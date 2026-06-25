"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import { createClient } from "@/lib/supabase/client";

import { ADMIN_SECTIONS, type AdminSection } from "./adminSections";

/**
 * Admin top bar: brand, a persistent nav strip, and a sign-out action. Client
 * component (uses the browser client + usePathname). The nav links come from the
 * shared ADMIN_SECTIONS directory and are gated by useCan(feature, action) so a
 * role only sees the sections it can read; the server route still enforces the
 * matrix regardless. The active route is highlighted via usePathname.
 */
export function AdminHeader() {
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    async function signOut() {
        setSigningOut(true);
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <Link href="/admin" className="flex items-baseline gap-3 transition hover:opacity-80">
                    <span className="text-lg font-semibold tracking-tight text-slate-900">
                        pApAmA
                    </span>
                    <span className="text-sm text-slate-400">Admin</span>
                </Link>
                <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                    {signingOut ? "Signing out…" : "Sign out"}
                </button>
            </div>
            <AdminNavStrip />
        </header>
    );
}

/** Horizontally scrollable, role-gated nav strip with active-route highlight. */
function AdminNavStrip() {
    const pathname = usePathname();
    return (
        <nav className="hidden md:block mx-auto max-w-6xl overflow-x-auto px-4 pb-2 sm:px-6">
            <ul className="flex items-center gap-1 whitespace-nowrap">
                <NavLink href="/admin" label="Home" pathname={pathname} exact />
                {ADMIN_SECTIONS.map((s) => (
                    <GatedNavLink key={s.href} section={s} pathname={pathname} />
                ))}
            </ul>
        </nav>
    );
}

/** A section link that renders only when the role can read that section. */
function GatedNavLink({ section, pathname }: { section: AdminSection; pathname: string }) {
    const allowed = useCan(section.feature, section.action);
    if (!allowed) return null;
    return (
        <NavLink
            href={section.href}
            label={section.navLabel ?? section.title}
            pathname={pathname}
        />
    );
}

function NavLink({
    href,
    label,
    pathname,
    exact = false,
}: {
    href: string;
    label: string;
    pathname: string;
    /** Match the path exactly (used for the Home link so it isn't always active). */
    exact?: boolean;
}) {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    return (
        <li>
            <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-block rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                }`}
            >
                {label}
            </Link>
        </li>
    );
}
