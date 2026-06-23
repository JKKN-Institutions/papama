import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { donorProfilePatchSchema } from "@/lib/validation/schemas";

/**
 * GET + PATCH /api/donor/profile — the signed-in donor reads/edits their own
 * profile (name + 80G PAN seam, donors.pan_number / client Q5).
 *
 * GET is gated by `donor_donation_credit/read`, PATCH by `.../update`, both
 * scope own. Donor identity is resolved server-side via resolveDonorId (never
 * trusted from the client); the write runs on the service-role client AFTER the
 * matrix check. PAN is normalized (trim + uppercase; empty → null) and, when
 * present, must match the canonical PAN format.
 */

/** Indian PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F). */
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Trim + uppercase a PAN; empty/null → null; else validate the format. */
function normalizePan(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const value = raw.trim().toUpperCase();
    if (value === "") return null;
    if (!PAN_PATTERN.test(value)) {
        throw new BadRequestError("Enter a valid PAN (e.g. ABCDE1234F)");
    }
    return value;
}

export const GET = defineRoute(
    { feature: "donor_donation_credit", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const { data, error } = await admin
            .from("donors")
            .select("name, pan_number")
            .eq("id", donorId)
            .maybeSingle();
        if (error) throw new Error(error.message);

        return {
            name: (data?.name as string | null) ?? null,
            pan_number: (data?.pan_number as string | null) ?? null,
        };
    }
);

export const PATCH = defineRoute(
    { feature: "donor_donation_credit", action: "update", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, donorProfilePatchSchema);

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const update: { name?: string; pan_number?: string | null } = {};
        if (body.full_name !== undefined) update.name = body.full_name;
        if (body.pan_number !== undefined) update.pan_number = normalizePan(body.pan_number);

        const { data, error } = await admin
            .from("donors")
            .update(update)
            .eq("id", donorId)
            .select("name, pan_number")
            .maybeSingle();
        if (error) throw new Error(error.message);

        await audit({
            action: "donor.profile.update",
            entity_table: "donors",
            entity_id: donorId,
            summary: "donor updated their profile",
            metadata: {
                name_changed: body.full_name !== undefined,
                pan_changed: body.pan_number !== undefined,
            },
        });

        return {
            name: (data?.name as string | null) ?? null,
            pan_number: (data?.pan_number as string | null) ?? null,
        };
    }
);
