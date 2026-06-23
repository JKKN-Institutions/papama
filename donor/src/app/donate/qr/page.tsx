"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiClient } from "@/src/services/apiClient";
import { DonationResponse } from "@/src/types/contract";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const qrDonateSchema = z.object({
  amount: z
    .number()
    .int("Amount must be a whole number")
    .min(1, "Scanned amount must be greater than ₹0"),
  refNumber: z
    .string()
    .trim()
    .min(6, "Please enter a valid transaction reference / UTR number (min 6 characters)"),
});

type QrDonateFormValues = z.infer<typeof qrDonateSchema>;

export default function GuestQRDonatePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Success Receipt State
  const [receipt, setReceipt] = useState<DonationResponse | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<QrDonateFormValues>({
    resolver: zodResolver(qrDonateSchema),
    defaultValues: {
      amount: 100,
      refNumber: "",
    },
  });

  const watchAmount = watch("amount");
  const watchRefNumber = watch("refNumber");

  const onSubmit = async (values: QrDonateFormValues) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      // Pass null as donor_id for anonymous guest donation
      const res = await ApiClient.createDonation(values.amount, "qr", null);
      if (res.status === "success") {
        setReceipt(res);
      } else {
        setErrorMsg(`Verification failed: ${res.status}`);
      }
    } catch (error) {
      console.error("QR verification error:", error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to verify payment reference.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Public Header */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Link href="/donate" className="flex items-center gap-1.5">
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-2xl font-black tracking-wider text-transparent dark:from-emerald-400 dark:to-teal-300">
                pApAmA
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                QR Checkout
              </span>
            </Link>
          </div>
          <Link
            href="/donate"
            className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Back to Web donation
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6 lg:px-8 flex flex-col justify-center">
        {receipt ? (
          /* Confirmation Screen */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900 text-center animate-fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
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

            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-zinc-50">
              Payment Verified!
            </h1>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Thank you! Your QR scan payment has been registered.
            </p>

            {/* Receipt details */}
            <div className="mt-6 text-left rounded-2xl border border-zinc-150/60 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="border-b border-dashed border-zinc-200 px-6 py-4 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">QR Scan Receipt</span>
                <span className="font-mono text-[9px] text-zinc-400 font-bold uppercase">{receipt.donation_id.substring(0, 8)}...</span>
              </div>
              <div className="p-5 space-y-3.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Amount Verified:</span>
                  <span className="text-zinc-900 dark:text-zinc-50 font-bold">₹{receipt.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Reference Input:</span>
                  <span className="font-mono text-[10px] text-zinc-800 dark:text-zinc-200">{watchRefNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Verify Status:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 uppercase text-[10px] font-black">SUCCESS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Processed At:</span>
                  <span className="font-normal text-[10px] text-zinc-400">{new Date(receipt.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => {
                  setReceipt(null);
                  reset({ amount: 100, refNumber: "" });
                }}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 cursor-pointer"
              >
                Scan Another QR
              </button>
              <Link
                href="/donor/dashboard"
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline py-1"
              >
                Create a Portal Account to track balance →
              </Link>
            </div>
          </div>
        ) : (
          /* Checkout scan form */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900">
            <div className="text-center">
              <h1 className="text-xl font-black text-zinc-900 dark:text-zinc-50">
                Scan static QR Code
              </h1>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                Scan the UPI QR below with BHIM, GPay, or Paytm, then input details to register.
              </p>
            </div>

            {/* Static UPI QR Display */}
            <div className="mt-6 flex flex-col items-center justify-center">
              <div className="bg-white p-2.5 rounded-2xl border border-zinc-150 shadow-inner">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=papama@okaxis%26pn=pApAmA%2520Community%2520Meals%26cu=INR"
                  alt="pApAmA static donation QR"
                  className="h-40 w-40"
                />
              </div>
              <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                pa: papama@okaxis
              </p>
            </div>

            {errorMsg && (
              <div className="mt-6 rounded-xl bg-red-500/10 p-3.5 text-xs text-red-800 dark:text-red-400">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
              {/* Amount input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Amount Scanned (₹)
                </label>
                <input
                  type="number"
                  placeholder="Enter scanned amount"
                  className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  {...register("amount", { valueAsNumber: true })}
                />
                {errors.amount && (
                  <p className="text-xs text-rose-500 mt-1">{errors.amount.message}</p>
                )}
              </div>

              {/* UPI Ref Number */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Transaction Ref / UTR Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 614089025112"
                  className="h-10 w-full rounded-xl border border-zinc-200 px-3 font-mono text-xs text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  {...register("refNumber")}
                />
                {errors.refNumber && (
                  <p className="text-xs text-rose-500 mt-1">{errors.refNumber.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || watchAmount <= 0 || !watchRefNumber.trim()}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-1">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Verifying Reference...
                  </span>
                ) : (
                  "Verify & Register Payment"
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
