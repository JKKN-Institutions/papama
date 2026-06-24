import { z } from "zod";

import { requireAppUser } from "@/lib/auth";
import { BadRequestError, parseBody, toErrorResponse } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit";

/**
 * POST /api/vendor/register — self-service vendor onboarding.
 *
 * HAND-ROLLED (not defineRoute): the caller is still role 'donor' at this point
 * (every signup is provisioned as a donor by the `handle_new_user` trigger), so
 * there is no vendor matrix cell to gate on yet. We authenticate with
 * requireAppUser, run the conversion ourselves on the service-role client
 * (`vendors_insert` RLS is staff-only, so the session client cannot insert), and
 * map errors through the shared toErrorResponse so the body shape matches every
 * other route.
 *
 * Conversion (donor → vendor), all on the admin client:
 *   1. reject if the user already owns a vendor;
 *   2. FRESH-ACCOUNT guard — reject if the donor account has any real activity
 *      (donations, tokens, or a positive credit balance), so we never silently
 *      delete a donor with history;
 *   3. flip users.role → 'vendor' and clear users.donor_id;
 *   4. delete donor_credits then donors (FK order: credits reference the donor);
 *   5. insert the vendors row (status/kyc 'pending');
 *   6. audit `vendor.register`.
 */
const vendorRegisterSchema = z.object({
    name: z.string().trim().min(1, "name is required"),
    legal_name: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    pincode: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    emergency_contact: z.string().trim().optional(),
    fssai_license: z.string().trim().optional(),
    gst_number: z.string().trim().optional(),
    bank_account_name: z.string().trim().optional(),
    bank_account_number: z.string().trim().optional(),
    bank_ifsc: z.string().trim().optional(),
    geo_lat: z.number().optional(),
    geo_lng: z.number().optional(),
});

export async function POST(req: Request) {
    try {
        const user = await requireAppUser();
        const body = await parseBody(req as never, vendorRegisterSchema);

        const admin = createAdminClient();

        // 1. Already a vendor?
        const { data: existingVendor } = await admin
            .from("vendors")
            .select("id")
            .eq("owner_id", user.id)
            .maybeSingle();
        if (existingVendor) {
            throw new BadRequestError("already a vendor");
        }

        const donorId = user.donor_id;

        // 2. FRESH-ACCOUNT guard — refuse to convert a donor with real activity.
        if (donorId) {
            const [{ count: donationCount }, { count: tokenCount }, { data: creditRow }] =
                await Promise.all([
                    admin
                        .from("donations")
                        .select("id", { count: "exact", head: true })
                        .eq("donor_id", donorId),
                    admin
                        .from("tokens")
                        .select("id", { count: "exact", head: true })
                        .eq("donor_id", donorId),
                    admin
                        .from("donor_credits")
                        .select("balance_inr")
                        .eq("donor_id", donorId)
                        .maybeSingle(),
                ]);

            const balance = Number(creditRow?.balance_inr ?? 0);
            if ((donationCount ?? 0) > 0 || (tokenCount ?? 0) > 0 || balance > 0) {
                throw new BadRequestError(
                    "this email is already used as a donor account; register a vendor with a different email"
                );
            }
        }

        // 3. Flip the role and unlink the donor profile.
        const { error: roleError } = await admin
            .from("users")
            .update({ role: "vendor", donor_id: null })
            .eq("id", user.id);
        if (roleError) throw new Error(roleError.message);

        // 4. Tear down the now-unused donor profile (credits first: FK order).
        if (donorId) {
            const { error: creditDelError } = await admin
                .from("donor_credits")
                .delete()
                .eq("donor_id", donorId);
            if (creditDelError) throw new Error(creditDelError.message);

            const { error: donorDelError } = await admin
                .from("donors")
                .delete()
                .eq("id", donorId);
            if (donorDelError) throw new Error(donorDelError.message);
        }

        // 5. Create the vendor outlet (pending review + pending KYC).
        const { data: vendor, error: vendorError } = await admin
            .from("vendors")
            .insert({
                owner_id: user.id,
                name: body.name,
                legal_name: body.legal_name ?? null,
                address: body.address ?? null,
                city: body.city ?? null,
                pincode: body.pincode ?? null,
                phone: body.phone ?? null,
                email: body.email ?? null,
                emergency_contact: body.emergency_contact ?? null,
                fssai_license: body.fssai_license ?? null,
                gst_number: body.gst_number ?? null,
                bank_account_name: body.bank_account_name ?? null,
                bank_account_number: body.bank_account_number ?? null,
                bank_ifsc: body.bank_ifsc ?? null,
                geo_lat: body.geo_lat ?? null,
                geo_lng: body.geo_lng ?? null,
                status: "pending",
                kyc_status: "pending",
            })
            .select("id, status")
            .single();

        if (vendorError || !vendor) {
            throw new Error(vendorError?.message ?? "failed to create vendor");
        }

        // 6. Audit the conversion. The actor's role snapshot is still 'donor'
        //    (the value on the AppUser we authenticated), which faithfully records
        //    who they were at the moment of self-registration.
        await writeAuditLog({
            actor: user,
            action: "vendor.register",
            entity_table: "vendors",
            entity_id: vendor.id as string,
            summary: `self-registered vendor '${body.name}' (donor → vendor)`,
            metadata: {
                converted_from_donor_id: donorId,
                vendor_id: vendor.id,
            },
        });

        return new Response(
            JSON.stringify({ vendor_id: vendor.id, status: vendor.status }),
            { status: 200, headers: { "content-type": "application/json" } }
        );
    } catch (err) {
        return toErrorResponse(err);
    }
}
