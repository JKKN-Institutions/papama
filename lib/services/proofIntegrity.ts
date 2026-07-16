import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getConfig } from "@/lib/system-config";

/**
 * Proof-photo integrity (addon #10). Detects the same plate photo being re-used
 * across redemptions — a classic settlement-padding fraud where a vendor submits
 * one photo for many "served" meals.
 *
 * PERCEPTUAL HASH — important limitation: there is NO image-decoding dependency
 * in package.json (no sharp/jimp; @vladmandic/human is face detection, qrcode is
 * encode-only, html5-qrcode is a QR reader). A true pixel-domain pHash needs a
 * decoder, so `computePhash` implements a self-contained AVERAGE hash over the
 * RAW (compressed) file bytes instead of decoded pixels. Consequences:
 *   - It reliably flags byte-identical / near-identical re-uploads (the same
 *     JPEG re-submitted, or with only tiny header/metadata differences) — the
 *     dominant abuse vector here.
 *   - It is NOT robust to re-encoding, resizing or recompression of the same
 *     scene (those change the byte stream substantially). Upgrading to a true
 *     pixel pHash is a drop-in: swap `computePhash` for a decode+aHash once an
 *     image-decode dep is approved. The Hamming-distance comparison and the
 *     duplicate-scan plumbing stay the same.
 *
 * The hash is a 64-bit fingerprint, hex-encoded to 16 chars and stored in
 * token_redemptions.proof_photo_phash. Comparison is Hamming distance against the
 * admin-tunable system_config `proof_phash_dup_distance` (soft-skip when unset).
 */

/** Number of bits in the average hash (and therefore 16 hex chars). */
const HASH_BITS = 64;

/**
 * Average hash over the raw bytes of an uploaded image. Splits the byte stream
 * into 64 contiguous buckets, takes each bucket's mean, then sets bit i to 1 when
 * bucket i's mean is >= the global mean. Deterministic; same bytes → same hash.
 * Returns a 16-char lowercase hex string. Empty input → all-zero hash.
 */
export function computePhash(input: ArrayBuffer | Uint8Array): string {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const n = bytes.length;

    const bucketMeans = new Array<number>(HASH_BITS).fill(0);
    if (n > 0) {
        for (let b = 0; b < HASH_BITS; b++) {
            const start = Math.floor((b * n) / HASH_BITS);
            const end = Math.floor(((b + 1) * n) / HASH_BITS);
            // Guard the final/edge buckets so every bucket samples at least one byte.
            const lo = Math.min(start, n - 1);
            const hi = Math.max(end, lo + 1);
            let sum = 0;
            let count = 0;
            for (let i = lo; i < hi && i < n; i++) {
                sum += bytes[i];
                count++;
            }
            bucketMeans[b] = count > 0 ? sum / count : 0;
        }
    }

    const globalMean = bucketMeans.reduce((s, v) => s + v, 0) / HASH_BITS;

    // Pack 64 bits, MSB first, into 16 hex nibbles.
    let hex = "";
    for (let nibble = 0; nibble < HASH_BITS / 4; nibble++) {
        let v = 0;
        for (let bit = 0; bit < 4; bit++) {
            const idx = nibble * 4 + bit;
            v = (v << 1) | (bucketMeans[idx] >= globalMean ? 1 : 0);
        }
        hex += v.toString(16);
    }
    return hex;
}

/** Popcount of a 4-bit nibble (0..15). */
const NIBBLE_BITS = Array.from({ length: 16 }, (_, i) =>
    ((i >> 0) & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1)
);

/**
 * Hamming distance between two equal-length hex-encoded hashes (number of
 * differing bits). Returns Infinity when the inputs are malformed/mismatched so a
 * bad stored value can never be treated as a "match".
 */
export function hammingDistanceHex(a: string, b: string): number {
    if (!a || !b || a.length !== b.length) return Infinity;
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
        const xa = parseInt(a[i], 16);
        const xb = parseInt(b[i], 16);
        if (Number.isNaN(xa) || Number.isNaN(xb)) return Infinity;
        dist += NIBBLE_BITS[xa ^ xb];
    }
    return dist;
}

export interface DuplicateProofMatch {
    redemption_id: string;
    vendor_id: string;
    distance: number;
}

export interface RecordMediaFingerprintInput {
    redemptionId: string;
    vendorId: string;
    type: "photo" | "bill";
    hash: string;
}

/**
 * Append a durable fingerprint row for a proof media upload (addon #12). Photo
 * rows are populated/checked now; 'bill' is a forward-compat type for #13
 * (bill-fingerprint detection), held — not called with type:'bill' yet.
 */
export async function recordMediaFingerprint(
    admin: SupabaseClient,
    input: RecordMediaFingerprintInput
): Promise<void> {
    const { error } = await admin.from("media_fingerprints").insert({
        redemption_id: input.redemptionId,
        vendor_id: input.vendorId,
        type: input.type,
        hash: input.hash,
    });
    if (error) throw new Error(error.message);
}

/**
 * Find an existing redemption whose stored proof phash is within
 * `proof_phash_dup_distance` Hamming distance of `phash`. Soft-skips (returns
 * null) when the threshold is unset/missing — same discipline as the other addon
 * tunables. `excludeRedemptionId` omits the row currently being written.
 *
 * @param admin service-role client (the route already passed the matrix check)
 */
export async function findDuplicateProof(
    phash: string,
    admin: SupabaseClient,
    excludeRedemptionId?: string
): Promise<DuplicateProofMatch | null> {
    if (!phash) return null;

    // Soft-skip when the threshold is unset (NULL) or the key is absent entirely.
    let maxDistance: number | null = null;
    try {
        const raw = await getConfig("proof_phash_dup_distance", admin as never);
        maxDistance = typeof raw === "number" && !Number.isNaN(raw) ? raw : null;
    } catch {
        return null; // key missing → feature simply off
    }
    if (maxDistance === null) return null;

    let query = admin
        .from("token_redemptions")
        .select("id, vendor_id, proof_photo_phash")
        .not("proof_photo_phash", "is", null);
    if (excludeRedemptionId) query = query.neq("id", excludeRedemptionId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let best: DuplicateProofMatch | null = null;
    for (const r of (data ?? []) as {
        id: string;
        vendor_id: string;
        proof_photo_phash: string | null;
    }[]) {
        if (!r.proof_photo_phash) continue;
        const dist = hammingDistanceHex(phash, r.proof_photo_phash);
        if (dist <= maxDistance && (best === null || dist < best.distance)) {
            best = { redemption_id: r.id, vendor_id: r.vendor_id, distance: dist };
            if (dist === 0) break; // exact match — can't do better
        }
    }
    return best;
}
