import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { nanoid } from "nanoid";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/payment/upi-qr/generate — start a real UPI QR donation.
 *
 * Builds an NPCI-spec UPI deep link (upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…&tr=…),
 * renders it to a QR data URL, and records a PENDING `upi_qr_payments` row with a
 * 15-minute expiry. The donor scans with any UPI app; there is NO webhook for a
 * static VPA, so payment is confirmed MANUALLY at /api/payment/upi-qr/confirm
 * (the donor enters their UTR). Adapted from the upi-qr-payment-gateway skill.
 *
 * Merchant VPA + name come from env (NEXT_PUBLIC_UPI_VPA / _MERCHANT_NAME). These
 * are deployment config, NOT a payment-provider SDK key — the static-VPA flow is
 * self-hosted. A clearly-flagged placeholder VPA is used in dev if unset.
 *
 * Ungated (the public/guest QR page has no session) — uses the service-role
 * client to write the intent row. No client write surface exists on the table.
 */

const generateSchema = z.object({
    amount_inr: z.number().int().positive().max(1_000_000),
});

// Best-effort, process-local per-IP rate limit (resets on redeploy; not a hard
// control). Mirrors app/api/donations/create-guest. This is a PUBLIC, ungated,
// real-money path, so throttle QR creation to blunt scripted abuse. A real
// deployment should also front this with an edge/WAF limiter. 10 req / 10 min / IP.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > RATE_MAX;
}

function clientIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for");
    return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// PLACEHOLDER (ASSUMPTIONS.md): a real merchant VPA must be set via env before
// launch. This dev fallback lets the demo render a scannable QR; it is NOT a real
// collecting account. Do NOT treat this as the production VPA.
const DEV_PLACEHOLDER_VPA = "papama@upi"; // FLAG: placeholder, override via NEXT_PUBLIC_UPI_VPA
const DEV_PLACEHOLDER_NAME = "pApAmA Community Meals";

function buildUpiString(opts: {
    vpa: string;
    payeeName: string;
    amount: number;
    note: string;
    ref: string;
    merchantCode?: string;
}): string {
    let s = `upi://pay?pa=${encodeURIComponent(opts.vpa)}`;
    s += `&pn=${encodeURIComponent(opts.payeeName)}`;
    s += `&am=${opts.amount.toFixed(2)}`;
    s += `&cu=INR`;
    s += `&tn=${encodeURIComponent(opts.note)}`;
    s += `&tr=${encodeURIComponent(opts.ref)}`;
    if (opts.merchantCode) s += `&mc=${opts.merchantCode}`;
    return s;
}

export async function POST(req: NextRequest) {
    try {
        if (rateLimited(clientIp(req))) {
            return NextResponse.json(
                { error: "too many payment attempts, please wait a few minutes" },
                { status: 429 }
            );
        }

        let raw: unknown;
        try {
            raw = await req.json();
        } catch {
            return NextResponse.json({ error: "request body is not valid JSON" }, { status: 400 });
        }
        const parsed = generateSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: "invalid amount" }, { status: 400 });
        }
        const amount = parsed.data.amount_inr;

        const vpa = process.env.NEXT_PUBLIC_UPI_VPA || DEV_PLACEHOLDER_VPA;
        const merchantName = process.env.NEXT_PUBLIC_UPI_MERCHANT_NAME || DEV_PLACEHOLDER_NAME;
        const merchantCode = process.env.NEXT_PUBLIC_UPI_MERCHANT_CODE || undefined;
        const usingPlaceholder = !process.env.NEXT_PUBLIC_UPI_VPA;

        const prefix = process.env.UPI_TX_PREFIX || "PAPAMA";
        const transactionRef = `${prefix}${Date.now()}${nanoid(6)}`;

        const upiString = buildUpiString({
            vpa,
            payeeName: merchantName,
            amount,
            note: `pApAmA donation ${transactionRef}`,
            ref: transactionRef,
            merchantCode,
        });

        const qrCode = await QRCode.toDataURL(upiString, {
            errorCorrectionLevel: "H",
            type: "image/png",
            width: 360,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
        });

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const admin = createAdminClient();
        const { error } = await admin.from("upi_qr_payments").insert({
            transaction_ref: transactionRef,
            upi_string: upiString,
            amount_inr: amount,
            status: "PENDING",
            expires_at: expiresAt,
        });
        if (error) {
            console.error("[upi-qr/generate] db error:", error.message);
            return NextResponse.json({ error: "failed to create payment record" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            qrCode,
            upiString,
            transactionRef,
            expiresAt,
            amount,
            merchantName,
            upiId: vpa,
            usingPlaceholder, // UI can flag "demo VPA" when no real VPA configured
        });
    } catch (err) {
        console.error("[upi-qr/generate] error:", err);
        return NextResponse.json({ error: "failed to generate QR code" }, { status: 500 });
    }
}
