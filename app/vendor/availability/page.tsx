"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader, Notice, StatusBadge } from "../_ui";

/* ---- Backend contract ------------------------------------------------------ */

interface Availability {
  vendor_id: string;
  name: string;
  status: string;
  is_open: boolean;
  stock_exhausted: boolean;
  temporary_closure_until: string | null;
  daily_meal_capacity: number | null;
  served_today: number;
  remaining_today: number | null;
}

/** Convert an ISO timestamp to the value a <input type="datetime-local"> wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function VendorAvailabilityPage() {
  const router = useRouter();

  const [data, setData] = useState<Availability | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error" | "none">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Local editable copies
  const [isOpen, setIsOpen] = useState(true);
  const [stockExhausted, setStockExhausted] = useState(false);
  const [closureUntil, setClosureUntil] = useState("");
  const [capacity, setCapacity] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/vendor/availability", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/availability");
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
      const body = (await res.json()) as { availability: Availability | null };
      if (!body.availability) {
        setState("none");
        return;
      }
      const a = body.availability;
      setData(a);
      setIsOpen(a.is_open);
      setStockExhausted(a.stock_exhausted);
      setClosureUntil(toLocalInput(a.temporary_closure_until));
      setCapacity(a.daily_meal_capacity == null ? "" : String(a.daily_meal_capacity));
      setState("ready");
    } catch {
      setErrorMsg("Network error — please try again.");
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);

    const payload: Record<string, unknown> = {
      is_open: isOpen,
      stock_exhausted: stockExhausted,
      temporary_closure_until: closureUntil ? new Date(closureUntil).toISOString() : null,
      daily_meal_capacity: capacity.trim() === "" ? null : Number(capacity),
    };

    if (payload.daily_meal_capacity != null && (Number.isNaN(payload.daily_meal_capacity) || (payload.daily_meal_capacity as number) < 0)) {
      setSaveError("Daily capacity must be a non-negative number (or blank for unlimited).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/vendor/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.push("/vendor/login?redirect=/vendor/availability");
        return;
      }
      if (res.status === 403) {
        setSaveError("You don’t have permission to change availability.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error ?? `Save failed (${res.status}).`);
        return;
      }
      setSaved(true);
      await load();
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const blocked =
    !isOpen ||
    stockExhausted ||
    (closureUntil !== "" && new Date(closureUntil).getTime() > Date.now());

  return (
    <div>
      <PageHeader
        title="Availability"
        subtitle="Control whether your outlet can accept meal redemptions right now, and set an optional daily limit."
      />

      {state === "loading" && <div className="h-64 animate-pulse rounded-xl bg-slate-200/60" />}

      {state === "forbidden" && (
        <Notice tone="warn" title="Not permitted">
          Your account does not have permission to manage availability.
        </Notice>
      )}

      {state === "none" && (
        <Notice tone="info" title="No vendor profile yet">
          Once your outlet is onboarded you can manage its availability here.
        </Notice>
      )}

      {state === "error" && (
        <Notice tone="error" title="Couldn’t load availability">
          {errorMsg}
        </Notice>
      )}

      {state === "ready" && data && (
        <form onSubmit={onSave} className="space-y-6">
          {/* Live status summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Accepting redemptions</p>
                <div className="mt-1">
                  <StatusBadge value={blocked ? "closed" : "open"} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Served today</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {data.served_today}
                  {data.daily_meal_capacity != null && ` / ${data.daily_meal_capacity}`}
                </p>
              </div>
              {data.remaining_today != null && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Remaining today</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{data.remaining_today}</p>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Closed, out-of-stock, an active temporary-closure window, or hitting your daily capacity will
              each stop new redemptions.
            </p>
          </div>

          {/* Toggles */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Serving status</h2>

            <label className="mt-4 flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium text-slate-800">Open for redemptions</span>
                <span className="block text-xs text-slate-500">Turn off to pause all redemptions immediately.</span>
              </span>
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) => {
                  setIsOpen(e.target.checked);
                  setSaved(false);
                }}
                className="h-5 w-5 rounded border-slate-300"
              />
            </label>

            <label className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
              <span>
                <span className="block text-sm font-medium text-slate-800">Out of stock today</span>
                <span className="block text-xs text-slate-500">Use when you’ve run out of food for the day.</span>
              </span>
              <input
                type="checkbox"
                checked={stockExhausted}
                onChange={(e) => {
                  setStockExhausted(e.target.checked);
                  setSaved(false);
                }}
                className="h-5 w-5 rounded border-slate-300"
              />
            </label>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <label htmlFor="closure" className="mb-1 block text-sm font-medium text-slate-800">
                Temporary closure until
              </label>
              <p className="mb-2 text-xs text-slate-500">
                Optional. Redemptions are blocked until this time, then resume automatically.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="closure"
                  type="datetime-local"
                  value={closureUntil}
                  onChange={(e) => {
                    setClosureUntil(e.target.value);
                    setSaved(false);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                />
                {closureUntil && (
                  <button
                    type="button"
                    onClick={() => {
                      setClosureUntil("");
                      setSaved(false);
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Daily capacity */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Daily meal capacity</h2>
            <p className="mt-1 text-sm text-slate-500">
              Optional. The maximum meals you can serve per day. Leave blank for unlimited. Enforced at
              redemption when the admin has capacity limits switched on.
            </p>
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                setSaved(false);
              }}
              placeholder="Unlimited"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 sm:w-48"
            />
          </div>

          {saveError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {saveError}
            </p>
          )}
          {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
          >
            {saving ? "Saving…" : "Save availability"}
          </button>
        </form>
      )}
    </div>
  );
}
