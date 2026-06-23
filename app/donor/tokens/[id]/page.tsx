"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { TokenItem } from "@/lib/donor/types/contract";

function useCountdown(expiresAt: string | undefined, isActive: boolean) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isClose, setIsClose] = useState(false);

  useEffect(() => {
    if (!expiresAt || !isActive) {
      setTimeLeft(null);
      setIsClose(false);
      return;
    }

    function updateCountdown() {
      const difference = +new Date(expiresAt!) - +new Date();
      if (difference <= 0) {
        setTimeLeft("Expired");
        setIsClose(true);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);

      // Warning when within 7 days
      if (days < 7) {
        setIsClose(true);
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else {
        setIsClose(false);
        setTimeLeft(null);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiresAt, isActive]);

  return { timeLeft, isClose };
}

export default function TokenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [token, setToken] = useState<TokenItem | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadToken() {
    try {
      const res = await ApiClient.getTokens();
      const match = res.tokens.find((t) => t.token_id === id);
      if (match) {
        setToken(match);
      }
    } catch (error) {
      console.error("Error loading token details:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadToken();

    window.addEventListener("papama_data_update", loadToken);
    return () => {
      window.removeEventListener("papama_data_update", loadToken);
    };
  }, [id]);

  // `live` is the donor-usable (pre-redemption) status in the authoritative enum.
  const isLive = token?.status === "live";
  const { timeLeft, isClose } = useCountdown(token?.expires_at, isLive);

  const statusColors: Record<string, string> = {
    // Authoritative token_status enum (token-flow.md)
    generated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50",
    live: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50",
    in_admin_pool: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50",
    assigned_to_volunteer: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/50",
    distributed: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-900/50",
    redeemed: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800/60",
    expired: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50",
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/donor/tokens"
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back to Token Ledger
          </Link>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : token ? (
          <div className="space-y-8">
            {/* Header Details Card */}
            <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40 md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                    Food Token Certificate
                  </span>
                  <h1 className="text-2xl font-black tracking-wider text-zinc-900 dark:text-zinc-50 font-mono mt-1">
                    {token.token_id.substring(0, 18).toUpperCase()}...
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Type: <span className="uppercase text-emerald-600 dark:text-emerald-400">{token.type.replace("_", " ")}</span>
                  </p>
                </div>
                <div className="self-start sm:self-center flex flex-wrap items-center gap-2">
                  {token.type === "special_care" && (
                    <span className="inline-flex rounded-full bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50 px-3 py-1 text-xs font-bold border">
                      SPECIAL CARE
                    </span>
                  )}
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusColors[token.status]}`}>
                    {token.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Expiry Warning Banner (Active Timer) */}
            {isClose && timeLeft && (
              <div className="rounded-2xl border border-amber-200 bg-amber-500/5 p-6 shadow-sm dark:border-amber-800/30 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 animate-pulse">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Voucher Expiring Soon!
                </h3>
                <p className="mt-2 text-xs font-medium">
                  This active food voucher will expire in <strong className="font-bold">{timeLeft}</strong>. Please ensure it is assigned and claimed soon.
                </p>
              </div>
            )}

            {/* Special Care Instructions Banner */}
            {token.type === "special_care" && token.special_instructions && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/35 p-6 shadow-sm dark:border-rose-800/30 dark:bg-rose-950/10">
                <h3 className="text-sm font-bold text-rose-800 dark:text-rose-400 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-5 w-5 text-rose-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  Special Care Instructions
                </h3>
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-300 font-medium">
                  {token.special_instructions}
                </p>
              </div>
            )}

            {/* Token Lifecycle Timeline & Cert */}
            <div className="grid gap-8 md:grid-cols-3">
              {/* Timeline Journey */}
              <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40 md:col-span-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  Token Lifecycle Path
                </h2>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Audit logs representing the lifecycle of this food token.
                </p>

                {/* Timeline Steps */}
                <div className="mt-8 space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
                  
                  {/* Step 1: Minted */}
                  <div className="relative pl-10 flex items-start gap-4">
                    <div className="absolute left-1.5 h-6 w-6 rounded-full border-2 border-emerald-500 bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center -translate-x-1/2">
                      <div className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        Token Generated
                      </h4>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Voucher created from credit conversion. Cryptographic token and value verified.
                      </p>
                      <span className="mt-2 inline-block font-mono text-[10px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded dark:bg-zinc-800">
                        Issued At: {new Date(token.issued_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Current Status / Redeemed */}
                  <div className="relative pl-10 flex items-start gap-4">
                    <div className={`absolute left-1.5 h-6 w-6 rounded-full border-2 flex items-center justify-center -translate-x-1/2 ${
                      token.status === "redeemed"
                        ? "border-emerald-500 bg-emerald-100 dark:bg-emerald-950"
                        : token.status === "expired"
                        ? "border-red-500 bg-red-100 dark:bg-red-950"
                        : "border-blue-400 bg-blue-50 dark:bg-blue-950"
                    }`}>
                      <div className={`h-2 w-2 rounded-full ${
                        token.status === "redeemed"
                          ? "bg-emerald-600"
                          : token.status === "expired"
                          ? "bg-red-600"
                          : "bg-blue-500"
                      }`} />
                    </div>
                    <div>
                      {token.status === "redeemed" && (
                        <>
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Token Redeemed
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Voucher scanned and redeemed for meal:{" "}
                            <strong className="font-semibold text-zinc-700 dark:text-zinc-200">
                              {token.meal_info || "Lunch — Wholesome Meal"}
                            </strong>.
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Vendor: <strong className="font-bold text-zinc-700 dark:text-zinc-200">{token.vendor_name}</strong> ({token.location})
                          </p>
                          {token.beneficiary_category && (
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              Beneficiary Category: <span className="uppercase text-[10px] font-bold text-amber-600">{token.beneficiary_category.replace("_", " ")}</span>
                            </p>
                          )}
                          <span className="mt-2 inline-block font-mono text-[10px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded dark:bg-zinc-800">
                            Redeemed At: {new Date(token.redeemed_at || "").toLocaleString()}
                          </span>
                        </>
                      )}

                      {token.status === "expired" && (
                        <>
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Token Expired
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            This token expired unused.
                          </p>
                          <span className="mt-2 inline-block font-mono text-[10px] text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded dark:bg-zinc-800">
                            Expired At: {new Date(token.expires_at).toLocaleString()}
                          </span>
                        </>
                      )}

                      {isLive && (
                        <>
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Live / Awaiting Scan
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Voucher is live and ready to be presented at any participating Anna Canteen or kitchen counter.
                          </p>
                          {token.expires_at && (
                            <span className="mt-2 inline-block font-mono text-[10px] text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded dark:bg-blue-950/20 dark:text-blue-400 font-bold">
                              Expires On: {new Date(token.expires_at).toLocaleDateString()}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Verification & Actions Column */}
              <div className="space-y-6 md:col-span-1">
                {/* QR Code Card — real QR of the token's qr_payload */}
                {isLive && (
                  <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40 text-center flex flex-col items-center">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 mb-4">
                      Voucher QR Code
                    </h3>
                    <div className="p-4 bg-white rounded-2xl border border-zinc-150 shadow-inner flex items-center justify-center">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(token.qr_payload)}`}
                        alt="Voucher QR code"
                        width={140}
                        height={140}
                        className="h-[140px] w-[140px]"
                      />
                    </div>
                    <div className="mt-3 font-mono text-[9px] text-zinc-400 break-all select-all">
                      {token.qr_payload}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                      Counter staff will scan this code to issue 1 meal (worth ₹{token.value}).
                    </p>
                  </div>
                )}

                {/* Verification box — real serial / QR payload */}
                <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                    Verification
                  </h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Token verification details.
                  </p>

                  <div className="mt-6 space-y-4 text-xs">
                    {token.serial_number && (
                      <div>
                        <span className="font-semibold text-zinc-400 dark:text-zinc-500">
                          Serial Number
                        </span>
                        <p className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 break-all bg-zinc-50 dark:bg-zinc-800 p-2.5 rounded mt-1 select-all">
                          {token.serial_number}
                        </p>
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-zinc-400 dark:text-zinc-500">
                        Voucher Token ID
                      </span>
                      <p className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 break-all bg-zinc-50 dark:bg-zinc-800 p-2.5 rounded mt-1 select-all">
                        {token.token_id}
                      </p>
                    </div>

                    <div>
                      <span className="font-semibold text-zinc-400 dark:text-zinc-500">
                        QR Payload
                      </span>
                      <p className="font-mono text-[10px] text-zinc-700 dark:text-zinc-300 break-all bg-zinc-50 dark:bg-zinc-800 p-2.5 rounded mt-1 select-all">
                        {token.qr_payload}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              Token Not Found
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              The requested token ID does not exist in your ledger.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
