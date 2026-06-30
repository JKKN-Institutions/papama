"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Public beneficiary feedback form (addon #9). Reached from the nearby-vendors
 * list (?vendor=<id>&name=<name>). No account required — it POSTs to the public
 * /api/beneficiary/feedback route, which records the rating, recomputes the
 * vendor's quality score, and (when an admin has enabled it) runs the
 * auto-suspend check.
 */
export default function BeneficiaryFeedbackPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
                    <div className="h-48 w-full max-w-lg animate-pulse rounded-2xl bg-slate-200/60" />
                </main>
            }
        >
            <FeedbackForm />
        </Suspense>
    );
}

function FeedbackForm() {
    const params = useSearchParams();
    const vendorId = params.get("vendor");
    const vendorName = params.get("name");

    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [isComplaint, setIsComplaint] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        if (!vendorId) {
            setErr("No vendor selected.");
            return;
        }
        if (rating < 1) {
            setErr("Please pick a rating.");
            return;
        }
        setBusy(true);
        try {
            const res = await fetch("/api/beneficiary/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "omit",
                body: JSON.stringify({
                    vendor_id: vendorId,
                    rating,
                    comment: comment.trim() || undefined,
                    is_complaint: isComplaint,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
            setDone(true);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn’t submit feedback.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Rate your meal</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {vendorName ? (
                            <>
                                How was your experience at{" "}
                                <span className="font-medium text-slate-700">{vendorName}</span>?
                            </>
                        ) : (
                            "Tell us how your experience was."
                        )}
                    </p>
                </div>

                {!vendorId ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        <p className="font-medium">No vendor selected</p>
                        <p className="mt-1">
                            Open the{" "}
                            <Link href="/beneficiary/nearby-vendors" className="font-medium underline">
                                nearby outlets
                            </Link>{" "}
                            list and choose “Leave feedback” on an outlet.
                        </p>
                    </div>
                ) : done ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center text-sm text-green-800">
                        <p className="font-medium">Thank you for your feedback!</p>
                        <p className="mt-1">It helps us keep meals safe and high quality.</p>
                        <Link
                            href="/beneficiary/nearby-vendors"
                            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                            Find more outlets
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-5">
                        {/* Star rating */}
                        <div>
                            <span className="mb-1 block text-sm font-medium text-slate-700">Your rating</span>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setRating(n)}
                                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                                        className={`text-3xl leading-none transition ${
                                            n <= rating ? "text-amber-500" : "text-slate-300 hover:text-amber-300"
                                        }`}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="comment" className="mb-1 block text-sm font-medium text-slate-700">
                                Comment <span className="font-normal text-slate-400">(optional)</span>
                            </label>
                            <textarea
                                id="comment"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                rows={4}
                                maxLength={1000}
                                placeholder="What went well, or what could be better?"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={isComplaint}
                                onChange={(e) => setIsComplaint(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                            />
                            This is a complaint (hygiene, behaviour, or a serious problem)
                        </label>

                        {err && (
                            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                                {err}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {busy ? "Submitting…" : "Submit feedback"}
                        </button>
                    </form>
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
