import { isAdminConsoleRole } from "@/lib/permissions";
import type { UserRole } from "@/lib/types/enums";

/**
 * Single source of truth mapping an app role to its portal home. Used after a
 * successful sign-in (via /post-login) so a user always lands in the area their
 * *actual* role owns — the login page's portal tab is cosmetic and never grants
 * access. Staff roles (admin/compliance/vendor_manager) share the /admin console.
 */
export function portalHomeForRole(role: UserRole): string {
    if (isAdminConsoleRole(role)) return "/admin"; // admin | compliance | vendor_manager
    if (role === "donor") return "/donor/dashboard";
    if (role === "vendor") return "/vendor";
    if (role === "volunteer") return "/volunteer";
    return "/"; // beneficiary / guest have no portal — send home
}
