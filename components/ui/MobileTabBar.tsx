"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Shared slate mobile bottom tab bar with a raised center FAB, used by the
 * staff-facing portals that share the slate design language (vendor, volunteer).
 * The admin and donor portals keep bespoke bars because they carry their own
 * gating (useCan) / theme (emerald + dark mode) and FAB behavior.
 *
 * Up to four tabs flank the FAB (two each side). A tab or the FAB may be either
 * a navigation link (`href`) or an action (`onClick`, e.g. sign out). Fixed to
 * the bottom, hidden on md+ where the top nav strip takes over. iOS safe-area
 * padding keeps it clear of the home indicator.
 */

export interface MobileTab {
    label: string;
    icon: ReactNode;
    /** Navigation tab. */
    href?: string;
    /** Action tab (used when there is no destination, e.g. Sign out). */
    onClick?: () => void;
}

export interface MobileFab {
    label: string;
    icon: ReactNode;
    href?: string;
    onClick?: () => void;
}

function isActive(pathname: string, href?: string) {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + "/");
}

export function MobileTabBar({ tabs, fab }: { tabs: MobileTab[]; fab: MobileFab }) {
    const pathname = usePathname();
    // Balance the tabs around the FAB: with 4 → 2+2, with 2 → 1+1, with 3 → 2+1.
    const split = Math.ceil(tabs.length / 2);
    const left = tabs.slice(0, split);
    const right = tabs.slice(split);

    return (
        <nav
            aria-label="Sections"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
        >
            <div className="relative mx-auto flex h-14 max-w-md items-center justify-around px-2">
                {left.map((t) => (
                    <TabButton key={t.label} tab={t} pathname={pathname} />
                ))}

                {/* Reserve the center column so the tabs stay evenly spaced
                    around the raised FAB. */}
                <div className="w-12 shrink-0" aria-hidden="true" />

                {right.map((t) => (
                    <TabButton key={t.label} tab={t} pathname={pathname} />
                ))}

                <FabButton fab={fab} pathname={pathname} />
            </div>
        </nav>
    );
}

function TabButton({ tab, pathname }: { tab: MobileTab; pathname: string }) {
    const active = isActive(pathname, tab.href);
    const cls = `group flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition ${
        active ? "font-semibold text-slate-900" : "font-medium text-slate-400"
    }`;
    const inner = (
        <>
            <span
                className={`flex h-6 items-center justify-center rounded-full px-4 transition-colors ${
                    active ? "bg-slate-100" : "bg-transparent group-active:bg-slate-100"
                }`}
            >
                {tab.icon}
            </span>
            <span>{tab.label}</span>
        </>
    );

    if (tab.href) {
        return (
            <Link href={tab.href} aria-current={active ? "page" : undefined} className={cls}>
                {inner}
            </Link>
        );
    }
    return (
        <button type="button" onClick={tab.onClick} className={cls}>
            {inner}
        </button>
    );
}

function FabButton({ fab, pathname }: { fab: MobileFab; pathname: string }) {
    const active = isActive(pathname, fab.href);
    const cls =
        "absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 ring-4 ring-white transition hover:bg-slate-700 active:scale-95";

    if (fab.href) {
        return (
            <Link
                href={fab.href}
                aria-label={fab.label}
                aria-current={active ? "page" : undefined}
                className={cls}
            >
                {fab.icon}
            </Link>
        );
    }
    return (
        <button type="button" onClick={fab.onClick} aria-label={fab.label} className={cls}>
            {fab.icon}
        </button>
    );
}
