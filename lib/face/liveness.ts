import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BadRequestError } from "@/lib/api/handler";
import { getNumber, MissingConfigError } from "@/lib/system-config";
import type { FaceCapture } from "@/lib/validation/schemas";

/**
 * Enforce the anti-spoof / liveness floor on a face capture — FAIL-SAFE.
 *
 * The floor is system_config `face_liveness_min`. Behaviour on read:
 *   - key genuinely unset (MissingConfigError) → SKIP (no floor configured yet;
 *     consistent with the "never invent a value" rule — we do not block on a rule
 *     that has not been set).
 *   - any OTHER (transient) read error → THROW, so a DB/network hiccup can never
 *     silently DISABLE the anti-spoof gate. This is the fix for the previous
 *     `.catch(() => 0)`, which set the floor to 0 (accept anything) on any error.
 *   - liveness below the floor → throw BadRequestError (client should retake).
 *
 * Shared by all enrolment routes (beneficiary self / volunteer-assisted / admin)
 * so the gate behaves identically everywhere.
 */
export async function assertLiveness(
    capture: FaceCapture,
    client: SupabaseClient
): Promise<void> {
    let min: number;
    try {
        min = await getNumber("face_liveness_min", client as never);
    } catch (err) {
        if (err instanceof MissingConfigError) return; // unset → nothing to enforce
        throw new Error(
            "could not read the liveness threshold — refusing to skip the anti-spoof check"
        );
    }
    if (capture.liveness < min) {
        throw new BadRequestError(
            "face capture failed the liveness/anti-spoof check — retake in good lighting"
        );
    }
}
