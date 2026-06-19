"use client";

import { Campaign } from "@/src/types/donor";

interface CampaignCardProps {
  campaign: Campaign;
  onDonateClick: (campaign: Campaign) => void;
}

export default function CampaignCard({
  campaign,
  onDonateClick,
}: CampaignCardProps) {
  const percentage = Math.min(
    100,
    Math.round((campaign.raisedTokens / campaign.targetTokens) * 100)
  );

  const categoryColors = {
    School: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50",
    Orphanage: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/50",
    "Disaster Relief": "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50",
    "Community Kitchen": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50",
  };

  return (
    <div className="group overflow-hidden rounded-2xl border border-zinc-200/50 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:border-zinc-800/40 dark:bg-zinc-900/40">
      {/* Campaign Image */}
      <div className="relative h-48 w-full bg-zinc-100 dark:bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={campaign.imageUrl || "https://images.unsplash.com/photo-1541802645635-11f2286a7482?auto=format&fit=crop&w=800&q=80"}
          alt={campaign.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4 flex gap-2">
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold backdrop-blur-sm ${categoryColors[campaign.category]}`}>
            {campaign.category}
          </span>
          <span className="rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
            {campaign.location}
          </span>
        </div>
      </div>

      {/* Campaign Content */}
      <div className="p-5">
        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
          {campaign.organizationName}
        </span>
        <h3 className="mt-1 text-lg font-bold leading-snug text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          {campaign.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
          {campaign.description}
        </p>

        {/* Progress Section */}
        <div className="mt-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-600 dark:text-zinc-300">
              Raised {campaign.raisedTokens} / {campaign.targetTokens} Tokens
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {percentage}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Pricing & CTA */}
        <div className="mt-5 flex items-center justify-between border-t border-zinc-100/50 pt-4 dark:border-zinc-800/30">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              Price per token
            </span>
            <p className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
              ₹{campaign.tokenPriceInINR}{" "}
              <span className="text-xs font-normal text-zinc-400">/ meal</span>
            </p>
          </div>

          <button
            onClick={() => onDonateClick(campaign)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-sm shadow-emerald-600/10 active:scale-95"
          >
            Donate Tokens
          </button>
        </div>
      </div>
    </div>
  );
}
