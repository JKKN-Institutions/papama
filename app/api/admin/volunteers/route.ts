import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
    volunteerActionRequestSchema,
    volunteerCreateRequestSchema,
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
export const GET = defineRoute({ feature: "volunteer_management", action: "read" }, async () => {
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
 * POST /api/admin/volunteers — admin-initiated volunteer onboarding (token-flow §3).
 *
 * Closes the onboarding gap: previously a `volunteers` row + a way to log in could
 * not both come to exist, so the volunteer portal was unreachable. This mirrors the
 * vendor self-register flow (app/api/vendor/register/route.ts) but is ADMIN-gated
 * (token_distribution/create — admin, scope all) and produces an immediately-usable
 * account, in one atomic shot on the service-role client with rollback:
 *   1. admin.auth.admin.createUser({ email, password, email_confirm: true }) — the
 *      handle_new_user trigger provisions users(role 'donor') + donors + donor_credits.
 *   2. flip users.role → 'volunteer', clear donor_id, and tear down the unused donor
 *      rows the trigger created (credits first: FK order).
 *   3. insert the linked volunteers row (status 'active').
 *   4. audit volunteer.create (actor = the admin).
 * On any failure after the auth user is made, the auth user is deleted so the email
 * can be retried cleanly. NO migration needed — volunteers table + user_role enum
 * already exist, so this works immediately.
 */
export const POST = defineRoute(
    { feature: "volunteer_management", action: "create" },
    async ({ req, audit }) => {
        const body = await parseBody(req, volunteerCreateRequestSchema);
        const admin = createAdminClient();

        // 1. Create the auth user (email pre-confirmed; volunteers are admin-managed,
        //    not gated by email confirmation).
        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
            user_metadata: { full_name: body.full_name, account_type: "volunteer" },
        });

        if (createError || !created?.user) {
            const msg = createError?.message ?? "could not create the account";
            const exists = /already|registered|exists/i.test(msg);
            throw new BadRequestError(
                exists
                    ? "an account with this email already exists — choose another email"
                    : msg
            );
        }

        const userId = created.user.id;

        try {
            // 2. Promote donor → volunteer and unlink the donor profile the trigger made.
            const { error: roleError } = await admin
                .from("users")
                .update({ role: "volunteer", donor_id: null })
                .eq("id", userId);
            if (roleError) throw new Error(roleError.message);

            // Tear down the now-unused donor rows (credits first: FK order).
            const { data: donorRow } = await admin
                .from("donors")
                .select("id")
                .eq("user_id", userId)
                .maybeSingle();
            if (donorRow) {
                const donorId = (donorRow as { id: string }).id;
                const { error: credErr } = await admin
                    .from("donor_credits")
                    .delete()
                    .eq("donor_id", donorId);
                if (credErr) throw new Error(credErr.message);
                const { error: donorErr } = await admin.from("donors").delete().eq("id", donorId);
                if (donorErr) throw new Error(donorErr.message);
            }

            // 3. Insert the linked volunteer profile (active immediately).
            const { data: volunteer, error: volunteerError } = await admin
                .from("volunteers")
                .insert({
                    user_id: userId,
                    full_name: body.full_name,
                    phone: body.phone ?? null,
                    email: body.email,
                    status: "active",
                })
                .select("id, status")
                .single();
            if (volunteerError || !volunteer) {
                throw new Error(volunteerError?.message ?? "failed to create volunteer");
            }
            const v = volunteer as { id: string; status: string };

            // 4. Audit the admin-initiated onboarding.
            await audit({
                action: "volunteer.create",
                entity_table: "volunteers",
                entity_id: v.id,
                summary: `admin onboarded volunteer '${body.full_name}' (${body.email})`,
                metadata: { volunteer_id: v.id, user_id: userId, email: body.email },
            });

            return { id: v.id, user_id: userId, status: v.status };
        } catch (innerErr) {
            // Roll back the half-created auth user so the email can be retried cleanly.
            await admin.auth.admin.deleteUser(userId).catch(() => {});
            throw innerErr;
        }
    }
);

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
    approve: { to: "active", from: ["pending"], verb: "volunteer.approve" },
    reject: { to: "rejected", from: ["pending"], verb: "volunteer.reject" },
    suspend: { to: "suspended", from: ["active"], verb: "volunteer.suspend" },
    deactivate: { to: "inactive", from: ["active"], verb: "volunteer.deactivate" },
    activate: { to: "active", from: ["suspended", "inactive"], verb: "volunteer.activate" },
};

export const PATCH = defineRoute(
    { feature: "volunteer_management", action: "update" },
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
