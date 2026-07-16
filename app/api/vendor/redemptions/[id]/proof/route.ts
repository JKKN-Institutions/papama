import { BadRequestError, NotFoundError, defineRoute } from "@/lib/api/handler";
import { resolveVendorId } from "@/lib/vendor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePhash, findDuplicateProof, recordMediaFingerprint } from "@/lib/services/proofIntegrity";
import { flagFraud } from "@/lib/services/fraud";

/**
 * POST /api/vendor/redemptions/[id]/proof — submit proof of service (PROOF-1..4).
 *
 * Gated by `proof_of_service/create` (scope own). The vendor uploads the proof
 * IMAGES (plate photo + receipt) for a redemption they own; this stores the
 * binaries in the private `vendor-proofs` Storage bucket under a
 * `<vendor_id>/<redemption_id>/...` prefix, records the resulting object paths,
 * and marks proof_status='submitted' — payment STAYS 'locked'. An admin then
 * reviews the proof (PATCH /api/admin/proofs/[id]/decide); only an APPROVE
 * releases the payment so the redemption can roll into a settlement. Ownership is
 * verified server-side (the redemption's vendor_id must match the resolved
 * vendor) — a vendor cannot submit proof against someone else's redemption.
 *
 * PROOF GATING (closes the audit gap): BOTH the plate photo and the receipt are
 * REQUIRED. An empty / partial submission is rejected with a 400 and the payment
 * stays locked — no proof, no release. The binaries are accepted as
 * multipart/form-data (`photo`, `receipt`); we never trust client-supplied refs.
 *
 * Storage lives in the `vendor-proofs` bucket (proposed in m26). Until that
 * migration is applied the upload fails; we surface that as a clear 400
 * ("apply m26") rather than a 500.
 */
const BUCKET = "vendor-proofs";

export const POST = defineRoute<{ id: string }>(
    { feature: "proof_of_service", action: "create", scope: "own" },
    async ({ req, user, params, audit }) => {
        const redemptionId = params.id;

        let form: FormData;
        try {
            form = await req.formData();
        } catch {
            throw new BadRequestError(
                "expected multipart/form-data with 'photo' and 'receipt' image fields"
            );
        }

        const photo = form.get("photo");
        const receipt = form.get("receipt");

        // Proof gate: both images are mandatory before any payment is released.
        if (!(photo instanceof File) || photo.size === 0) {
            throw new BadRequestError("a plate photo image is required to release payment");
        }
        if (!(receipt instanceof File) || receipt.size === 0) {
            throw new BadRequestError("a receipt image is required to release payment");
        }

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const { data: existing } = await admin
            .from("token_redemptions")
            .select("id, vendor_id, payment_status, proof_status")
            .eq("id", redemptionId)
            .maybeSingle();

        const redemption = existing as
            | { id: string; vendor_id: string; payment_status: string; proof_status: string | null }
            | null;

        // Not found OR not this vendor's → 404 (never leak another vendor's row).
        if (!redemption || redemption.vendor_id !== vendorId) {
            throw new NotFoundError("redemption not found");
        }

        // Proof may only be submitted against a LOCKED redemption. Reject if it is
        // already 'released' (approved), 'held' (admin override), or 'failed'.
        if (redemption.payment_status !== "locked") {
            throw new BadRequestError(
                `payment is '${redemption.payment_status}', not locked — proof cannot be (re)submitted`
            );
        }
        // A proof already awaiting review must not be overwritten before the admin
        // decides. Re-upload is only allowed when there is no proof yet or the
        // previous one was REJECTED (the vendor is correcting it).
        if (redemption.proof_status === "submitted") {
            throw new BadRequestError(
                "proof already submitted and awaiting admin review"
            );
        }

        // Upload both binaries before touching payment_status. If either fails, the
        // payment stays locked.
        const prefix = `${vendorId}/${redemptionId}`;
        const photoPath = `${prefix}/plate-${Date.now()}`;
        const receiptPath = `${prefix}/receipt-${Date.now()}`;

        const photoUp = await admin.storage
            .from(BUCKET)
            .upload(photoPath, photo, { upsert: false, contentType: photo.type || "image/jpeg" });
        if (photoUp.error) {
            // Most likely the bucket does not exist yet (m24 unapplied).
            throw new BadRequestError("proof storage not configured (apply m26)");
        }

        const receiptUp = await admin.storage
            .from(BUCKET)
            .upload(receiptPath, receipt, {
                upsert: false,
                contentType: receipt.type || "image/jpeg",
            });
        if (receiptUp.error) {
            throw new BadRequestError("proof storage not configured (apply m26)");
        }

        // Perceptual hash of the plate photo (addon #10) — stored so future and
        // past proofs can be compared for the same photo being re-used across
        // redemptions. Computed from the bytes we already hold in memory.
        const photoPhash = computePhash(await photo.arrayBuffer());

        const nowIso = new Date().toISOString();
        const { data: submitted, error } = await admin
            .from("token_redemptions")
            .update({
                proof_photo_ref: photoPath,
                proof_receipt_ref: receiptPath,
                proof_photo_phash: photoPhash,
                proof_uploaded_at: nowIso,
                // Proof now goes to admin review; payment STAYS locked until approve.
                proof_status: "submitted",
                // Clear any prior rejection so a re-upload starts a fresh review.
                proof_reviewed_by: null,
                proof_reviewed_at: null,
                proof_review_note: null,
            })
            .eq("id", redemptionId)
            .eq("vendor_id", vendorId)
            // CAS: only submit while STILL locked — guards an admin hold landing
            // between the check above and this write.
            .eq("payment_status", "locked")
            .select("id")
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!submitted) {
            throw new BadRequestError(
                "payment was changed (held or already released) — proof not applied"
            );
        }

        await audit({
            action: "proof.submit",
            entity_table: "token_redemptions",
            entity_id: redemptionId,
            summary: `proof submitted (photo + receipt); awaiting admin review for redemption ${redemptionId}`,
            metadata: {
                proof_photo_ref: photoPath,
                proof_receipt_ref: receiptPath,
            },
        });

        // Durable fingerprint history (addon #12) — best-effort, never blocks the
        // upload. media_fingerprints is the evidence trail alongside the existing
        // proof_photo_phash scan below (which stays the live duplicate-detection
        // path); this row is what a future bill-fingerprint pass (#13, held) would
        // also write to.
        try {
            await recordMediaFingerprint(admin, {
                redemptionId,
                vendorId,
                type: "photo",
                hash: photoPhash,
            });
        } catch (e) {
            console.error("[proof] media fingerprint recording failed:", e);
        }

        // DUPLICATE-PROOF DETECTION (addon #10/#12) — best-effort, never blocks
        // the upload. Soft-skips entirely when proof_phash_dup_distance is unset.
        // If the plate photo matches an existing proof within the configured
        // Hamming distance, we (1) HOLD any settlement(s) already covering either
        // redemption so the suspect payout can't be released before review, and
        // (2) raise a `duplicate_media` fraud flag (spec §3.1 F-3 [M1-10] — the
        // enum value now exists; this replaces the old 'vendor_anomaly' reuse
        // workaround). The proof itself still goes to admin review; this only
        // adds guard-rails around the money.
        let duplicateProof = false;
        try {
            const match = await findDuplicateProof(photoPhash, admin, redemptionId);
            if (match) {
                duplicateProof = true;

                // Hold settlements covering either the new or the matched redemption.
                const { data: lines } = await admin
                    .from("settlement_line_items")
                    .select("settlement_id")
                    .in("redemption_id", [redemptionId, match.redemption_id]);
                const settlementIds = [
                    ...new Set(
                        ((lines ?? []) as { settlement_id: string }[]).map((l) => l.settlement_id)
                    ),
                ];
                if (settlementIds.length > 0) {
                    await admin
                        .from("vendor_settlements")
                        .update({
                            on_hold: true,
                            hold_note: `duplicate proof photo detected (redemption ${redemptionId} ~ ${match.redemption_id}, distance ${match.distance})`,
                        })
                        .in("id", settlementIds);
                }

                await flagFraud(admin, {
                    flag_type: "duplicate_media",
                    severity: "high",
                    detection_method: "pattern_analysis",
                    entity: {
                        kind: "redemption",
                        id: redemptionId,
                        vendor_id: vendorId,
                        matched_redemption_id: match.redemption_id,
                        media_type: "photo",
                    },
                    blocked: false,
                });

                await audit({
                    action: "proof.duplicate_detected",
                    entity_table: "token_redemptions",
                    entity_id: redemptionId,
                    summary: `duplicate proof photo detected: redemption ${redemptionId} matches ${match.redemption_id} (Hamming ${match.distance})`,
                    metadata: {
                        matched_redemption_id: match.redemption_id,
                        distance: match.distance,
                        held_settlements: settlementIds,
                    },
                });
            }
        } catch (e) {
            // Detection must not break a legitimate proof submission; log + move on.
            console.error("[proof] duplicate-detection failed:", e);
        }

        return {
            redemption_id: redemptionId,
            payment_status: "locked",
            proof_status: "submitted",
            duplicate_proof: duplicateProof,
        };
    }
);
