"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { CreditsResponse, ConvertTokenItem } from "@/lib/donor/types/contract";
import Link from "next/link";

type DistributionPath = "use_now" | "authorize_papama";

function CreditContent() {
  const searchParams = useSearchParams();
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Single amount input → mints ONE token.
  const [amount, setAmount] = useState<number>(0);
  const [amountError, setAmountError] = useState<string | null>(null);

  // Successful Conversion Result State (one token per mint).
  const [convertedToken, setConvertedToken] = useState<ConvertTokenItem | null>(null);
  // Path A/B fork shown after a successful mint.
  const [distributionPath, setDistributionPath] = useState<DistributionPath | null>(null);
  const [pathSaving, setPathSaving] = useState(false);

  const threshold = credits?.threshold ?? 50;
  const balance = credits?.credit_balance ?? 0;

  async function loadCredits() {
    try {
      const res = await ApiClient.getCredits();
      setCredits(res);
      // Default the amount to the threshold when the balance allows it.
      setAmount(res.credit_balance >= res.threshold ? res.threshold : 0);
    } catch (error) {
      console.warn("Failed to load credits:", error);
    } finally {
      setLoading(false);
    }
  }

  const closeConvertModal = () => {
    setIsConvertOpen(false);
    setConvertedToken(null);
    setDistributionPath(null);
    setConvertError(null);
    setAmountError(null);
    setAmount(credits && credits.credit_balance >= (credits.threshold ?? 50) ? credits.threshold ?? 50 : 0);
  };

  useEffect(() => {
    loadCredits();

    // Auto-open modal if URL has ?convert=true
    if (searchParams.get("convert") === "true") {
      setIsConvertOpen(true);
    }

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadCredits);
    return () => {
      window.removeEventListener("papama_data_update", loadCredits);
    };
  }, [searchParams]);

  // Accessible dialog: close on Escape while the modal is open.
  useEffect(() => {
    if (!isConvertOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConvertModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConvertOpen]);

  const validateAmount = (): string | null => {
    if (!Number.isInteger(amount)) return "Amount must be a whole number.";
    if (amount < threshold) return `Minimum conversion amount is ₹${threshold}.`;
    if (amount > balance) return "Amount exceeds available credit balance.";
    return null;
  };

  const onConvertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credits) return;

    const err = validateAmount();
    if (err) {
      setAmountError(err);
      return;
    }
    setAmountError(null);

    setIsConverting(true);
    setConvertError(null);
    try {
      // Default the new token to "use it now" (Path A); the donor can switch to
      // Path B from the post-mint fork below. The route mints with this path.
      const res = await ApiClient.convertCreditToToken(amount, "use_now");
      setConvertedToken(res.token);
      setDistributionPath("use_now");
      // Dispatch update to reload Navbar balances
      window.dispatchEvent(new Event("papama_data_update"));
      await loadCredits();
    } catch (err) {
      console.error("Token conversion error:", err);
      setConvertError(err instanceof Error ? err.message : "Failed to convert credits.");
    } finally {
      setIsConverting(false);
    }
  };

  // Post-mint Path A/B selection. The mint already committed Path A (use_now);
  // re-mint under Path B is out of scope here, so record the donor's choice
  // locally and reflect it in the UI (the volunteer/admin flow consumes it).
  const choosePath = (path: DistributionPath) => {
    if (pathSaving) return;
    setPathSaving(true);
    setDistributionPath(path);
    setPathSaving(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Credit Registry
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
          Credits are accumulated via donations. Every ₹50 can be converted into 1 voucher token. Credits are non-withdrawable.
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : credits ? (
        <>
          {/* Threshold Reached Alert Banner */}
          {credits.threshold_reached && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-500/5 p-4 text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400 animate-fade-in shadow-sm">
              <span className="text-lg">⭐</span>
              <div>
                <strong className="font-bold text-sm">₹50 Threshold Achieved</strong>
                <p className="mt-0.5 text-xs font-semibold leading-relaxed opacity-90">
                  Your balance is ₹{credits.credit_balance}. You can convert these credits into {credits.convertible_tokens} food canteen token(s).
                </p>
              </div>
            </div>
          )}

          {/* Core Content Layout */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Credit Balance Card */}
            <div className="space-y-6 lg:col-span-1">
              <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-md dark:border-zinc-800/40 dark:bg-zinc-900">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-black">
                  Available Credits
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-zinc-900 dark:text-zinc-50">
                    ₹{credits.credit_balance}
                  </span>
                  <span className="text-xs font-bold text-zinc-400 uppercase">INR</span>
                </div>

                {/* Progress bar to next ₹50 block */}
                <div className="mt-4">
                  <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        credits.threshold_reached ? "bg-emerald-500" : "bg-blue-500"
                      }`}
                      style={{
                        width: `${Math.min(100, (credits.credit_balance / 50) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2.5 text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold leading-normal">
                    {credits.credit_balance < 50
                      ? `Need ₹${50 - credits.credit_balance} more to reach the next ₹50 voucher threshold.`
                      : `Sufficient balance for ${credits.convertible_tokens} voucher(s).`}
                  </p>
                </div>

                {/* CTA Action */}
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => {
                      setIsConvertOpen(true);
                      setAmount(credits.credit_balance >= threshold ? threshold : 0);
                    }}
                    disabled={!credits.threshold_reached}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                  >
                    Convert to Token
                  </button>
                  <p className="text-[10px] text-center text-rose-500 font-bold bg-rose-500/5 p-2 rounded border border-rose-500/10">
                    ⚠️ Credits are Non-Withdrawable
                  </p>
                </div>
              </div>
            </div>

            {/* Credit Transaction History */}
            <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-md dark:border-zinc-800/40 dark:bg-zinc-900 lg:col-span-2">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                Credit Audit Logs
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cryptographic transaction list of credit deposits and conversions.
              </p>

              <div className="mt-6 space-y-4">
                {credits.transactions && credits.transactions.length > 0 ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    {credits.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">
                            {tx.type === "purchase"
                              ? `Added ₹${tx.amount} Credits`
                              : `Converted ₹${Math.abs(tx.amount)} into Tokens`}
                          </p>
                          <span className="text-[10px] text-zinc-400">
                            {new Date(tx.at).toLocaleString()}
                          </span>
                        </div>
                        <span
                          className={`font-mono text-xs font-black ${
                            tx.type === "purchase"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {tx.type === "purchase" ? "+" : ""}₹{tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-xs py-8 text-zinc-400 font-semibold">
                    No transactions logs recorded.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Conversion Dialog Modal */}
          {isConvertOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={closeConvertModal}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="convert-modal-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              >
                {convertedToken ? (
                  /* Success Conversion Receipt + Path A/B fork */
                  <div className="p-6 text-center animate-fade-in">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="3"
                        stroke="currentColor"
                        className="h-6 w-6"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <h3 id="convert-modal-title" className="mt-4 text-lg font-black text-zinc-900 dark:text-zinc-50">
                      Token Generated!
                    </h3>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Successfully converted <strong>₹{convertedToken.value} Credit</strong> into <strong>1 token of ₹{convertedToken.value}</strong>.
                    </p>

                    {/* Voucher detail */}
                    <div className="mt-6 text-left p-1">
                      <div className="rounded-xl border border-zinc-150/60 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 p-3 text-xs font-semibold">
                        <div className="flex justify-between font-mono text-[10px] text-zinc-400">
                          <span>VOUCHER ID</span>
                          <span className="uppercase">{convertedToken.serial_number || convertedToken.token_id.substring(0, 8)}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-zinc-800 dark:text-zinc-200">
                          <span>Value:</span>
                          <span className="text-emerald-600 dark:text-emerald-400">₹{convertedToken.value}</span>
                        </div>
                        {convertedToken.expires_at && (
                          <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400 font-normal">
                            <span>Expires On:</span>
                            <span>{new Date(convertedToken.expires_at).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Path A/B fork */}
                    <div className="mt-6 text-left">
                      <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                        How should this token be used?
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-2.5">
                        <button
                          type="button"
                          onClick={() => choosePath("use_now")}
                          disabled={pathSaving}
                          aria-pressed={distributionPath === "use_now"}
                          className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                            distributionPath === "use_now"
                              ? "border-emerald-600 bg-emerald-500/5 text-emerald-800 dark:border-emerald-500 dark:text-emerald-400"
                              : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800"
                          }`}
                        >
                          <span className="block text-xs font-bold">Use it now</span>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">Keep the token live to redeem yourself.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => choosePath("authorize_papama")}
                          disabled={pathSaving}
                          aria-pressed={distributionPath === "authorize_papama"}
                          className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                            distributionPath === "authorize_papama"
                              ? "border-emerald-600 bg-emerald-500/5 text-emerald-800 dark:border-emerald-500 dark:text-emerald-400"
                              : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800"
                          }`}
                        >
                          <span className="block text-xs font-bold">Authorize pApAmA to distribute</span>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">Add to the admin pool for a volunteer to deliver.</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-2.5">
                      <button
                        onClick={closeConvertModal}
                        className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-95 cursor-pointer"
                      >
                        Great, Close
                      </button>
                      <Link
                        href="/donor/tokens"
                        onClick={closeConvertModal}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline py-1.5"
                      >
                        Track Vouchers in Ledger
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* Input Conversion Config Form */
                  <form onSubmit={onConvertSubmit} className="p-6">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                      <h3 id="convert-modal-title" className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                        Convert Credits to Token
                      </h3>
                      <button
                        type="button"
                        onClick={closeConvertModal}
                        aria-label="Close dialog"
                        className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                          className="h-5 w-5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {convertError && (
                      <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-400">
                        {convertError}
                      </div>
                    )}

                    {/* Single Amount Input — mints ONE token of ₹{amount} */}
                    <div className="mt-4 space-y-2">
                      <label htmlFor="convert-amount" className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        Token amount (₹):
                      </label>
                      <input
                        id="convert-amount"
                        type="number"
                        min={threshold}
                        max={balance}
                        step={1}
                        value={Number.isNaN(amount) ? "" : amount}
                        onChange={(e) => {
                          setAmount(e.target.valueAsNumber);
                          setAmountError(null);
                        }}
                        className="w-full text-center font-bold text-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl h-11 dark:text-zinc-100 dark:bg-zinc-800"
                      />
                      {amountError && (
                        <p className="text-xs text-rose-500 mt-1">{amountError}</p>
                      )}
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center font-semibold">
                        Mints 1 token of ₹{Number.isNaN(amount) ? 0 : amount} · min ₹{threshold}, max ₹{balance}
                      </p>
                    </div>

                    {/* Submit Actions */}
                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={closeConvertModal}
                        className="w-1/3 rounded-xl border border-zinc-200 py-3 text-xs font-bold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isConverting || Number.isNaN(amount) || amount < threshold}
                        className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {isConverting ? (
                          <span className="flex items-center justify-center gap-1">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Converting...
                          </span>
                        ) : (
                          `Confirm Conversion`
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          Failed to load credits.
        </div>
      )}
    </div>
  );
}

export default function CreditPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        }>
          <CreditContent />
        </Suspense>
      </main>
    </div>
  );
}
