import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

        // Redemption detail (vendor/location/category). token_redemptions is
        // staff/vendor-gated by RLS, so read it on the service-role client BUT
        // scoped to this donor's own (RLS-fetched) redeemed token ids — no leakage.
        const redeemedIds = redeemedTokens.map((t) => t.id);
        let redemptionHistory: {
            token_id: string;
            vendor_name: string;
            location: string;
            time: string;
            meal_info: string;
            beneficiary_category: string;
        }[] = [];

        if (redeemedIds.length > 0) {
            const admin = createAdminClient();
            const { data: reds } = await admin
                .from("token_redemptions")
                .select("token_id, vendor_id, beneficiary_id, menu_value_inr, redeemed_at")
                .in("token_id", redeemedIds)
                .order("redeemed_at", { ascending: false });
            const redemptions = (reds ?? []) as {
                token_id: string;
                vendor_id: string | null;
                beneficiary_id: string | null;
                menu_value_inr: number | null;
                redeemed_at: string;
            }[];

            // Resolve vendor names + (privacy-safe) beneficiary categories.
            const vendorIds = [...new Set(redemptions.map((r) => r.vendor_id).filter(Boolean))] as string[];
            const benefIds = [...new Set(redemptions.map((r) => r.beneficiary_id).filter(Boolean))] as string[];
            const vendorMap = new Map<string, { name: string | null; city: string | null }>();
            const benefMap = new Map<string, string>();
            if (vendorIds.length > 0) {
                const { data: vs } = await admin.from("vendors").select("id, name, city").in("id", vendorIds);
                for (const v of vs ?? []) vendorMap.set(v.id, { name: v.name, city: v.city });
            }
            if (benefIds.length > 0) {
                const { data: bs } = await admin.from("beneficiaries").select("id, category").in("id", benefIds);
                for (const b of bs ?? []) benefMap.set(b.id, b.category);
            }

            redemptionHistory = redemptions.map((r) => {
                const v = r.vendor_id ? vendorMap.get(r.vendor_id) : undefined;
                return {
                    token_id: r.token_id,
                    vendor_name: v?.name ?? "Partner vendor",
                    location: v?.city ?? "",
                    time: r.redeemed_at,
                    meal_info: r.menu_value_inr != null ? `Meal (₹${r.menu_value_inr})` : "Meal served",
                    // Neutral fallback when the category is unknown — the UI maps
                    // an unrecognised value to a generic "Beneficiary" card, so we
                    // do NOT mislabel as a specific category like "patient".
                    beneficiary_category:
                        (r.beneficiary_id && benefMap.get(r.beneficiary_id)) || "beneficiary",
                };
            });
        }

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
