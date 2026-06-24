import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveVolunteerId } from "@/lib/volunteer/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/volunteer/requests — the signed-in volunteer asks for a number of
 * tokens to distribute (token-flow Path-B, step 1).
 *
 * Gated by `token_distribution/create` (scope own). The volunteer identity is
 * resolved server-side; a client-sent volunteer id is never trusted. The row is
 * always created `pending` — an admin decides it later via
 * /api/admin/volunteer-requests/[id]/decide. Insert runs on the service-role
 * client after the matrix check (RLS also permits the volunteer's own pending
 * insert, but we mirror the convert/redemption routes and use admin).
 *
 * GET /api/volunteer/requests — list this volunteer's own requests, newest
 * first, through the session (RLS) client so the volunteer only sees their own.
 */
const createSchema = z.object({
    requested_count: z.number().int().positive(),
});

export const POST = defineRoute(
    { feature: "token_distribution", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);

        const admin = createAdminClient();
        const volunteerId = await resolveVolunteerId(user, admin);
        if (!volunteerId) {
            throw new BadRequestError("no volunteer profile for this account");
        }

        const { data: request, error } = await admin
            .from("volunteer_token_requests")
            .insert({
                volunteer_id: volunteerId,
                requested_count: body.requested_count,
                status: "pending",
            })
            .select("id, status")
            .single();

        if (error || !request) {
            throw new Error(error?.message ?? "failed to create request");
        }
        const r = request as { id: string; status: string };

        await audit({
            action: "volunteer.request",
            entity_table: "volunteer_token_requests",
            entity_id: r.id,
            summary: `volunteer requested ${body.requested_count} tokens (pending)`,
            metadata: {
                volunteer_id: volunteerId,
                requested_count: body.requested_count,
            },
        });

        return { request_id: r.id, status: r.status };
    }
);

export const GET = defineRoute(
    { feature: "token_distribution", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("volunteer_token_requests")
            .select(
                "id, volunteer_id, requested_count, decided_count, status, notes, created_at, updated_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        return { requests: data ?? [], total: (data ?? []).length };
    }
);
