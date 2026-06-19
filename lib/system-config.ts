import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * System configuration reader.
 *
 * Every tunable rule lives in the `system_config` table (migration M03). This
 * module is the ONLY place application code reads them — values are NEVER
 * hard-coded as constants (AGENTS.md hard rule). A value may be NULL when it is
 * intentionally unset (e.g. `max_tokens_per_volunteer` pending mentor input);
 * callers must handle null rather than substituting a guessed default.
 */

/** Known config keys (seeded in M03). Arbitrary strings are still accepted. */
export type SystemConfigKey =
    | "standard_token_value"
    | "special_care_multiplier"
    | "special_care_post_delivery_months"
    | "token_expiry_days"
    | "meal_cooldown_hours"
    | "max_meals_per_day"
    | "redemption_radius_km"
    | "city_lock_enabled"
    | "co_contribution_max"
    | "courier_batch_min_value"
    | "vendor_min_rating"
    | "vendor_max_complaint_rate"
    | "max_tokens_per_volunteer";

type ValueType = "number" | "boolean" | "string";

interface RawConfigRow {
    key: string;
    value: string | null;
    value_type: ValueType;
}

/** Coerced value: number | boolean | string, or null when the row is unset. */
export type ConfigValue = number | boolean | string | null;

function coerce(row: RawConfigRow): ConfigValue {
    if (row.value === null) return null;
    switch (row.value_type) {
        case "number":
            return Number(row.value);
        case "boolean":
            return row.value === "true";
        case "string":
            return row.value;
    }
}

type Client = SupabaseClient;

async function resolveClient(client?: Client): Promise<Client> {
    return client ?? ((await createClient()) as unknown as Client);
}

/**
 * Thrown when a required config key is missing or unset (NULL). Callers that
 * cannot proceed without a value (e.g. the volunteer allocation limit) should
 * let this surface rather than inventing a fallback.
 */
export class MissingConfigError extends Error {
    constructor(key: string, reason: "missing" | "unset") {
        super(
            reason === "missing"
                ? `system_config key '${key}' not found`
                : `system_config key '${key}' is unset (NULL) — must be set before use`
        );
        this.name = "MissingConfigError";
    }
}

/**
 * Read one config value (coerced). Returns null when the row exists but its
 * value is NULL. Throws if the key does not exist at all.
 */
export async function getConfig(
    key: SystemConfigKey | string,
    client?: Client
): Promise<ConfigValue> {
    const supabase = await resolveClient(client);
    const { data, error } = await supabase
        .from("system_config")
        .select("key, value, value_type")
        .eq("key", key)
        .single();

    if (error || !data) throw new MissingConfigError(key, "missing");
    return coerce(data as RawConfigRow);
}

/**
 * Read a config value that MUST be present and non-null. Throws
 * MissingConfigError otherwise. Use for rules the system cannot run without.
 */
export async function requireConfig(
    key: SystemConfigKey | string,
    client?: Client
): Promise<number | boolean | string> {
    const value = await getConfig(key, client);
    if (value === null) throw new MissingConfigError(key, "unset");
    return value;
}

/** Typed accessor: a numeric config value (must be present & non-null). */
export async function getNumber(key: SystemConfigKey | string, client?: Client): Promise<number> {
    const value = await requireConfig(key, client);
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new MissingConfigError(key, "unset");
    }
    return value;
}

/** Typed accessor: a boolean config value (must be present & non-null). */
export async function getBoolean(key: SystemConfigKey | string, client?: Client): Promise<boolean> {
    const value = await requireConfig(key, client);
    return value === true;
}

/** Typed accessor: a string config value (must be present & non-null). */
export async function getString(key: SystemConfigKey | string, client?: Client): Promise<string> {
    const value = await requireConfig(key, client);
    return String(value);
}

/**
 * Read all config as a coerced map { key: value }. Powers
 * GET /api/admin/system-config. Unset rows appear with a null value.
 */
export async function getAllConfig(client?: Client): Promise<Record<string, ConfigValue>> {
    const supabase = await resolveClient(client);
    const { data, error } = await supabase
        .from("system_config")
        .select("key, value, value_type");

    if (error || !data) return {};

    const map: Record<string, ConfigValue> = {};
    for (const row of data as RawConfigRow[]) {
        map[row.key] = coerce(row);
    }
    return map;
}
