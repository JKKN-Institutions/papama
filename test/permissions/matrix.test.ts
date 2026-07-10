/**
 * Permission matrix tests — derived from papama-phase1-spec-rev2.md §6.
 *
 * The spec §6 Role Access Matrix defines 8 roles × 22 features. The current
 * code implements 11 features. Tests for existing features verify the matrix
 * logic; tests for the 11 missing features are expected to FAIL until the
 * code is extended, surfacing the spec gap.
 *
 * Spec sections referenced:
 *   §6   Phase 1 Role Access Matrix (authoritative)
 *   §3.1 Foundation features
 *   §3.2 Hard business rules
 *   §3.3 Core flows
 */

import { describe, expect, it } from "vitest";

import {
    can,
    assertCan,
    userCan,
    hasCapability,
    isAdminConsoleRole,
    getPermission,
    ForbiddenError,
    FEATURES,
    PERMISSION_MATRIX,
    type Action,
    type Feature,
    type Capability,
} from "@/lib/permissions";
import type { UserRole } from "@/lib/types/enums";
import { USER_ROLES } from "@/lib/types/enums";
import { makeUser } from "@test/helpers";

const ACTIONS: Action[] = ["create", "read", "update", "delete"];

/**
 * The 22 features defined in spec §6 Role Access Matrix.
 * The first 11 exist in code; the remaining 11 are spec-required gaps.
 */
const SPEC_FEATURES = [
    // Existing in code
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
    // Spec §6 features NOT yet in code
    "donor_sponsorship_counters",
    "institution_bulk_allocation",
    "vendor_discovery",
    "vendor_capacity_availability",
    "financial_ledgers_reconciliation",
    "refunds_failed_payments",
    "csr_module",
    "volunteer_management",
    "quality_feedback_complaints_inspections",
    "emergency_disaster_mode",
    "analytics_dashboard",
    "public_transparency_dashboard",
    "document_management",
    "consent_management",
] as const;

// ---------------------------------------------------------------------------
// 1. Exhaustive matrix coverage — every (feature, role, action) for existing features
// ---------------------------------------------------------------------------

describe("permission matrix — exhaustive RBAC (existing 11 features)", () => {
    for (const feature of FEATURES) {
        describe(`feature: ${feature}`, () => {
            for (const role of USER_ROLES) {
                describe(`role: ${role}`, () => {
                    const perm = getPermission(role, feature);

                    for (const action of ACTIONS) {
                        const granted = perm[action];

                        it(`${action} → scope "all" is ${granted === "all"}`, () => {
                            expect(can(role, feature, action, "all")).toBe(granted === "all");
                        });

                        it(`${action} → scope "own" is ${granted !== "none"}`, () => {
                            expect(can(role, feature, action, "own")).toBe(granted !== "none");
                        });
                    }
                });
            }
        });
    }
});

// ---------------------------------------------------------------------------
// 2. Spec §6 critical access rules (guards against accidental matrix edits)
// ---------------------------------------------------------------------------

describe("spec §6 — critical access rules", () => {
    // --- Admin: CRUD on most features, R_ALL on read-only features (spec §6) ---
    it("admin has CRUD-all on features where spec §6 grants CRUD", () => {
        // These features are R_ALL (not CRUD) for admin per spec §6
        const adminReadOnly: string[] = [
            "proof_of_service",                  // §6: R+U (approve)
            "donor_sponsorship_counters",        // §6: R
            "vendor_discovery",                  // §6: R
            "analytics_dashboard",               // §6: R (full)
            "public_transparency_dashboard",     // §6: Config (treated as R)
        ];
        for (const feature of FEATURES) {
            if (adminReadOnly.includes(feature)) continue;
            for (const action of ACTIONS) {
                expect(can("admin", feature, action, "all")).toBe(true);
            }
        }
    });

    it("admin has read+update on proof_of_service with approve capability (spec §6)", () => {
        expect(can("admin", "proof_of_service", "read", "all")).toBe(true);
        expect(can("admin", "proof_of_service", "update", "all")).toBe(true);
        expect(can("admin", "proof_of_service", "create", "all")).toBe(false);
        expect(can("admin", "proof_of_service", "delete", "all")).toBe(false);
        expect(hasCapability("admin", "proof_of_service", "approve")).toBe(true);
    });

    it("admin has override capability on vendor_settlement (spec §6: CRUD + Override)", () => {
        expect(hasCapability("admin", "vendor_settlement", "override")).toBe(true);
    });

    // --- Compliance: read-only everywhere, but spec §6 grants Approve on vendor_settlement ---
    it("compliance can read all features where it has an entry (spec §6: R across the board)", () => {
        // Compliance has R or R+Approve on all features it's listed in.
        // Features where compliance has no entry default to NONE — skip those.
        const complianceFeatures = FEATURES.filter(
            (f) => getPermission("compliance", f).read !== "none"
        );
        expect(complianceFeatures.length).toBeGreaterThanOrEqual(11);
        for (const feature of complianceFeatures) {
            expect(can("compliance", feature, "read", "all")).toBe(true);
        }
    });

    it("compliance cannot create/update/delete on most features (spec §6)", () => {
        for (const feature of FEATURES) {
            if (feature === "vendor_settlement") continue; // spec gives compliance R + Approve here
            expect(can("compliance", feature, "create", "all")).toBe(false);
            expect(can("compliance", feature, "update", "all")).toBe(false);
            expect(can("compliance", feature, "delete", "all")).toBe(false);
        }
    });

    // --- Guest: minimal access (spec §6) ---
    it("guest can donate via QR/web (spec §6: donor_donation_credit → Donate)", () => {
        expect(can("guest", "donor_donation_credit", "create", "all")).toBe(true);
        expect(hasCapability("guest", "donor_donation_credit", "donate")).toBe(true);
    });

    it("guest can self-register as beneficiary (spec §6: self_register)", () => {
        expect(can("guest", "beneficiary_registration", "create", "own")).toBe(true);
        expect(hasCapability("guest", "beneficiary_registration", "self_register")).toBe(true);
    });

    it("guest cannot access vendor, settlement, fraud, audit (spec §6)", () => {
        expect(can("guest", "vendor_management", "read", "all")).toBe(false);
        expect(can("guest", "vendor_settlement", "read", "all")).toBe(false);
        expect(can("guest", "fraud_monitoring", "read", "all")).toBe(false);
        expect(can("guest", "audit_reports", "read", "all")).toBe(false);
    });

    // --- Donor: own-scope only (spec §6) ---
    it("donor has own-scope on donation/tokens/distribution (spec §6: Own)", () => {
        expect(can("donor", "donor_donation_credit", "create", "own")).toBe(true);
        expect(can("donor", "donor_donation_credit", "create", "all")).toBe(false);
        expect(can("donor", "token_generation", "create", "own")).toBe(true);
        expect(can("donor", "token_generation", "create", "all")).toBe(false);
        expect(can("donor", "token_distribution", "create", "own")).toBe(true);
        expect(can("donor", "token_distribution", "create", "all")).toBe(false);
    });

    // --- Vendor: own profile + scan/proof (spec §6) ---
    it("vendor has own-scope read/update on vendor_management (spec §6: Own profile)", () => {
        expect(can("vendor", "vendor_management", "read", "all")).toBe(false);
        expect(can("vendor", "vendor_management", "read", "own")).toBe(true);
        expect(can("vendor", "vendor_management", "update", "own")).toBe(true);
    });

    it("vendor has scan_proof capability on token_redemption (spec §6: CR scan/proof)", () => {
        expect(hasCapability("vendor", "token_redemption", "scan_proof")).toBe(true);
        expect(can("vendor", "token_redemption", "create", "own")).toBe(true);
        expect(can("vendor", "token_redemption", "read", "own")).toBe(true);
    });

    it("vendor can only view own settlement (spec §6: Own view)", () => {
        expect(can("vendor", "vendor_settlement", "read", "all")).toBe(false);
        expect(can("vendor", "vendor_settlement", "read", "own")).toBe(true);
    });

    it("vendor can create own proof_of_service (spec §6: C Own)", () => {
        expect(can("vendor", "proof_of_service", "create", "own")).toBe(true);
    });

    // --- Vendor Manager: Approve vendors/menus (spec §6) ---
    it("vendor_manager has approve capability on vendor_management (spec §6: Approve/CRU)", () => {
        expect(hasCapability("vendor_manager", "vendor_management", "approve")).toBe(true);
        expect(can("vendor_manager", "vendor_management", "create", "all")).toBe(true);
        expect(can("vendor_manager", "vendor_management", "read", "all")).toBe(true);
        expect(can("vendor_manager", "vendor_management", "update", "all")).toBe(true);
    });

    it("vendor_manager has approve capability on vendor_menu_pricing (spec §6: Approve)", () => {
        expect(hasCapability("vendor_manager", "vendor_menu_pricing", "approve")).toBe(true);
    });

    // --- Volunteer: assist + limited read (spec §6) ---
    it("volunteer has assist capability on beneficiary_registration (spec §6: CR assist)", () => {
        expect(hasCapability("volunteer", "beneficiary_registration", "assist")).toBe(true);
        expect(can("volunteer", "beneficiary_registration", "create", "all")).toBe(true);
        expect(can("volunteer", "beneficiary_registration", "read", "all")).toBe(true);
    });

    it("volunteer cannot approve beneficiaries or access settlements (spec §6)", () => {
        expect(can("volunteer", "beneficiary_registration", "update", "all")).toBe(false);
        expect(can("volunteer", "vendor_settlement", "read", "all")).toBe(false);
    });

    // --- Beneficiary: minimal own-scope (spec §6) ---
    it("beneficiary can read own registration and redemptions (spec §6: Own)", () => {
        expect(can("beneficiary", "beneficiary_registration", "read", "own")).toBe(true);
        expect(can("beneficiary", "beneficiary_registration", "read", "all")).toBe(false);
        expect(can("beneficiary", "token_redemption", "read", "own")).toBe(true);
    });

    // --- Cross-role fraud/audit restrictions (spec §6) ---
    it("only admin/compliance/vendor_manager can access fraud_monitoring (spec §6)", () => {
        const fraudRoles = USER_ROLES.filter((r) => can(r, "fraud_monitoring", "read", "all"));
        expect(fraudRoles).toEqual(["admin", "compliance", "vendor_manager"]);
    });

    it("only admin and compliance can access audit_reports (spec §6)", () => {
        const auditRoles = USER_ROLES.filter((r) => can(r, "audit_reports", "read", "all"));
        expect(auditRoles).toEqual(["admin", "compliance"]);
    });
});

// ---------------------------------------------------------------------------
// 3. Spec §6 gap tests — features the spec requires but code hasn't added
// ---------------------------------------------------------------------------

describe("spec §6 — missing features (expect failures until code catches up)", () => {
    // Spec §6: Donor Sponsorship Counters [M1-2]
    // Admin: R, Compliance: R, Donor: Own
    describe("donor_sponsorship_counters [M1-2]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("donor_sponsorship_counters");
        });

        it("admin can read (spec §6: R)", () => {
            expect(can("admin", "donor_sponsorship_counters" as Feature, "read", "all")).toBe(true);
        });

        it("donor can read own (spec §6: Own)", () => {
            expect(can("donor", "donor_sponsorship_counters" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: Institution Bulk Allocation [M1-11]
    // Admin: CRUD, Compliance: R, Vendor_Manager: R, Volunteer: R, Donor: —, Beneficiary: Institution (Own view)
    describe("institution_bulk_allocation [M1-11]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("institution_bulk_allocation");
        });

        it("admin has CRUD (spec §6: CRUD)", () => {
            for (const action of ACTIONS) {
                expect(can("admin", "institution_bulk_allocation" as Feature, action, "all")).toBe(true);
            }
        });
    });

    // Spec §6: Vendor Discovery [M1-5]
    // Admin: R, Vendor_Manager: R, Vendor: Own listing, Volunteer: R, Beneficiary: R
    describe("vendor_discovery [M1-5]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("vendor_discovery");
        });

        it("beneficiary can read (spec §6: R — nearby vendor search)", () => {
            expect(can("beneficiary", "vendor_discovery" as Feature, "read", "all")).toBe(true);
        });
    });

    // Spec §6: Vendor Capacity & Availability [M1-4]
    // Admin: CRUD, Compliance: R, Vendor_Manager: R, Vendor: Own (CRU), Beneficiary: R (status)
    describe("vendor_capacity_availability [M1-4]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("vendor_capacity_availability");
        });

        it("vendor can CRU own capacity (spec §6: Own CRU)", () => {
            expect(can("vendor", "vendor_capacity_availability" as Feature, "create", "own")).toBe(true);
            expect(can("vendor", "vendor_capacity_availability" as Feature, "read", "own")).toBe(true);
            expect(can("vendor", "vendor_capacity_availability" as Feature, "update", "own")).toBe(true);
        });

        it("beneficiary can read status (spec §6: R status)", () => {
            expect(can("beneficiary", "vendor_capacity_availability" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: Financial Ledgers & Reconciliation [M1-12]
    describe("financial_ledgers_reconciliation [M1-12]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("financial_ledgers_reconciliation");
        });

        it("admin has CRUD (spec §6)", () => {
            for (const action of ACTIONS) {
                expect(can("admin", "financial_ledgers_reconciliation" as Feature, action, "all")).toBe(true);
            }
        });

        it("vendor can read own payable (spec §6: Own payable R)", () => {
            expect(can("vendor", "financial_ledgers_reconciliation" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: Refunds / Failed Payments [M2-4]
    describe("refunds_failed_payments [M2-4]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("refunds_failed_payments");
        });

        it("donor can view/request own (spec §6: Own view/request)", () => {
            expect(can("donor", "refunds_failed_payments" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: CSR Module [M1-7]
    describe("csr_module [M1-7]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("csr_module");
        });

        it("donor (corporate) can access own CSR (spec §6: Own corporate)", () => {
            expect(can("donor", "csr_module" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: Volunteer Management [M1-13]
    describe("volunteer_management [M1-13]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("volunteer_management");
        });

        it("admin has CRUD (spec §6)", () => {
            for (const action of ACTIONS) {
                expect(can("admin", "volunteer_management" as Feature, action, "all")).toBe(true);
            }
        });

        it("volunteer can access own profile/activity (spec §6: Own)", () => {
            expect(can("volunteer", "volunteer_management" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: Quality: Feedback / Complaints / Inspections [M2-11]
    describe("quality_feedback_complaints_inspections [M2-11]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("quality_feedback_complaints_inspections");
        });

        it("beneficiary can create feedback/complaint (spec §6: C)", () => {
            expect(can("beneficiary", "quality_feedback_complaints_inspections" as Feature, "create", "own")).toBe(true);
        });

        it("vendor can respond to own (spec §6: Own respond)", () => {
            expect(can("vendor", "quality_feedback_complaints_inspections" as Feature, "read", "own")).toBe(true);
        });
    });

    // Spec §6: Emergency / Disaster Mode [M2-9]
    describe("emergency_disaster_mode [M2-9]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("emergency_disaster_mode");
        });

        it("admin has CRUD + toggle (spec §6: CRUD toggle)", () => {
            for (const action of ACTIONS) {
                expect(can("admin", "emergency_disaster_mode" as Feature, action, "all")).toBe(true);
            }
        });

        it("volunteer can read but not toggle (spec §6: R)", () => {
            expect(can("volunteer", "emergency_disaster_mode" as Feature, "read", "all")).toBe(true);
            expect(can("volunteer", "emergency_disaster_mode" as Feature, "update", "all")).toBe(false);
        });
    });

    // Spec §6: Analytics Dashboard [M2-8]
    describe("analytics_dashboard [M2-8]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("analytics_dashboard");
        });

        it("admin has full read (spec §6: R full)", () => {
            expect(can("admin", "analytics_dashboard" as Feature, "read", "all")).toBe(true);
        });

        it("vendor_manager has scoped read (spec §6: R scoped)", () => {
            expect(can("vendor_manager", "analytics_dashboard" as Feature, "read", "all")).toBe(true);
        });
    });

    // Spec §6: Public Transparency Dashboard [M1-14]
    describe("public_transparency_dashboard [M1-14]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("public_transparency_dashboard");
        });

        it("guest has read access (spec §6: bold R — unauthenticated)", () => {
            expect(can("guest", "public_transparency_dashboard" as Feature, "read", "all")).toBe(true);
        });

        it("all 8 roles have read access (spec §6: R for every role)", () => {
            for (const role of USER_ROLES) {
                expect(can(role, "public_transparency_dashboard" as Feature, "read", "all")).toBe(true);
            }
        });
    });

    // Spec §6: Document Management [M2-13]
    describe("document_management [M2-13]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("document_management");
        });

        it("vendor can upload own docs (spec §6: Own upload)", () => {
            expect(can("vendor", "document_management" as Feature, "create", "own")).toBe(true);
        });

        it("beneficiary can upload own docs (spec §6: Own upload)", () => {
            expect(can("beneficiary", "document_management" as Feature, "create", "own")).toBe(true);
        });
    });

    // Spec §6: Consent Management [M2-14]
    describe("consent_management [M2-14]", () => {
        it("feature exists in FEATURES array", () => {
            expect(FEATURES).toContain("consent_management");
        });

        it("donor can manage own consent (spec §6: Own)", () => {
            expect(can("donor", "consent_management" as Feature, "read", "own")).toBe(true);
        });

        it("beneficiary can manage own consent (spec §6: Own)", () => {
            expect(can("beneficiary", "consent_management" as Feature, "read", "own")).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// 4. Spec §6 gap: compliance approve on vendor_settlement
// ---------------------------------------------------------------------------

describe("spec §6 gap — compliance capabilities", () => {
    it("compliance has approve capability on vendor_settlement (spec §6: R + Approve)", () => {
        // Spec §6 says compliance gets "R + Approve" for Vendor Settlement
        expect(hasCapability("compliance", "vendor_settlement", "approve")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 5. assertCan — throws ForbiddenError correctly
// ---------------------------------------------------------------------------

describe("assertCan", () => {
    it("passes silently for allowed actions", () => {
        const admin = makeUser("admin");
        expect(() => assertCan(admin, "vendor_management", "read")).not.toThrow();
    });

    it("throws ForbiddenError for denied actions", () => {
        const donor = makeUser("donor");
        expect(() => assertCan(donor, "vendor_management", "read")).toThrow(ForbiddenError);
    });

    it("error message includes role, action, and feature", () => {
        const donor = makeUser("donor");
        try {
            assertCan(donor, "fraud_monitoring", "read");
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(ForbiddenError);
            expect((e as Error).message).toContain("donor");
            expect((e as Error).message).toContain("read");
            expect((e as Error).message).toContain("fraud_monitoring");
        }
    });

    it("respects scope parameter", () => {
        const vendor = makeUser("vendor");
        expect(() => assertCan(vendor, "vendor_management", "read", "own")).not.toThrow();
        expect(() => assertCan(vendor, "vendor_management", "read", "all")).toThrow(ForbiddenError);
    });
});

// ---------------------------------------------------------------------------
// 6. userCan — convenience wrapper
// ---------------------------------------------------------------------------

describe("userCan", () => {
    it("returns same result as can() for matching role", () => {
        for (const role of USER_ROLES) {
            const user = makeUser(role);
            for (const feature of FEATURES) {
                for (const action of ACTIONS) {
                    expect(userCan(user, feature, action)).toBe(can(role, feature, action));
                }
            }
        }
    });
});

// ---------------------------------------------------------------------------
// 7. Capabilities — spec §6 parenthetical notes
// ---------------------------------------------------------------------------

describe("capabilities — spec §6 parenthetical notes", () => {
    const capTests: Array<{ role: UserRole; feature: Feature; cap: Capability; expected: boolean; specRef: string }> = [
        // Positive cases per spec §6
        { role: "vendor_manager", feature: "vendor_management", cap: "approve", expected: true,
          specRef: "§6: Vendor_Manager → Vendor Management → Approve/CRU" },
        { role: "vendor_manager", feature: "vendor_menu_pricing", cap: "approve", expected: true,
          specRef: "§6: Vendor_Manager → Vendor Menu → Approve" },
        { role: "admin", feature: "vendor_settlement", cap: "override", expected: true,
          specRef: "§6: Admin → Vendor Settlement → CRUD + Override" },
        { role: "vendor", feature: "token_redemption", cap: "scan_proof", expected: true,
          specRef: "§6: Vendor → Token Redemption → CR (scan/proof)" },
        { role: "volunteer", feature: "beneficiary_registration", cap: "assist", expected: true,
          specRef: "§6: Volunteer → Beneficiary Registration → CR (assist)" },
        { role: "guest", feature: "beneficiary_registration", cap: "self_register", expected: true,
          specRef: "§6: Guest → Beneficiary Registration → Self-register" },
        { role: "guest", feature: "donor_donation_credit", cap: "donate", expected: true,
          specRef: "§6: Guest → Donor Donation Credit → Donate (QR/web)" },
        { role: "admin", feature: "proof_of_service", cap: "approve", expected: true,
          specRef: "§6: Admin → Proof of Service → approve" },
        // Negative cases — spec §6 does NOT grant these
        { role: "donor", feature: "vendor_management", cap: "approve", expected: false,
          specRef: "§6: Donor has no entry in Vendor Management" },
        { role: "volunteer", feature: "beneficiary_registration", cap: "approve", expected: false,
          specRef: "§6: Volunteer can assist but NOT approve" },
        { role: "vendor", feature: "vendor_settlement", cap: "override", expected: false,
          specRef: "§6: Vendor can only view own settlement" },
        { role: "beneficiary", feature: "token_redemption", cap: "scan_proof", expected: false,
          specRef: "§6: Beneficiary can read own redemptions, not scan" },
    ];

    for (const { role, feature, cap, expected, specRef } of capTests) {
        it(`${role} ${expected ? "has" : "lacks"} '${cap}' on ${feature} (${specRef})`, () => {
            expect(hasCapability(role, feature, cap)).toBe(expected);
        });
    }
});

// ---------------------------------------------------------------------------
// 8. Admin console role gating
// ---------------------------------------------------------------------------

describe("isAdminConsoleRole — spec §6 admin module access", () => {
    it("admin, compliance, vendor_manager can enter admin console", () => {
        expect(isAdminConsoleRole("admin")).toBe(true);
        expect(isAdminConsoleRole("compliance")).toBe(true);
        expect(isAdminConsoleRole("vendor_manager")).toBe(true);
    });

    it("donor, vendor, volunteer, beneficiary, guest cannot enter admin console", () => {
        expect(isAdminConsoleRole("donor")).toBe(false);
        expect(isAdminConsoleRole("vendor")).toBe(false);
        expect(isAdminConsoleRole("volunteer")).toBe(false);
        expect(isAdminConsoleRole("beneficiary")).toBe(false);
        expect(isAdminConsoleRole("guest")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 9. Matrix structural integrity
// ---------------------------------------------------------------------------

describe("matrix structural integrity", () => {
    it("FEATURES array has 22 entries (spec §6 defines 22 features)", () => {
        // Spec §6 Role Access Matrix has 22 feature rows (+ fraud + audit = 24 but
        // some are grouped). This test surfaces the gap if FEATURES < 22.
        expect(FEATURES.length).toBeGreaterThanOrEqual(22);
    });

    it("USER_ROLES array has 8 entries (spec §6: 8 roles)", () => {
        expect(USER_ROLES).toHaveLength(8);
    });

    it("every feature in PERMISSION_MATRIX is in FEATURES", () => {
        const matrixKeys = Object.keys(PERMISSION_MATRIX);
        for (const key of matrixKeys) {
            expect(FEATURES).toContain(key);
        }
    });

    it("every role in PERMISSION_MATRIX entries is a valid UserRole", () => {
        for (const feature of FEATURES) {
            const roles = Object.keys(PERMISSION_MATRIX[feature]);
            for (const role of roles) {
                expect(USER_ROLES).toContain(role);
            }
        }
    });

    it("getPermission returns NONE for unlisted (feature, role) pairs", () => {
        const perm = getPermission("beneficiary", "fraud_monitoring");
        expect(perm.create).toBe("none");
        expect(perm.read).toBe("none");
        expect(perm.update).toBe("none");
        expect(perm.delete).toBe("none");
        expect(perm.caps).toEqual([]);
    });
});
