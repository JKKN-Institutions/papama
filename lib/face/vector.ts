/**
 * Client-safe vector helpers for face embeddings.
 *
 * NOTE: this file is intentionally NOT `server-only` — it is imported by the
 * <FaceCapture> client component (unlike lib/face/embedding.ts, which is
 * server-only). Keep it dependency-free and isomorphic.
 */

/**
 * L2-normalize an embedding to unit length.
 *
 * @vladmandic/human's `faceres` descriptors are NOT unit vectors, and the model
 * is designed around Euclidean distance. Normalizing at capture makes the
 * stored/queried vectors canonical:
 *   - it is a NO-OP for the current cosine index (cosine distance is
 *     scale-invariant, so existing non-normalized rows still match correctly), but
 *   - it de-risks a future switch to L2 / inner-product distance (Human's native
 *     metric), where on unit vectors L2 and cosine become rank-equivalent.
 *
 * Returns a new array; a zero/degenerate vector is returned unchanged (a copy).
 */
export function l2normalize(embedding: number[]): number[] {
    let sumSq = 0;
    for (const x of embedding) sumSq += x * x;
    const norm = Math.sqrt(sumSq);
    if (!Number.isFinite(norm) || norm === 0) return embedding.slice();
    return embedding.map((x) => x / norm);
}
