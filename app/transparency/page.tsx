import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { getTransparencyStats, type TransparencyStats } from "@/lib/services/transparency";

/**
 * Public transparency dashboard (addon #14). Aggregate-only impact numbers, no
 * PII. Published only while system_config transparency_dashboard_enabled is on;
 * otherwise a neutral "not available" panel is shown. Server-rendered so the
 * numbers come straight from the SECURITY DEFINER aggregate function.
 */
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Transparency · pApAmA",
    description: "Aggregate impact of the pApAmA meal-token programme.",
};

async function loadStats(): Promise<{ enabled: boolean; stats: TransparencyStats | null }> {
    const admin = createAdminClient();
    let enabled = false;
    try {
        enabled = await getBoolean("transparency_dashboard_enabled", admin as never);
    } catch {
        enabled = false;
    }
    if (!enabled) return { enabled: false, stats: null };
    try {
        const stats = await getTransparencyStats(admin);
        return { enabled: true, stats };
    } catch {
        return { enabled: true, stats: null };
    }
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

export default async function TransparencyPage() {
    const { enabled, stats } = await loadStats();

    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            <div className="mx-auto max-w-5xl px-6 py-16">
                <div className="mb-10 text-center">
                    <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
                        pApAmA · Transparency
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                        Our impact, in the open
                    </h1>
                    <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 sm:text-base">
                        Every meal token funded by a donor, served by a vendor, to a verified
                        beneficiary. These are programme-wide totals — no personal data is shown.
                    </p>
                </div>

                {!enabled || !stats ? (
                    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                        <p className="text-base font-medium text-slate-900">
                            The transparency dashboard isn’t published yet.
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                            Please check back soon. In the meantime, you can still support the
                            programme.
                        </p>
                        <Link
                            href="/donate"
                            className="mt-5 inline-flex rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            Donate a meal
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <StatCard
                                label="Total donations"
                                value={inr(stats.total_donations_inr)}
                                hint="Completed contributions"
                                accent
                            />
                            <StatCard
                                label="Meals sponsored"
                                value={num(stats.meals_sponsored)}
                                hint="Tokens funded"
                            />
                            <StatCard
                                label="Meals served"
                                value={num(stats.meals_served)}
                                hint="Redeemed at vendors"
                            />
                            <StatCard
                                label="Active vendors"
                                value={num(stats.active_vendors)}
                                hint="Approved food outlets"
                            />
                            <StatCard
                                label="Beneficiaries reached"
                                value={num(stats.active_beneficiaries)}
                                hint="Active, verified"
                            />
                            <StatCard
                                label="Cities covered"
                                value={num(stats.cities_covered)}
                                hint="Across the network"
                            />
                        </div>

                        <p className="mt-10 text-center text-xs text-slate-400">
                            Figures are aggregate totals refreshed live. No personally identifiable
                            information is published.
                        </p>
                    </>
                )}
            </div>
        </main>
    );
}

function StatCard({
    label,
    value,
    hint,
    accent = false,
}: {
    label: string;
    value: string;
    hint: string;
    accent?: boolean;
}) {
    return (
        <div
            className={`rounded-2xl border p-6 shadow-sm transition hover:shadow-md ${
                accent ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
            }`}
        >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p
                className={`mt-2 text-3xl font-bold tracking-tight ${
                    accent ? "text-green-700" : "text-slate-900"
                }`}
            >
                {value}
            </p>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
        </div>
    );
}
