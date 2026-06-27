"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/donor/Navbar";
import { ApiClient } from "@/lib/donor/services/apiClient";
import { TokenItem } from "@/lib/donor/types/contract";
import Link from "next/link";

export default function TokensLedgerPage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");

  async function loadTokens() {
    try {
      const res = await ApiClient.getTokens();
      setTokens(res.tokens);
    } catch (error) {
      console.error("Error loading token ledger:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTokens();

    // Listen for custom background events
    window.addEventListener("papama_data_update", loadTokens);
    return () => {
      window.removeEventListener("papama_data_update", loadTokens);
    };
  }, []);

  const filteredTokens = useMemo(() => {
    let result = tokens;

    if (selectedStatus !== "All") {
      result = result.filter((t) => t.status === selectedStatus);
    }

    if (selectedType !== "All") {
      result = result.filter((t) => t.type === selectedType.toLowerCase());
    }

    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.token_id.toLowerCase().includes(query) ||
          t.qr_payload.toLowerCase().includes(query) ||
          (t.special_instructions && t.special_instructions.toLowerCase().includes(query))
      );
    }

    return result;
  }, [searchQuery, selectedStatus, selectedType, tokens]);

  // Filter labels map to the authoritative token_status enum values (all 7 states).
  const statuses: { label: string; value: string }[] = [
    { label: "All", value: "All" },
    { label: "Live", value: "live" },
    { label: "In Pool", value: "in_admin_pool" },
    { label: "With Volunteer", value: "assigned_to_volunteer" },
    { label: "Distributed", value: "distributed" },
    { label: "Redeemed", value: "redeemed" },
    { label: "Expired", value: "expired" },
  ];
  const types = ["All", "Standard", "Special_Care"];

  const statusBadges: Record<string, string> = {
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Token Ledger Registry
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
            View the complete cryptographic record of all food canteen voucher tokens you have generated.
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 pb-6 dark:border-zinc-800/30">
          {/* Search bar */}
          <div className="relative w-full sm:max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center text-zinc-400">
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by token ID or payload..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-4 text-xs font-semibold text-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Filters Wrapper */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((status) => {
                const isSelected = selectedStatus === status.value;
                return (
                  <button
                    key={status.value}
                    onClick={() => setSelectedStatus(status.value)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${
                      isSelected
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white border border-zinc-200/60 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {status.label}
                  </button>
                );
              })}
            </div>

            {/* Type Filter Select */}
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Type:</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="rounded-xl border border-zinc-200/60 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : filteredTokens.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-zinc-500 dark:text-zinc-300 font-medium">
                <thead className="bg-zinc-50/50 text-[10px] font-black uppercase text-zinc-400 border-b border-zinc-200/80 dark:bg-zinc-800/20 dark:border-zinc-800/50">
                  <tr>
                    <th scope="col" className="px-6 py-4">Token ID</th>
                    <th scope="col" className="px-6 py-4">Type</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4">Value</th>
                    <th scope="col" className="px-6 py-4">Issued At</th>
                    <th scope="col" className="px-6 py-4">Expiration / Redemption</th>
                    <th scope="col" className="px-6 py-4 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {filteredTokens.map((token) => (
                    <tr
                      key={token.token_id}
                      className="transition-colors hover:bg-zinc-50/30 dark:hover:bg-zinc-800/10"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-zinc-900 dark:text-zinc-50">
                        {token.token_id.substring(0, 18)}...
                      </td>
                      <td className="px-6 py-4 uppercase font-bold text-[10px]">
                        <span className={token.type === "special_care" ? "text-rose-600 dark:text-rose-400" : "text-zinc-600"}>
                          {token.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadges[token.status]}`}>
                          {token.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-zinc-800 dark:text-zinc-200">
                        ₹{token.value}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        {new Date(token.issued_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        {token.status === "redeemed" && token.redeemed_at ? (
                          <div>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Redeemed</span>
                            <p className="text-[10px] text-zinc-400 font-normal">
                              {new Date(token.redeemed_at).toLocaleDateString()}
                            </p>
                          </div>
                        ) : token.status === "expired" ? (
                          <span className="text-red-500 font-bold">Expired</span>
                        ) : (
                          <div>
                            <span className="font-semibold text-blue-600 dark:text-blue-400 capitalize">
                              {token.status.replace(/_/g, " ")}
                            </span>
                            {token.expires_at && (
                              <p className="text-[10px] text-zinc-400 font-normal">
                                Expires: {new Date(token.expires_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/donor/tokens/${token.token_id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 hover:underline"
                        >
                          {token.status === "live" ? "Show QR" : "Verify Journey"}
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
                              d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                            />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16">
              <span className="text-3xl">🎫</span>
              <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-50">
                No Tokens Registered
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Try selecting a different status/type or adjust the search query.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
