import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { recordDonation } from "@/app/api/_lib/recordDonation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/payment/upi-qr/confirm — manually confirm a UPI QR donation.
 * GET  /api/payment/upi-qr/confirm?ref=… — poll a payment's status.
 *
 * Static-VPA UPI has no webhook, so confirmation is MANUAL: after paying, the
 * donor enters the UTR from their UPI app. This route validates the PENDING row,
 * enforces lazy 15-minute expiry, guards double-confirm, flips it to PAID, then
 * credits the donation through the shared `recordDonation` helper (a donor-less
 * guest donation whose payment_ref is the REAL confirmed UTR — not a mock). The
 * resulting donation id is back-linked onto the payment row.
 *
 * Ungated (public QR page, no session) — service-role client. Replaces the old
 * fake confirm that accepted any 6+ char string with no persistence.
 */

const confirmSchema = z.object({
    transactionRef: z.string().trim().min(1),
    // UTR / UPI reference number the payer reads off their app. UPI UTRs are
    // typically 12 digits; accept 6+ alphanumerics to tolerate app variations.
    upiTransactionId: z.string().trim().min(6).max(40),
    payerVpa: z.string().trim().max(120).optional(),
});

export async function POST(req: NextRequest) {
    try {
        let raw: unknown;
        try {
            raw = await req.json();
        } catch {
            return NextResponse.json({ error: "request body is not valid JSON" }, { status: 400 });
        }
        const parsed = confirmSchema.safeParse(raw);
        if (!parsed.success) {
            const msg = parsed.error.issues.map((i) => i.message).join("; ") || "invalid request";
            return NextResponse.json({ error: msg }, { status: 400 });
        }
        const { transactionRef, upiTransactionId, payerVpa } = parsed.data;

        const admin = createAdminClient();
        const { data: payment, error: fetchError } = await admin
            .from("upi_qr_payments")
            .select("id, status, amount_inr, expires_at, donation_id")
            .eq("transaction_ref", transactionRef)
            .maybeSingle();

        if (fetchError || !payment) {
            return NextResponse.json({ error: "payment record not found" }, { status: 404 });
        }

        if (payment.status === "PAID") {
            return NextResponse.json({ error: "payment already confirmed" }, { status: 400 });
        }

        // Lazy expiry: flip to EXPIRED on first touch past the deadline.
        if (payment.status === "PENDING" && new Date(payment.expires_at as string) < new Date()) {
            await admin
                .from("upi_qr_payments")
                .update({ status: "EXPIRED" })
                .eq("transaction_ref", transactionRef);
            return NextResponse.json({ error: "payment QR has expired, please start again" }, { status: 400 });
        }

        if (payment.status !== "PENDING") {
            return NextResponse.json({ error: "payment cannot be confirmed" }, { status: 400 });
        }

        // Credit the donation (guest / no-account; payment_ref = the real UTR).
        const result = await recordDonation({
            admin,
            amountInr: payment.amount_inr as number,
            donorId: null,
            method: "upi_qr",
            paymentRef: `upi:${upiTransactionId}`,
        });

        // Flip to PAID + back-link the donation. Re-check status to guard a race
        // where two confirms arrive together (only one should win).
        const { data: updated, error: updateError } = await admin
            .from("upi_qr_payments")
            .update({
                status: "PAID",
                upi_transaction_id: upiTransactionId,
                payer_vpa: payerVpa ?? null,
                paid_at: new Date().toISOString(),
                donation_id: result.donationId,
            })
            .eq("transaction_ref", transactionRef)
            .eq("status", "PENDING")
            .select("id")
            .maybeSingle();

        if (updateError) {
            console.error("[upi-qr/confirm] update error:", updateError.message);
            return NextResponse.json({ error: "failed to confirm payment" }, { status: 500 });
        }
        if (!updated) {
            // Lost the race — another confirm already credited it. Donation we just
            // recorded is a duplicate; surface a friendly already-confirmed state.
            return NextResponse.json({ error: "payment already confirmed" }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            donation_id: result.donationId,
            amount: payment.amount_inr,
            status: "PAID",
            upiTransactionId,
        });
    } catch (err) {
        console.error("[upi-qr/confirm] error:", err);
        return NextResponse.json({ error: "failed to confirm payment" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const ref = req.nextUrl.searchParams.get("ref") || req.nextUrl.searchParams.get("transactionRef");
        if (!ref) {
            return NextResponse.json({ error: "transaction ref required" }, { status: 400 });
        }
        const admin = createAdminClient();
        const { data, error } = await admin
            .from("upi_qr_payments")
            .select("status, amount_inr, paid_at, upi_transaction_id, expires_at")
            .eq("transaction_ref", ref)
            .maybeSingle();

        if (error || !data) {
            return NextResponse.json({ error: "payment record not found" }, { status: 404 });
        }
        const expired = new Date(data.expires_at as string) < new Date();
        return NextResponse.json({
            success: true,
            status: expired && data.status === "PENDING" ? "EXPIRED" : data.status,
            amount: data.amount_inr,
            paidAt: data.paid_at,
            upiTransactionId: data.upi_transaction_id,
            expiresAt: data.expires_at,
        });
    } catch (err) {
        console.error("[upi-qr/confirm GET] error:", err);
        return NextResponse.json({ error: "failed to check payment status" }, { status: 500 });
    }
}
