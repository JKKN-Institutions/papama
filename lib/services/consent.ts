import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConsentType } from "@/lib/types/enums";

/**
 * Consent management (addon2 A7) — records a subject's privacy/communication
 * consent into consent_records, versioned so a policy change can require
 * re-consent. Insert runs through whatever client the caller passes: donors use
 * the session client (RLS `consent_records_insert_own_donor`); other subjects are
 * captured server-side with the service-role client at registration.
 */

/** Current privacy-policy version. Bump to force re-consent on a policy change. */
export const CURRENT_CONSENT_VERSION = "v1";

export interface RecordConsentArgs {
    subjectType: "donor" | "beneficiary" | "volunteer" | "vendor";
    subjectId: string;
    consentType: ConsentType;
    version?: string;
}

/**
 * Record a consent grant. Idempotent for an active (non-revoked) consent of the
 * same (subject, type, version) — returns the existing row id instead of writing
 * a duplicate.
 */
export async function recordConsent(
    client: SupabaseClient,
    { subjectType, subjectId, consentType, version = CURRENT_CONSENT_VERSION }: RecordConsentArgs
): Promise<string> {
    const { data: existing } = await client
        .from("consent_records")
        .select("id")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .eq("consent_type", consentType)
        .eq("version", version)
        .is("revoked_at", null)
        .maybeSingle();
    if (existing) return existing.id as string;

    const { data, error } = await client
        .from("consent_records")
        .insert({
            subject_type: subjectType,
            subject_id: subjectId,
            consent_type: consentType,
            version,
        })
        .select("id")
        .single();
    if (error) throw new Error(error.message);
    return data.id as string;
}

/** Whether an active (non-revoked) consent exists for the current version. */
export async function hasActiveConsent(
    client: SupabaseClient,
    subjectType: RecordConsentArgs["subjectType"],
    subjectId: string,
    consentType: ConsentType,
    version = CURRENT_CONSENT_VERSION
): Promise<boolean> {
    const { data } = await client
        .from("consent_records")
        .select("id")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .eq("consent_type", consentType)
        .eq("version", version)
        .is("revoked_at", null)
        .maybeSingle();
    return !!data;
}
