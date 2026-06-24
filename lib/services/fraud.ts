import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber } from "@/lib/system-config";

/**
 * Core rule-based fraud signals (SEC-5..8, demo step 9). Real-time flags are
 * raised inline by the redemption route (repeat-beneficiary, duplicate token);
 * `scanVendorAnomalies` is an admin/cron sweep for volume outliers. Advanced/AI
 * detection (GPS integrity, behavioural clustering) is a Phase-2 seam — the
 * detection_method enum already reserves `gps_integrity`/`pattern_analysis`.
 *
 * Flags land in `fraud_flags` (status 'open'); the admin console resolves/dismisses.
 */

type FlagType =
    | "duplicate_token"
    | "cloned_qr"
    | "tampered_qr"
    | "beneficiary_duplicate"
    | "vendor_anomaly";
type Severity = "low" | "medium" | "high";
type DetectionMethod =
    | "face_hash_repeat"
    | "vendor_volume_anomaly"
    | "token_duplication"
    | "cloned_qr"
    | "tampered_qr"
    | "geofence_violation"
    | "gps_integrity"
    | "pattern_analysis";

export interface FraudFlagInput {
    flag_type: FlagType;
    severity: Severity;
    detection_method?: DetectionMethod;
    entity: { kind: string; id: string };
    blocked?: boolean;
}

/**
 * Insert a fraud flag. De-duplicates: if an OPEN flag of the same type already
 * targets this entity, nothing is inserted. Returns true iff a flag was created.
 */
export async function flagFraud(admin: SupabaseClient, input: FraudFlagInput): Promise<boolean> {
    const { data: existing } = await admin
        .from("fraud_flags")
        .select("id")
        .eq("flag_type", input.flag_type)
        .eq("status", "open")
        .eq("entity->>id", input.entity.id)
        .limit(1);
    if (existing && existing.length > 0) return false;

    const { error } = await admin.from("fraud_flags").insert({
        flag_type: input.flag_type,
        severity: input.severity,
        status: "open",
        detection_method: input.detection_method ?? null,
        entity: input.entity,
        blocked: input.blocked ?? false,
    });
    if (error) throw new Error(error.message);
    return true;
}

/**
 * Vendor volume-anomaly sweep: flag any vendor whose redemptions TODAY are a
 * statistical outlier — ≥ `fraud_anomaly_min_count` AND ≥ `fraud_anomaly_median_multiple`×
 * the median across active vendors. Both thresholds are admin-tunable
 * `system_config` rows (AGENTS.md: rules are never hard-coded); the constants
 * below are only the fallback used when a key is unset. Returns NEW flags created.
 */
const DEFAULT_ANOMALY_MIN_COUNT = 3;
const DEFAULT_ANOMALY_MEDIAN_MULTIPLE = 3;

export async function scanVendorAnomalies(admin: SupabaseClient): Promise<number> {
    const minCount = await getNumber("fraud_anomaly_min_count", admin as never).catch(
        () => DEFAULT_ANOMALY_MIN_COUNT
    );
    const medianMultiple = await getNumber("fraud_anomaly_median_multiple", admin as never).catch(
        () => DEFAULT_ANOMALY_MEDIAN_MULTIPLE
    );

    // Use UTC midnight so the day boundary matches redeemed_at (stored as UTC)
    // regardless of the server's local timezone (which may not be IST).
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { data: reds, error } = await admin
        .from("token_redemptions")
        .select("vendor_id")
        .gte("redeemed_at", startOfDay.toISOString());
    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const r of (reds ?? []) as { vendor_id: string | null }[]) {
        if (r.vendor_id) counts.set(r.vendor_id, (counts.get(r.vendor_id) ?? 0) + 1);
    }
    if (counts.size === 0) return 0;

    // True median: average the two middle values for an even-length set (the old
    // upper-middle pick inflated the threshold and let real outliers escape).
    const sorted = [...counts.values()].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const rawMedian =
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const median = Math.max(1, rawMedian);

    let created = 0;
    for (const [vendorId, count] of counts) {
        if (count >= minCount && count >= medianMultiple * median) {
            const inserted = await flagFraud(admin, {
                flag_type: "vendor_anomaly",
                severity: "medium",
                detection_method: "vendor_volume_anomaly",
                entity: { kind: "vendor", id: vendorId },
            });
            if (inserted) created += 1;
        }
    }
    return created;
}
