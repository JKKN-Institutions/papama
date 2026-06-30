import type { Action, Feature } from "@/lib/permissions";

/**
 * The admin console's section directory — single source of truth for both the
 * home-page card grid (app/admin/page.tsx) and the persistent nav strip
 * (app/admin/AdminHeader.tsx). Each entry names the permission cell that gates
 * it so the nav can hide links a role can't use (`useCan(feature, action)`);
 * the server route still enforces the matrix regardless.
 */
export interface AdminSection {
    href: string;
    title: string;
    description: string;
    /** Permission cell the nav gates the link on (read access to the section). */
    feature: Feature;
    action: Action;
    /** Short label for the compact nav strip (defaults to title). */
    navLabel?: string;
}

export const ADMIN_SECTIONS: AdminSection[] = [
    {
        href: "/admin/vendors",
        title: "Vendors",
        description: "Registered food vendors and their onboarding/KYC status.",
        feature: "vendor_management",
        action: "read",
    },
    {
        href: "/admin/donations",
        title: "Donations",
        description: "All gifts (attributed + anonymous); convert the guest pool into distributable tokens.",
        feature: "donor_donation_credit",
        action: "read",
    },
    {
        href: "/admin/beneficiaries",
        title: "Beneficiaries",
        description: "Approved beneficiary registry — category, status, eligibility.",
        feature: "beneficiary_registration",
        action: "read",
    },
    {
        href: "/admin/beneficiary-registrations",
        title: "Beneficiary registrations",
        description: "Review eligibility submissions; approve to create verified beneficiaries.",
        feature: "beneficiary_registration",
        action: "read",
        navLabel: "Registrations",
    },
    {
        href: "/admin/vendor-menus",
        title: "Vendor menus",
        description: "Approve vendor-proposed menu items (incl. Special-Care equivalents).",
        feature: "vendor_menu_pricing",
        action: "read",
        navLabel: "Menus",
    },
    {
        href: "/admin/volunteers",
        title: "Volunteers",
        description: "Volunteer registry for token distribution (Path B).",
        feature: "token_distribution",
        action: "read",
    },
    {
        href: "/admin/tokens",
        title: "Tokens",
        description: "Token registry by status/holder; run the expire-sweep for lapsed tokens.",
        feature: "token_generation",
        action: "read",
    },
    {
        href: "/admin/proofs",
        title: "Proof review",
        description:
            "Verify vendor plate-photo + receipt proofs; approval releases the locked payment for settlement.",
        feature: "proof_of_service",
        action: "read",
        navLabel: "Proofs",
    },
    {
        href: "/admin/settlements",
        title: "Settlements",
        description: "Vendor settlement headers and payout status.",
        feature: "vendor_settlement",
        action: "read",
    },
    {
        href: "/admin/fraud",
        title: "Fraud",
        description: "Fraud flags, severity, detection method and resolution.",
        feature: "fraud_monitoring",
        action: "read",
    },
    {
        href: "/admin/reports",
        title: "Reports",
        description: "Generated compliance & CSR report exports.",
        feature: "audit_reports",
        action: "read",
    },
    {
        href: "/admin/audit-logs",
        title: "Audit logs",
        description: "Append-only, immutable trail of every admin action.",
        feature: "audit_reports",
        action: "read",
        navLabel: "Audit",
    },
    {
        href: "/admin/ngo-partners",
        title: "NGO partners",
        description: "Partner NGO/organisation reference registry.",
        feature: "audit_reports",
        action: "read",
        navLabel: "NGOs",
    },
    {
        href: "/admin/system-config",
        title: "System config",
        description: "Admin-tunable rules read at runtime (thresholds, limits).",
        feature: "audit_reports",
        action: "read",
        navLabel: "Config",
    },
    // --- Phase-1 addon areas (pages created by Wave-2 agents) ---------------
    {
        href: "/admin/meal-windows",
        title: "Meal windows",
        description: "Configure per-slot serving windows (breakfast/lunch/dinner/snack) enforced at redemption.",
        feature: "token_redemption",
        action: "read",
        navLabel: "Meals",
    },
    {
        href: "/admin/vendor-capacity",
        title: "Vendor capacity",
        description: "Vendor daily capacity & availability windows; throttle redemptions when capacity is reached.",
        feature: "vendor_management",
        action: "read",
        navLabel: "Capacity",
    },
    {
        href: "/admin/vendor-feedback",
        title: "Vendor feedback",
        description: "Beneficiary feedback, inspections and auto-suspend review for vendors.",
        feature: "vendor_management",
        action: "read",
        navLabel: "Feedback",
    },
    {
        href: "/admin/settlement-audit",
        title: "Settlement audit",
        description: "Random and flagged settlement audit queue; review before payout release.",
        feature: "vendor_settlement",
        action: "read",
        navLabel: "Audit queue",
    },
    {
        href: "/admin/institutions",
        title: "Institutions",
        description: "Partner institutions: bulk token allocation and per-institution redemption reporting.",
        feature: "audit_reports",
        action: "read",
    },
    {
        href: "/admin/csr",
        title: "Corporate CSR",
        description: "Corporate CSR donors and aggregated CSR reports (by company / campaign / financial year).",
        feature: "audit_reports",
        action: "read",
        navLabel: "CSR",
    },
    {
        href: "/admin/volunteer-activity",
        title: "Volunteer activity",
        description: "Volunteer zones and field-activity log (tokens distributed, registrations assisted).",
        feature: "token_distribution",
        action: "read",
        navLabel: "Activity",
    },
    {
        href: "/admin/emergency",
        title: "Emergency mode",
        description: "Global emergency relief toggle and relaxed per-day meal limits.",
        feature: "audit_reports",
        action: "read",
        navLabel: "Emergency",
    },
    {
        href: "/admin/transparency",
        title: "Transparency",
        description: "Public transparency dashboard configuration and published metrics.",
        feature: "audit_reports",
        action: "read",
    },
];
