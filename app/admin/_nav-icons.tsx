/**
 * Shared inline-SVG icon set for the admin navigation surfaces (the mobile
 * bottom bar + the "Jump to…" command palette). Keying icons by section href in
 * one place guarantees the bar and the palette can never render a different
 * glyph for the same destination. Line-art, 24×24, stroke inherits the parent's
 * `text-*` color — never hardcode a stroke. No icon library (the repo already
 * hand-rolls SVGs in _ui.tsx), so this adds no dependency.
 */

/**
 * Single-path glyphs, keyed by a semantic name. The destination glyphs (home,
 * vendors, users, ticket, photo, banknotes, shieldAlert, search) are the
 * original bolder set restored at the owner's request — they read more clearly
 * at small sizes than the thinner heroicons variants. Drawn at strokeWidth 2
 * (see SectionIcon) to match.
 */
const PATHS: Record<string, string> = {
    home: "M3 11l9-8 9 8M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
    vendors: "M3 9l1-4h16l1 4M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 13h6",
    users: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0m8 0a3 3 0 10-2.5-1.5",
    clipboardCheck:
        "M9 12l2 2 4-4m1.553-6.776c.143.482.22.992.22 1.526H7.227c0-.534.077-1.044.22-1.526m9.106 0A2.25 2.25 0 0014.4 1.5H9.6a2.25 2.25 0 00-2.153 1.724m9.106 0c.317.384.546.84.654 1.342M7.447 3.224A2.264 2.264 0 006.793 4.566M6.793 4.566A2.25 2.25 0 004.5 6.75v12A2.25 2.25 0 006.75 21h10.5A2.25 2.25 0 0019.5 18.75v-12a2.25 2.25 0 00-2.293-2.184",
    menu: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    heart: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    ticket: "M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 014 11V6a3 3 0 013-3z",
    photo: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    banknotes:
        "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 9v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    shieldAlert:
        "M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0l-6.93 12a2 2 0 001.74 3z",
    chartBar:
        "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    document:
        "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    building:
        "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z",
    sliders:
        "M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75",
    grid: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
    search: "M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z",
    chevron: "M8.25 4.5l7.5 7.5-7.5 7.5",
};

/** Section href → glyph name. Unmapped hrefs fall back to the grid glyph. */
const HREF_ICON: Record<string, string> = {
    "/admin": "home",
    "/admin/vendors": "vendors",
    "/admin/beneficiaries": "users",
    "/admin/beneficiary-registrations": "clipboardCheck",
    "/admin/vendor-menus": "menu",
    "/admin/volunteers": "heart",
    "/admin/tokens": "ticket",
    "/admin/proofs": "photo",
    "/admin/settlements": "banknotes",
    "/admin/fraud": "shieldAlert",
    "/admin/reports": "chartBar",
    "/admin/audit-logs": "document",
    "/admin/ngo-partners": "building",
    "/admin/system-config": "sliders",
};

/**
 * Renders the glyph for a destination. Pass `href` to resolve a section's icon,
 * or `name` to request a specific glyph directly (e.g. "search", "chevron",
 * "grid"). Falls back to the grid glyph so a tile is never empty.
 */
export function SectionIcon({
    href,
    name,
    className = "h-5 w-5",
}: {
    href?: string;
    name?: keyof typeof PATHS | string;
    className?: string;
}) {
    const key = name ?? (href ? HREF_ICON[href] : undefined) ?? "grid";
    const d = PATHS[key] ?? PATHS.grid;
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d={d} />
        </svg>
    );
}
