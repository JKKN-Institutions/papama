import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/volunteer-requests — the admin queue of volunteer token
 * requests (token-flow Path-B allocation), newest first.
 *
 * Gated by `token_distribution/read` (scope all). Each row is joined to the
 * requesting volunteer's display name via a second lookup of volunteers.full_name
 * (no PostgREST embed, mirroring the two-query joins elsewhere). Runs on the
 * service-role client after the matrix check, since the admin reads across all
 * volunteers' requests.
 */
interface RequestRow {
    id: string;
    volunteer_id: string;
    requested_count: number;
    decided_count: number | null;
    status: string;
    created_at: string;
}

export const GET = defineRoute(
    { feature: "token_distribution", action: "read" },
    async () => {
        const admin = createAdminClient();

        const { data, error } = await admin
            .from("volunteer_token_requests")
            .select("id, volunteer_id, requested_count, decided_count, status, created_at")
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        const requests = (data ?? []) as RequestRow[];

        // Resolve volunteer display names in one lookup (no embed).
        const names = new Map<string, string>();
        const volunteerIds = [...new Set(requests.map((r) => r.volunteer_id))];
        if (volunteerIds.length > 0) {
            const { data: volunteers, error: volunteerError } = await admin
                .from("volunteers")
                .select("id, full_name")
                .in("id", volunteerIds);
            if (volunteerError) throw new Error(volunteerError.message);
            for (const v of (volunteers ?? []) as { id: string; full_name: string | null }[]) {
                names.set(v.id, v.full_name ?? "");
            }
        }

        const result = requests.map((r) => ({
            id: r.id,
            volunteer_id: r.volunteer_id,
            volunteer_name: names.get(r.volunteer_id) ?? "",
            requested_count: r.requested_count,
            decided_count: r.decided_count,
            status: r.status,
            created_at: r.created_at,
        }));

        return { requests: result, total: result.length };
    }
);
