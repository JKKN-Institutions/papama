"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";

function SuccessReceipt() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const id = searchParams.get("id") || "N/A";
  const amount = searchParams.get("amount") || "0";
  const method = searchParams.get("method") || "upi";
  const added = searchParams.get("added") || "0";
  const balance = searchParams.get("balance") || "0";
  const reached = searchParams.get("reached") === "true";
  const at = searchParams.get("at") || new Date().toISOString();

  return (
    <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900 md:p-10 text-center">
      {/* Animated Success Badge */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="3"
          stroke="currentColor"
          className="h-8 w-8"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="mt-4 text-2xl font-black text-zinc-900 dark:text-zinc-50">
        Payment Successful!
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Your donation has been verified. Credits were successfully added to your balance.
      </p>

      {/* Ticket Receipt */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-150/60 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-left">
        <div className="border-b border-dashed border-zinc-200 px-6 py-4 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Transaction Receipt</span>
          <span className="font-mono text-[10px] text-zinc-400 font-bold uppercase">{id.substring(0, 8)}...</span>
        </div>

        <div className="p-6 space-y-4 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          <div className="flex justify-between">
            <span className="text-zinc-400">Amount Paid:</span>
            <span className="text-zinc-900 dark:text-zinc-50 text-sm font-bold">₹{amount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Payment Method:</span>
            <span className="text-zinc-950 dark:text-zinc-50 uppercase">{method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Credit Added:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">+₹{added} Credits</span>
          </div>
          <div className="flex justify-between border-t border-zinc-100/80 pt-4 dark:border-zinc-800/80">
            <span className="text-zinc-400">New Credit Balance:</span>
            <span className="text-zinc-900 dark:text-zinc-50 font-black text-sm">₹{balance}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Timestamp:</span>
            <span className="font-normal text-[10px] text-zinc-400">{new Date(at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Threshold Alert Banner */}
      {reached && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/10 dark:text-emerald-400 text-left">
          <div className="flex gap-2.5">
            <span className="text-base">🚀</span>
            <div>
              <p className="text-xs font-bold">Credit Threshold Reached!</p>
              <p className="mt-0.5 text-[10px] leading-normal font-medium opacity-90">
                You have meeting threshold (₹50+). You can now generate food voucher tokens and support partner canteens.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row justify-center">
        {reached ? (
          <Link
            href="/donor/credit?convert=true"
            className="flex-1 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 text-center"
          >
            Convert Credits to Token
          </Link>
        ) : (
          <Link
            href="/donor/donate"
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition active:scale-95 text-center dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Donate More
          </Link>
        )}
        <Link
          href="/donor/dashboard"
          className="flex-1 rounded-xl bg-zinc-900 py-3 text-xs font-bold text-white transition hover:bg-zinc-700 active:scale-95 text-center dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 sm:px-6 lg:px-8 flex flex-col justify-center">
        <Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        }>
          <SuccessReceipt />
        </Suspense>
      </main>
    </div>
  );
}
