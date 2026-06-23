"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Shared vendor-app UI primitives + a list-fetch state machine. These mirror the
 * admin console's _ui.tsx patterns (replicated inline per file-ownership rules —
 * the vendor app does NOT import from app/admin). All fetches are same-origin and
 * reduce to four render states: loading / forbidden / error / ready (+ empty).
 */

export type FetchState = "loading" | "ready" | "forbidden" | "error";

/** Shared 401→login / 403→forbidden / !ok→error response handling for a GET. */
async function handleGet<T>(
  res: Response,
  dataKey: string,
  router: ReturnType<typeof useRouter>,
  loginRedirect: string
): Promise<{ ok: true; data: T } | { ok: false; state: "forbidden" | "error"; error?: string } | { ok: false; state: "redirected" }> {
  if (res.status === 401) {
    router.push(`/vendor/login?redirect=${loginRedirect}`);
    return { ok: false, state: "redirected" };
  }
  if (res.status === 403) {
    return { ok: false, state: "forbidden" };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, state: "error", error: body.error ?? `Request failed (${res.status})` };
  }
  const body = (await res.json()) as Record<string, unknown>;
  return { ok: true, data: body[dataKey] as T };
}

/**
 * Fetches a vendor GET route and reduces it to the four render states.
 * @param apiPath        the GET /api/vendor/* endpoint
 * @param dataKey        the key in the JSON envelope (e.g. "menus", "vendor")
 * @param loginRedirect  page URL used as the post-login redirect target
 */
export function useVendorFetch<T>(apiPath: string, dataKey: string, loginRedirect: string) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<FetchState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(apiPath, { cache: "no-store", credentials: "same-origin" });
      const result = await handleGet<T>(res, dataKey, router, loginRedirect);
      if (!result.ok) {
        if (result.state === "redirected") return;
        setErrorMsg(result.state === "error" ? (result.error ?? null) : null);
        setState(result.state);
        return;
      }
      setData(result.data ?? null);
      setState("ready");
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  }, [apiPath, dataKey, loginRedirect, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, state, errorMsg, reload };
}

/** Page title + subtitle + optional right-aligned count. */
export function PageHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {count != null && <span className="text-sm text-slate-400">{count} total</span>}
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

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
  approved: "bg-green-50 text-green-700 ring-green-600/20",
  verified: "bg-green-50 text-green-700 ring-green-600/20",
  active: "bg-green-50 text-green-700 ring-green-600/20",
  completed: "bg-green-50 text-green-700 ring-green-600/20",
  paid: "bg-green-50 text-green-700 ring-green-600/20",
  reconciled: "bg-green-50 text-green-700 ring-green-600/20",
  released: "bg-green-50 text-green-700 ring-green-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  scheduled: "bg-amber-50 text-amber-700 ring-amber-600/20",
  open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-600/20",
  suspended: "bg-orange-50 text-orange-700 ring-orange-600/20",
  locked: "bg-orange-50 text-orange-700 ring-orange-600/20",
  held: "bg-orange-50 text-orange-700 ring-orange-600/20",
  inactive: "bg-orange-50 text-orange-700 ring-orange-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  blocked: "bg-red-50 text-red-700 ring-red-600/20",
  denied: "bg-red-50 text-red-700 ring-red-600/20",
  closed: "bg-slate-100 text-slate-600 ring-slate-500/20",
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
      <div className="mt-1 opacity-90">{children}</div>
    </div>
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

/** The shared loading/forbidden/error/empty/ready switch for list pages. */
export function ListStates({
  state,
  errorMsg,
  isEmpty,
  resourceLabel,
  emptyHint,
  children,
}: {
  state: FetchState;
  errorMsg: string | null;
  isEmpty: boolean;
  resourceLabel: string;
  emptyHint: string;
  children: ReactNode;
}) {
  if (state === "loading") return <SkeletonTable />;

  if (state === "forbidden")
    return (
      <Notice tone="warn" title="Not permitted">
        Your account does not have permission to view {resourceLabel}.
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

  return <>{children}</>;
}
