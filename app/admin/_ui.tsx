"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Shared admin-console UI primitives + the proven list-fetch state machine,
 * extracted verbatim from the verified vendors page so every section page
 * behaves identically: cookie → GET /api/admin/* → requireAppUser → matrix → DB,
 * with 401 → login bounce, 403 → access-denied, error → notice, empty → notice.
 */

type ListState = "loading" | "ready" | "forbidden" | "error";

/**
 * Fetches an admin list route and reduces it to the four render states.
 * @param apiPath    the GET /api/admin/* endpoint
 * @param dataKey    the array key in the JSON envelope (e.g. "vendors", "config")
 * @param pageHref   the /admin/* page URL, used as the post-login redirect target
 */
export function useAdminList<T>(apiPath: string, dataKey: string, pageHref: string) {
    const router = useRouter();
    const [items, setItems] = useState<T[]>([]);
    const [state, setState] = useState<ListState>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await fetch(apiPath, { cache: "no-store" });

        if (res.status === 401) {
            router.push(`/login?redirect=${pageHref}`);
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

        const body = (await res.json()) as Record<string, T[]>;
        setItems(body[dataKey] ?? []);
        setState("ready");
    }, [router, apiPath, dataKey, pageHref]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { items, state, errorMsg, reload };
}

/**
 * Row-level mutation runner shared by the admin action columns. PATCHes the given
 * endpoint, tracks a per-row busy id, surfaces the error body, and reloads the
 * list on success. The server still enforces the matrix — UI gating is cosmetic.
 *
 * @param apiPath  the PATCH endpoint (same route as the list's GET)
 * @param reload   the list reloader (from useAdminList) to run after success
 */
export function useRowAction(apiPath: string, reload: () => Promise<void>) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const run = useCallback(
        async (rowId: string, payload: Record<string, unknown>, confirmText?: string) => {
            if (confirmText && !window.confirm(confirmText)) return;
            setBusyId(rowId);
            setActionError(null);
            try {
                const res = await fetch(apiPath, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (res.status === 401) {
                    router.push("/login?redirect=/admin");
                    return;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setActionError(body.error ?? `Action failed (${res.status})`);
                    return;
                }
                await reload();
            } finally {
                setBusyId(null);
            }
        },
        [apiPath, reload, router]
    );

    return { run, busyId, actionError };
}

/** Page title + subtitle + (when ready) a row count, matching the vendors header. */
export function AdminPageHeader({
    title,
    subtitle,
    count,
}: {
    title: string;
    subtitle: string;
    count?: number;
}) {
    return (
        <div className="mb-6 flex items-end justify-between">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
            {count != null && <span className="text-sm text-slate-400">{count} total</span>}
        </div>
    );
}

/** Card shell around a `<table>`, identical chrome to the vendors table. */
export function TableShell({ children }: { children: ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
        </div>
    );
}

/** Uppercase column-header row; pass the labels in order. */
export function TableHead({ columns }: { columns: string[] }) {
    return (
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
                {columns.map((c) => (
                    <th key={c} className="px-4 py-3 font-medium">
                        {c}
                    </th>
                ))}
            </tr>
        </thead>
    );
}

const BADGE_TONES: Record<string, string> = {
    // green — healthy / approved / done
    approved: "bg-green-50 text-green-700 ring-green-600/20",
    verified: "bg-green-50 text-green-700 ring-green-600/20",
    active: "bg-green-50 text-green-700 ring-green-600/20",
    completed: "bg-green-50 text-green-700 ring-green-600/20",
    paid: "bg-green-50 text-green-700 ring-green-600/20",
    reconciled: "bg-green-50 text-green-700 ring-green-600/20",
    released: "bg-green-50 text-green-700 ring-green-600/20",
    resolved: "bg-green-50 text-green-700 ring-green-600/20",
    granted: "bg-green-50 text-green-700 ring-green-600/20",
    // amber — pending / in flight
    pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
    scheduled: "bg-amber-50 text-amber-700 ring-amber-600/20",
    open: "bg-amber-50 text-amber-700 ring-amber-600/20",
    in_progress: "bg-amber-50 text-amber-700 ring-amber-600/20",
    partially_granted: "bg-amber-50 text-amber-700 ring-amber-600/20",
    medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
    // orange — held / suspended
    suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
    locked: "bg-orange-50 text-orange-700 ring-orange-600/20",
    held: "bg-orange-50 text-orange-700 ring-orange-600/20",
    inactive: "bg-orange-50 text-orange-700 ring-orange-600/20",
    // red — failure / risk
    rejected: "bg-red-50 text-red-700 ring-red-600/20",
    failed: "bg-red-50 text-red-700 ring-red-600/20",
    blocked: "bg-red-50 text-red-700 ring-red-600/20",
    high: "bg-red-50 text-red-700 ring-red-600/20",
    denied: "bg-red-50 text-red-700 ring-red-600/20",
    // slate — low / neutral / closed
    low: "bg-slate-100 text-slate-600 ring-slate-500/20",
    closed: "bg-slate-100 text-slate-600 ring-slate-500/20",
    dismissed: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

/** Capitalised, underscores-to-spaces status pill, tone keyed off the value. */
export function StatusBadge({ value }: { value: string }) {
    const tone = BADGE_TONES[value] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${tone}`}
        >
            {value.replace(/_/g, " ")}
        </span>
    );
}

/** Yes/No pill for privacy-safe boolean flags (e.g. aadhaar_linked, blocked). */
export function BoolBadge({
    value,
    yes = "Yes",
    no = "No",
    danger = false,
}: {
    value: boolean;
    yes?: string;
    no?: string;
    /** When true, a `true` value reads as a risk (red) rather than healthy (green). */
    danger?: boolean;
}) {
    const tone = value
        ? danger
            ? "bg-red-50 text-red-700 ring-red-600/20"
            : "bg-green-50 text-green-700 ring-green-600/20"
        : "bg-slate-100 text-slate-600 ring-slate-500/20";
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
        >
            {value ? yes : no}
        </span>
    );
}

/** Renders a value or an em-dash when it is null/empty. */
export function Dash({ children }: { children: ReactNode }) {
    const empty = children == null || children === "";
    return <>{empty ? "—" : children}</>;
}

export function Notice({
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

export type BtnTone = "primary" | "danger" | "warn" | "neutral";

const BTN_TONES: Record<BtnTone, string> = {
    primary: "border-green-300 bg-green-50 text-green-700 hover:bg-green-100",
    danger: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
    warn: "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100",
    neutral: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

/** Small tone-coloured action button used in admin table action columns. */
export function ActionButton({
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

export function SkeletonTable() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200/60" />
            ))}
        </div>
    );
}

/**
 * Shared "run a job" action bar — one POST to a job endpoint with busy/success/
 * error states. Used by the settlement-run, fraud-scan and token expire-sweep
 * controls (replaces three near-identical hand-rolled bars). Optional `children`
 * render extra controls (e.g. a period select) before the button; `body` is a
 * thunk so it reads the latest of those controls' state at click time.
 */
export function RunJobBar({
    label,
    endpoint,
    buttonText,
    busyText,
    successMessage,
    onDone,
    body,
    children,
}: {
    label: string;
    endpoint: string;
    buttonText: string;
    busyText: string;
    successMessage: (data: Record<string, unknown>) => string;
    onDone: () => void;
    body?: () => Record<string, unknown>;
    children?: ReactNode;
}) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function run() {
        setBusy(true);
        setMsg(null);
        setErr(null);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body()) : undefined,
            });
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (!res.ok) throw new Error((data.error as string) ?? `Failed (${res.status})`);
            setMsg(successMessage(data));
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Action failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            {children}
            <button
                type="button"
                onClick={run}
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
                {busy ? busyText : buttonText}
            </button>
            {msg && <span className="text-xs font-medium text-green-700">{msg}</span>}
            {err && <span className="text-xs font-medium text-red-700">{err}</span>}
        </div>
    );
}

/**
 * The shared loading/forbidden/error/empty/ready switch. Pass the loaded `table`
 * render only; the four non-ready states are handled identically everywhere.
 */
export function ListStates({
    state,
    errorMsg,
    isEmpty,
    resourceLabel,
    emptyHint,
    table,
}: {
    state: ListState;
    errorMsg: string | null;
    isEmpty: boolean;
    resourceLabel: string;
    emptyHint: string;
    table: ReactNode;
}) {
    if (state === "loading") return <SkeletonTable />;

    if (state === "forbidden")
        return (
            <Notice tone="warn" title="Access denied">
                Your role does not have permission to view {resourceLabel}.
            </Notice>
        );

    if (state === "error")
        return (
            <Notice tone="error" title={`Couldn’t load ${resourceLabel}`}>
                {errorMsg}
            </Notice>
        );

    if (isEmpty)
        return (
            <Notice tone="info" title={`No ${resourceLabel} yet`}>
                {emptyHint}
            </Notice>
        );

    return <>{table}</>;
}
