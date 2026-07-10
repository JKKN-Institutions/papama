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

// ---------------------------------------------------------------------------
// 1. Exhaustive matrix coverage — every (feature, role, action) combination
// ---------------------------------------------------------------------------

describe("permission matrix — exhaustive RBAC", () => {
    /**
     * For every cell in the matrix, verify can() returns the expected boolean.
     * This is data-driven from the PERMISSION_MATRIX itself, so if the matrix
     * changes the tests auto-adapt. The test verifies can() honours the matrix
     * rather than hard-coding expected values (which would just duplicate it).
     */
    for (const feature of FEATURES) {
        describe(`feature: ${feature}`, () => {
            for (const role of USER_ROLES) {
                describe(`role: ${role}`, () => {
                    const perm = getPermission(role, feature);

                    for (const action of ACTIONS) {
                        const granted = perm[action]; // "all" | "own" | "none"

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
// 2. Specific high-value assertions (guards against accidental matrix edits)
// ---------------------------------------------------------------------------

describe("permission matrix — critical access rules", () => {
    // Admin has full access everywhere except proof_of_service (read+update only)
    it("admin has CRUD-all on every feature except proof_of_service", () => {
        for (const feature of FEATURES) {
            if (feature === "proof_of_service") continue;
            for (const action of ACTIONS) {
                expect(can("admin", feature, action, "all")).toBe(true);
            }
        }
    });

    it("admin has read+update on proof_of_service with approve capability", () => {
        expect(can("admin", "proof_of_service", "read", "all")).toBe(true);
        expect(can("admin", "proof_of_service", "update", "all")).toBe(true);
        expect(can("admin", "proof_of_service", "create", "all")).toBe(false);
        expect(can("admin", "proof_of_service", "delete", "all")).toBe(false);
        expect(hasCapability("admin", "proof_of_service", "approve")).toBe(true);
    });

    // Compliance is read-only across the board
    it("compliance can read all features but cannot create/update/delete", () => {
        for (const feature of FEATURES) {
            expect(can("compliance", feature, "read", "all")).toBe(true);
            expect(can("compliance", feature, "create", "all")).toBe(false);
            expect(can("compliance", feature, "update", "all")).toBe(false);
            expect(can("compliance", feature, "delete", "all")).toBe(false);
        }
    });

    // Guest has very limited access
    it("guest can only create donor_donation_credit and self-register for beneficiary", () => {
        const guestFeatures = FEATURES.filter((f) =>
            ACTIONS.some((a) => can("guest", f, a, "all") || can("guest", f, a, "own"))
        );
        expect(guestFeatures).toEqual(
            expect.arrayContaining(["donor_donation_credit", "beneficiary_registration"])
        );
        // Guest should not access vendor, settlement, fraud, audit
        expect(can("guest", "vendor_management", "read", "all")).toBe(false);
        expect(can("guest", "vendor_settlement", "read", "all")).toBe(false);
        expect(can("guest", "fraud_monitoring", "read", "all")).toBe(false);
        expect(can("guest", "audit_reports", "read", "all")).toBe(false);
    });

    // Donor can only act on own data
    it("donor has own-scope on donation, tokens, distribution — not all-scope", () => {
        expect(can("donor", "donor_donation_credit", "create", "own")).toBe(true);
        expect(can("donor", "donor_donation_credit", "create", "all")).toBe(false);
        expect(can("donor", "token_generation", "create", "own")).toBe(true);
        expect(can("donor", "token_generation", "create", "all")).toBe(false);
    });

    // Vendor can only access own profile and redemption
    it("vendor cannot read all vendors or settlements", () => {
        expect(can("vendor", "vendor_management", "read", "all")).toBe(false);
        expect(can("vendor", "vendor_management", "read", "own")).toBe(true);
        expect(can("vendor", "vendor_settlement", "read", "all")).toBe(false);
        expect(can("vendor", "vendor_settlement", "read", "own")).toBe(true);
    });

    // Volunteer cannot approve beneficiaries or manage settlements
    it("volunteer cannot update beneficiary_registration or access settlements", () => {
        expect(can("volunteer", "beneficiary_registration", "update", "all")).toBe(false);
        expect(can("volunteer", "vendor_settlement", "read", "all")).toBe(false);
    });

    // Beneficiary has minimal access
    it("beneficiary can only read own registration and own redemptions", () => {
        expect(can("beneficiary", "beneficiary_registration", "read", "own")).toBe(true);
        expect(can("beneficiary", "beneficiary_registration", "read", "all")).toBe(false);
        expect(can("beneficiary", "token_redemption", "read", "own")).toBe(true);
        expect(can("beneficiary", "token_redemption", "create", "own")).toBe(false);
    });

    // No role has fraud_monitoring except admin, compliance, vendor_manager
    it("only admin/compliance/vendor_manager can access fraud_monitoring", () => {
        const fraudRoles = USER_ROLES.filter((r) => can(r, "fraud_monitoring", "read", "all"));
        expect(fraudRoles).toEqual(["admin", "compliance", "vendor_manager"]);
    });

    // Only admin and compliance can access audit_reports
    it("only admin and compliance can access audit_reports", () => {
        const auditRoles = USER_ROLES.filter((r) => can(r, "audit_reports", "read", "all"));
        expect(auditRoles).toEqual(["admin", "compliance"]);
    });
});

// ---------------------------------------------------------------------------
// 3. assertCan — throws ForbiddenError correctly
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
        // Vendor can read own vendor_management but not all
        expect(() => assertCan(vendor, "vendor_management", "read", "own")).not.toThrow();
        expect(() => assertCan(vendor, "vendor_management", "read", "all")).toThrow(ForbiddenError);
    });
});

// ---------------------------------------------------------------------------
// 4. userCan — convenience wrapper
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
// 5. Capabilities
// ---------------------------------------------------------------------------

describe("capabilities", () => {
    const capTests: Array<{ role: UserRole; feature: Feature; cap: Capability; expected: boolean }> = [
        { role: "vendor_manager", feature: "vendor_management", cap: "approve", expected: true },
        { role: "vendor_manager", feature: "vendor_menu_pricing", cap: "approve", expected: true },
        { role: "admin", feature: "vendor_settlement", cap: "override", expected: true },
        { role: "vendor", feature: "token_redemption", cap: "scan_proof", expected: true },
        { role: "volunteer", feature: "beneficiary_registration", cap: "assist", expected: true },
        { role: "guest", feature: "beneficiary_registration", cap: "self_register", expected: true },
        { role: "guest", feature: "donor_donation_credit", cap: "donate", expected: true },
        { role: "admin", feature: "proof_of_service", cap: "approve", expected: true },
        // Negative cases
        { role: "donor", feature: "vendor_management", cap: "approve", expected: false },
        { role: "volunteer", feature: "beneficiary_registration", cap: "approve", expected: false },
        { role: "vendor", feature: "vendor_settlement", cap: "override", expected: false },
        { role: "beneficiary", feature: "token_redemption", cap: "scan_proof", expected: false },
    ];

    for (const { role, feature, cap, expected } of capTests) {
        it(`${role} ${expected ? "has" : "lacks"} '${cap}' on ${feature}`, () => {
            expect(hasCapability(role, feature, cap)).toBe(expected);
        });
    }
});

// ---------------------------------------------------------------------------
// 6. Admin console role gating
// ---------------------------------------------------------------------------

describe("isAdminConsoleRole", () => {
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
// 7. Matrix structural integrity
// ---------------------------------------------------------------------------

describe("matrix structural integrity", () => {
    it("FEATURES array has 11 entries", () => {
        expect(FEATURES).toHaveLength(11);
    });

    it("USER_ROLES array has 8 entries", () => {
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
        // beneficiary has no entry in fraud_monitoring
        const perm = getPermission("beneficiary", "fraud_monitoring");
        expect(perm.create).toBe("none");
        expect(perm.read).toBe("none");
        expect(perm.update).toBe("none");
        expect(perm.delete).toBe("none");
        expect(perm.caps).toEqual([]);
    });
});
