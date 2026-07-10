import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    corporateCsrProfileRequestSchema,
    type CorporateCsrProfileResponse,
} from "@/lib/validation/schemas";

/**
 * GET + POST /api/donor/csr — the signed-in donor's corporate CSR profile
 * (addon #7). This BRANCHES the donor into a corporate donor by creating/updating
 * a corporate_csr_profiles row (one per donor); donations/credit/campaigns are
 * unchanged and reused.
 *
 * GET gated by `donor_donation_credit/read`, POST by `.../update`, both scope
 * own. Donor identity is resolved server-side (never trusted from the client);
 * the write runs on the service-role client AFTER the matrix check.
 */

const PROFILE_COLUMNS =
    "id, donor_id, company_name, cin, registration_number, csr_focus_area, ngo_partner_id, created_at, updated_at";

export const GET = defineRoute(
    { feature: "csr_module", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const { data, error } = await admin
            .from("corporate_csr_profiles")
            .select(PROFILE_COLUMNS)
            .eq("donor_id", donorId)
            .maybeSingle();
        if (error) throw new Error(error.message);

        return { profile: (data as CorporateCsrProfileResponse | null) ?? null };
    }
);

export const POST = defineRoute(
    { feature: "csr_module", action: "update", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, corporateCsrProfileRequestSchema);

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        // Upsert on the unique donor_id: creating or editing the same profile.
        const { data, error } = await admin
            .from("corporate_csr_profiles")
            .upsert(
                {
                    donor_id: donorId,
                    company_name: body.company_name,
                    cin: body.cin ?? null,
                    registration_number: body.registration_number ?? null,
                    csr_focus_area: body.csr_focus_area ?? null,
                    ngo_partner_id: body.ngo_partner_id ?? null,
                },
                { onConflict: "donor_id" }
            )
            .select(PROFILE_COLUMNS)
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to save CSR profile");

        const profile = data as CorporateCsrProfileResponse;
        await audit({
            action: "donor.csr.upsert",
            entity_table: "corporate_csr_profiles",
            entity_id: profile.id,
            summary: `donor registered/updated corporate CSR profile '${body.company_name}'`,
            metadata: { company_name: body.company_name },
        });

        return { ok: true, profile };
    }
);
