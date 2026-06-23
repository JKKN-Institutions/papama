import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { getNumber } from "@/lib/system-config";
import type { CreditsResponse } from "@/lib/validation/schemas";

/**
 * GET /api/donor/credits — the signed-in donor's credit balance, the mint
 * threshold, and their credit-transaction ledger (token-flow §1).
 *
 * Gated by `donor_donation_credit/read` (scope own). Read through the session
 * client so RLS (`*_select_own`) scopes rows to this donor. The threshold is the
 * admin-tunable `standard_token_value`; if it is unset we report 0 / not-reached
 * rather than invent a default. Funds are never withdrawable.
 */
export const GET = defineRoute(
    { feature: "donor_donation_credit", action: "read", scope: "own" },
    async ({ user }) => {
        const supabase = await createClient();
        const donorId = user.donor_id;

        let balance = 0;
        if (donorId) {
            const { data } = await supabase
                .from("donor_credits")
                .select("balance_inr")
                .eq("donor_id", donorId)
                .maybeSingle();
            balance = data?.balance_inr ?? 0;
        }

        const { data: txRows } = await supabase
            .from("credit_transactions")
            .select("id, amount_inr, type, description, created_at")
            .order("created_at", { ascending: false });

        let threshold = 0;
        try {
            threshold = await getNumber("standard_token_value", supabase as never);
        } catch {
            // standard_token_value unset — leave threshold 0 / not reached (no guessed default).
        }

        const body: CreditsResponse = {
            credit_balance: balance,
            threshold,
            threshold_reached: threshold > 0 && balance >= threshold,
            withdrawable: false,
            transactions: (txRows ?? []).map((t) => ({
                id: t.id as string,
                amount: t.amount_inr as number,
                type: t.type as string,
                description: (t.description as string) ?? "",
                timestamp: t.created_at as string,
            })),
        };

        return body;
    }
);
