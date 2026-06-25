"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";

interface ScheduleItem {
  id: string;
  token_id: string;
  scheduled_for: string;
  location: string | null;
  status: string;
  created_at: string;
}

/**
 * Donor scheduling sub-route (DIST-6). Lets the donor pick a future occasion date
 * (and optional location) for a token; a reminder is dispatched 7 days before.
 * Talks to the new same-origin governed route /api/donor/tokens/[id]/schedule
 * (GET / POST / DELETE). New file — does not touch the token detail page, which
 * is owned elsewhere.
 */
export default function ScheduleTokenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [schedule, setSchedule] = useState<ScheduleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");

  // Min selectable date = today (the route also rejects past dates server-side).
  const today = new Date().toISOString().slice(0, 10);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`/api/donor/tokens/${id}/schedule`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load (${res.status})`);
      }
      const data = await res.json();
      const s = (data.schedule as ScheduleItem | null) ?? null;
      setSchedule(s);
      if (s) {
        setDate(s.scheduled_for);
        setLocation(s.location ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedMsg(null);
    if (!date) {
      setError("Please pick a date.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/donor/tokens/${id}/schedule`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_for: date,
          location: location.trim() ? location.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to save (${res.status})`);
      }
      const data = await res.json();
      setSchedule((data.schedule as ScheduleItem) ?? null);
      setSavedMsg("Occasion scheduled. We'll remind you 7 days before.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/donor/tokens/${id}/schedule`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to clear (${res.status})`);
      }
      setSchedule(null);
      setDate("");
      setLocation("");
      setSavedMsg("Schedule cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear schedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href={`/donor/tokens/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
              className="h-3.5 w-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Token
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40 md:p-8">
          <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            Schedule for an Occasion
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Set a future date for this token to be redeemed (e.g. a birthday or festival).
            We&apos;ll send you a reminder 7 days before.
          </p>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {schedule && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <p className="font-bold text-emerald-800 dark:text-emerald-400">
                    Currently scheduled for {new Date(schedule.scheduled_for).toLocaleDateString()}
                  </p>
                  {schedule.location && (
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                      Location: {schedule.location}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs font-semibold text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
              {savedMsg && (
                <div className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {savedMsg}
                </div>
              )}

              <form onSubmit={onSave} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="schedule-date" className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    Occasion date
                  </label>
                  <input
                    id="schedule-date"
                    type="date"
                    min={today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="schedule-location" className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    Location (optional)
                  </label>
                  <input
                    id="schedule-location"
                    type="text"
                    placeholder="e.g. Anna Canteen, T. Nagar"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : schedule ? "Update schedule" : "Schedule occasion"}
                  </button>
                  {schedule && (
                    <button
                      type="button"
                      onClick={onClear}
                      disabled={saving}
                      className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 cursor-pointer"
                    >
                      Clear schedule
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
