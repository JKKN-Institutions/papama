import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber } from "@/lib/system-config";
import { qrHashOf } from "@/app/api/_lib/tokenQr";

/**
 * Redemption validation + value engine (owner §4.4, RED-1..7, PROOF-4).
 *
 * `validateRedemption` is the single source of truth for "may this token be
 * redeemed at this vendor for this menu item, and for how much money?". It is
 * pure-ish: it reads tokens / vendor_menus / beneficiaries / cooldown log and
 * the tunable `system_config` rules, runs an ordered list of named checks, and
 * computes the value split (forfeit / pay-difference / co-pay). It performs NO
 * writes — both the dry-run preview and the real redemption route call it; the
 * real route re-runs it and then commits inside its own transaction.
 *
 * Checks are HARD or SOFT:
 *   - HARD: a failure makes the whole redemption invalid (`ok = false`).
 *   - SOFT: informational only; recorded in `checks` but never blocks (e.g. a
 *     volunteer-assisted redemption with no beneficiary identity, or geo not
 *     provided). `ok` = ALL HARD checks pass.
 *
 * Config reads tolerate an unset key: a rule whose threshold is not configured
 * is SKIPPED (recorded as a soft "config unset" note), never invented — same
 * discipline as the mint route's threshold/expiry handling.
 */

/** One named validation check. */
export interface RedemptionCheck {
    name: string;
    pass: boolean;
    /** Whether failing this check invalidates the redemption. */
    hard: boolean;
    detail: string;
}

/** The token row fields the engine needs. */
interface TokenRow {
    id: string;
    qr_hash: string | null;
    status: string;
    value_inr: number;
    token_type: string;
    donor_id: string | null;
    beneficiary_id: string | null;
    expires_at: string | null;
    redeemed_at: string | null;
}

/** The menu row fields the engine needs. */
interface MenuRow {
    id: string;
    vendor_id: string;
    item_name: string;
    price: number;
    nutrition_category: string | null;
    is_special_care_equivalent: boolean;
    special_care_equivalent_approved: boolean;
    approval_status: string;
}

/** The beneficiary row fields the engine needs (matched by face_hash). */
interface BeneficiaryRow {
    id: string;
    face_hash: string | null;
    category: string;
    eligibility_status: string;
    status: string;
}

/** Money split computed for the redemption (owner §4.4). */
export interface RedemptionValue {
    token_value: number;
    menu_value: number;
    /** Beneficiary pays the over-value (menu > token). */
    difference_paid: number;
    /** Optional voluntary co-contribution (clamped to co_contribution_max). */
    co_pay: number;
    /** Unused token value retained by the system (token > menu); never refunded. */
    forfeited: number;
}

/** Input to the engine. Vendor id is resolved server-side, never trusted. */
export interface ValidateRedemptionInput {
    qr_payload: string;
    vendor_id: string;
    menu_item_id: string;
    geo?: { lat: number; lng: number };
    face_hash?: string;
    co_pay?: number;
}

/** Result of the engine. `ok` = all HARD checks passed. */
export interface RedemptionValidation {
    ok: boolean;
    checks: RedemptionCheck[];
    token: TokenRow | null;
    menuItem: MenuRow | null;
    beneficiary?: BeneficiaryRow | null;
    value: RedemptionValue;
}

/** Token statuses at which a token may be redeemed. */
const REDEEMABLE_STATUSES = new Set(["live", "distributed"]);

/** Great-circle distance (km) between two lat/lng points (haversine). */
function haversineKm(
    aLat: number,
    aLng: number,
    bLat: number,
    bLng: number
): number {
    const R = 6371; // Earth radius (km)
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

const ZERO_VALUE: RedemptionValue = {
    token_value: 0,
    menu_value: 0,
    difference_paid: 0,
    co_pay: 0,
    forfeited: 0,
};

/**
 * Run all redemption checks + compute value. Reads only; never writes. Designed
 * so the preview route can call it dry and the create route can re-call it
 * immediately before committing (the DB status guard handles the race window).
 */
export async function validateRedemption(
    input: ValidateRedemptionInput,
    admin: SupabaseClient
): Promise<RedemptionValidation> {
    const checks: RedemptionCheck[] = [];
    const nowMs = Date.now();

    // --- token ---------------------------------------------------------------
    const qrHash = qrHashOf(input.qr_payload);
    const { data: tokenData } = await admin
        .from("tokens")
        .select(
            "id, qr_hash, status, value_inr, token_type, donor_id, beneficiary_id, expires_at, redeemed_at"
        )
        .eq("qr_hash", qrHash)
        .maybeSingle();
    const token = (tokenData as TokenRow | null) ?? null;

    if (!token) {
        checks.push({
            name: "token",
            pass: false,
            hard: true,
            detail: "no token matches this QR",
        });
        return { ok: false, checks, token: null, menuItem: null, value: ZERO_VALUE };
    }

    const expired = token.expires_at != null && Date.parse(token.expires_at) < nowMs;
    const statusOk = REDEEMABLE_STATUSES.has(token.status);
    const tokenPass = statusOk && !expired;
    checks.push({
        name: "token",
        pass: tokenPass,
        hard: true,
        detail: tokenPass
            ? `token ${token.id} is redeemable (${token.status})`
            : expired
              ? "token has expired"
              : `token status '${token.status}' is not redeemable`,
    });

    // --- menu ----------------------------------------------------------------
    const { data: menuData } = await admin
        .from("vendor_menus")
        .select(
            "id, vendor_id, item_name, price, nutrition_category, is_special_care_equivalent, special_care_equivalent_approved, approval_status"
        )
        .eq("id", input.menu_item_id)
        .maybeSingle();
    const menuItem = (menuData as MenuRow | null) ?? null;

    let menuPass = false;
    let menuDetail: string;
    if (!menuItem) {
        menuDetail = "menu item not found";
    } else if (menuItem.vendor_id !== input.vendor_id) {
        menuDetail = "menu item does not belong to this vendor";
    } else if (menuItem.approval_status !== "approved") {
        menuDetail = `menu item is not approved (${menuItem.approval_status})`;
    } else if (
        token.token_type === "special_care" &&
        !(menuItem.is_special_care_equivalent && menuItem.special_care_equivalent_approved)
    ) {
        menuDetail = "menu item is not an approved special-care equivalent";
    } else {
        menuPass = true;
        menuDetail = `'${menuItem.item_name}' (₹${Math.round(menuItem.price)})`;
    }
    checks.push({ name: "menu", pass: menuPass, hard: true, detail: menuDetail });

    // --- geofence ------------------------------------------------------------
    if (input.geo) {
        const { data: vendorGeo } = await admin
            .from("vendors")
            .select("geo_lat, geo_lng")
            .eq("id", input.vendor_id)
            .maybeSingle();
        const vLat = vendorGeo?.geo_lat != null ? Number(vendorGeo.geo_lat) : null;
        const vLng = vendorGeo?.geo_lng != null ? Number(vendorGeo.geo_lng) : null;

        if (vLat == null || vLng == null) {
            checks.push({
                name: "geofence",
                pass: true,
                hard: false,
                detail: "vendor has no geo-location on file — skipped",
            });
        } else {
            try {
                const radiusKm = await getNumber("redemption_radius_km", admin as never);
                const dist = haversineKm(input.geo.lat, input.geo.lng, vLat, vLng);
                const within = dist <= radiusKm;
                checks.push({
                    name: "geofence",
                    pass: within,
                    hard: true,
                    detail: within
                        ? `within ${radiusKm} km (${dist.toFixed(2)} km)`
                        : `outside the ${radiusKm} km radius (${dist.toFixed(2)} km)`,
                });
            } catch {
                // redemption_radius_km unset — skip the geofence rule (no guessed default).
                checks.push({
                    name: "geofence",
                    pass: true,
                    hard: false,
                    detail: "redemption_radius_km unset — geofence skipped",
                });
            }
        }
    } else {
        checks.push({
            name: "geofence",
            pass: true,
            hard: false,
            detail: "location not provided",
        });
    }

    // --- cooldown / meal-limit (fair usage, RED-3) ---------------------------
    if (input.face_hash) {
        const { data: log } = await admin
            .from("redemption_cooldown_log")
            .select("redeemed_at")
            .eq("face_hash", input.face_hash)
            .order("redeemed_at", { ascending: false });
        const rows = (log as { redeemed_at: string }[] | null) ?? [];

        // 6h gap since the last meal.
        try {
            const cooldownHours = await getNumber("meal_cooldown_hours", admin as never);
            const last = rows[0]?.redeemed_at;
            if (last) {
                const sinceMs = nowMs - Date.parse(last);
                const within = sinceMs < cooldownHours * 3_600_000;
                checks.push({
                    name: "cooldown",
                    pass: !within,
                    hard: true,
                    detail: within
                        ? `last meal was ${(sinceMs / 3_600_000).toFixed(1)}h ago (< ${cooldownHours}h)`
                        : `last meal ≥ ${cooldownHours}h ago`,
                });
            } else {
                checks.push({
                    name: "cooldown",
                    pass: true,
                    hard: false,
                    detail: "no prior meals on record",
                });
            }
        } catch {
            checks.push({
                name: "cooldown",
                pass: true,
                hard: false,
                detail: "meal_cooldown_hours unset — cooldown skipped",
            });
        }

        // max meals/day.
        try {
            const maxPerDay = await getNumber("max_meals_per_day", admin as never);
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const todayCount = rows.filter(
                (r) => Date.parse(r.redeemed_at) >= startOfDay.getTime()
            ).length;
            const underLimit = todayCount < maxPerDay;
            checks.push({
                name: "meal_limit",
                pass: underLimit,
                hard: true,
                detail: underLimit
                    ? `${todayCount}/${maxPerDay} meals today`
                    : `daily meal limit reached (${todayCount}/${maxPerDay})`,
            });
        } catch {
            checks.push({
                name: "meal_limit",
                pass: true,
                hard: false,
                detail: "max_meals_per_day unset — meal limit skipped",
            });
        }
    } else {
        checks.push({
            name: "cooldown",
            pass: true,
            hard: false,
            detail: "no beneficiary identity — volunteer-assisted",
        });
    }

    // --- eligibility (only when face_hash matches a beneficiary) --------------
    let beneficiary: BeneficiaryRow | null = null;
    if (input.face_hash) {
        const { data: benefData } = await admin
            .from("beneficiaries")
            .select("id, face_hash, category, eligibility_status, status")
            .eq("face_hash", input.face_hash)
            .maybeSingle();
        beneficiary = (benefData as BeneficiaryRow | null) ?? null;

        if (beneficiary) {
            const active = beneficiary.status === "active";
            checks.push({
                name: "eligibility",
                pass: active,
                hard: true,
                detail: active
                    ? beneficiary.eligibility_status === "verified"
                        ? "beneficiary active & verified"
                        : `beneficiary active (eligibility ${beneficiary.eligibility_status})`
                    : `beneficiary is ${beneficiary.status}`,
            });
        }
    }

    // --- value (owner §4.4) --------------------------------------------------
    let value: RedemptionValue = ZERO_VALUE;
    if (token && menuItem) {
        const tokenValue = token.value_inr;
        const menuValue = Math.round(menuItem.price);
        const differencePaid = Math.max(0, menuValue - tokenValue);
        const forfeited = Math.max(0, tokenValue - menuValue);

        let coPay = 0;
        const requested = input.co_pay ?? 0;
        try {
            const coMax = await getNumber("co_contribution_max", admin as never);
            coPay = clamp(requested, 0, coMax);
        } catch {
            // co_contribution_max unset — accept only ₹0 (no guessed ceiling).
            coPay = clamp(requested, 0, 0);
        }

        value = {
            token_value: tokenValue,
            menu_value: menuValue,
            difference_paid: differencePaid,
            co_pay: coPay,
            forfeited,
        };
    }

    const ok = checks.every((c) => !c.hard || c.pass);

    return { ok, checks, token, menuItem, beneficiary, value };
}
