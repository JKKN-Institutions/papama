"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

/**
 * Public nearby-vendor finder (addon #5). Asks the browser for the user's
 * location, then calls the public /api/beneficiary/nearby-vendors route (which
 * returns a SAFE projection only — no bank/contact details) and lists approved
 * outlets sorted by distance with live open/closed + hours.
 */

interface Hours {
    meal_type: string | null;
    start_time: string;
    end_time: string;
}

interface NearbyVendor {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    geo_lat: number | null;
    geo_lng: number | null;
    is_open: boolean;
    stock_exhausted: boolean;
    temporary_closure_until: string | null;
    distance_km: number;
    hours: Hours[];
}

function hhmm(t: string): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : t;
}

function availability(v: NearbyVendor): { label: string; tone: string } {
    if (!v.is_open) return { label: "Closed", tone: "bg-red-50 text-red-700 ring-red-600/20" };
    if (v.stock_exhausted)
        return { label: "Out of stock", tone: "bg-orange-50 text-orange-700 ring-orange-600/20" };
    if (v.temporary_closure_until && new Date(v.temporary_closure_until).getTime() > Date.now())
        return { label: "Temporarily closed", tone: "bg-orange-50 text-orange-700 ring-orange-600/20" };
    return { label: "Open", tone: "bg-green-50 text-green-700 ring-green-600/20" };
}

export default function NearbyVendorsPage() {
    const [state, setState] = useState<"idle" | "locating" | "loading" | "ready" | "error">("idle");
    const [vendors, setVendors] = useState<NearbyVendor[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const search = useCallback(() => {
        setErrorMsg(null);
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setErrorMsg("Your device does not support location. Please try another device.");
            setState("error");
            return;
        }
        setState("locating");
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                setState("loading");
                try {
                    const { latitude, longitude } = pos.coords;
                    const res = await fetch(
                        `/api/beneficiary/nearby-vendors?lat=${latitude}&lng=${longitude}`,
                        { cache: "no-store", credentials: "omit" }
                    );
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        setErrorMsg(body.error ?? `Request failed (${res.status})`);
                        setState("error");
                        return;
                    }
                    const body = (await res.json()) as { vendors: NearbyVendor[] };
                    setVendors(body.vendors ?? []);
                    setState("ready");
                } catch {
                    setErrorMsg("Network error — please try again.");
                    setState("error");
                }
            },
            () => {
                setErrorMsg("We couldn’t access your location. Please allow location access and try again.");
                setState("error");
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, []);

    const busy = state === "locating" || state === "loading";

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto w-full max-w-2xl">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Find a meal nearby</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Share your location to see approved pApAmA outlets near you, sorted by distance.
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <button
                        type="button"
                        onClick={search}
                        disabled={busy}
                        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {state === "locating"
                            ? "Getting your location…"
                            : state === "loading"
                              ? "Finding outlets…"
                              : state === "ready"
                                ? "Search again"
                                : "Use my location"}
                    </button>
                    {state === "error" && errorMsg && (
                        <p className="mt-3 text-sm text-red-600">{errorMsg}</p>
                    )}
                </div>

                {state === "ready" && (
                    <div className="mt-6 space-y-3">
                        {vendors.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                                No approved outlets found near you right now.
                            </div>
                        ) : (
                            vendors.map((v) => {
                                const a = availability(v);
                                return (
                                    <div
                                        key={v.id}
                                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold text-slate-900">{v.name}</p>
                                                <p className="mt-0.5 truncate text-sm text-slate-500">
                                                    {[v.address, v.city].filter(Boolean).join(", ") || "—"}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                <span className="text-sm font-medium text-slate-700">
                                                    {v.distance_km} km
                                                </span>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${a.tone}`}
                                                >
                                                    {a.label}
                                                </span>
                                            </div>
                                        </div>

                                        {v.hours.length > 0 && (
                                            <p className="mt-2 text-xs text-slate-500">
                                                Hours:{" "}
                                                {v.hours
                                                    .map(
                                                        (h) =>
                                                            `${h.meal_type ? `${h.meal_type} ` : ""}${hhmm(h.start_time)}–${hhmm(h.end_time)}`
                                                    )
                                                    .join(", ")}
                                            </p>
                                        )}

                                        <div className="mt-3 flex flex-wrap gap-3 text-sm">
                                            {v.geo_lat != null && v.geo_lng != null && (
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${v.geo_lat},${v.geo_lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-slate-900 hover:underline"
                                                >
                                                    Directions
                                                </a>
                                            )}
                                            <Link
                                                href={`/beneficiary/feedback?vendor=${v.id}&name=${encodeURIComponent(v.name)}`}
                                                className="font-medium text-slate-900 hover:underline"
                                            >
                                                Leave feedback
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                <p className="mt-6 text-center text-sm text-slate-500">
                    <Link href="/" className="font-medium text-slate-900 hover:underline">
                        Back to home
                    </Link>
                </p>
            </div>
        </main>
    );
}
