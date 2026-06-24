import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber } from "@/lib/system-config";

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

    // 2. Add credit to the donor's balance (upsert donor_credits).
    const { data: creditRow } = await admin
        .from("donor_credits")
        .select("balance_inr")
        .eq("donor_id", donorId)
        .maybeSingle();

    const oldBalance = creditRow?.balance_inr ?? 0;
    const newBalance = oldBalance + amountInr;

    const creditWrite = creditRow
        ? await admin
              .from("donor_credits")
              .update({ balance_inr: newBalance, updated_at: nowIso })
              .eq("donor_id", donorId)
        : await admin.from("donor_credits").insert({ donor_id: donorId, balance_inr: newBalance });
    if (creditWrite.error) throw new Error(creditWrite.error.message);

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
    const notes: Array<Record<string, unknown>> = [
        {
            donor_id: donorId,
            kind: "donation_success",
            title: "Donation received",
            message: `Thank you! ₹${amountInr} was added to your credit.`,
            metadata: { amount_inr: amountInr, balance: newBalance },
        },
    ];
    if (threshold != null && oldBalance < threshold && newBalance >= threshold) {
        notes.push({
            donor_id: donorId,
            kind: "threshold",
            title: "You can mint a token",
            message: `Your credit reached ₹${newBalance} — convert it into a food token.`,
            metadata: { balance: newBalance, threshold },
        });
    }
    await admin.from("notifications").insert(notes);

    return {
        donationId,
        creditAdded: amountInr,
        creditBalance: newBalance,
        thresholdReached,
    };
}
