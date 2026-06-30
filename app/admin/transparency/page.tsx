"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AdminPageHeader, Notice, SkeletonTable } from "../_ui";

interface TransparencyStats {
    total_donations_inr: number;
    meals_sponsored: number;
    meals_served: number;
    active_vendors: number;
    active_beneficiaries: number;
    cities_covered: number;
}

type State = "loading" | "ready" | "forbidden" | "error";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");

/**
 * Admin transparency page (addon #14) — preview the public dashboard's aggregate
 * numbers and see whether it is published. The publish toggle itself lives in
 * System config (transparency_dashboard_enabled); this page links there.
 */
export default function AdminTransparencyPage() {
    const router = useRouter();
    const [state, setState] = useState<State>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [stats, setStats] = useState<TransparencyStats | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/admin/transparency", { cache: "no-store" });
        if (res.status === 401) {
            router.push("/login?redirect=/admin/transparency");
            return;
        }
        if (res.status === 403) {
            setState("forbidden");
            return;
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setErrorMsg(body.error ?? `Request failed (${res.status})`);
            setState("error");
            return;
        }
        const body = (await res.json()) as { enabled: boolean; stats: TransparencyStats };
        setEnabled(body.enabled);
        setStats(body.stats);
        setState("ready");
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div>
            <AdminPageHeader
                title="Transparency"
                subtitle="Preview the public impact dashboard and its published state."
            />

            {state === "loading" && <SkeletonTable />}
            {state === "forbidden" && (
                <Notice tone="warn" title="Access denied">
                    Your role does not have permission to view the transparency dashboard.
                </Notice>
            )}
            {state === "error" && (
                <Notice tone="error" title="Couldn’t load transparency stats">
                    {errorMsg}
                </Notice>
            )}

            {state === "ready" && stats && (
                <>
                    <div
                        className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
                            enabled
                                ? "border-green-200 bg-green-50"
                                : "border-amber-200 bg-amber-50"
                        }`}
                    >
                        <div>
                            <p className="text-sm font-semibold text-slate-900">
                                {enabled
                                    ? "Published — the public dashboard is live."
                                    : "Not published — the public page returns 404."}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Toggle <code className="font-mono">transparency_dashboard_enabled</code> in
                                System config to publish/unpublish.
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

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Card label="Total donations" value={inr(stats.total_donations_inr)} />
                        <Card label="Meals sponsored" value={num(stats.meals_sponsored)} />
                        <Card label="Meals served" value={num(stats.meals_served)} />
                        <Card label="Active vendors" value={num(stats.active_vendors)} />
                        <Card label="Beneficiaries reached" value={num(stats.active_beneficiaries)} />
                        <Card label="Cities covered" value={num(stats.cities_covered)} />
                    </div>
                </>
            )}
        </div>
    );
}

function Card({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
    );
}
