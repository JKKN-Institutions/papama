import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";
import { donationPurchaseRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/donations/create — the signed-in donor buys credit (fiat → credit).
 *
 * Gated by `donor_donation_credit/create` (scope own). donations/donor_credits/
 * credit_transactions are all `*_write_admin` under RLS, so the writes run on the
 * service-role client AFTER the matrix check. The donor id comes from the session
 * — never the client body.
 *
 * Payment: the provider is an OPEN item (ASSUMPTIONS.md). Until a real gateway
 * lands (Phase E), the donation is recorded as `completed` with a placeholder
 * `payment_ref` so the credit flow is demoable. No provider is invented.
 */

/** Indian financial year (Apr–Mar) for a date, e.g. "2026-2027". */
function indianFinancialYear(d: Date): string {
    const y = d.getUTCFullYear();
    const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // months are 0-based; 3 = April
    return `${startYear}-${startYear + 1}`;
}

export const POST = defineRoute(
    { feature: "donor_donation_credit", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, donationPurchaseRequestSchema);

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const nowIso = new Date().toISOString();
        const method = body.payment_method ?? "portal";
        const paymentRef = `mock:${method}:${nowIso}`; // placeholder until Phase E gateway

        // 1. Record the donation (completed — payment is mocked until Phase E).
        const { data: donation, error: donationError } = await admin
            .from("donations")
            .insert({
                donor_id: donorId,
                amount_inr: body.amount_inr,
                token_amount: 0, // tokens are minted later via /api/tokens/convert
                status: "completed",
                payment_ref: paymentRef,
                financial_year: indianFinancialYear(new Date()),
            })
            .select("id")
            .single();

        if (donationError || !donation) {
            throw new Error(donationError?.message ?? "failed to record donation");
        }
        const donationId = (donation as { id: string }).id;

        // 2. Add the credit to the donor's balance (upsert the donor_credits row).
        const { data: creditRow } = await admin
            .from("donor_credits")
            .select("balance_inr")
            .eq("donor_id", donorId)
            .maybeSingle();

        const newBalance = (creditRow?.balance_inr ?? 0) + body.amount_inr;

        const creditWrite = creditRow
            ? await admin
                  .from("donor_credits")
                  .update({ balance_inr: newBalance, updated_at: nowIso })
                  .eq("donor_id", donorId)
            : await admin
                  .from("donor_credits")
                  .insert({ donor_id: donorId, balance_inr: newBalance });

        if (creditWrite.error) throw new Error(creditWrite.error.message);

        // 3. Ledger entry.
        const { error: txError } = await admin.from("credit_transactions").insert({
            donor_id: donorId,
            amount_inr: body.amount_inr,
            type: "purchase",
            description: `Added ₹${body.amount_inr} credit via ${method}`,
        });
        if (txError) throw new Error(txError.message);

        // Threshold (for the UI's "you can mint now" hint); unset → not reached.
        let thresholdReached = false;
        try {
            const threshold = await getNumber("standard_token_value", admin as never);
            thresholdReached = newBalance >= threshold;
        } catch {
            // standard_token_value unset — no guessed default.
        }

        await audit({
            action: "donation.create",
            entity_table: "donations",
            entity_id: donationId,
            summary: `donor added ₹${body.amount_inr} credit (${method})`,
            metadata: { amount_inr: body.amount_inr, new_balance: newBalance, payment_ref: paymentRef },
        });

        return {
            donation_id: donationId,
            status: "completed",
            credit_added: body.amount_inr,
            credit_balance: newBalance,
            threshold_reached: thresholdReached,
        };
    }
);
