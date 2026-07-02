import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { getTransparencyStats, type TransparencyStats } from "@/lib/services/transparency";
import { ADMIN_SECTIONS } from "./adminSections";

/**
 * Admin console home — KPI strip + recent-activity feed + a directory of the
 * section pages. Each card routes to a page that fetches its matching GET
 * /api/admin/* route; the route itself enforces the role gate. The KPIs are read
 * server-side through the session client (RLS-scoped), so staff who lack a
 * table's read simply see 0 there rather than an error. Alert KPIs deep-link to
 * the matching filtered list.
 *
 * The section directory lives in ./adminSections (shared with the AdminHeader
 * nav strip — single source of truth).
 */

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

interface Kpi {
    label: string;
    value: number;
    alert?: boolean;
    /** When set, the card becomes a deep-link to the matching filtered list. */
    href?: string;
}

async function loadKpis(): Promise<Kpi[]> {
    const supabase = await createClient();
    const [donations, tokens, redemptions, proofsToReview, openFraud, heldSettlements] =
        await Promise.all([
            countRows(supabase, "donations"),
            countRows(supabase, "tokens"),
            countRows(supabase, "token_redemptions"),
            countRows(supabase, "token_redemptions", { column: "proof_status", value: "submitted" }),
            countRows(supabase, "fraud_flags", { column: "status", value: "open" }),
            countRows(supabase, "vendor_settlements", { column: "on_hold", value: true }),
        ]);
    return [
        { label: "Donations", value: donations },
        { label: "Tokens minted", value: tokens, href: "/admin/tokens" },
        { label: "Redemptions", value: redemptions },
        { label: "Proofs to review", value: proofsToReview, alert: proofsToReview > 0, href: "/admin/proofs" },
        { label: "Open fraud flags", value: openFraud, alert: openFraud > 0, href: "/admin/fraud?status=open" },
        {
            label: "Settlements on hold",
            value: heldSettlements,
            alert: heldSettlements > 0,
            href: "/admin/settlements?hold=true",
        },
    ];
}

interface ActivityRow {
    id: string;
    action: string;
    summary: string | null;
    actor_role: string | null;
    created_at: string;
}

async function loadRecentActivity(): Promise<ActivityRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("audit_logs")
        .select("id, action, summary, actor_role, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
    return (data ?? []) as ActivityRow[];
}

/**
 * Community-impact stats (addon #14), merged onto the admin home. Uses the
 * service-role client (not the RLS session client) because the published flag
 * lives in system_config — not session-readable — and the numbers come from the
 * SECURITY DEFINER function public.public_transparency_stats(). Aggregate-only,
 * no PII. Shown to admins even while unpublished, so they can preview the numbers
 * before flipping transparency_dashboard_enabled on in System config.
 */
async function loadTransparency(): Promise<{ enabled: boolean; stats: TransparencyStats | null }> {
    const admin = createAdminClient();
    let enabled = false;
    try {
        enabled = await getBoolean("transparency_dashboard_enabled", admin as never);
    } catch {
        enabled = false;
    }
    try {
        const stats = await getTransparencyStats(admin);
        return { enabled, stats };
    } catch {
        return { enabled, stats: null };
    }
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

function ImpactCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold text-slate-900">{value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{label}</p>
        </div>
    );
}

function KpiCard({ k }: { k: Kpi }) {
    const body = (
        <>
            <p className={`text-2xl font-semibold ${k.alert ? "text-orange-600" : "text-slate-900"}`}>
                {k.value.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-slate-500">{k.label}</p>
        </>
    );
    const cls = `block rounded-xl border bg-white p-4 shadow-sm transition ${
        k.alert ? "border-orange-300" : "border-slate-200"
    } ${k.href ? "hover:border-slate-400 hover:shadow" : ""}`;
    return k.href ? (
        <Link href={k.href} className={cls}>
            {body}
        </Link>
    ) : (
        <div className={cls}>{body}</div>
    );
}

export default async function AdminHomePage() {
    const [kpis, activity, transparency] = await Promise.all([
        loadKpis(),
        loadRecentActivity(),
        loadTransparency(),
    ]);

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
                    <KpiCard key={k.label} k={k} />
                ))}
            </div>

            {/* Community impact (addon #14) — same aggregate numbers the public
                /transparency page shows, previewable here regardless of publish state. */}
            {transparency.stats && (
                <section className="mb-8">
                    <div
                        className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
                            transparency.enabled
                                ? "border-green-200 bg-green-50"
                                : "border-amber-200 bg-amber-50"
                        }`}
                    >
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">Community impact</h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {transparency.enabled
                                    ? "Published — these totals are live on the public transparency page."
                                    : "Not published — the public /transparency page returns 404. Toggle "}
                                {!transparency.enabled && (
                                    <code className="font-mono">transparency_dashboard_enabled</code>
                                )}
                                {!transparency.enabled && " in System config to publish."}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link
                                href="/admin/system-config"
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                System config
                            </Link>
                            <Link
                                href="/transparency"
                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                            >
                                View public page
                            </Link>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <ImpactCard label="Total donations" value={inr(transparency.stats.total_donations_inr)} />
                        <ImpactCard label="Meals sponsored" value={num(transparency.stats.meals_sponsored)} />
                        <ImpactCard label="Meals served" value={num(transparency.stats.meals_served)} />
                        <ImpactCard label="Active vendors" value={num(transparency.stats.active_vendors)} />
                        <ImpactCard label="Beneficiaries reached" value={num(transparency.stats.active_beneficiaries)} />
                        <ImpactCard label="Cities covered" value={num(transparency.stats.cities_covered)} />
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Section directory */}
                <div className="lg:col-span-2">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {ADMIN_SECTIONS.map((s) => (
                            <Link
                                key={s.href}
                                href={s.href}
                                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
                            >
                                <p className="font-medium text-slate-900 group-hover:text-slate-950">{s.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Recent activity feed */}
                <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Latest entries from the audit log.</p>
                    {activity.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-400">No activity recorded yet.</p>
                    ) : (
                        <ul className="mt-4 space-y-3">
                            {activity.map((a) => (
                                <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                                    <p className="text-xs font-medium text-slate-700">{a.action}</p>
                                    {a.summary && (
                                        <p className="text-xs text-slate-500 line-clamp-2">{a.summary}</p>
                                    )}
                                    <p className="mt-0.5 text-[10px] text-slate-400">
                                        {a.actor_role ?? "system"} · {new Date(a.created_at).toLocaleString()}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link
                        href="/admin/audit-logs"
                        className="mt-4 inline-block text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                    >
                        View all audit logs →
                    </Link>
                </aside>
            </div>
        </div>
    );
}
