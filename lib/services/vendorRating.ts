import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { writeAuditLog } from "@/lib/services/audit";
import { getBoolean, getNumber } from "@/lib/system-config";

/**
 * Vendor rating / feedback service (addon #9).
 *
 * Beneficiary feedback lands in public.vendor_feedback; the aggregate trust
 * signals (rating_avg, feedback_count, complaint_count, quality_score) live on
 * the vendor row and are STAFF-ONLY (the guard_vendor_controlled_cols trigger
 * blocks vendors from moving them). Every function here therefore takes the
 * SERVICE-ROLE (admin) client and writes those guarded columns server-side.
 *
 * Auto-suspend is gated behind `vendor_auto_suspend_enabled` and only fires once
 * enough samples exist (`vendor_min_feedback_count`) AND a configured threshold
 * is breached (`vendor_min_rating` / `vendor_max_complaint_rate`). An unset
 * threshold SOFT-skips the rule — no invented value (AGENTS.md discipline).
 */

export interface RecordFeedbackInput {
    vendor_id: string;
    rating: number;
    redemption_id?: string | null;
    beneficiary_id?: string | null;
    comment?: string | null;
    is_complaint?: boolean;
}

/**
 * Insert one feedback row and bump the vendor's feedback/complaint counters, then
 * recompute the derived rating_avg + quality_score. Returns the new feedback id.
 */
export async function recordFeedback(
    admin: SupabaseClient,
    input: RecordFeedbackInput
): Promise<{ feedback_id: string }> {
    const isComplaint = input.is_complaint ?? false;

    const { data: inserted, error: insertErr } = await admin
        .from("vendor_feedback")
        .insert({
            vendor_id: input.vendor_id,
            redemption_id: input.redemption_id ?? null,
            beneficiary_id: input.beneficiary_id ?? null,
            rating: input.rating,
            comment: input.comment ?? null,
            is_complaint: isComplaint,
        })
        .select("id")
        .single();
    if (insertErr || !inserted) {
        throw new Error(insertErr?.message ?? "failed to record feedback");
    }

    // Bump counters from the authoritative feedback table (avoids drift if a
    // counter ever gets out of sync). Then recompute the derived scores.
    await recomputeQualityScore(input.vendor_id, admin);

    return { feedback_id: (inserted as { id: string }).id };
}

export interface QualitySummary {
    feedback_count: number;
    complaint_count: number;
    rating_avg: number | null;
    quality_score: number | null;
}

/**
 * Recompute rating_avg, feedback_count, complaint_count and quality_score from
 * the vendor_feedback rows and persist them on the vendor. quality_score is a
 * 0..100 index: the rating scaled to 100 minus a complaint-rate penalty.
 */
export async function recomputeQualityScore(
    vendorId: string,
    admin: SupabaseClient
): Promise<QualitySummary> {
    const { data: rows, error } = await admin
        .from("vendor_feedback")
        .select("rating, is_complaint")
        .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    const list = (rows as { rating: number; is_complaint: boolean }[] | null) ?? [];
    const feedbackCount = list.length;
    const complaintCount = list.filter((r) => r.is_complaint).length;
    const ratingAvg =
        feedbackCount > 0
            ? Math.round((list.reduce((s, r) => s + r.rating, 0) / feedbackCount) * 100) / 100
            : null;

    // quality index: rating on a 0..100 scale, less the complaint-rate penalty.
    const complaintRate = feedbackCount > 0 ? complaintCount / feedbackCount : 0;
    const qualityScore =
        ratingAvg == null
            ? null
            : Math.max(0, Math.round(((ratingAvg / 5) * 100 - complaintRate * 100) * 100) / 100);

    const { error: updateErr } = await admin
        .from("vendors")
        .update({
            rating_avg: ratingAvg,
            feedback_count: feedbackCount,
            complaint_count: complaintCount,
            quality_score: qualityScore,
            updated_at: new Date().toISOString(),
        })
        .eq("id", vendorId);
    if (updateErr) throw new Error(updateErr.message);

    return {
        feedback_count: feedbackCount,
        complaint_count: complaintCount,
        rating_avg: ratingAvg,
        quality_score: qualityScore,
    };
}

export interface AutoSuspendResult {
    suspended: boolean;
    reason: string;
}

/**
 * Suspend a vendor whose quality has fallen below the configured floor — but
 * ONLY when the feature is enabled, enough feedback exists, and a configured
 * threshold is actually breached. Every gate that is unset SOFT-skips (returns
 * suspended:false with the reason). Writes an audit row when it does suspend.
 */
export async function autoSuspendBelowThreshold(
    admin: SupabaseClient,
    vendorId: string
): Promise<AutoSuspendResult> {
    // Feature flag — off (or unset) means never auto-suspend.
    let enabled = false;
    try {
        enabled = await getBoolean("vendor_auto_suspend_enabled", admin as never);
    } catch {
        enabled = false;
    }
    if (!enabled) return { suspended: false, reason: "auto-suspend disabled" };

    // Minimum sample size before the rule applies (unset → skip, no guess).
    let minFeedback: number | null = null;
    try {
        minFeedback = await getNumber("vendor_min_feedback_count", admin as never);
    } catch {
        minFeedback = null;
    }
    if (minFeedback == null) {
        return { suspended: false, reason: "vendor_min_feedback_count unset — skipped" };
    }

    const { data: vendorRow, error } = await admin
        .from("vendors")
        .select("status, rating_avg, feedback_count, complaint_count, name")
        .eq("id", vendorId)
        .maybeSingle();
    if (error || !vendorRow) return { suspended: false, reason: "vendor not found" };
    const v = vendorRow as {
        status: string;
        rating_avg: number | null;
        feedback_count: number;
        complaint_count: number;
        name: string;
    };

    if (v.status !== "approved") {
        return { suspended: false, reason: `vendor not approved (${v.status})` };
    }
    if (v.feedback_count < minFeedback) {
        return {
            suspended: false,
            reason: `insufficient feedback (${v.feedback_count}/${minFeedback})`,
        };
    }

    // Either configured threshold breaching triggers suspension. Each unset
    // threshold simply does not contribute (no invented default).
    const reasons: string[] = [];

    let minRating: number | null = null;
    try {
        minRating = await getNumber("vendor_min_rating", admin as never);
    } catch {
        minRating = null;
    }
    if (minRating != null && v.rating_avg != null && v.rating_avg < minRating) {
        reasons.push(`rating ${v.rating_avg} < ${minRating}`);
    }

    let maxComplaintRate: number | null = null;
    try {
        maxComplaintRate = await getNumber("vendor_max_complaint_rate", admin as never);
    } catch {
        maxComplaintRate = null;
    }
    const complaintRate = v.feedback_count > 0 ? v.complaint_count / v.feedback_count : 0;
    if (maxComplaintRate != null && complaintRate > maxComplaintRate) {
        reasons.push(`complaint rate ${(complaintRate * 100).toFixed(0)}% > ${(maxComplaintRate * 100).toFixed(0)}%`);
    }

    if (reasons.length === 0) {
        return { suspended: false, reason: "within thresholds" };
    }

    const { error: suspendErr } = await admin
        .from("vendors")
        .update({ status: "suspended", updated_at: new Date().toISOString() })
        .eq("id", vendorId)
        .eq("status", "approved"); // race-guard: only flip an approved vendor
    if (suspendErr) throw new Error(suspendErr.message);

    const reason = reasons.join("; ");
    await writeAuditLog({
        actor: null, // system / automated action
        action: "vendor.auto_suspend",
        entity_table: "vendors",
        entity_id: vendorId,
        summary: `${v.name} auto-suspended: ${reason}`,
        metadata: {
            reason,
            rating_avg: v.rating_avg,
            feedback_count: v.feedback_count,
            complaint_count: v.complaint_count,
            min_rating: minRating,
            max_complaint_rate: maxComplaintRate,
            min_feedback_count: minFeedback,
        },
    });

    return { suspended: true, reason };
}
