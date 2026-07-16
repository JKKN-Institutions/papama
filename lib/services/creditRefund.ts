import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { postLedgerEntry } from "@/lib/services/ledger";

/**
 * Internal credit-refund / reversal (addon2 A6).
 *
 * This is NOT a donor money-back refund — donor funds are non-withdrawable and
 * permanently locked to the food-token lifecycle (AGENTS.md; papama-owner-scope
 * §2.1/§4.1). `refundCredit` only REVERSES credit that was provisionally granted
 * and must be clawed back — e.g. a payment later reconciled as failed/charged
 * back. The money never leaves pApAmA; the ledger simply nets the credit back out.
 *
 * (The failed-token-mint case does not use this: the mint routes revert the
 * balance inline before ever writing the debit — see app/api/tokens/convert.)
 *
 * Uses the same compare-and-swap balance loop as recordDonation (supabase-js
 * cannot express `balance = balance - x` atomically). You cannot claw back more
 * credit than currently exists, so the reversed amount is capped at the live
 * balance; a shortfall (credit already spent on a minted token) is reported.
 * Always invoked with the SERVICE-ROLE client after a permission check.
 */

export interface RefundCreditArgs {
    admin: SupabaseClient;
    donorId: string;
    /** Magnitude to reverse (positive INR). Capped at the live balance. */
    amountInr: number;
    /** Human-readable reason stored on the ledger row + used in the audit trail. */
    reason: string;
    /** Triple-ledger reference (addon #18) — defaults to a credit_transaction
     *  self-reference when the caller doesn't have a more specific one (e.g.
     *  a refund request, addon #14/#20). */
    ledgerReference?: { referenceType: string; referenceId: string };
}

export interface RefundCreditResult {
    /** INR actually removed from the balance (<= requested when credit was spent). */
    reversed: number;
    /** Requested magnitude. */
    requested: number;
    /** Balance after the reversal. */
    balance: number;
    /** True when the live balance was smaller than the requested reversal. */
    partial: boolean;
}

export async function refundCredit({
    admin,
    donorId,
    amountInr,
    reason,
    ledgerReference,
}: RefundCreditArgs): Promise<RefundCreditResult> {
    if (!(amountInr > 0)) {
        throw new Error("refund amount must be positive");
    }
    const nowIso = new Date().toISOString();

    let oldBalance = 0;
    let newBalance = 0;
    let reversed = 0;
    let done = false;

    for (let attempt = 0; attempt < 6 && !done; attempt++) {
        const { data: creditRow } = await admin
            .from("donor_credits")
            .select("balance_inr")
            .eq("donor_id", donorId)
            .maybeSingle();

        oldBalance = creditRow?.balance_inr ?? 0;
        // Can't reverse more credit than exists (the rest was already converted
        // into a token that has left the balance).
        reversed = Math.min(amountInr, oldBalance);
        newBalance = oldBalance - reversed;

        if (reversed === 0) {
            // Nothing to claw back — balance is empty (credit already spent).
            done = true;
            break;
        }

        if (creditRow) {
            const { data: updated, error: updErr } = await admin
                .from("donor_credits")
                .update({ balance_inr: newBalance, updated_at: nowIso })
                .eq("donor_id", donorId)
                .eq("balance_inr", oldBalance) // CAS: lose the race → re-read & retry
                .select("donor_id")
                .maybeSingle();
            if (updErr) throw new Error(updErr.message);
            done = !!updated;
        } else {
            // No credit row at all → nothing to reverse.
            done = true;
        }
    }

    if (!done) {
        throw new Error("could not reverse credit after concurrent updates — please retry");
    }

    // Ledger entry — a DEBIT (negative), typed refund_reversal so it is distinct
    // from a token_conversion debit or a purchase/donation credit.
    if (reversed > 0) {
        const { data: txRow, error: txError } = await admin
            .from("credit_transactions")
            .insert({
                donor_id: donorId,
                amount_inr: -reversed,
                type: "refund_reversal",
                description: reason,
            })
            .select("id")
            .single();
        if (txError) throw new Error(txError.message);

        // Triple-ledger financial trail (addon #18) — a credit reversal debits
        // the `donation` ledger. Best-effort: a ledger-posting failure must
        // never undo the reversal itself.
        try {
            await postLedgerEntry({
                admin,
                ledger: "donation",
                amountInr: -reversed,
                referenceType: ledgerReference?.referenceType ?? "credit_transaction",
                referenceId: ledgerReference?.referenceId ?? (txRow as { id: string } | null)?.id ?? donorId,
                description: reason,
            });
        } catch (e) {
            console.error("[refundCredit] ledger posting failed:", e);
        }
    }

    return {
        reversed,
        requested: amountInr,
        balance: newBalance,
        partial: reversed < amountInr,
    };
}
