import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

/**
 * Admin console home — KPI strip + a directory of the section pages. Each card
 * routes to a page that fetches its matching GET /api/admin/* route; the route
 * itself enforces the role gate. The KPIs are read server-side through the
 * session client (RLS-scoped), so staff who lack a table's read simply see 0
 * there rather than an error.
 */

const SECTIONS: { href: string; title: string; description: string }[] = [
    {
        href: "/admin/vendors",
        title: "Vendors",
        description: "Registered food vendors and their onboarding/KYC status.",
    },
    {
        href: "/admin/beneficiaries",
        title: "Beneficiaries",
        description: "Approved beneficiary registry — category, status, eligibility.",
    },
    {
        href: "/admin/beneficiary-registrations",
        title: "Beneficiary registrations",
        description: "Review eligibility submissions; approve to create verified beneficiaries.",
    },
    {
        href: "/admin/vendor-menus",
        title: "Vendor menus",
        description: "Approve vendor-proposed menu items (incl. Special-Care equivalents).",
    },
    {
        href: "/admin/volunteers",
        title: "Volunteers",
        description: "Volunteer registry for token distribution (Path B).",
    },
    {
        href: "/admin/tokens",
        title: "Tokens",
        description: "Token registry by status/holder; run the expire-sweep for lapsed tokens.",
    },
    {
        href: "/admin/settlements",
        title: "Settlements",
        description: "Vendor settlement headers and payout status.",
    },
    {
        href: "/admin/fraud",
        title: "Fraud",
        description: "Fraud flags, severity, detection method and resolution.",
    },
    {
        href: "/admin/reports",
        title: "Reports",
        description: "Generated compliance & CSR report exports.",
    },
    {
        href: "/admin/audit-logs",
        title: "Audit logs",
        description: "Append-only, immutable trail of every admin action.",
    },
    {
        href: "/admin/ngo-partners",
        title: "NGO partners",
        description: "Partner NGO/organisation reference registry.",
    },
    {
        href: "/admin/system-config",
        title: "System config",
        description: "Admin-tunable rules read at runtime (thresholds, limits).",
    },
];

/** A single head-only COUNT for a table, with an optional equality filter. RLS-scoped. */
async function countRows(
    supabase: Awaited<ReturnType<typeof createClient>>,
    table: string,
    filter?: { column: string; value: string | boolean }
): Promise<number> {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.eq(filter.column, filter.value);
    const { count } = await q;
    return count ?? 0;
}

async function loadKpis() {
    const supabase = await createClient();
    // Independent counts run concurrently.
    const [donations, tokens, redemptions, openFraud, pendingSettlements, heldSettlements] =
        await Promise.all([
            countRows(supabase, "donations"),
            countRows(supabase, "tokens"),
            countRows(supabase, "token_redemptions"),
            countRows(supabase, "fraud_flags", { column: "status", value: "open" }),
            countRows(supabase, "vendor_settlements", { column: "status", value: "pending" }),
            countRows(supabase, "vendor_settlements", { column: "on_hold", value: true }),
        ]);
    return [
        { label: "Donations", value: donations },
        { label: "Tokens minted", value: tokens },
        { label: "Redemptions", value: redemptions },
        { label: "Open fraud flags", value: openFraud, alert: openFraud > 0 },
        { label: "Pending settlements", value: pendingSettlements },
        { label: "Settlements on hold", value: heldSettlements, alert: heldSettlements > 0 },
    ];
}

export default async function AdminHomePage() {
    const kpis = await loadKpis();

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin console</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Manage vendors, beneficiaries, settlements, fraud, reports and system rules.
                </p>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {kpis.map((k) => (
                    <div
                        key={k.label}
                        className={`rounded-xl border bg-white p-4 shadow-sm ${
                            k.alert ? "border-orange-300" : "border-slate-200"
                        }`}
                    >
                        <p
                            className={`text-2xl font-semibold ${
                                k.alert ? "text-orange-600" : "text-slate-900"
                            }`}
                        >
                            {k.value.toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{k.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {SECTIONS.map((s) => (
                    <Link
                        key={s.href}
                        href={s.href}
                        className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
                    >
                        <p className="font-medium text-slate-900 group-hover:text-slate-950">
                            {s.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
