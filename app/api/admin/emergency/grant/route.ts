import { defineRoute, parseBody } from "@/lib/api/handler";
import { issueEmergencyToken } from "@/lib/services/emergency";
import { emergencyGrantRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/admin/emergency/grant — issue one emergency / disaster-relief token
 * (addon #8). Mints a Standard token flagged `is_emergency`, parks it in the
 * admin pool, and records the grant trail + audit (see lib/services/emergency).
 *
 * Gated by `token_generation/create` at the default `all` scope → admin only (a
 * donor holds only `create:own`), the same gate as the guest-pool mint. The
 * service writes its own audit row, so this route does not double-audit.
 *
 * The emergency MODE toggle + relaxed-limit config (emergency_mode_enabled /
 * emergency_max_meals_per_day / emergency_meal_cooldown_hours) are edited through
 * the existing /api/admin/system-config route — NOT here. This route only mints.
 *
 * OPEN ITEM (client Q7): proof that a beneficiary is disaster-affected is
 * undecided, so issuance is NOT proof-gated (see lib/services/emergency TODO).
 */
export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "create" },
    async ({ req, user }) => {
        const body = await parseBody(req, emergencyGrantRequestSchema);
        const result = await issueEmergencyToken({ reason: body.reason ?? null }, user);
        return {
            token_id: result.token_id,
            serial_number: result.serial_number,
            value_inr: result.value_inr,
            grant_id: result.grant_id,
        };
    }
);
