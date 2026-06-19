# pApAmA — Client Decisions & Build Directives

pApAmA — Client Decisions & Build Directives
Confirmed requirements from the client — read alongside papama-spec-complete.md
For: the development team (internal).  Source: client's email answers to the 20-question set — all 20 answered.  Read with: papama-spec-complete.md, papama-phase1-spec.md, papama-phase2-spec.md.
Status key:      Confirmed    = build as specced       Added to scope    = client extra, fold in       Deferred    = build later       Clarify    = open question       To finalise    = pick provider
Deferred — 80G tax receipts (Q5)
The client wants automatic 80G receipts, but they can only function once the PAPAMA Foundation holds 80G registration (per MOU Clause 21.7 the entity is intended but not yet constituted). Action now: build no receipt-generation logic, but include the data hooks — a nullable donor PAN field and donations grouped by financial year — so the feature is additive later, not a database migration on live data. Treat receipt generation as a Change Order (MOU Clause 11, ~Rs.30,000-50,000) once registration is obtained.
Client-borne costs these decisions rely on (MOU exclusions)
Per MOU Clauses 3.4 and 8.1, the client procures / pays on actuals (these are not in the Rs.7,50,000):
•   WhatsApp — WhatsApp Business API subscription (Q3).
•   SMS — SMS gateway costs (Q3, Q4).
•   Email — a transactional email service (Q4).
•   Gateway fees — payment-gateway transaction fees (Q17/Q18) — the organisation absorbs these rather than deducting from donations.
•   AI APIs — AI/ML API usage for face-match (Q12) and fraud / anomaly detection (Q15, Q20), billed monthly on a pass-through basis.
Correction needed in the MOU / quotation
Annexure A (quotation executive summary) advertises “vendors get instant settlement.” This contradicts the client's confirmed decision (Q19) and the spec. Update the wording to “configurable settlement cycles (daily / twice-weekly / weekly) with admin oversight.”
Standing principles (apply across the whole build)
•   pApAmA is a meal-enablement platform — never a food-delivery or food-storage organisation.
•   Every beneficiary must be able to receive food regardless of Aadhaar, smartphone, bank account, or formal ID.
•   Donor transparency is important, but beneficiary privacy must always be protected (show categories, never identities).
•   All limits (token value, meal frequency, distance, expiry, etc.) must stay editable by admins from the Admin Panel.
•   Design for expansion to multiple cities and states without major redesign.
Open items still needing the client's input
•   Beneficiary categories — define whether “disaster-affected (during emergencies)” is a standing beneficiary category or an emergency mode, and the proof / eligibility for it and for persons with disabilities (Q7).
•   Email — choose the email service, and confirm email scope is notifications only for now (receipts deferred with 80G) (Q4).
•   Payment provider — confirm the final payment provider from the shortlist (Q17).
Not covered by these 20 decisions
The separate optional-features set — event QR donations, micro-donation pooling, lost-token replacement, training module, Hindi/Tamil languages, donor area-preference, and volunteer hygiene feedback — is tracked elsewhere and remains pending the client's choice. Each is a Change Order under the MOU and is not part of the current build.

| # | Decision area | Ref | Client's decision | Build action for developer | Status |
| Q1 | Leftover-food collection | SCOPE-1 | No — fresh meals eaten at the shop only. | No food pickup / storage / delivery features. Core stays redeem-at-shop only. | Confirmed |
| Q2 | Token value model | SCOPE-3 | One fixed value; Special Care may be higher. | token_types = Standard + Special Care (up to 2x). No multi-denomination model. | Confirmed |
| Q3 | WhatsApp / SMS channels | SCOPE-5 | Yes — WhatsApp interactions; SMS for notifications & basic comms. | Build WhatsApp channel + SMS notifications. (WhatsApp Business API & SMS gateway are client-procured — see Costs note.) | Confirmed |
| Q4 | Email notifications | NOTIF-1 | Add email too. | Add email channel for donor notifications. Needs a transactional email service. Not in MOU's listed channels — minor addition. | Added to scope |
| Q5 | 80G tax receipts | 80G | Wanted, BUT the entity has no 80G registration yet. | DEFER receipt generation. NOW: add nullable donor PAN field + structure donations by financial year (data hooks only) so it is additive later, not a migration. See Deferred note. | Deferred |
| Q6 | “Donor credit” naming | BRAND-1 | Confirmed. | Use “donor credit” everywhere; never “wallet”. | Confirmed |
| Q7 | Beneficiary groups | RULE-13 | List confirmed + ADD persons with disabilities and disaster-affected individuals. | Add 2 categories to the beneficiary enum + eligibility/proof per category. CLARIFY: is “disaster-affected (during emergencies)” a standing category or an emergency mode, and what proof? (See Open Items.) | Added to scope |
| Q8 | Fresh-on-the-spot boundary | FOOD-1/3 | Confirmed. | Redemption rule: freshly cooked, eaten at shop; no packed / takeaway / stored. pApAmA never cooks / stores / delivers. | Confirmed |
| Q9 | Special Care food items | FOOD-2 | One standard list; shops may request approved local equivalents. | Central Care-item list; menu-approval flow accepts shop requests for equivalent nutritious items (admin approves). | Confirmed |
| Q10 | Special Care duration | FOOD-4 | Confirmed + post-delivery support up to 6 months (configurable). | Auto-expiry: pregnancy until delivery + post-delivery window (default up to 6 months, admin-configurable); patient until treatment ends. | Confirmed |
| Q11 | Aadhaar optional | IDENT-1 | Confirmed — optional, never mandatory. | Aadhaar optional only; face-hash primary; aadhaar field nullable. RESOLVES the brief-vs-interview conflict. | Confirmed |
| Q12 | Fingerprint vs face | IDENT-4 | Face check only; no fingerprint. | Face-hash verification; no fingerprint hardware. (Face-match AI is client-procured pass-through.) | Confirmed |
| Q13 | No-phone / no-ID fallback | IDENT-3 | Confirmed. | Volunteer-assisted redemption path; no genuine beneficiary denied. | Confirmed |
| Q14 | Vendor onboarding info | VENDOR-1 | Enough + ADD FSSAI licence, GST no., emergency contact, geo-location. | Add 4 fields to vendor onboarding / data model. Geo-location ties into existing geofencing. FSSAI = food-safety capture. | Added to scope |
| Q15 | Proof of service | VENDOR-3 | Confirmed + random audits & AI fraud. | Proof-gated payment (meal photo + bill, no proof -> no pay). Random audits + AI fraud already in scope. (AI fraud = client pass-through.) | Confirmed |
| Q16 | Volunteer permissions | VOL-3 | Confirmed. | Volunteers: register / assist / distribute. CANNOT approve eligibility, change rules, or release payments. Enforce in RBAC. | Confirmed |
| Q17 | Payment methods + provider | PAY-2 | Methods OK; shortlist Razorpay / Cashfree / PhonePe; finalise later. | Build payment integration provider-agnostic; recommend Razorpay; confirm final provider at implementation. | To finalise |
| Q18 | Who bears gateway fee | PAY-3 | Organisation absorbs it. | Do NOT deduct fee from donation — donor's full value -> food. Org bears gateway fee. Future (optional): donor-covers-fee toggle. | Confirmed |
| Q19 | Settlement model | PAY-6/7 | Confirmed — configurable cycles, no instant, admin hold/audit. | Settlement engine: daily / twice-weekly / weekly + admin override / hold / audit. NOTE: correct MOU Annexure A wording (it says “instant settlement”). | Confirmed |
| Q20 | Donor post-meal view | NOTIF-3 | Confirmed + ADD meal category, beneficiary category, impact stats, monthly summary. | Dashboard additions + monthly donation summary report. Beneficiary category is non-identifying (privacy-safe). | Added to scope |
