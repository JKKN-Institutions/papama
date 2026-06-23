import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/donor/dashboard — the signed-in donor's impact summary (credit,
 * donations, tokens, meals) plus monthly + history series for the donor home.
 *
 * Gated by `donor_donation_credit/read` (scope own). Read through the session
 * client so RLS (`*_select_own`) scopes every row to this donor — no donor id is
 * trusted from the client. Mirrors `lib/donor/services/dashboardService.ts`
 * (buildMonthlySummary + meals = redeemed-token count) but server-side. Redemption
 * detail (vendor/location/meal) lives in token_redemptions and is gated to
 * staff/vendor by RLS, so the donor view is time-only here (Phase-1 sparse).
 */

type DonationRow = { id: string; amount_inr: number; created_at: string };
type TokenRow = {
    id: string;
    status: string;
    value_inr: number | null;
    minted_at: string | null;
    redeemed_at: string | null;
};

interface MonthlySummaryItem {
    month: string; // "YYYY-MM"
    donated: number;
    meals: number;
}

function buildMonthlySummary(
    donations: DonationRow[],
    tokens: TokenRow[]
): MonthlySummaryItem[] {
    const monthlyMap = new Map<string, { donated: number; meals: number }>();

    donations.forEach((d) => {
        const month = (d.created_at || "").substring(0, 7); // YYYY-MM
        if (!month) return;
        const existing = monthlyMap.get(month) || { donated: 0, meals: 0 };
        existing.donated += d.amount_inr || 0;
        monthlyMap.set(month, existing);
    });

    tokens
        .filter((t) => t.status === "redeemed" && t.redeemed_at)
        .forEach((t) => {
            const month = (t.redeemed_at as string).substring(0, 7);
            const existing = monthlyMap.get(month) || { donated: 0, meals: 0 };
            existing.meals += 1;
            monthlyMap.set(month, existing);
        });

    return Array.from(monthlyMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

export const GET = defineRoute(
    { feature: "donor_donation_credit", action: "read", scope: "own" },
    async ({ user }) => {
        const supabase = await createClient();
        const donorId = user.donor_id;

        // Credit balance (donor_credits, F-6). RLS scopes to own.
        let totalCredit = 0;
        if (donorId) {
            const { data: creditRow } = await supabase
                .from("donor_credits")
                .select("balance_inr")
                .eq("donor_id", donorId)
                .maybeSingle();
            totalCredit = creditRow?.balance_inr ?? 0;
        }

        // Donor counters (total_donated_tokens).
        let totalDonatedTokens: number | null = null;
        if (donorId) {
            const { data: donorRow } = await supabase
                .from("donors")
                .select("total_donated_tokens")
                .eq("id", donorId)
                .maybeSingle();
            totalDonatedTokens = donorRow?.total_donated_tokens ?? null;
        }

        // Donations (amount_inr + created_at).
        const { data: donationsData } = await supabase
            .from("donations")
            .select("id, amount_inr, created_at")
            .order("created_at", { ascending: false });
        const donations = (donationsData as DonationRow[] | null) ?? [];

        // Tokens (status/value/timestamps).
        const { data: tokensData } = await supabase
            .from("tokens")
            .select("id, status, value_inr, minted_at, redeemed_at")
            .order("minted_at", { ascending: false });
        const tokens = (tokensData as TokenRow[] | null) ?? [];

        const totalDonations = donations.reduce((sum, d) => sum + (d.amount_inr || 0), 0);
        const redeemedTokens = tokens.filter((t) => t.status === "redeemed");

        const donationHistory = donations.map((d) => ({
            id: d.id,
            amount: d.amount_inr,
            at: d.created_at,
        }));

        // Redemption detail (vendor/meal/location) is staff/vendor-gated by RLS;
        // the donor view is time-only here. Wired richer in a later slice.
        const redemptionHistory = redeemedTokens
            .filter((t) => t.redeemed_at)
            .map((t) => ({
                token_id: t.id,
                vendor_name: "Vendor",
                location: "",
                time: t.redeemed_at as string,
                meal_info: "Meal served",
                beneficiary_category: "patient" as const,
            }));

        return {
            total_credit: totalCredit,
            total_donations: totalDonations,
            total_tokens: totalDonatedTokens ?? tokens.length,
            meals_sponsored: redeemedTokens.length,
            monthly_summary: buildMonthlySummary(donations, tokens),
            donation_history: donationHistory,
            redemption_history: redemptionHistory,
        };
    }
);
