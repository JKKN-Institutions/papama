"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactNode, useState } from "react";

import { useCan } from "@/components/auth/AppUserProvider";
import type { VendorAction, VendorResponse } from "@/lib/validation/schemas";

/**
 * Admin vendors page — lists vendors and (for staff with vendor_management/update)
 * exposes lifecycle actions. The browser session cookie is sent to the route,
 * which runs requireAppUser → matrix → service-role mutation → audit. Action
 * buttons are also hidden client-side via useCan(), but the server is the real
 * gate (403 → access-denied notice).
 */
export default function AdminVendorsPage() {
    const router = useRouter();
    const canManage = useCan("vendor_management", "update");
    const [vendors, setVendors] = useState<VendorResponse[]>([]);
    const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [busyVendor, setBusyVendor] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/admin/vendors", { cache: "no-store" });

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
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    const runAction = useCallback(
        async (vendorId: string, action: VendorAction) => {
            if (NEEDS_CONFIRM.has(action) && !window.confirm(CONFIRM_TEXT[action])) {
                return;
            }
            setBusyVendor(vendorId);
            setActionError(null);
            try {
                const res = await fetch("/api/admin/vendors", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ vendor_id: vendorId, action }),
                });

                if (res.status === 401) {
                    router.push("/login?redirect=/admin/vendors");
                    return;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setActionError(body.error ?? `Action failed (${res.status})`);
                    return;
                }
                await load();
            } finally {
                setBusyVendor(null);
            }
        },
        [load, router]
    );

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

            {actionError && (
                <div className="mb-4">
                    <Notice tone="error" title="Action failed">
                        {actionError}
                    </Notice>
                </div>
            )}

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
                    <VendorTable
                        vendors={vendors}
                        canManage={canManage}
                        busyVendor={busyVendor}
                        onAction={runAction}
                    />
                ))}
        </div>
    );
}

const NEEDS_CONFIRM = new Set<VendorAction>(["reject", "suspend", "fail_kyc"]);
const CONFIRM_TEXT: Record<VendorAction, string> = {
    approve: "",
    reinstate: "",
    verify_kyc: "",
    reject: "Reject this vendor? They will not be able to operate.",
    suspend: "Suspend this vendor? Redemptions at this vendor will stop.",
    fail_kyc: "Mark this vendor's KYC as failed?",
};

type BtnTone = "primary" | "danger" | "warn" | "neutral";

function actionsFor(v: VendorResponse): { action: VendorAction; label: string; tone: BtnTone }[] {
    const acts: { action: VendorAction; label: string; tone: BtnTone }[] = [];
    if (v.status === "pending") {
        acts.push({ action: "approve", label: "Approve", tone: "primary" });
        acts.push({ action: "reject", label: "Reject", tone: "danger" });
    }
    if (v.status === "approved") acts.push({ action: "suspend", label: "Suspend", tone: "warn" });
    if (v.status === "suspended") acts.push({ action: "reinstate", label: "Reinstate", tone: "primary" });
    if (v.kyc_status !== "verified") acts.push({ action: "verify_kyc", label: "Verify KYC", tone: "neutral" });
    if (v.kyc_status !== "failed") acts.push({ action: "fail_kyc", label: "Fail KYC", tone: "neutral" });
    return acts;
}

function VendorTable({
    vendors,
    canManage,
    busyVendor,
    onAction,
}: {
    vendors: VendorResponse[];
    canManage: boolean;
    busyVendor: string | null;
    onAction: (vendorId: string, action: VendorAction) => void;
}) {
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
                        {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {vendors.map((v) => {
                        const busy = busyVendor === v.vendor_id;
                        return (
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
                                {canManage && (
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1.5">
                                            {actionsFor(v).map((a) => (
                                                <ActionButton
                                                    key={a.action}
                                                    tone={a.tone}
                                                    disabled={busy}
                                                    onClick={() => onAction(v.vendor_id, a.action)}
                                                >
                                                    {a.label}
                                                </ActionButton>
                                            ))}
                                            {actionsFor(v).length === 0 && (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

const BTN_TONES: Record<BtnTone, string> = {
    primary: "border-green-300 bg-green-50 text-green-700 hover:bg-green-100",
    danger: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
    warn: "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100",
    neutral: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

function ActionButton({
    tone,
    disabled,
    onClick,
    children,
}: {
    tone: BtnTone;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BTN_TONES[tone]}`}
        >
            {children}
        </button>
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
