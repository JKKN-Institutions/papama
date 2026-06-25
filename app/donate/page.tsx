"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { DonationResponse } from "@/lib/donor/types/contract";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const PAYMENT_METHODS = [
  // "Scan & Pay (UPI QR)" hands off to the REAL UPI manual-QR flow (/donate/qr);
  // the others are the instant guest-donation seam (card/netbanking provider is
  // an open item — recorded as a flagged mock until a gateway is procured).
  { id: "qr", name: "Scan & Pay (UPI QR)", icon: "📷" },
  { id: "upi", name: "UPI (GPay / PhonePe)", icon: "⚡" },
  { id: "card", name: "Credit / Debit Card", icon: "💳" },
  { id: "netbanking", name: "Net Banking", icon: "🏦" },
  { id: "bank_transfer", name: "Bank Transfer", icon: "📄" },
] as const;

const guestDonateSchema = z.object({
  amount: z
    .number()
    .int("Amount must be a whole number")
    .min(1, "Donation amount must be greater than ₹0"),
  payment_method: z.enum(["upi", "qr", "card", "netbanking", "bank_transfer"]),
});

type GuestDonateFormValues = z.infer<typeof guestDonateSchema>;

export default function GuestDonatePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Success Receipt State
  const [receipt, setReceipt] = useState<DonationResponse | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<GuestDonateFormValues>({
    resolver: zodResolver(guestDonateSchema),
    defaultValues: {
      amount: 100,
      payment_method: "upi",
    },
  });

  const selectedAmount = watch("amount");
  const selectedPaymentMethod = watch("payment_method");

  const onSubmit = async (values: GuestDonateFormValues) => {
    // "Scan & Pay (UPI QR)" is the REAL UPI manual-QR flow: hand off to
    // /donate/qr instead of the instant mock guest donation that fake-succeeds.
    if (values.payment_method === "qr") {
      router.push(`/donate/qr?amount=${values.amount}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      // Ungated guest donation (no session): records a donor-less donation.
      const res = await ApiClient.createGuestDonation(values.amount, values.payment_method);
      if (res.status === "success") {
        setReceipt(res);
      } else {
        setErrorMsg(`Transaction failed: ${res.status}`);
      }
    } catch (error) {
      console.error("Guest donation error:", error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to verify transaction. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const presetAmounts = [50, 100, 250, 500];

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
              <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 sm:inline-block">
                Guest Donation
              </span>
            </Link>
          </div>
          <Link
            href="/donor/dashboard"
            className="shrink-0 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span className="sm:hidden">Dashboard →</span>
            <span className="hidden sm:inline">Access Dashboard Account →</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-6 lg:px-8 flex flex-col justify-center">
        {receipt ? (
          /* Confirmation Screen */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900 md:p-10 text-center animate-fade-in">
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

            <h1 className="mt-4 text-2xl font-black text-zinc-900 dark:text-zinc-50">
              Thank You for Your Donation!
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Your contribution was successfully processed. Funds will be directly converted into standard meal vouchers for community canteen lines.
            </p>

            {/* Receipt details */}
            <div className="mt-8 text-left rounded-2xl border border-zinc-150/60 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="border-b border-dashed border-zinc-200 px-6 py-4 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Guest Receipt</span>
                <span className="font-mono text-[10px] text-zinc-400 font-bold uppercase">{receipt.donation_id.substring(0, 8)}...</span>
              </div>
              <div className="p-6 space-y-4 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Donation Amount:</span>
                  <span className="text-zinc-900 dark:text-zinc-50 text-sm font-bold">₹{receipt.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Payment Method:</span>
                  <span className="text-zinc-950 dark:text-zinc-50 uppercase">{receipt.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Verification Hash:</span>
                  <span className="font-mono text-[10px] uppercase text-zinc-500">{receipt.donation_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Processed At:</span>
                  <span className="font-normal text-[10px] text-zinc-400">{new Date(receipt.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => setReceipt(null)}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 cursor-pointer"
              >
                Donate Again
              </button>
              <Link
                href="/donor/dashboard"
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline py-1"
              >
                Create a Donor Portal Account to track impact →
              </Link>
            </div>
          </div>
        ) : (
          /* Checkout form */
          <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-xl dark:border-zinc-800/40 dark:bg-zinc-900 md:p-10">
            <div className="text-center">
              <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">
                Quick Web Donation
              </h1>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Fill details below to quickly fund hot lunch boxes without signing in.
              </p>
            </div>

            {errorMsg && (
              <div className="mt-6 rounded-xl bg-red-500/10 p-3.5 text-xs text-red-800 dark:text-red-400">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
              {/* Amount input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Select Amount (INR ₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center text-lg font-bold text-zinc-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    placeholder="Enter custom amount"
                    className="h-12 w-full rounded-xl border border-zinc-200 pl-10 pr-4 text-sm font-bold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    {...register("amount", { valueAsNumber: true })}
                  />
                </div>
                {errors.amount && (
                  <p className="text-xs text-rose-500 mt-1">{errors.amount.message}</p>
                )}

                {/* Presets */}
                <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                  {presetAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setValue("amount", amt, { shouldValidate: true })}
                      className={`rounded-lg py-2 text-xs font-bold border transition cursor-pointer ${
                        selectedAmount === amt
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Methods */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Select Payment Method
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {PAYMENT_METHODS.map((method) => {
                    const isSelected = selectedPaymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setValue("payment_method", method.id, { shouldValidate: true })}
                        className={`flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition cursor-pointer ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-500/5 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/10 dark:text-emerald-300"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span className="text-xl">{method.icon}</span>
                        <div>
                          <p className="text-[11px] font-bold">{method.name}</p>
                          <p className="text-[9px] text-zinc-400 font-medium leading-none mt-0.5">Secure Gateway</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.payment_method && (
                  <p className="text-xs text-rose-500 mt-1">{errors.payment_method.message}</p>
                )}
              </div>

              {/* Guest flow notes */}
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-normal bg-zinc-50 dark:bg-zinc-900/35 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800/40">
                💡 <strong>Important Note:</strong> Because this is a guest checkout, you will not receive an account dashboard. To manage credits and track voucher scans in real-time, please sign in or register above.
              </p>

              <button
                type="submit"
                disabled={isSubmitting || selectedAmount <= 0}
                className="w-full rounded-xl bg-emerald-600 py-3.5 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing Payment...
                  </span>
                ) : (
                  `Contribute ₹${selectedAmount} anonymously`
                )}
              </button>

              {/* QR flow link */}
              <div className="text-center pt-2">
                <Link
                  href="/donate/qr"
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Prefer to scan a static QR code? Click here
                </Link>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
