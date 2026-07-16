import { defineRoute, parseBody } from "@/lib/api/handler";
import { activateEmergencyOverride } from "@/lib/services/emergency";
import { createClient } from "@/lib/supabase/server";
import { emergencyOverrideActivateRequestSchema } from "@/lib/validation/schemas";

/**
 * GET/POST /api/admin/emergency/overrides — time-boxed config overrides
 * during emergency mode (spec §3.3 [M1-8, M2-9], addon #9). Gated by
 * `emergency_disaster_mode` (admin CRUD, compliance/vendor_manager/volunteer
 * read-only per the matrix). The service writes its own audit row on POST, so
 * this route does not double-audit.
 */
export const GET = defineRoute({ feature: "emergency_disaster_mode", action: "read" }, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("emergency_overrides")
        .select(
            "id, config_key, override_value, previous_value, reason, activated_by, activated_at, expires_at, reverted_at, reverted_by, is_active"
        )
        .order("activated_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);

    return { overrides: data ?? [] };
});

export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "create" },
    async ({ req, user }) => {
        const body = await parseBody(req, emergencyOverrideActivateRequestSchema);

        const result = await activateEmergencyOverride(
            { configKey: body.config_key, overrideValue: body.override_value, reason: body.reason ?? null },
            user
        );
        return { ...result };
    }
);
