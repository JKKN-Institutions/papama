
**Layer 5 — Pages:** Donor portal (donate, credit, tokens, history, dashboard) + no-app QR donation page; Vendor app (login, scan, validate, menu, proof upload, settlement view); Admin console (vendors, menus, tokens, beneficiary rules, settlements, fraud dashboard, reports); Volunteer (registration assist, distribution); mobile-responsive throughout.

---

## 9. Demo Script (for the client review / milestone)

1. Donor donates ₹30, then ₹20 → credit reaches ₹50 → alert → convert to a **Standard** token (show QR).
2. Show a **Special Care** token issued to a registered pregnant/patient beneficiary, restricted to nutritious menu items.
3. Distribute a token (digital QR + show a printed token with anti-copy QR).
4. Vendor app scans → validations run live (show a blocked second redemption within 6 h, and a geofence rejection).
5. Beneficiary picks a meal under token value → balance forfeited; then one over value → pays difference; show optional ₹5 co-pay with ₹0 default.
6. Vendor uploads plate photo + receipt → payment unlocks.
7. Run a settlement on the vendor's chosen cycle; show admin override (hold).
8. Donor receives the redemption alert + sees it on the dashboard (time, vendor, location) with thank-you + re-donate link.
9. Admin: show fraud dashboard, audit log (immutable), and an exportable CSR report.

---

## 10. Phase 1 Definition of Done

- The full demo script runs end-to-end on Android + iOS (vendor) and donor web/app.
- All Phase 1 tables migrated with RLS; `system_config` drives every configurable rule.
- Proof-gated payments and configurable settlement working with admin override.
- Aadhaar non-mandatory; face-hash verification working; privacy-safe (no permanent identity storage).
- Audit log immutable; CSR report exports.
- UI strings externalized (i18n-ready).
- `ASSUMPTIONS.md` lists anything decided in the absence of a client answer (see parent §12 — most items now **resolved** by client decisions; remaining open: disaster-affected definition/proof, email provider, payment provider).