import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getNumber } from "@/lib/system-config";
import { embeddingFingerprint, toVectorLiteral } from "@/lib/face/embedding";
import { faceCaptureSchema } from "@/lib/validation/schemas";

/**
 * Volunteer-assisted beneficiary registration (owner-scope §3 / client Q16 — a
 * volunteer may *assist* registration but NOT approve it; matrix.ts grants
 * `beneficiary_registration` create+read with the "assist" cap).
 *
 * POST — submit a registration on a beneficiary's behalf; lands as `pending`
 *   with submitted_by = the volunteer. Approval (which creates the eligible
 *   `beneficiaries` row) remains admin-only via the admin decide route.
 * GET  — list ONLY this volunteer's own submissions. The session (RLS) client
 *   scopes to `submitted_by = auth.uid()` via the `registrations_select_own`
 *   policy, so a volunteer never sees other submitters' rows. Privacy-safe:
 *   raw face/aadhaar hashes are never returned, only presence flags.
 *
 * Mirrors the admin route's insert shape; the write runs on the service-role
 * client after the matrix check (consistent with the other volunteer routes).
 */
const createSchema = z.object({
    full_name: z.string().trim().max(120).optional(),
    category: z.enum(["pregnant_women", "patient", "disability", "disaster_affected"]),
    /** On-device face capture (preferred): embedding + liveness — parity with the admin route. */
    face_capture: faceCaptureSchema.optional(),
    /** Legacy manual face_hash, kept for back-compat / fallback. */
    face_hash: z.string().trim().min(1).optional(),
    aadhaar_hash: z.string().trim().min(1).optional(),
    contact: z.string().trim().max(120).optional(),
    location_hint: z.string().trim().max(200).optional(),
    document_refs: z.array(z.string()).optional(),
});

export const GET = defineRoute(
    { feature: "beneficiary_registration", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("beneficiary_registrations")
            .select(
                "id, full_name, category, contact, location_hint, registration_status, face_hash, aadhaar_hash, document_refs, beneficiary_id, review_notes, created_at"
            )
            .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);

        const registrations = (data ?? []).map((r) => ({
            id: r.id,
            full_name: r.full_name,
            category: r.category,
            contact: r.contact,
            location_hint: r.location_hint,
            status: r.registration_status,
            face_hash_present: r.face_hash != null,
            aadhaar_present: r.aadhaar_hash != null,
            document_count: Array.isArray(r.document_refs) ? r.document_refs.length : 0,
            beneficiary_id: r.beneficiary_id,
            review_notes: r.review_notes,
            created_at: r.created_at,
        }));
        return { registrations, total: registrations.length };
    }
);

export const POST = defineRoute(
    { feature: "beneficiary_registration", action: "create" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);
        const admin = createAdminClient();

        // On-device face capture (preferred): gate liveness, then store the embedding —
        // identical handling to app/api/admin/beneficiary-registrations/route.ts so an
        // assisted enrolment never silently drops the vector. Legacy `face_hash` is
        // derived from the embedding so presence flags keep working.
        let faceEmbedding: string | null = null;
        let faceHash: string | null = body.face_hash ?? null;
        if (body.face_capture) {
            const minLiveness = await getNumber("face_liveness_min", admin as never).catch(() => 0);
            if (body.face_capture.liveness < minLiveness) {
                throw new BadRequestError(
                    "face capture failed the liveness/anti-spoof check — retake in good lighting"
                );
            }
            faceEmbedding = toVectorLiteral(body.face_capture.embedding);
            faceHash = body.face_hash ?? embeddingFingerprint(body.face_capture.embedding);
        }

        const { data, error } = await admin
            .from("beneficiary_registrations")
            .insert({
                full_name: body.full_name ?? null,
                category: body.category,
                face_hash: faceHash,
                face_embedding: faceEmbedding,
                aadhaar_hash: body.aadhaar_hash ?? null,
                contact: body.contact ?? null,
                location_hint: body.location_hint ?? null,
                document_refs: body.document_refs ?? [],
                submitted_by: user.id,
            })
            .select("id")
            .single();
        if (error || !data) throw new Error(error?.message ?? "failed to submit registration");
        const id = (data as { id: string }).id;

        await audit({
            action: "beneficiary.register",
            entity_table: "beneficiary_registrations",
            entity_id: id,
            summary: `volunteer-assisted a ${body.category} beneficiary registration`,
            metadata: { category: body.category, assisted: true },
        });

        return { id, status: "pending" };
    }
);
