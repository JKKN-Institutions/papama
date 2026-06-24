import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { recordDonation } from "@/app/api/_lib/recordDonation";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { donationPurchaseRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/donations/create — the signed-in donor buys credit (fiat → credit).
 *
 * Gated by `donor_donation_credit/create` (scope own). donations/donor_credits/
 * credit_transactions are all `*_write_admin` under RLS, so the writes run on the
 * service-role client AFTER the matrix check. The donor id comes from the session
 * — never the client body. Shared crediting logic lives in `recordDonation`.
 *
 * Payment: the card/netbanking providers are an OPEN item (ASSUMPTIONS.md). Until
 * a real gateway lands, the donation is recorded `completed` with a flagged
 * `mock:` ref so the credit flow is demoable. The real UPI *manual QR* flow lives
 * in /api/payment/upi-qr/** (a confirmed UTR is the payment evidence). The guest
 * (no-account) donation path is POST /api/donations/create-guest.
 */
export const POST = defineRoute(
    { feature: "donor_donation_credit", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, donationPurchaseRequestSchema);

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const method = body.payment_method ?? "portal";
        // MOCK payment seam: card/netbanking provider is an OPEN item. Flagged ref.
        const paymentRef = `mock:${method}:${new Date().toISOString()}`;

        const result = await recordDonation({
            admin,
            amountInr: body.amount_inr,
            donorId,
            method,
            paymentRef,
        });

        await audit({
            action: "donation.create",
            entity_table: "donations",
            entity_id: result.donationId,
            summary: `donor added ₹${body.amount_inr} credit (${method})`,
            metadata: {
                amount_inr: body.amount_inr,
                new_balance: result.creditBalance,
                payment_ref: paymentRef,
            },
        });

        return {
            donation_id: result.donationId,
            status: "completed",
            credit_added: result.creditAdded,
            credit_balance: result.creditBalance,
            threshold_reached: result.thresholdReached,
        };
    }
);
