import { vi } from "vitest";
import type { AppUser } from "@/lib/auth";
import type { UserRole } from "@/lib/types/enums";

/**
 * Test helpers for authentication mocking.
 *
 * Usage in tests:
 *   vi.mock("@/lib/auth", async (importActual) => {
 *       const actual = await importActual<typeof import("@/lib/auth")>();
 *       return { ...actual, requireAppUser: vi.fn() };
 *   });
 *   import { requireAppUser } from "@/lib/auth";
 *   const mock = vi.mocked(requireAppUser);
 *   mock.mockResolvedValue(makeUser("admin"));
 */

let userCounter = 0;

/**
 * Create a test AppUser with sensible defaults for a given role.
 * Each call generates a unique user ID.
 */
export function makeUser(role: UserRole, overrides?: Partial<AppUser>): AppUser {
    userCounter++;
    const id = overrides?.id ?? `00000000-0000-0000-0000-${String(userCounter).padStart(12, "0")}`;

    return {
        id,
        email: overrides?.email ?? `${role}-${userCounter}@papama.test`,
        role,
        donor_id: overrides?.donor_id ?? (role === "donor" ? `donor-${userCounter}` : null),
        ...overrides,
    };
}

/** Pre-built users for common test scenarios */
export const TEST_USERS = {
    admin: makeUser("admin", { id: "admin-001", email: "admin@papama.test" }),
    compliance: makeUser("compliance", { id: "compliance-001", email: "compliance@papama.test" }),
    vendor_manager: makeUser("vendor_manager", { id: "vm-001", email: "vm@papama.test" }),
    vendor: makeUser("vendor", { id: "vendor-001", email: "vendor@papama.test" }),
    volunteer: makeUser("volunteer", { id: "volunteer-001", email: "volunteer@papama.test" }),
    donor: makeUser("donor", { id: "donor-001", email: "donor@papama.test", donor_id: "donor-001" }),
    beneficiary: makeUser("beneficiary", { id: "beneficiary-001", email: "beneficiary@papama.test" }),
    guest: makeUser("guest", { id: "guest-001", email: null }),
} as const;

/** All role names for data-driven tests */
export const ALL_ROLES: UserRole[] = [
    "admin", "compliance", "vendor_manager", "vendor",
    "volunteer", "donor", "beneficiary", "guest",
];

/**
 * Reset the user counter (call in beforeEach if you need deterministic IDs).
 */
export function resetUserCounter(): void {
    userCounter = 0;
}
