import "server-only";

import { createHash, createHmac } from "node:crypto";

/**
 * One-time token QR payload + its non-reversible at-rest hash (SEC-5).
 *
 * The raw QR payload a beneficiary presents is derived deterministically from the
 * token id and a server secret — unguessable without the secret, yet re-derivable
 * for rendering, so it never has to be stored. Only its SHA-256 (`qrHashOf`) is
 * persisted in `tokens.qr_hash`; redemption hashes the scanned payload and matches
 * the stored hash (anti-duplication). This replaces the old guessable plaintext
 * `PAPAMA:<serial>`.
 *
 * NOTE: the HMAC secret reuses SUPABASE_SERVICE_ROLE_KEY (already server-only) to
 * avoid introducing an unset env var. A dedicated TOKEN_QR_SECRET should replace
 * it before launch so issued QRs survive a service-key rotation.
 */
const DOMAIN = "papama-token-qr:v1:";

function qrSecret(): string {
    const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!s) {
        throw new Error("token QR secret unavailable (SUPABASE_SERVICE_ROLE_KEY unset)");
    }
    return s;
}

/** Deterministic, unguessable, re-derivable one-time QR payload (never stored). */
export function deriveQrPayload(tokenId: string): string {
    const mac = createHmac("sha256", qrSecret()).update(DOMAIN + tokenId).digest("hex");
    return `PAPAMA:${mac}`;
}

/** Non-reversible hash persisted in tokens.qr_hash (anti-duplication lookup). */
export function qrHashOf(payload: string): string {
    return createHash("sha256").update(payload).digest("hex");
}
