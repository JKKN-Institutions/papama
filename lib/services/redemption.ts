import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber, getBoolean, getString } from "@/lib/system-config";
import { qrHashOf } from "@/app/api/_lib/tokenQr";
import { toVectorLiteral } from "@/lib/face/embedding";
import { getGreatCircleDistanceKm } from "@/lib/services/geo";

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

/** The beneficiary row fields the engine needs (matched by face embedding). */
interface BeneficiaryRow {
    id: string;
    face_hash: string | null;
    category: string;
    eligibility_status: string;
    status: string;
    eligibility_expires_at: string | null;
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
    /** On-device face capture. Required at the real redemption; optional in preview. */
    face?: { embedding: number[]; liveness: number };
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

    // --- vendor approval (owner §4.5) ----------------------------------------
    // A pending / suspended / rejected outlet must not be able to redeem a token,
    // burn it, or lock a payment. HARD: this was previously unchecked, letting any
    // user with the `vendor` role redeem before approval.
    const { data: vendorRow } = await admin
        .from("vendors")
        .select("status")
        .eq("id", input.vendor_id)
        .maybeSingle();
    const vendorStatus = (vendorRow as { status: string } | null)?.status ?? null;
    const vendorApproved = vendorStatus === "approved";
    checks.push({
        name: "vendor_status",
        pass: vendorApproved,
        hard: true,
        detail: vendorApproved
            ? "vendor outlet is approved"
            : vendorStatus
              ? `vendor outlet is not approved (${vendorStatus})`
              : "vendor outlet not found",
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
                const dist = getGreatCircleDistanceKm(input.geo.lat, input.geo.lng, vLat, vLng);
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
        // No location supplied. Fail CLOSED: if the geofence is enforceable for
        // this vendor (vendor has geo on file AND redemption_radius_km is
        // configured), a missing location is a HARD block — otherwise a caller
        // could bypass the radius simply by omitting `geo`. The geofence only
        // degrades to a soft skip when it genuinely can't be evaluated (vendor has
        // no geo on file, or the radius config is unset).
        const { data: vendorGeo } = await admin
            .from("vendors")
            .select("geo_lat, geo_lng")
            .eq("id", input.vendor_id)
            .maybeSingle();
        const hasVendorGeo =
            vendorGeo?.geo_lat != null && vendorGeo?.geo_lng != null;

        let radiusConfigured = false;
        try {
            await getNumber("redemption_radius_km", admin as never);
            radiusConfigured = true;
        } catch {
            radiusConfigured = false;
        }

        if (hasVendorGeo && radiusConfigured) {
            checks.push({
                name: "geofence",
                pass: false,
                hard: true,
                detail: "location required — share your location to redeem within the radius",
            });
        } else {
            checks.push({
                name: "geofence",
                pass: true,
                hard: false,
                detail: hasVendorGeo
                    ? "redemption_radius_km unset — geofence skipped"
                    : "vendor has no geo-location on file — skipped",
            });
        }
    }

    // --- city lock (owner §6 admin protection rule, PRD §7 city_lock_enabled) -
    // Independent of the radius geofence. There is NO per-beneficiary or per-token
    // city in the schema, so the authoritative "bound city" is the admin-configured
    // OPERATING CITY (`system_config.operating_city`) — the single city pApAmA is
    // operating in for Phase 1. When city_lock_enabled is true and an operating
    // city is configured and the vendor has a city on file, the vendor's city MUST
    // match the operating city (case-insensitive, trimmed). This is FAIL-CLOSED for
    // the radius bypass reason: the only soft-skips are when the rule genuinely
    // cannot be evaluated — city_lock disabled, operating_city unset, or the vendor
    // has no city recorded. (If a future migration adds a per-token/beneficiary
    // city, swap `operating_city` for that bound value here.)
    {
        let cityLockOn = false;
        try {
            cityLockOn = await getBoolean("city_lock_enabled", admin as never);
        } catch {
            cityLockOn = false; // unset → treat as disabled (no guessed default)
        }

        if (!cityLockOn) {
            checks.push({
                name: "city_lock",
                pass: true,
                hard: false,
                detail: "city lock disabled — skipped",
            });
        } else {
            let operatingCity: string | null = null;
            try {
                operatingCity = (await getString("operating_city", admin as never)).trim();
                if (operatingCity.length === 0) operatingCity = null;
            } catch {
                operatingCity = null; // operating_city unset — cannot evaluate
            }

            const { data: vendorCityRow } = await admin
                .from("vendors")
                .select("city")
                .eq("id", input.vendor_id)
                .maybeSingle();
            const vendorCity =
                (vendorCityRow as { city: string | null } | null)?.city?.trim() || null;

            if (operatingCity == null) {
                checks.push({
                    name: "city_lock",
                    pass: true,
                    hard: false,
                    detail: "operating_city unset — city lock skipped",
                });
            } else if (vendorCity == null) {
                checks.push({
                    name: "city_lock",
                    pass: true,
                    hard: false,
                    detail: "vendor has no city on file — city lock skipped",
                });
            } else {
                const match = vendorCity.toLowerCase() === operatingCity.toLowerCase();
                checks.push({
                    name: "city_lock",
                    pass: match,
                    hard: true,
                    detail: match
                        ? `vendor city '${vendorCity}' is within the operating city`
                        : `vendor city '${vendorCity}' is outside the operating city '${operatingCity}'`,
                });
            }
        }
    }

    // --- face capture: liveness + identity (owner §4.5/§4.6/§5.2, SEC-1..4) ---
    // Identity is resolved by VECTOR DISTANCE, not text equality. A registered
    // beneficiary is identified 1:1 via match_beneficiary_face; fair-usage
    // (cooldown/meal-limit) is keyed on the FACE across vendors via
    // recent_face_matches, so it catches anonymous repeat-redeemers too. The
    // create route REQUIRES a capture — the no-face branch is preview-only.
    let beneficiary: BeneficiaryRow | null = null;
    let faceVector: string | null = null;

    if (!input.face) {
        checks.push({
            name: "face",
            pass: true,
            hard: false,
            detail: "face capture pending (required to redeem)",
        });
    } else {
        faceVector = toVectorLiteral(input.face.embedding);

        // liveness / anti-spoof gate
        try {
            const minLive = await getNumber("face_liveness_min", admin as never);
            const livePass = input.face.liveness >= minLive;
            checks.push({
                name: "liveness",
                pass: livePass,
                hard: true,
                detail: livePass
                    ? `liveness ${input.face.liveness.toFixed(2)} ≥ ${minLive}`
                    : `liveness ${input.face.liveness.toFixed(2)} < ${minLive} (possible spoof)`,
            });
        } catch {
            checks.push({
                name: "liveness",
                pass: true,
                hard: false,
                detail: "face_liveness_min unset — liveness skipped",
            });
        }

        let threshold: number | null = null;
        try {
            threshold = await getNumber("face_match_threshold", admin as never);
        } catch {
            threshold = null;
        }

        // 1:1 identify a REGISTERED beneficiary (nearest within the threshold).
        if (threshold != null) {
            const { data: matchRows } = await admin.rpc("match_beneficiary_face", {
                query: faceVector,
                max_distance: threshold,
            });
            const matchId =
                (matchRows as { beneficiary_id: string }[] | null)?.[0]?.beneficiary_id ?? null;
            if (matchId) {
                const { data: benefData } = await admin
                    .from("beneficiaries")
                    .select("id, face_hash, category, eligibility_status, status, eligibility_expires_at")
                    .eq("id", matchId)
                    .maybeSingle();
                beneficiary = (benefData as BeneficiaryRow | null) ?? null;
            }
        }

        // cooldown + meal-limit (RED-3). Fair-usage is evaluated over the UNION of
        // two independent signals so it cannot be bypassed by a face that fails to
        // re-match a prior capture:
        //   (a) FACE signal — prior captures matching this face by vector distance
        //       (cross-vendor, catches anonymous repeat-redeemers); needs threshold.
        //   (b) BENEFICIARY signal — when a registered beneficiary is identified,
        //       that beneficiary's OWN redemption history keyed on beneficiary_id
        //       (independent of whether the historical face embeddings re-match).
        // Either signal tripping blocks. The previous version ran ONLY (a) inside
        // `if (threshold != null)`, so a non-matching face escaped both checks.
        {
            let cooldownHours = 0;
            let maxPerDay = 0;
            let dedupHours = 0;
            try {
                cooldownHours = await getNumber("meal_cooldown_hours", admin as never);
            } catch {
                /* unset — skip below */
            }
            try {
                maxPerDay = await getNumber("max_meals_per_day", admin as never);
            } catch {
                /* unset — skip below */
            }
            try {
                dedupHours = await getNumber("face_dedup_window_hours", admin as never);
            } catch {
                /* unset — falls back to cooldown window */
            }

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const lookbackMs = Math.max(cooldownHours, dedupHours) * 3_600_000;
            const since = new Date(
                Math.min(startOfDay.getTime(), nowMs - lookbackMs)
            ).toISOString();

            // collect prior redemption timestamps (ms) from both signals.
            const priorMs: number[] = [];

            // (a) face signal — only when a match threshold is configured.
            if (threshold != null) {
                const { data: recentRows } = await admin.rpc("recent_face_matches", {
                    query: faceVector,
                    max_distance: threshold,
                    since,
                });
                for (const r of (recentRows as { redeemed_at: string }[] | null) ?? []) {
                    priorMs.push(Date.parse(r.redeemed_at));
                }
            }

            // (b) beneficiary signal — independent of face re-match.
            if (beneficiary) {
                const { data: benefRows } = await admin
                    .from("redemption_cooldown_log")
                    .select("redeemed_at")
                    .eq("beneficiary_id", beneficiary.id)
                    .gte("redeemed_at", since)
                    .order("redeemed_at", { ascending: false });
                for (const r of (benefRows as { redeemed_at: string }[] | null) ?? []) {
                    priorMs.push(Date.parse(r.redeemed_at));
                }
            }

            // de-dupe (the same redemption seeds both face + beneficiary rows) and
            // sort newest-first.
            const recentMs = Array.from(new Set(priorMs)).sort((a, b) => b - a);

            // A fair-usage rule is only enforceable if at least one signal could be
            // gathered (threshold set, or a registered beneficiary matched). With
            // neither, the checks degrade to a SOFT skip rather than a false pass.
            const signalAvailable = threshold != null || beneficiary != null;

            if (cooldownHours > 0) {
                if (!signalAvailable) {
                    checks.push({
                        name: "cooldown",
                        pass: true,
                        hard: false,
                        detail: "face_match_threshold unset and no registered beneficiary — cooldown skipped",
                    });
                } else if (recentMs.length > 0) {
                    const lastMs = recentMs[0]; // newest-first
                    const sinceMs = nowMs - lastMs;
                    const within = sinceMs < cooldownHours * 3_600_000;
                    checks.push({
                        name: "cooldown",
                        pass: !within,
                        hard: true,
                        detail: within
                            ? `last meal ${(sinceMs / 3_600_000).toFixed(1)}h ago (< ${cooldownHours}h)`
                            : `last meal ≥ ${cooldownHours}h ago`,
                    });
                } else {
                    checks.push({
                        name: "cooldown",
                        pass: true,
                        hard: false,
                        detail: "no prior meals for this beneficiary/face",
                    });
                }
            } else {
                checks.push({
                    name: "cooldown",
                    pass: true,
                    hard: false,
                    detail: "meal_cooldown_hours unset — cooldown skipped",
                });
            }

            if (maxPerDay > 0) {
                if (!signalAvailable) {
                    checks.push({
                        name: "meal_limit",
                        pass: true,
                        hard: false,
                        detail: "face_match_threshold unset and no registered beneficiary — meal limit skipped",
                    });
                } else {
                    const todayCount = recentMs.filter(
                        (ms) => ms >= startOfDay.getTime()
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
                }
            } else {
                checks.push({
                    name: "meal_limit",
                    pass: true,
                    hard: false,
                    detail: "max_meals_per_day unset — meal limit skipped",
                });
            }
        }

        // eligibility of the matched registered beneficiary, incl. expiry (owner §2.2.1).
        if (beneficiary) {
            const active = beneficiary.status === "active";
            const expired =
                beneficiary.eligibility_expires_at != null &&
                Date.parse(beneficiary.eligibility_expires_at) < nowMs;
            const pass = active && !expired;
            checks.push({
                name: "eligibility",
                pass,
                hard: true,
                detail: !active
                    ? `beneficiary is ${beneficiary.status}`
                    : expired
                      ? `eligibility expired ${beneficiary.eligibility_expires_at!.slice(0, 10)}`
                      : beneficiary.eligibility_status === "verified"
                        ? "beneficiary active & verified"
                        : `beneficiary active (eligibility ${beneficiary.eligibility_status})`,
            });
        }

        // Special-Care binding: a Special-Care token requires a matched, active,
        // care-eligible beneficiary — eligibility is registration-driven, not just
        // the menu item (owner §2.2.1 / §4.2.1, closes the menu-only gap).
        if (token.token_type === "special_care") {
            const careCategories = new Set(["pregnant_women", "patient"]);
            const careOk =
                beneficiary != null &&
                beneficiary.status === "active" &&
                careCategories.has(beneficiary.category);
            checks.push({
                name: "special_care_eligibility",
                pass: careOk,
                hard: true,
                detail: careOk
                    ? `special-care eligible (${beneficiary!.category})`
                    : beneficiary
                      ? `beneficiary category '${beneficiary.category}' is not special-care eligible`
                      : "special-care token requires a registered, care-eligible beneficiary",
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
