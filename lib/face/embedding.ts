import "server-only";

import { createHash } from "node:crypto";

/**
 * Server-side helpers for face embeddings (owner §4.6 / §5.2).
 *
 * The embedding itself is produced ON THE DEVICE by <FaceCapture>; the server only
 * serializes it for storage/matching and derives a coarse fingerprint. No raw image
 * is ever handled here.
 */

/**
 * Serialize an embedding for a pgvector column or RPC argument. PostgREST/supabase-js
 * would otherwise send a JS array as a Postgres array literal (`{1,2}`), which the
 * `vector` type rejects — it needs the bracketed string form `[1,2,3]`.
 */
export function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

/**
 * Deterministic, non-reversible fingerprint of an embedding. Kept in the legacy
 * `face_hash` text column as a coarse presence/equality signal (real identity
 * matching uses vector distance, not this). Two identical embeddings hash equal;
 * near-duplicates do NOT — so this is a fingerprint, never the matcher.
 */
export function embeddingFingerprint(embedding: number[]): string {
    return createHash("sha256").update(embedding.join(",")).digest("hex");
}
