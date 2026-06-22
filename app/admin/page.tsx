import Link from "next/link";

/**
 * Admin console home — a dashboard linking the nine section pages. Each card
 * routes to a page that fetches its matching GET /api/admin/* route; the route
 * itself enforces the role gate, so this index stays a simple static directory.
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
        href: "/admin/volunteers",
        title: "Volunteers",
        description: "Volunteer registry for token distribution (Path B).",
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

export default function AdminHomePage() {
    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin console</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Manage vendors, beneficiaries, settlements, fraud, reports and system rules.
                </p>
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
