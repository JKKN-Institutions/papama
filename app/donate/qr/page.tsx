"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

/**
 * Public UPI QR donation — REAL manual-confirm flow (no fake confirm).
 *
 * Step 1: pick an amount → backend generates a UPI deep-link QR (15-min expiry)
 *         and a PENDING upi_qr_payments row.
 * Step 2: donor scans + pays with any UPI app, then enters the UTR.
 * Step 3: backend validates the pending row, enforces expiry, flips it to PAID,
 *         and credits a donor-less donation whose payment_ref is the real UTR.
 */

const amountSchema = z.object({
  amount: z.number().int("Amount must be a whole number").min(1, "Amount must be greater than ₹0"),
});
type AmountValues = z.infer<typeof amountSchema>;

const utrSchema = z.object({
  refNumber: z
    .string()
    .trim()
    .min(6, "Enter the UTR / reference number from your UPI app (min 6 characters)"),
});
type UtrValues = z.infer<typeof utrSchema>;

interface QrSession {
  qrCode: string;
  upiString: string;
  transactionRef: string;
  expiresAt: string;
  amount: number;
  merchantName: string;
  upiId: string;
  usingPlaceholder: boolean;
}

interface PaidReceipt {
  donation_id: string;
  amount: number;
  utr: string;
  at: string;
}

function useCountdown(expiresAt: string | null): number {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return secondsLeft;
}

export default function GuestQRDonatePage() {
  const [session, setSession] = useState<QrSession | null>(null);
  const [receipt, setReceipt] = useState<PaidReceipt | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const secondsLeft = useCountdown(session?.expiresAt ?? null);
  const isExpired = session != null && !receipt && secondsLeft <= 0;

  const amountForm = useForm<AmountValues>({
    resolver: zodResolver(amountSchema),
    defaultValues: { amount: 100 },
  });
  const utrForm = useForm<UtrValues>({
    resolver: zodResolver(utrSchema),
    defaultValues: { refNumber: "" },
  });

  const watchAmount = amountForm.watch("amount");
  const presetAmounts = [50, 100, 250, 500];

  const onGenerate = async (values: AmountValues) => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const s = await ApiClient.generateUpiQr(values.amount);
      setSession(s);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Could not generate the payment QR.");
    } finally {
      setIsGenerating(false);
    }
  };

  const onConfirm = async (values: UtrValues) => {
    if (!session) return;
    setIsConfirming(true);
    setErrorMsg(null);
    try {
      const res = await ApiClient.confirmUpiQr(session.transactionRef, values.refNumber.trim());
      setReceipt({
        donation_id: res.donation_id,
        amount: res.amount,
        utr: values.refNumber.trim(),
        at: new Date().toISOString(),
      });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Could not verify the payment reference.");
    } finally {
      setIsConfirming(false);
    }
  };

  const resetAll = useCallback(() => {
    setSession(null);
    setReceipt(null);
    setErrorMsg(null);
    utrForm.reset({ refNumber: "" });
    amountForm.reset({ amount: 100 });
  }, [amountForm, utrForm]);

  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(
    secondsLeft % 60
  ).padStart(2, "0")}`;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Public Header */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/donate" className="flex items-center gap-1.5">
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-2xl font-black tracking-wider text-transparent dark:from-emerald-400 dark:to-teal-300">
              pApAmA
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              UPI QR Checkout
            </span>
          </Link>
          <Link
            href="/donate"
            className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; Back to Web donation
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center">
        {receipt ? (
          /* Confirmation Screen */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-8 w-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-zinc-50">Payment Confirmed!</h1>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Thank you! Your UPI donation has been recorded against your reference number.
            </p>

            <div className="mt-6 text-left rounded-2xl border border-zinc-150/60 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="border-b border-dashed border-zinc-200 px-6 py-4 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">UPI Receipt</span>
                <span className="font-mono text-[9px] text-zinc-400 font-bold uppercase">{receipt.donation_id.substring(0, 8)}...</span>
              </div>
              <div className="p-5 space-y-3.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Amount Donated:</span>
                  <span className="text-zinc-900 dark:text-zinc-50 font-bold">&#8377;{receipt.amount}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400 shrink-0">UTR Reference:</span>
                  <span className="font-mono text-[10px] text-zinc-800 dark:text-zinc-200 break-all text-right">{receipt.utr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Status:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 uppercase text-[10px] font-black">PAID</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Processed At:</span>
                  <span className="font-normal text-[10px] text-zinc-400">{new Date(receipt.at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={resetAll}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 cursor-pointer"
              >
                Make Another Donation
              </button>
              <Link href="/donor/dashboard" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline py-1">
                Create a Portal Account to track balance &rarr;
              </Link>
            </div>
          </div>
        ) : !session ? (
          /* Step 1 — amount entry */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900">
            <div className="text-center">
              <h1 className="text-xl font-black text-zinc-900 dark:text-zinc-50">Pay by UPI QR</h1>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Choose an amount — we&apos;ll generate a UPI QR you can scan with any app.
              </p>
            </div>

            {errorMsg && (
              <div className="mt-6 rounded-xl bg-red-500/10 p-3.5 text-xs text-red-800 dark:text-red-400">{errorMsg}</div>
            )}

            <form onSubmit={amountForm.handleSubmit(onGenerate)} className="mt-6 space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Donation Amount (&#8377;)
                </label>
                <input
                  type="number"
                  placeholder="Enter amount"
                  className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  {...amountForm.register("amount", { valueAsNumber: true })}
                />
                {amountForm.formState.errors.amount && (
                  <p className="text-xs text-rose-500 mt-1">{amountForm.formState.errors.amount.message}</p>
                )}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {presetAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => amountForm.setValue("amount", amt, { shouldValidate: true })}
                      className={`rounded-lg py-2 text-xs font-bold border transition cursor-pointer ${
                        watchAmount === amt
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      }`}
                    >
                      &#8377;{amt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating || watchAmount <= 0}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-1">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Generating QR...
                  </span>
                ) : (
                  "Generate UPI QR"
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Step 2 — scan + confirm */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900">
            <div className="text-center">
              <h1 className="text-xl font-black text-zinc-900 dark:text-zinc-50">Scan &amp; Pay &#8377;{session.amount}</h1>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Scan with GPay, PhonePe, Paytm or BHIM, then enter your UTR below.
              </p>
            </div>

            <div className="mt-5 flex flex-col items-center justify-center">
              <div className={`bg-white p-2.5 rounded-2xl border border-zinc-150 shadow-inner ${isExpired ? "opacity-30" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={session.qrCode} alt="UPI donation QR" className="h-44 w-44" />
              </div>
              <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                {session.upiId}
              </p>
              <div className="mt-1 text-[10px] font-bold">
                {isExpired ? (
                  <span className="text-rose-500 uppercase">QR expired</span>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Expires in <span className="font-mono text-emerald-600 dark:text-emerald-400">{mmss}</span>
                  </span>
                )}
              </div>
              {session.usingPlaceholder && (
                <p className="mt-2 max-w-xs text-center text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                  Demo VPA — a real merchant VPA must be configured (NEXT_PUBLIC_UPI_VPA) before going live.
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="mt-5 rounded-xl bg-red-500/10 p-3.5 text-xs text-red-800 dark:text-red-400">{errorMsg}</div>
            )}

            {isExpired ? (
              <button
                onClick={resetAll}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 cursor-pointer"
              >
                Start a new payment
              </button>
            ) : (
              <form onSubmit={utrForm.handleSubmit(onConfirm)} className="mt-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    UTR / Transaction Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 614089025112"
                    className="h-10 w-full rounded-xl border border-zinc-200 px-3 font-mono text-xs text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    {...utrForm.register("refNumber")}
                  />
                  {utrForm.formState.errors.refNumber && (
                    <p className="text-xs text-rose-500 mt-1">{utrForm.formState.errors.refNumber.message}</p>
                  )}
                  <p className="text-[10px] text-zinc-400 leading-normal pt-1">
                    The UTR is the 12-digit reference shown on your UPI app&apos;s success screen.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isConfirming}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isConfirming ? (
                    <span className="flex items-center justify-center gap-1">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Confirming...
                    </span>
                  ) : (
                    "I've paid — confirm donation"
                  )}
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Cancel / change amount
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
