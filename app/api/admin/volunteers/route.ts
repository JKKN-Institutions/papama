import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
    volunteerActionRequestSchema,
    type VolunteerResponse,
} from "@/lib/validation/schemas";

type VolunteerStatus = VolunteerResponse["status"];

/**
 * GET /api/admin/volunteers — volunteer registry (M09, token-flow §3).
 *
 * Gated by `token_distribution/read` (admin, compliance, vendor_manager;
 * volunteer own). `status` is text+CHECK in the DB (active|inactive|suspended);
 * the dedicated enum is a later slice. Newest first.
 */
export const GET = defineRoute({ feature: "token_distribution", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("volunteers")
        .select("id, user_id, full_name, phone, email, status, created_at, updated_at")
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const volunteers: VolunteerResponse[] = (data ?? []).map((v) => ({
        id: v.id,
        user_id: v.user_id,
        full_name: v.full_name,
        phone: v.phone,
        email: v.email,
        status: v.status,
        created_at: v.created_at,
        updated_at: v.updated_at,
    }));

    return { volunteers, total: volunteers.length };
});

/**
 * PATCH /api/admin/volunteers — admin registry-status control (M09).
 *
 * Gated by `token_distribution/update` — admin only. State machine: suspend
 * (active→suspended), deactivate (active→inactive), activate (suspended|inactive
 * →active). Illegal transition → 400, missing → 404. Audited.
 *
 * Out of scope here: token allocation/grant (3a/3b) and the
 * max_tokens_per_volunteer concurrent limit — those mutate the tokens table and
 * land with the token-flow slice (see docs/implementation-plan.md, Phase C).
 */
type VolunteerActionRule = {
    to: VolunteerStatus;
    from: ReadonlyArray<VolunteerStatus>;
    verb: string;
};

const VOLUNTEER_ACTION_RULES: Record<string, VolunteerActionRule> = {
    suspend: { to: "suspended", from: ["active"], verb: "volunteer.suspend" },
    deactivate: { to: "inactive", from: ["active"], verb: "volunteer.deactivate" },
    activate: { to: "active", from: ["suspended", "inactive"], verb: "volunteer.activate" },
};

export const PATCH = defineRoute(
    { feature: "token_distribution", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, volunteerActionRequestSchema);
        const rule = VOLUNTEER_ACTION_RULES[body.action];

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("volunteers")
            .select("id, full_name, status")
            .eq("id", body.volunteer_id)
            .single();

        if (fetchError || !data) throw new NotFoundError("volunteer not found");
        const volunteer = data as { id: string; full_name: string | null; status: VolunteerStatus };

        if (!rule.from.includes(volunteer.status)) {
            throw new BadRequestError(
                `cannot '${body.action}' a volunteer whose status is '${volunteer.status}'`
            );
        }

        const { error: updateError } = await admin
            .from("volunteers")
            .update({ status: rule.to, updated_at: new Date().toISOString() })
            .eq("id", body.volunteer_id);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: rule.verb,
            entity_table: "volunteers",
            entity_id: body.volunteer_id,
            summary: `${volunteer.full_name ?? "volunteer"}: ${volunteer.status} → ${rule.to}${
                body.reason ? ` (${body.reason})` : ""
            }`,
            metadata: { from: volunteer.status, to: rule.to, reason: body.reason ?? null },
        });

        return { ok: true, id: body.volunteer_id, status: rule.to };
    }
);
