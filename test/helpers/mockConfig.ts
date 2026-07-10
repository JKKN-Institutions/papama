/**
 * Test helpers for system_config mocking.
 *
 * Every tunable rule lives in the system_config table. This module provides
 * factories to build config rows for tests, so services that call getConfig()
 * or requireConfig() get predictable values.
 */

interface ConfigRow {
    key: string;
    value: string | null;
    value_type: "number" | "boolean" | "string";
}

/** Default config values matching the seeded M03 migration */
const DEFAULTS: Record<string, ConfigRow> = {
    standard_token_value: { key: "standard_token_value", value: "50", value_type: "number" },
    special_care_multiplier: { key: "special_care_multiplier", value: "2", value_type: "number" },
    special_care_post_delivery_months: { key: "special_care_post_delivery_months", value: "6", value_type: "number" },
    token_expiry_days: { key: "token_expiry_days", value: "30", value_type: "number" },
    meal_cooldown_hours: { key: "meal_cooldown_hours", value: "6", value_type: "number" },
    max_meals_per_day: { key: "max_meals_per_day", value: "3", value_type: "number" },
    redemption_radius_km: { key: "redemption_radius_km", value: "5", value_type: "number" },
    city_lock_enabled: { key: "city_lock_enabled", value: "false", value_type: "boolean" },
    operating_city: { key: "operating_city", value: "Komarapalayam", value_type: "string" },
    co_contribution_max: { key: "co_contribution_max", value: "0", value_type: "number" },
    courier_batch_min_value: { key: "courier_batch_min_value", value: "5000", value_type: "number" },
    vendor_min_rating: { key: "vendor_min_rating", value: "3", value_type: "number" },
    vendor_max_complaint_rate: { key: "vendor_max_complaint_rate", value: "0.1", value_type: "number" },
    max_tokens_per_volunteer: { key: "max_tokens_per_volunteer", value: null, value_type: "number" },
    patient_eligibility_months: { key: "patient_eligibility_months", value: "12", value_type: "number" },
    meal_window_enforcement_enabled: { key: "meal_window_enforcement_enabled", value: "false", value_type: "boolean" },
    vendor_capacity_enforcement_enabled: { key: "vendor_capacity_enforcement_enabled", value: "false", value_type: "boolean" },
    csr_80g_certificates_enabled: { key: "csr_80g_certificates_enabled", value: "false", value_type: "boolean" },
    emergency_mode_enabled: { key: "emergency_mode_enabled", value: "false", value_type: "boolean" },
    emergency_max_meals_per_day: { key: "emergency_max_meals_per_day", value: "6", value_type: "number" },
    emergency_meal_cooldown_hours: { key: "emergency_meal_cooldown_hours", value: "2", value_type: "number" },
    vendor_auto_suspend_enabled: { key: "vendor_auto_suspend_enabled", value: "false", value_type: "boolean" },
    vendor_min_feedback_count: { key: "vendor_min_feedback_count", value: "5", value_type: "number" },
    proof_phash_dup_distance: { key: "proof_phash_dup_distance", value: "10", value_type: "number" },
    settlement_random_audit_rate: { key: "settlement_random_audit_rate", value: "0.05", value_type: "number" },
    institution_bulk_allocation_max: { key: "institution_bulk_allocation_max", value: "100", value_type: "number" },
    volunteer_zones_enabled: { key: "volunteer_zones_enabled", value: "false", value_type: "boolean" },
    transparency_dashboard_enabled: { key: "transparency_dashboard_enabled", value: "true", value_type: "boolean" },
    audit_log_retention_days: { key: "audit_log_retention_days", value: "365", value_type: "number" },
};

/**
 * Get all default config rows as an array (for mocking a full table read).
 */
export function allConfigRows(): ConfigRow[] {
    return Object.values(DEFAULTS);
}

/**
 * Get a single config row by key. Optionally override the value.
 */
export function configRow(key: string, value?: string | null): ConfigRow {
    const base = DEFAULTS[key];
    if (!base) {
        return { key, value: value ?? null, value_type: "string" };
    }
    if (value !== undefined) {
        return { ...base, value };
    }
    return { ...base };
}

/**
 * Build a set of config rows with custom overrides.
 *
 * @example
 *   const rows = buildConfig({
 *     standard_token_value: "100",
 *     emergency_mode_enabled: "true",
 *     token_expiry_days: null,  // unset
 *   });
 */
export function buildConfig(overrides: Record<string, string | null> = {}): ConfigRow[] {
    const rows = allConfigRows().map((row) => {
        if (row.key in overrides) {
            return { ...row, value: overrides[row.key] };
        }
        return row;
    });

    // Add any override keys not in defaults
    for (const [key, value] of Object.entries(overrides)) {
        if (!DEFAULTS[key]) {
            rows.push({ key, value, value_type: "string" });
        }
    }

    return rows;
}
