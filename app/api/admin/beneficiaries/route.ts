import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { BeneficiaryResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/beneficiaries — approved-beneficiary registry (contract §6).
 *
 * Thin read gated by `beneficiary_registration/read`. Privacy-first: the raw
 * `face_hash`/`aadhaar_hash` are NEVER returned — only the boolean presence flags
 * `face_hash_valid` / `aadhaar_linked`. `status` is the record-state enum
 * (active|suspended|blocked) from the `beneficiaries` table; the pending-approval
 * queue lives in `beneficiary_registrations` (separate route).
 */
export const GET = defineRoute(
    { feature: "beneficiary_registration", action: "read" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("beneficiaries")
            .select("id, category, status, eligibility_status, aadhaar_hash, face_hash, created_at")
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        const beneficiaries: BeneficiaryResponse[] = (data ?? []).map((b) => ({
            beneficiary_id: b.id,
            category: b.category,
            status: b.status,
            eligibility: b.eligibility_status,
            aadhaar_linked: b.aadhaar_hash != null,
            face_hash_valid: b.face_hash != null,
            registered_at: b.created_at,
        }));

        return { beneficiaries, total: beneficiaries.length };
    }
);
