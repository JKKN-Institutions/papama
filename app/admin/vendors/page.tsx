"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode, useState } from "react";

import type { VendorResponse } from "@/lib/validation/schemas";

/**
 * Admin vendors page — proves the full stack: the browser session cookie is sent
 * to GET /api/admin/vendors, the route runs requireAppUser → matrix → DB, and the
 * rows render here. 401 → bounce to login; 403 → access-denied notice.
 */
export default function AdminVendorsPage() {
    const router = useRouter();
    const [vendors, setVendors] = useState<VendorResponse[]>([]);
    const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        (async () => {
            const res = await fetch("/api/admin/vendors", { cache: "no-store" });

            if (!active) return;

            if (res.status === 401) {
                router.push("/login?redirect=/admin/vendors");
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

            const body = (await res.json()) as { vendors: VendorResponse[] };
            setVendors(body.vendors);
            setState("ready");
        })();

        return () => {
            active = false;
        };
    }, [router]);

    return (
        <div>
            <div className="mb-6 flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vendors</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Registered food vendors and their onboarding status.
                    </p>
                </div>
                {state === "ready" && (
                    <span className="text-sm text-slate-400">{vendors.length} total</span>
                )}
            </div>

            {state === "loading" && <SkeletonTable />}

            {state === "forbidden" && (
                <Notice tone="warn" title="Access denied">
                    Your role does not have permission to view vendors.
                </Notice>
            )}

            {state === "error" && (
                <Notice tone="error" title="Couldn’t load vendors">
                    {errorMsg}
                </Notice>
            )}

            {state === "ready" &&
                (vendors.length === 0 ? (
                    <Notice tone="info" title="No vendors yet">
                        Vendors will appear here once they are onboarded.
                    </Notice>
                ) : (
                    <VendorTable vendors={vendors} />
                ))}
        </div>
    );
}

function VendorTable({ vendors }: { vendors: VendorResponse[] }) {
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">KYC</th>
                        <th className="px-4 py-3 font-medium">FSSAI</th>
                        <th className="px-4 py-3 font-medium">GST</th>
                        <th className="px-4 py-3 font-medium">Hygiene</th>
                        <th className="px-4 py-3 font-medium">Registered</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {vendors.map((v) => (
                        <tr key={v.vendor_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{v.name}</td>
                            <td className="px-4 py-3">
                                <StatusBadge value={v.status} />
                            </td>
                            <td className="px-4 py-3">
                                <StatusBadge value={v.kyc_status} />
                            </td>
                            <td className="px-4 py-3 text-slate-600">{v.fssai_license ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-600">{v.gst_number ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-600">
                                {v.hygiene_rating != null ? `${v.hygiene_rating}/5` : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                                {new Date(v.created_at).toLocaleDateString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const BADGE_TONES: Record<string, string> = {
    approved: "bg-green-50 text-green-700 ring-green-600/20",
    verified: "bg-green-50 text-green-700 ring-green-600/20",
    pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
    suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
    rejected: "bg-red-50 text-red-700 ring-red-600/20",
    failed: "bg-red-50 text-red-700 ring-red-600/20",
};

function StatusBadge({ value }: { value: string }) {
    const tone = BADGE_TONES[value] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${tone}`}
        >
            {value.replace(/_/g, " ")}
        </span>
    );
}

function Notice({
    tone,
    title,
    children,
}: {
    tone: "info" | "warn" | "error";
    title: string;
    children: ReactNode;
}) {
    const tones = {
        info: "border-slate-200 bg-white text-slate-600",
        warn: "border-amber-200 bg-amber-50 text-amber-800",
        error: "border-red-200 bg-red-50 text-red-800",
    } as const;
    return (
        <div className={`rounded-xl border p-6 text-sm ${tones[tone]}`}>
            <p className="font-medium">{title}</p>
            <p className="mt-1 opacity-90">{children}</p>
        </div>
    );
}

function SkeletonTable() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200/60" />
            ))}
        </div>
    );
}
