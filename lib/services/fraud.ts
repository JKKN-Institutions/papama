import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
 * statistical outlier — ≥ 3 and ≥ 3× the median across active vendors. The
 * multiplier/floor are detection heuristics (a later slice can move them to
 * system_config). Returns the number of NEW flags created.
 */
const ANOMALY_MIN_COUNT = 3;
const ANOMALY_MEDIAN_MULTIPLE = 3;

export async function scanVendorAnomalies(admin: SupabaseClient): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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

    const sorted = [...counts.values()].sort((a, b) => a - b);
    const median = Math.max(1, sorted[Math.floor(sorted.length / 2)]);

    let created = 0;
    for (const [vendorId, count] of counts) {
        if (count >= ANOMALY_MIN_COUNT && count >= ANOMALY_MEDIAN_MULTIPLE * median) {
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
