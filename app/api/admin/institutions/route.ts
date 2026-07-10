import { defineRoute, parseBody, parseQuery } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
    bulkAllocateToInstitution,
    institutionRedemptionReport,
} from "@/lib/services/institution";
import {
    institutionAllocateRequestSchema,
    type InstitutionAllocationResponse,
} from "@/lib/validation/schemas";
import { z } from "zod";

/**
 * Institution module (addon #11) — bulk token allocation toward partner
 * institutions + per-institution redemption reporting.
 *
 * Gated by `audit_reports` (admin manages, compliance reads) — matches the
 * institution_token_allocations RLS (admin write, admin+compliance read), the
 * same altitude as the sibling NGO-partner registry.
 */

const reportQuerySchema = z.object({
    report: z.literal("redemption"),
    ngo_partner_id: z.string().uuid(),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/admin/institutions
 *   - default: list bulk-allocation ledger rows (newest first), institution name joined.
 *   - ?report=redemption&ngo_partner_id=…[&start=&end=]: per-institution meals-served report.
 */
export const GET = defineRoute({ feature: "institution_bulk_allocation", action: "read" }, async ({ req, user }) => {
    const url = new URL(req.url);

    if (url.searchParams.get("report") === "redemption") {
        const q = parseQuery(url.searchParams, reportQuerySchema);
        const admin = createAdminClient();
        const report = await institutionRedemptionReport(
            admin,
            q.ngo_partner_id,
            { start: q.start ?? null, end: q.end ?? null },
            user
        );
        return { report };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("institution_token_allocations")
        .select(
            "id, ngo_partner_id, token_count, allocated_by, status, notes, created_at, updated_at, ngo_partners(name)"
        )
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const allocations: InstitutionAllocationResponse[] = (data ?? []).map((a) => {
        const partner = a.ngo_partners as { name: string } | { name: string }[] | null;
        const institution_name = Array.isArray(partner)
            ? partner[0]?.name ?? null
            : partner?.name ?? null;
        return {
            id: a.id,
            ngo_partner_id: a.ngo_partner_id,
            institution_name,
            token_count: a.token_count,
            allocated_by: a.allocated_by,
            status: a.status,
            notes: a.notes,
            created_at: a.created_at,
            updated_at: a.updated_at,
        };
    });

    return { allocations, total: allocations.length };
});

/**
 * POST /api/admin/institutions — bulk-allocate `count` pooled tokens to an
 * institution. Atomic via the allocate_pooled_tokens_to_institution RPC
 * (cap-checked against institution_bulk_allocation_max). Admin only. Audited.
 */
export const POST = defineRoute(
    { feature: "institution_bulk_allocation", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, institutionAllocateRequestSchema);
        const admin = createAdminClient();

        const { allocationId, movedCount } = await bulkAllocateToInstitution(
            admin,
            body.ngo_partner_id,
            body.count,
            user,
            body.notes ?? null
        );

        await audit({
            action: "institution.allocate",
            entity_table: "institution_token_allocations",
            entity_id: allocationId,
            summary: `bulk-allocated ${movedCount} token(s) to institution ${body.ngo_partner_id}`,
            metadata: {
                ngo_partner_id: body.ngo_partner_id,
                requested: body.count,
                moved: movedCount,
                allocation_id: allocationId,
            },
        });

        return { ok: true, id: allocationId, granted_count: movedCount };
    }
);
