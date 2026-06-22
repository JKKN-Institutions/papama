"use client";

import Link from "next/link";
import { DashboardResponse, TokenItem } from "@/src/types/contract";

interface DashboardOverviewProps {
  dashboard: DashboardResponse;
  tokens: TokenItem[];
}

export default function DashboardOverview({
  dashboard,
  tokens,
}: DashboardOverviewProps) {
  const totalTokens = tokens.length;
  const activeTokens = tokens.filter((t) => t.status === "active").length;
  const redeemedTokens = tokens.filter((t) => t.status === "redeemed").length;
  const expiredTokens = tokens.filter((t) => t.status === "expired").length;
  const invalidatedTokens = tokens.filter((t) => t.status === "invalidated").length;

  const redemptionRate =
    totalTokens > 0 ? Math.round((redeemedTokens / totalTokens) * 100) : 0;

  const stats = [
    {
      name: "Total Donated Amount",
      value: `₹${dashboard.total_donations}`,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
          className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5M4.5 9h15M5.25 13.5h13.5m-11.25 5.25h9"
          />
        </svg>
      ),
      color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      description: `${dashboard.total_tokens} lifetime tokens minted`,
    },
    {
      name: "Meals Sponsored",
      value: dashboard.meals_sponsored,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
          className="h-5 w-5 text-amber-600 dark:text-amber-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253"
          />
        </svg>
      ),
      color: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      description: "Direct beneficiary meals funded",
    },
    {
      name: "Token Redemption Rate",
      value: `${redemptionRate}%`,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
          className="h-5 w-5 text-blue-600 dark:text-blue-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v5.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 013 18.375v-5.25zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125v-9.75zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v14.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
      ),
      color: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
      description: `${redeemedTokens} of ${totalTokens} tokens redeemed`,
    },
    {
      name: "Available Credits",
      value: `₹${dashboard.total_credit}`,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
          className="h-5 w-5 text-teal-600 dark:text-teal-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
          />
        </svg>
      ),
      color: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
      description: "Non-withdrawable credits balance",
    },
  ];

  const statuses = [
    {
      name: "Active / Unused",
      count: activeTokens,
      color: "bg-blue-500",
      textColor: "text-blue-600 dark:text-blue-400",
      description: "Generated, ready to be redeemed",
    },
    {
      name: "Redeemed",
      count: redeemedTokens,
      color: "bg-emerald-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      description: "Successfully claimed at partner canteens",
    },
    {
      name: "Expired",
      count: expiredTokens,
      color: "bg-amber-500",
      textColor: "text-amber-600 dark:text-amber-400",
      description: "Expired before canteen scanning",
    },
    {
      name: "Invalidated / Cancelled",
      count: invalidatedTokens,
      color: "bg-red-500",
      textColor: "text-red-500 dark:text-red-400",
      description: "Voided due to transaction adjustments",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-800 to-teal-700 p-6 text-white shadow-xl dark:from-emerald-950 dark:to-teal-900 md:p-8">
        <h1 className="text-2xl font-bold md:text-3xl">
          Welcome back!
        </h1>
        <p className="mt-2 max-w-xl text-emerald-100/80 text-sm md:text-base font-medium leading-relaxed">
          Your donations have sponsored <strong>{dashboard.meals_sponsored} meals</strong> directly to beneficiaries at locations like Anna Canteen and local primary schools.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/donor/donate"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 transition shadow hover:bg-emerald-50"
          >
            Donate Money
          </Link>
          <Link
            href="/donor/credit"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
          >
            Manage & Convert Credit
          </Link>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-450">
                {stat.name}
              </span>
              <div className={`rounded-xl p-2.5 ${stat.color}`}>{stat.icon}</div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                {stat.value}
              </span>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {stat.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts & Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Token Status Breakdown */}
        <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40 lg:col-span-1">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            Token Status Breakdown
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Current status of all generated food tokens.
          </p>

          <div className="mt-6 space-y-4">
            {statuses.map((status) => {
              const percentage =
                totalTokens > 0
                  ? Math.round((status.count / totalTokens) * 100)
                  : 0;
              return (
                <div key={status.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {status.name}
                    </span>
                    <span className={`font-bold ${status.textColor}`}>
                      {status.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${status.color}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {status.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Token Activity Feed */}
        <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Recent Generated Tokens
              </h2>
              <p className="text-zinc-400 text-xs mt-1">
                Crypto vouchers created and waiting for redemption.
              </p>
            </div>
            <Link
              href="/donor/tokens"
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              View Token Registry
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {tokens.length === 0 ? (
              <p className="text-center text-sm py-8 text-zinc-400">
                No active tokens found. Convert credits to tokens.
              </p>
            ) : (
              tokens.slice(0, 3).map((token) => (
                <div
                  key={token.token_id}
                  className="flex items-start justify-between rounded-xl border border-zinc-150/60 p-4 transition-colors hover:bg-zinc-50/50 dark:border-zinc-800/40 dark:hover:bg-zinc-900/20"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        token.status === "active"
                          ? "bg-blue-500"
                          : token.status === "redeemed"
                          ? "bg-emerald-500"
                          : token.status === "expired"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/donor/tokens/${token.token_id || ''}`}
                          className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-emerald-600"
                        >
                          {token.qr_payload
                            ? token.qr_payload.substring(0, 18)
                            : token.token_id
                            ? token.token_id.substring(0, 18)
                            : 'TOKEN'}...
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            token.status === "active"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                              : token.status === "redeemed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : token.status === "expired"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                          }`}
                        >
                          {token.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-zinc-900 dark:text-zinc-50">
                        {token.type ? token.type.replace("_", " ").toUpperCase() : "STANDARD"} TOKEN · Value ₹{token.value || 50}
                      </p>
                      {token.status === "redeemed" && token.vendor_name && (
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                          Meal ({token.meal_info || "Food"}) was served at <strong>{token.vendor_name}</strong> in {token.location || "Unknown location"}.
                        </p>
                      )}
                      {token.status === "redeemed" && !token.vendor_name && (
                        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                          Redeemed on {token.redeemed_at ? new Date(token.redeemed_at).toLocaleDateString() : "Unknown date"}
                        </p>
                      )}
                      {token.status === "active" && (
                        <p className="mt-1 text-[11px] text-zinc-400">
                          Issued on {token.issued_at ? new Date(token.issued_at).toLocaleDateString() : "Recently"} · Expires in 3 months
                        </p>
                      )}
                      {token.is_special_care && token.special_instructions && (
                        <p className="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/20 dark:bg-rose-950/5 p-1.5 rounded">
                          Instruction: {token.special_instructions}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-zinc-400 font-semibold">
                    {token.issued_at ? new Date(token.issued_at).toLocaleDateString() : "Unknown"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Donation History Section */}
      <div className="rounded-2xl border border-zinc-200/50 bg-white p-6 shadow-sm dark:border-zinc-800/40 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Recent Financial Donations
            </h2>
            <p className="text-zinc-400 text-xs mt-1">
              Audit trails of your financial contributions to your credit balance.
            </p>
          </div>
          <Link
            href="/donor/history"
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            View Full History
          </Link>
        </div>

        <div className="mt-6 overflow-x-auto">
          {dashboard.donation_history.length === 0 ? (
            <p className="text-center text-sm py-8 text-zinc-400">
              No donations recorded yet.
            </p>
          ) : (
            <table className="w-full text-left text-xs font-medium">
              <thead>
                <tr className="border-b border-zinc-150/60 text-[10px] font-bold uppercase text-zinc-400 dark:border-zinc-800/30">
                  <th className="pb-3 pr-4">Donation ID</th>
                  <th className="pb-3 px-4">Amount Donated</th>
                  <th className="pb-3 px-4">Allocated Status</th>
                  <th className="pb-3 pl-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100/50 dark:divide-zinc-800/20">
                {dashboard.donation_history.slice(0, 3).map((item) => (
                  <tr key={item.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="py-3 pr-4 font-mono font-bold text-zinc-500 uppercase">
                      {item.id.substring(0, 8)}...
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{item.amount}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                        SUCCESS
                      </span>
                    </td>
                    <td className="py-3 pl-4 text-right text-zinc-400">
                      {new Date(item.at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
