import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/vendor-feedback — feedback rows + per-vendor quality summary
 * for the admin console (addon #9).
 *
 * Gated by `vendor_management/read` (admin, compliance, vendor_manager, volunteer
 * per the matrix; the /admin layout already restricts the console to staff). Runs
 * on the session (RLS) client — the vendor_feedback_select_staff policy scopes
 * reads to admin/compliance/vendor_manager as defense-in-depth.
 */
interface FeedbackRow {
    id: string;
    vendor_id: string;
    rating: number;
    comment: string | null;
    is_complaint: boolean;
    created_at: string;
    vendors: { name: string | null } | { name: string | null }[] | null;
}

export const GET = defineRoute({ feature: "quality_feedback_complaints_inspections", action: "read" }, async () => {
    const supabase = await createClient();

    const [{ data: feedbackData, error: feedbackErr }, { data: vendorData, error: vendorErr }] =
        await Promise.all([
            supabase
                .from("vendor_feedback")
                .select("id, vendor_id, rating, comment, is_complaint, created_at, vendors(name)")
                .order("created_at", { ascending: false })
                .limit(500),
            supabase
                .from("vendors")
                .select("id, name, status, rating_avg, feedback_count, complaint_count, quality_score")
                .order("feedback_count", { ascending: false }),
        ]);

    if (feedbackErr) throw new Error(feedbackErr.message);
    if (vendorErr) throw new Error(vendorErr.message);

    const feedback = ((feedbackData as FeedbackRow[] | null) ?? []).map((f) => {
        const v = Array.isArray(f.vendors) ? f.vendors[0] : f.vendors;
        return {
            id: f.id,
            vendor_id: f.vendor_id,
            vendor_name: v?.name ?? null,
            rating: f.rating,
            comment: f.comment,
            is_complaint: f.is_complaint,
            created_at: f.created_at,
        };
    });

    const vendors = ((vendorData as Record<string, unknown>[] | null) ?? []).map((v) => ({
        vendor_id: v.id as string,
        name: v.name as string,
        status: v.status as string,
        rating_avg: v.rating_avg != null ? Number(v.rating_avg) : null,
        feedback_count: (v.feedback_count as number) ?? 0,
        complaint_count: (v.complaint_count as number) ?? 0,
        quality_score: v.quality_score != null ? Number(v.quality_score) : null,
    }));

    return { feedback, vendors, total: feedback.length };
});
