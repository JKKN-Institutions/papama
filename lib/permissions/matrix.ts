import type { UserRole } from "@/lib/types/enums";

/**
 * Phase-1 Role Access Matrix — encodes docs/papama-phase1-spec.md §6 verbatim.
 * This is the authorization source of truth consumed by lib/permissions.
 */

/** The protected feature areas (rows of the §6 matrix). */
export const FEATURES = [
    "donor_donation_credit",
    "token_generation",
    "token_distribution",
    "beneficiary_registration",
    "token_redemption",
    "vendor_management",
    "vendor_menu_pricing",
    "vendor_settlement",
    "proof_of_service",
    "fraud_monitoring",
    "audit_reports",
] as const;
export type Feature = (typeof FEATURES)[number];

/** CRUD actions. */
export type Action = "create" | "read" | "update" | "delete";

/**
 * Scope of an allowed action:
 *  - "all"  → across all rows
 *  - "own"  → only rows the caller owns (enforced together with RLS)
 *  - "none" → not allowed
 */
export type Scope = "all" | "own" | "none";

/**
 * Special capabilities beyond plain CRUD (the parenthetical notes in §6):
 *  approve       — Vendor_Manager approves vendors/menus
 *  override      — Admin overrides settlement (hold/delay)
 *  scan_proof    — Vendor scans token / submits proof during redemption
 *  assist        — Volunteer assists beneficiary registration (cannot approve)
 *  self_register — Guest/Beneficiary self-registration
 *  donate        — Guest donates via QR/web without an account
 */
export type Capability =
    | "approve"
    | "override"
    | "scan_proof"
    | "assist"
    | "self_register"
    | "donate";

export interface Permission {
    create: Scope;
    read: Scope;
    update: Scope;
    delete: Scope;
    caps: Capability[];
}

const NONE: Permission = { create: "none", read: "none", update: "none", delete: "none", caps: [] };
const R_ALL: Permission = { create: "none", read: "all", update: "none", delete: "none", caps: [] };
const CRUD_ALL: Permission = { create: "all", read: "all", update: "all", delete: "all", caps: [] };

function perm(p: Partial<Permission>): Permission {
    return { ...NONE, ...p };
}

/**
 * matrix[feature][role] → Permission. Any (feature, role) not listed defaults
 * to NONE. Mirrors the §6 table cell-by-cell.
 */
export const PERMISSION_MATRIX: Record<Feature, Partial<Record<UserRole, Permission>>> = {
    donor_donation_credit: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        donor: perm({ create: "own", read: "own" }),
        guest: perm({ create: "all", caps: ["donate"] }), // donate via QR/web
    },
    token_generation: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: R_ALL,
        donor: perm({ create: "own", read: "own", update: "own" }), // Own (CRU)
    },
    token_distribution: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: perm({ create: "own", read: "own" }), // CR
        donor: perm({ create: "own", read: "own", update: "own" }), // CRU
    },
    beneficiary_registration: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        volunteer: perm({ create: "all", read: "all", caps: ["assist"] }), // CR (assist), cannot approve
        beneficiary: perm({ read: "own" }), // Own
        guest: perm({ create: "own", caps: ["self_register"] }), // Self-register
    },
    token_redemption: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ create: "own", read: "own", caps: ["scan_proof"] }), // CR (scan/proof)
        volunteer: R_ALL,
        beneficiary: perm({ read: "own" }), // Own
    },
    vendor_management: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: perm({ create: "all", read: "all", update: "all", caps: ["approve"] }), // Approve/CRU
        vendor: perm({ read: "own", update: "own" }), // Own profile
        volunteer: R_ALL,
    },
    vendor_menu_pricing: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: perm({ read: "all", update: "all", caps: ["approve"] }), // Approve
        vendor: perm({ create: "own", read: "own", update: "own" }), // Propose (Own)
    },
    vendor_settlement: {
        admin: perm({ create: "all", read: "all", update: "all", delete: "all", caps: ["override"] }), // CRUD + Override
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ read: "own" }), // Own (view)
    },
    proof_of_service: {
        admin: R_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
        vendor: perm({ create: "own" }), // C (Own)
    },
    fraud_monitoring: {
        admin: CRUD_ALL,
        compliance: R_ALL,
        vendor_manager: R_ALL,
    },
    audit_reports: {
        admin: CRUD_ALL,
        compliance: R_ALL,
    },
};
