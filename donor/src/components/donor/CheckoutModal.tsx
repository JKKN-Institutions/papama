"use client";

import { Campaign } from "@/src/types/donor";
import { useState } from "react";
import Link from "next/link";
import { CreditService } from "@/src/services/creditService";

interface CheckoutModalProps {
  campaign: Campaign | null;
  isOpen: boolean;
  onClose: () => void;
  creditsBalance: number;
  onDonationSuccess: (tokenAmount: number, cost: number) => void;
}

export default function CheckoutModal({
  campaign,
  isOpen,
  onClose,
  creditsBalance,
  onDonationSuccess,
}: CheckoutModalProps) {
  const [tokenCount, setTokenCount] = useState<number>(10);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [isSpecialCare, setIsSpecialCare] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!isOpen || !campaign) return null;

  const tokenPrice = 50; // Standard token value is ₹50
  const totalCost = tokenCount * tokenPrice;
  const isInsufficientCredits = totalCost > creditsBalance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInsufficientCredits || tokenCount <= 0 || !campaign) return;

    setIsProcessing(true);
    setErrorText(null);
    try {
      const res = await CreditService.convertCreditToToken(
        campaign.id,
        tokenCount,
        isSpecialCare,
        specialInstructions
      );
      if (res.success && res.txHash) {
        setTxHash(res.txHash);
        setIsSuccess(true);
      } else {
        setErrorText(res.error || "Failed to convert credits into tokens.");
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setTokenCount(10);
    setIsProcessing(false);
    setIsSuccess(false);
    setTxHash("");
    setIsSpecialCare(false);
    setSpecialInstructions("");
    setErrorText(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSuccessClose = () => {
    onDonationSuccess(tokenCount, totalCost);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/50 bg-white shadow-2xl dark:border-zinc-800/40 dark:bg-zinc-900 transition-all">
        {/* Success State */}
        {isSuccess ? (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                className="h-8 w-8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Donation Successful!
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              You donated <strong>{tokenCount} tokens</strong> (₹{totalCost} Credits)
              to {campaign.title}.
            </p>

            <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-left dark:bg-zinc-800/40">
              <div className="flex justify-between text-xs font-semibold text-zinc-500">
                <span>Receipt / Tx Hash:</span>
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all select-all">
                {txHash}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleSuccessClose}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 active:scale-95"
              >
                Done
              </button>
              <Link
                href="/donor/tokens"
                onClick={handleSuccessClose}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline py-1.5"
              >
                Track these tokens in ledger
              </Link>
            </div>
          </div>
        ) : (
          /* Input / Checkout State */
          <form onSubmit={handleSubmit} className="p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100/50 dark:border-zinc-800/30">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Allocate Tokens
              </h3>
              <button
                type="button"
                onClick={handleClose}
                disabled={isProcessing}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-350"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-bold text-zinc-850 dark:text-zinc-100">
                {campaign.title}
              </h4>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Organized by {campaign.organizationName}
              </p>
            </div>

            {/* Token Input */}
            <div className="mt-6 space-y-2">
              <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                Number of Food Tokens to Donate:
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTokenCount(Math.max(1, tokenCount - 5))}
                  disabled={isProcessing}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 text-lg font-bold"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={tokenCount}
                  onChange={(e) =>
                    setTokenCount(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  disabled={isProcessing}
                  className="h-11 flex-1 rounded-xl border border-zinc-200 text-center font-bold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-850 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => setTokenCount(tokenCount + 5)}
                  disabled={isProcessing}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 text-lg font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Special Care Token Inputs */}
            <div className="mt-4 space-y-3 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="specialCareCheckbox"
                  checked={isSpecialCare}
                  onChange={(e) => setIsSpecialCare(e.target.checked)}
                  disabled={isProcessing}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="specialCareCheckbox" className="text-xs font-bold text-zinc-700 dark:text-zinc-350 cursor-pointer">
                  Generate Special Care Tokens
                </label>
              </div>
              {isSpecialCare && (
                <div className="animate-fade-in space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">
                    Special Instructions / Diet Requirements:
                  </label>
                  <textarea
                    rows={2}
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    disabled={isProcessing}
                    placeholder="e.g. Nut allergy, high protein, extra fruit"
                    className="w-full rounded-lg border border-zinc-200 p-2 text-xs text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-850 dark:text-zinc-100"
                  />
                </div>
              )}
            </div>

            {/* Error Display */}
            {errorText && (
              <div className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-400">
                {errorText}
              </div>
            )}

            {/* Calculations and Balance */}
            <div className="mt-6 space-y-3 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/40">
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Credits per token:</span>
                <span className="font-semibold">₹{tokenPrice}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Total Credits required:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  ₹{totalCost}
                </span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200/50 pt-2.5 dark:border-zinc-700/50">
                <span>Your Credit Balance:</span>
                <span
                  className={`font-bold ${
                    isInsufficientCredits
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  ₹{creditsBalance}
                </span>
              </div>

              {/* Social Impact statement */}
              <div className="mt-2 flex gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>
                  <strong>Social Impact:</strong> Allocating {tokenCount} tokens will provide {tokenCount} meals to children or individuals supported by this drive.
                </span>
              </div>
            </div>

            {/* Warning / Error */}
            {isInsufficientCredits && (
              <div className="mt-4 flex gap-2 rounded-xl bg-red-500/10 p-3.5 text-xs text-red-800 dark:text-red-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  className="h-5 w-5 shrink-0 text-red-650 dark:text-red-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <span>Insufficient Credits. You need ₹{totalCost - creditsBalance} more.</span>
                  <Link
                    href="/donor/credits"
                    onClick={handleClose}
                    className="block font-bold text-red-700 dark:text-red-300 underline mt-0.5 hover:text-red-850"
                  >
                    Purchase Credits now
                  </Link>
                </div>
              </div>
            )}

            {/* Submit button */}
            <div className="mt-6 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isProcessing}
                className="w-1/3 rounded-xl border border-zinc-200 py-3 text-sm font-semibold hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing || isInsufficientCredits || tokenCount <= 0}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 shadow-lg shadow-emerald-600/10 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </span>
                ) : (
                  "Confirm & Allocate"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
