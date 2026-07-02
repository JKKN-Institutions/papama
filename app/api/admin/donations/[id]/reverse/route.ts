import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { refundCredit } from "@/lib/services/creditRefund";
import { GUEST_POOL_EMAIL } from "@/lib/donations/guest-pool";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/donations/[id]/reverse — failed-payment handling (addon2 A6).
 *
 * When a completed donation's payment is later found failed / charged back, an
 * admin marks it failed here and the provisionally-granted credit is reversed
 * (internal credit-reversal — NOT a money-back refund; funds never leave the
 * food-token lifecycle). Gated by `donor_donation_credit/update` → admin only
 * (compliance is read-only). The donation must currently be 'completed'.
 */
const reverseSchema = z
    .object({ reason: z.string().trim().max(300).optional() })
    .strict();

export const POST = defineRoute<{ id: string }>(
    { feature: "donor_donation_credit", action: "update" },
    async ({ req, params, audit }) => {
        const body = await parseBody(req, reverseSchema);
        const admin = createAdminClient();

        const { data: donation, error: fetchError } = await admin
            .from("donations")
            .select("id, donor_id, amount_inr, status")
            .eq("id", params.id)
            .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        if (!donation) throw new NotFoundError("donation not found");
        if (donation.status !== "completed") {
            throw new BadRequestError(`donation is '${donation.status}', not completed — cannot reverse`);
        }

        // Flip completed → failed (CAS: lose cleanly if another admin acted first).
        const { data: flipped, error: flipError } = await admin
            .from("donations")
            .update({ status: "failed" })
            .eq("id", params.id)
            .eq("status", "completed")
            .select("id")
            .maybeSingle();
        if (flipError) throw new Error(flipError.message);
        if (!flipped) throw new BadRequestError("donation was reconciled concurrently");

        const reason = body.reason?.trim()
            ? `Payment reversed: ${body.reason.trim()}`
            : "Payment reversed (reconciled as failed)";

        // Reverse the credit only for a donor-attributed donation (guest-pool
        // donations credit a userless system donor; still reversible so the pool
        // balance stays honest).
        let reversal: Awaited<ReturnType<typeof refundCredit>> | null = null;
        if (donation.donor_id) {
            reversal = await refundCredit({
                admin,
                donorId: donation.donor_id as string,
                amountInr: donation.amount_inr as number,
                reason,
            });
        }

        await audit({
            action: "donation.reverse",
            entity_table: "donations",
            entity_id: params.id,
            summary: `donation ₹${donation.amount_inr} reversed (payment failed); credit clawed back ₹${reversal?.reversed ?? 0}${reversal?.partial ? " (partial — credit already spent)" : ""}`,
            metadata: {
                amount_inr: donation.amount_inr,
                reversed: reversal?.reversed ?? 0,
                partial: reversal?.partial ?? false,
                reason: body.reason ?? null,
            },
        });

        // Notify the donor (skip the userless guest-pool donor).
        if (donation.donor_id) {
            const { data: d } = await admin
                .from("donors")
                .select("email")
                .eq("id", donation.donor_id)
                .maybeSingle();
            if (d?.email !== GUEST_POOL_EMAIL) {
                await dispatchNotification(admin, {
                    donorId: donation.donor_id as string,
                    kind: "payment_reversed",
                    title: "A payment was reversed",
                    message: `A donation of ₹${donation.amount_inr} was reconciled as failed and the matching credit was reversed.`,
                    metadata: {
                        amount_inr: donation.amount_inr,
                        reversed: reversal?.reversed ?? 0,
                        balance: reversal?.balance ?? null,
                    },
                });
            }
        }

        return {
            ok: true,
            donation_id: params.id,
            status: "failed",
            reversed: reversal?.reversed ?? 0,
            partial: reversal?.partial ?? false,
        };
    }
);
