import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { CURRENT_CONSENT_VERSION, recordConsent } from "@/lib/services/consent";
import { createClient } from "@/lib/supabase/server";
import { CONSENT_TYPES } from "@/lib/types/enums";

/**
 * Donor consent capture (addon2 A7). A signed-in donor records their own consent
 * (data-privacy / communications). Runs on the SESSION client so RLS
 * (`consent_records_insert_own_donor`) enforces subject_id = the caller's donor.
 * Gated by donor_donation_credit/create (scope own) — donor account management.
 */

const postSchema = z
    .object({ consent_type: z.enum(CONSENT_TYPES).default("data_privacy") })
    .strict();

export const POST = defineRoute(
    { feature: "donor_donation_credit", action: "create", scope: "own" },
    async ({ req, user }) => {
        if (!user.donor_id) throw new BadRequestError("no donor profile for this account");
        const body = await parseBody(req, postSchema);
        const supabase = await createClient();

        const id = await recordConsent(supabase, {
            subjectType: "donor",
            subjectId: user.donor_id,
            consentType: body.consent_type,
        });

        return { ok: true, consent_id: id, version: CURRENT_CONSENT_VERSION };
    }
);

export const GET = defineRoute(
    { feature: "donor_donation_credit", action: "read", scope: "own" },
    async ({ user }) => {
        if (!user.donor_id) return { consents: [] };
        const supabase = await createClient();
        const { data } = await supabase
            .from("consent_records")
            .select("consent_type, version, granted_at, revoked_at")
            .eq("subject_type", "donor")
            .eq("subject_id", user.donor_id)
            .order("granted_at", { ascending: false });
        return { consents: data ?? [] };
    }
);
