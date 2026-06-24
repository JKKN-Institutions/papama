import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber } from "@/lib/system-config";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Shared donation-recording primitive used by BOTH the guest donation route and
 * the UPI QR confirm route. Records a `donations` row, and — only when a donor is
 * attached — credits the donor's balance + writes the credit ledger entry +
 * notifications. Guest (donor-less) donations record the donation but have no
 * credit balance to add to (there is no account to hold credit).
 *
 * Always invoked with the SERVICE-ROLE client (the writes target *_write_admin
 * RLS tables, and the guest path is unauthenticated by design).
 *
 * Payment: the card/netbanking/UPI-app providers remain an OPEN item
 * (ASSUMPTIONS.md) recorded as a clearly-flagged `mock:` ref. The UPI *manual QR*
 * flow is real (a confirmed UTR is the payment evidence) and passes `paymentRef`.
 */

/** Indian financial year (Apr–Mar) for a date, e.g. "2026-2027". */
export function indianFinancialYear(d: Date): string {
    const y = d.getUTCFullYear();
    const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // months 0-based; 3 = April
    return `${startYear}-${startYear + 1}`;
}

export interface RecordDonationArgs {
    admin: SupabaseClient;
    amountInr: number;
    /** null = guest / no-account donation (donation row only, no credit). */
    donorId: string | null;
    /** Free-text method label for the ledger ("upi", "qr", "card", …). */
    method: string;
    /** Real payment reference (e.g. a confirmed UPI UTR) or a mock placeholder. */
    paymentRef: string;
}

export interface RecordDonationResult {
    donationId: string;
    creditAdded: number;
    creditBalance: number;
    thresholdReached: boolean;
}

export async function recordDonation({
    admin,
    amountInr,
    donorId,
    method,
    paymentRef,
}: RecordDonationArgs): Promise<RecordDonationResult> {
    const nowIso = new Date().toISOString();

    // 1. Record the donation row (completed — payment is either a real confirmed
    //    UPI UTR or a flagged mock until a card/netbanking provider is chosen).
    const { data: donation, error: donationError } = await admin
        .from("donations")
        .insert({
            donor_id: donorId, // nullable column — guest donations allowed (M15)
            amount_inr: amountInr,
            token_amount: 0,
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

    // Threshold (for the "you can mint now" hint); unset → not reached.
    let threshold: number | null = null;
    try {
        threshold = await getNumber("standard_token_value", admin as never);
    } catch {
        // standard_token_value unset — no guessed default.
    }

    // Guest donation: no account, so nothing to credit.
    if (!donorId) {
        return {
            donationId,
            creditAdded: amountInr,
            creditBalance: 0,
            thresholdReached: false,
        };
    }

    // 2. Add credit to the donor's balance with a compare-and-swap retry loop.
    //    supabase-js can't express `balance = balance + x` or wrap a transaction,
    //    so we read-then-CAS on the prior value: if a concurrent donation/mint
    //    moved the balance, the guarded update affects 0 rows and we re-read and
    //    retry. This prevents lost updates (two donations silently overwriting
    //    each other). A hardening RPC is proposed in docs/proposed-migrations.
    let oldBalance = 0;
    let newBalance = 0;
    let credited = false;
    for (let attempt = 0; attempt < 6 && !credited; attempt++) {
        const { data: creditRow } = await admin
            .from("donor_credits")
            .select("balance_inr")
            .eq("donor_id", donorId)
            .maybeSingle();

        oldBalance = creditRow?.balance_inr ?? 0;
        newBalance = oldBalance + amountInr;

        if (creditRow) {
            const { data: updated, error: updErr } = await admin
                .from("donor_credits")
                .update({ balance_inr: newBalance, updated_at: nowIso })
                .eq("donor_id", donorId)
                .eq("balance_inr", oldBalance)
                .select("donor_id")
                .maybeSingle();
            if (updErr) throw new Error(updErr.message);
            credited = !!updated; // 0 rows → lost the race; loop re-reads & retries
        } else {
            const { error: insErr } = await admin
                .from("donor_credits")
                .insert({ donor_id: donorId, balance_inr: newBalance });
            // A concurrent donation may have inserted the row first; retry as update.
            credited = !insErr;
        }
    }
    if (!credited) {
        throw new Error("could not apply credit after concurrent updates — please retry");
    }

    // 3. Ledger entry.
    const { error: txError } = await admin.from("credit_transactions").insert({
        donor_id: donorId,
        amount_inr: amountInr,
        type: "purchase",
        description: `Added ₹${amountInr} credit via ${method}`,
    });
    if (txError) throw new Error(txError.message);

    const thresholdReached = threshold != null && newBalance >= threshold;

    // 4. Notifications: receipt + one-time threshold alert.
    await dispatchNotification(admin, {
        donorId,
        kind: "donation_success",
        title: "Donation received",
        message: `Thank you! ₹${amountInr} was added to your credit.`,
        metadata: { amount_inr: amountInr, balance: newBalance },
        // Default channels = ['in_app']. Pass ['in_app','email','sms'] here once
        // the email/SMS provider is configured (ASSUMPTIONS.md open item Q4).
    });
    if (threshold != null && oldBalance < threshold && newBalance >= threshold) {
        await dispatchNotification(admin, {
            donorId,
            kind: "threshold",
            title: "You can mint a token",
            message: `Your credit reached ₹${newBalance} — convert it into a food token.`,
            metadata: { balance: newBalance, threshold },
        });
    }

    return {
        donationId,
        creditAdded: amountInr,
        creditBalance: newBalance,
        thresholdReached,
    };
}
