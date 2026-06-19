# pApAmA — Owner Scope Document

> Source: original requirement document provided by the project owner. This is the authoritative description of *how the system should behave*. Read alongside papama-phase1-spec.md (what to build in Phase 1) and papama-client-decisions.md (confirmed values).

pApAmA – Scope Document

## 1. Project Overview

pApAmA is a technology-driven, token-based humanitarian platform designed to eliminate hunger with dignity through a controlled food-distribution system.
The platform enables donors to contribute funds that are converted into fixed-value food tokens, which can be redeemed by needy individuals at approved food outlets strictly for on-the-spot cooked meals.
pApAmA is not a payment, wallet, or discount application. Tokens represent food value only and can never be withdrawn, exchanged for cash, or used as discount equivalents.
Vendor settlement is configurable and executed based on defined settlement cycles (daily / twice-weekly / weekly), with explicit administrative oversight to ensure operational flexibility and cost optimization.
This document defines the end-to-end operational flow and detailed scope, explaining clearly where the process starts, how it moves through the system, and where it ends.
Sample Visual screens:

## 2. Stakeholders & User Roles


### 2.1 Donor

Individuals or organizations who contribute funds to sponsor meals.
Donor Credit & Contribution Logic
 Donors can contribute any amount, including micro-donations below token value.
 Contributions are accumulated as donor credit within the system.
 When accumulated credit reaches a token value, the donor is notified.
 Donors may choose to:
  - convert accumulated credit into a food token, or
  - continue accumulating credit for later redemption.
 The donor application shall be supported on both Android and iOS platforms. Donors may contribute using multiple payment methods including QR-based payments, payment gateways, credit cards, and direct bank payments, as configured by the system.
Fund Usage Rules
 Donated funds are non-withdrawable.
 Funds are permanently locked to the food-token lifecycle.
 Credits cannot be used as cash or discount equivalents.
Optional Donor Preferences
 Area / locality-based redemption preference
 Optional PIN-code or area-level restriction
Donor Portal Accessibility
 The platform shall provide a dedicated donor portal (mobile-first) enabling donors to contribute easily from anywhere.
 Donations shall be supported through payment gateways and multiple methods as configured by the system.
 The donor portal focuses on simplicity, accessibility, and transparency of contribution and usage.
 Donations may be made via QR code, bank transfer, UPI, cards, or any system-supported payment method, without mandatory app installation.
 Donors are not mandatorily required to install the mobile app; donations may also be completed through QR-based or web-assisted mechanisms.
Small-Value Sponsorship & Credit Accumulation
 Donors may sponsor small contribution amounts, which are maintained as donor credit within the system.
 Once accumulated credit reaches the value of a food token, the donor may:
  - redeem the credit for a token, or
  - continue accumulating credit for multiple tokens.
 Donors retain full flexibility to redeem accumulated credit as and when they choose.
Small-Value Donation Completion Logic
 Donors may contribute very small donation amounts, even below the value of a single food token.
 Such donations are accumulated as donor credit within the system.
 When the accumulated donation value approaches but does not fully reach the token value, the system may:
  - notify the donor to add the remaining amount, or
  - allow the donor to continue accumulation over time.

#### 2.1.1 Occasion-Based QR Donation (Event Campaign)

- Donors may create event-specific QR codes for:
 Weddings
 Anniversaries
 Religious functions
 Family events
- Event-specific QR codes may be printed on invitation cards with a message such as: “Instead of gifts, please donate food.”
- Guests scan the QR code and donate. • Contributions are automatically converted into food tokens (no cash handling). • Both the event host and contributing guest receive:
 Acknowledgement alerts
 Utilisation notifications
All funds remain locked to the food-token lifecycle.

### 2.2 Beneficiary

Needy individuals who receive and redeem food tokens.
Food Governance Rules
 Only on-the-spot cooked food is allowed.
 Distribution of packed, takeaway, or stored food is strictly prohibited.
 Tokens cannot be converted into cash or non-food items.
Fair Usage Controls
 One-person–one-meal rule enforced.
 Configurable time-based lockout (e.g., 6 hours) between redemptions.
Optional Beneficiary Co-Contribution
 Where enabled by Admin, the beneficiary may optionally contribute a nominal amount (up to ₹5) at the time of redemption.
 This amount is paid directly to the vendor.
 The co-contribution does not reduce or alter the token value in any way.
 The option to pay ₹0 must always be available.
Identity Validation
 Aadhaar usage is optional only, never mandatory.

#### 2.2.1 Beneficiary Registration & Verification (System-Driven)

- Beneficiaries may self-register online or be assisted by volunteers. • Registration requires submission of supporting documentation where applicable:
 Medical certificate
 Antenatal card
 Hospital reference
- Approval is strictly system-rule-driven. Volunteers cannot approve, override, or manually modify beneficiary eligibility. • Care Token eligibility is automatically determined by configured system rules.
Auto-Expiry Logic: • Pregnancy category: Valid until delivery + configurable post-delivery duration. • Patient category: Valid until treatment duration as configured by Admin.
All approvals, expiries, and category transitions are system-controlled and auditable.

### 2.3 Vendor

Approved food outlets that provide meals against tokens.
Vendor Governance
 Vendor onboarding and approval by Admin.
 Menu items and pricing subject to admin approval.
 Hygiene and quality ratings may be maintained.
Settlement Configuration
 Vendors can select preferred settlement cycles:
  - Daily
  - Twice-weekly
  - Weekly
 Settlement execution occurs only after admin-approved redemption validation.

### 2.4 Volunteer (Optional)

Authorized persons who distribute tokens on behalf of donors or pApAmA.
Additional responsibilities may include:
 Hygiene and quality observation
 Vendor feedback reporting
 Distribution audits

### 2.5 System Administrator

The pApAmA operations team acting as the master controller of the platform.
Configure optional beneficiary co-contribution rules, including enable/disable, maximum amount, and category-based exemptions.
Admin responsibilities include:
 Pooling of micro-donations
 Matching incomplete donor credits to generate tokens
 Holding excess value as system credit
 Defining token values
 Preventing misuse of tokens as discounts or cash
 Approving vendors, menus, and pricing
 Configuring settlement cycles and overrides
 Enforcing city / PIN / vendor-level restrictions
 Monitoring fraud, misuse, and alerts
All actions are logged and CSR-auditable.
Admin-Assisted Token Value Completion
 The administrator may match or supplement incomplete donor credits using pooled system funds to complete the value of a food token.
 Admin may also authorize token distribution based on accumulated donations even if the donor does not immediately complete the full token value.
 This mechanism ensures that small donations are effectively utilized without forcing donors to make immediate top-up payments.
Ensuring tokens are not applied or treated as promotional discounts, price reductions, or loyalty benefits at vendor outlets.

## 3. End-to-End Process Flow (High-Level Diagram)

Donor
│
│ (Donation via App – Any Amount)
▼
pApAmA System
│ - Credit Accumulation
│ - Token Creation
│ - Security Rules
▼
Token (QR Code)
│
│ (Given to Beneficiary)
▼
Beneficiary
│
│ (Visits Approved Vendor)
▼
Vendor App (QR Scan)
│
│-- Validation & Security Checks
▼
Food Served
│
▼
Admin Validation
│
▼
Configurable Vendor Settlement
│
▼
Donor Alert & Dashboard Update
3A. Donor Flow Diagram
Open Android App
│
▼
Donate Any Amount
│
▼
Credit Accumulated
│
▼
Multiple small donations accumulated over time toward token value
│
▼
Alert When Token Value Reached
│
▼
Convert to Token / Accumulate Further
│
▼
Assign / Distribute Token
│
▼
Receive Alert on Token Usage
│
▼
View Redemption Details
3B. Beneficiary Flow Diagram
 Beneficiary identity verification may be performed using optional Aadhaar, face verification, or other admin-approved methods.
 Identity verification is used only to prevent misuse, not for profiling.
 Food must be consumed on the spot at the vendor outlet.
 Packed, takeaway, or stored food is strictly prohibited to avoid fraud and misuse.
Receives Token (QR) Contact:
▼
Visits Approved Vendor
│
▼
Shows Token for Scan
│
▼
(Optional Aadhaar / Face Check)
│
▼
On-the-Spot Cooked Food Served
3C. Vendor Flow Diagram
Vendor Settlement & Cost Optimization Rules
 Instant settlement is not mandatory due to transaction and gateway costs.
 Vendors may choose their preferred settlement cycle:
  - end of day
  - twice a week
  - weekly
 Settlement frequency selection is vendor-configurable and admin-approved.
Vendor Login (Android / iOS)
│
▼
Scan QR Token
│
▼
System Validation
│ - Token
│ - Location
│ - Time Lock
│ - Face / Aadhaar (Optional)
▼
Menu Value Validation
│
▼
Serve Food
│
▼
Settlement as per Configured Cycle
3D. Admin Control Flow Diagram
Admin-Controlled Value & Pricing Rules
 Admin approves food items and pricing for each vendor.
 Beneficiaries may choose food within the token value.
 If the selected food value exceeds the token value, the beneficiary pays the difference directly to the vendor.
 If the selected food value is less than the token value, the remaining value is retained as system/admin credit.
Admin Login
│
▼
Approve Vendors & Menus
│
▼
Configure Token & Settlement Rules
│
▼
Monitor Redemptions
│
▼
View Alerts & Fraud Flags
│
▼
Audit, CSR & Financial Reports
3E. Lost Token & Replacement Flow
Token Reported Lost
│
▼
Admin Validates Private Logs
│
▼
Invalidate Token
│
▼
Issue Replacement (Admin Approved & Rate Limited)
- Lost token handling must follow a clearly defined admin-controlled process. • Every lost token request is validated using private system logs. • Tokens can only be cancelled and reissued with explicit admin approval. • All replacement actions are logged and rate-limited to prevent misuse.
In cases where a token is cancelled or invalidated, reissue of a replacement token is permitted only with donor approval. • Donors are notified via alert when a token is cancelled or reissued. • All cancellation and reissue actions are logged for audit and traceability.

## 4. Detailed Scope Explanation – End-to-End

This section explains the scope as one continuous operational process, not as separate modules.

### 4.1 Donor Initiation (Process Start)

This is the formal starting point of the pApAmA system. The entire lifecycle begins when a donor makes a conscious decision to sponsor a meal.
Platform Support for Donors - Android mobile application for donors - Web access (if required) for broader reach
 The donor contributes any amount via the pApAmA Android application.
 All donated funds are non-withdrawable and permanently locked to the food-token lifecycle.
 Funds can only be used for the creation and redemption of food tokens.
 Donor contributions are accumulated as system credit until eligible for token generation.
 The donor is notified when accumulated credit reaches the required token value.
At this stage, the system ensures that donor intent is clearly converted into a traceable digital value, without any ambiguity or manual intervention.
Sample Visual screens:

### 4.2 Token Generation & Management

After receiving donor funds, the system generates secure digital food tokens that act as controlled representations of the donated value.
 Each token is uniquely generated and cryptographically secured.
 The token carries a fixed food value mapped strictly to admin-approved food items and menus.
 Tokens are strictly one-time-use and cannot be combined, split, or applied as discounts.
 Tokens cannot be redeemed for non-food items or services.
 Until redemption, tokens remain inactive and cannot be converted back to cash.
This ensures that donated funds are used only for approved food consumption and cannot be misused or re-purposed in any form.
Every food token represents a fixed, predefined food value approved by the system and cannot be partially redeemed, split, or altered.

#### 4.2.1 Token Categories & Special Care Tokens

The platform shall support multiple token categories to address specific beneficiary needs:
- Standard Food Token – For general beneficiaries, redeemable for regular meals from admin-approved menus. • Special Care Token – Higher-value token (up to 2× standard value) for:
 Pregnant women
 Patients undergoing medical treatment
Care Tokens are redeemable only for predefined nutritious categories such as:
 Nutritious meals
 Fruits and vegetables
 Milk and protein-based items
Eligibility for Care Tokens shall be system-driven and linked to verified beneficiary registration status. Care Tokens cannot be redeemed for general or unrestricted food categories.

### 4.3 Token Distribution

Token distribution bridges the donor and the beneficiary while maintaining dignity, traceability, and misuse prevention.
 Tokens may be handed directly by donors to beneficiaries.
 Alternatively, donors may authorize pApAmA or trusted volunteers to distribute tokens on their behalf.
 Beneficiaries are not required to register, log in, or install any application.
 Tokens may be issued as digital QR codes, printed physical tokens, or mobile-based tokens, based on operational and distribution requirements.

Printed Token Handling
 Tokens may be issued in printed form with high-security QR codes and anti-copy features.
 Where feasible, printed tokens can be area-locked (city / locality / PIN code) to prevent misuse outside the intended distribution region.
 Printed tokens may be securely dispatched via courier to authorized donors, volunteers, or distribution points.
Token Expiry Management
 Token expiry rules are fully configurable by the System Administrator.
 Expiry may vary based on:
  - geography
  - distribution method (digital vs printed)
  - operational or emergency use cases
 Expired tokens are automatically invalidated by the system and cannot be redeemed.
Lost Token Handling
 In the event of a lost token, redemption eligibility is validated using private system logs.
 Replacement tokens, if approved, are:
  - admin-authorized
  - logged for audit
  - rate-limited to prevent misuse
This approach ensures controlled distribution while retaining flexibility for real-world scenarios.

### 4.4 Redemption at Vendor Outlet

This step represents the moment of dignity, where a beneficiary accesses food just like any regular customer, while ensuring strict food-only usage and financial control.
 The beneficiary visits any pApAmA-approved food outlet.
 The beneficiary selects food items from the admin-approved menu offered by the vendor.
 The vendor initiates redemption by scanning the token QR using the vendor application.
 Beneficiaries may select food items only from the list of system-approved and admin-authorized menu items.
 This control ensures that food tokens are used strictly for food purchase and are not misused as discount equivalents or cash substitutes.
Value Handling Rules
 If the selected food value exceeds the token value, the beneficiary pays the difference directly to the vendor.
 If the selected food value is less than the token value, the unused balance is retained by the system/admin and is not returned to the beneficiary in any form.
 Unused token value cannot be converted into cash, credited back to the beneficiary, or transferred.
 Beneficiaries have no entitlement to claim, withdraw, or demand any unused token value in any form.
Optional Beneficiary Co-Contribution
 Where enabled by Admin, the beneficiary may optionally contribute a nominal amount (up to ₹5) at the time of redemption.
 This amount is paid directly to the vendor.
 The co-contribution does not reduce or alter the token value in any way.
 The option to pay ₹0 must always be available.

No special counters, queues, or identification processes are involved, preserving normalcy, dignity, and fairness.
Volunteer Module
- Volunteers may register via QR code or web link. • System captures:
 Personal details
 Location preference
 Predefined role selection
- Volunteers may assist in:
 Beneficiary registration
 Distribution coordination
 Hygiene observation
- Volunteers cannot:
 Approve beneficiaries
 Override system rules
 Modify token allocations
 Authorize payments
Volunteer participation is structured and system-controlled.

### 4.5 Real-Time Validation & Security Checks

Once a token is scanned, the system performs multiple validations within seconds to confirm legitimacy, eligibility, and fair usage.
 QR code authenticity and encryption integrity are verified.
 Token usage status (unused / expired) is confirmed.
 Vendor credentials and approval status are validated.
 Redemption location is matched against approved geofences.
 A configurable time-based lock (e.g., minimum 6-hour gap) is enforced between redemptions for the same beneficiary to ensure fair distribution and prevent repeated use.
 The system enforces a maximum meal limit per beneficiary per day as configured by admin (e.g., not more than two meals per day).
Redemption proceeds only when all validations pass, ensuring system integrity and equitable access.
Time-Based Redemption Restriction
 Once a beneficiary redeems a food token and consumes a meal, the system enforces a minimum lock period of 6 hours before the same beneficiary can redeem another token.
 This rule is enforced across vendors and locations to prevent multiple redemptions by the same person within a short time window.
 The restriction is designed specifically to prevent misuse and ensure fair distribution.

### 4.6 Beneficiary Misuse Prevention & Optional Aadhaar Validation

To prevent repeated or organized misuse while preserving beneficiary privacy, the system applies temporary and privacy-safe verification mechanisms.
 A quick photo captured by the vendor is converted into a temporary, non-reversible face hash.
 The face hash is used only for short-term misuse prevention, such as enforcing time-gap and location rules.
 Face hash and Aadhaar verification are strictly prohibited from being used for long-term tracking, identity analytics, behavioral profiling, or any form of personal history creation.
 The platform actively monitors beneficiary usage patterns across days, weeks, and months to detect misuse.
 Face hash may be used to understand repeated redemption behaviour over defined time periods (days / weeks / months).
 This analysis is strictly limited to misuse prevention and policy enforcement.
Optional Aadhaar Validation
 Aadhaar verification, when available, is strictly optional and never mandatory.
 Aadhaar data is used only for immediate verification and is not stored, profiled, or reused.
 Face hash and Aadhaar (if used) may be retained by the admin strictly for verification and misuse-control purposes, subject to system policy and audit controls.
These mechanisms ensure misuse prevention without compromising dignity or privacy.
Administrative Controls for Misuse Prevention
The system enforces fair-usage rules such as:
 One-person–one-meal policy (configurable by admin)
 Minimum time-gap between meals (e.g., 6 hours or admin-defined) • If repeated misuse patterns are detected (e.g., multiple redemptions within restricted time or location limits):
 The system automatically flags the activity for admin review.
 Administrators may temporarily suspend token redemption for the beneficiary. • In cases of confirmed or repeated misuse:
 The administrator may permanently block further token redemptions for the beneficiary.
 Any such action is logged and auditable. • Blocking or suspension actions are applied strictly for misuse prevention and never for identity profiling or tracking.

### 4.7 Food Fulfilment

Once the system authorizes redemption, food is served immediately at the vendor outlet.
 Only freshly cooked, on-the-spot food prepared by the vendor is permitted.
 Distribution of packed, takeaway, pre-cooked, or stored food is strictly prohibited.
 The beneficiary consumes food as a regular customer, without any special handling or identification.
pApAmA does not participate in food preparation, storage, or delivery, ensuring freshness, dignity, and scalability.
Mandatory Proof of Food Service (Vendor-Driven)
- Vendor must upload:
 Digital receipt / bill
 Food plate photograph
- Token redemption is considered valid only after proof submission. • No proof upload → No payment release. • All uploads are timestamped and linked to the specific token ID.
This ensures accountability while preserving dignity and preventing misuse.

### 4.8 Vendor Settlement

Vendor settlement is designed to be flexible, transparent, and administratively controlled.
 Upon successful redemption, the system records the transaction for settlement processing.
 Vendors may select their preferred settlement frequency:
  - daily
  - twice-weekly
  - weekly
 Settlement execution occurs as per the configured cycle and is subject to admin oversight and validation.
 The system supports admin override to delay, review, or hold settlements when required.
All settlement transactions are permanently logged for audit and reconciliation.
Payment Lock Mechanism
- Token-related payments remain locked until:
 Successful redemption validation
 Mandatory proof upload (photo + receipt)
 System verification
- Only after successful verification will settlement be processed as per the configured settlement cycle.
Sample Visual screens:

### 4.9 Donor Transparency, Alerts & Audit (Process End)

Transparency is reinforced through real-time donor notifications and audit visibility.
 Donors receive automated alerts when a token is successfully redeemed.
 Alerts may be sent via in-app notification and/or SMS.
 The donor dashboard displays complete redemption details including:
  - Date and time of usage
  - Vendor name
  - Location of redemption
- Donors can view real-time donation status, accumulated credit, and redemption history at any time.
Each token is permanently closed after redemption, ensuring full traceability and donor confidence.

### 4.2 Beneficiary Flow (Non-App User)

 Beneficiary is not required to install an app
 Receives token via:
  - Printed QR token
  - Digital QR token
 Can redeem token at any authorized vendor

### 4.3 Vendor Module (Mobile App)

The Vendor Mobile Application is the primary operational interface for food redemption and is designed for reliability, speed, and ease of use.
Platform Support - Native Android application - Native iOS application
This ensures wide adoption across vendors irrespective of device preference.
Core Responsibilities of Vendor App - Secure vendor login and outlet verification - QR token scanning and redemption initiation - Real-time communication with the pApAmA system for validation - Beneficiary photo capture for misuse prevention - Instant confirmation of successful redemption - Visibility into settlement status and transaction history
The vendor app acts as a controlled gateway that ensures food is served only after system approval.

### 4.4 Volunteer Module (Optional)

 Volunteer registration & approval
 Token distribution tracking
 Area-based assignment
 Distribution audit trail

### 4.5 Admin Module


#### 4.5.1 Admin Authentication

 Role-based access

#### 4.5.2 Vendor Management

 Vendor approval/rejection
 Menu & pricing control
 Location & geofence setup
 Vendor suspension/blocking

#### 4.5.3 Token Management

 Token generation
 Token expiry rules
 Token usage policies

#### 4.5.4 Beneficiary Protection Rules

 One token per person per defined time window
 20 km radius lock enforcement
 City-level redemption control

#### 4.5.5 Fraud Monitoring Dashboard

 Suspicious activity alerts
 Vendor-level abuse detection
 Beneficiary repeat attempts

#### 4.5.6 Reporting & Audit

 Full audit logs
 CSR-compliant reports
 Exportable reports
 Sample visual screens:

## 5. Security Scope

Security is a foundational element of the pApAmA platform, designed to meet donor trust expectations, beneficiary dignity, vendor fairness, and CSR compliance requirements.
The system ensures that every token, transaction, and redemption event is verifiable, auditable, and protected against misuse.

### 5.1 QR Token Security

 Encrypted one-time-use QR codes
 Auto invalidation post redemption
 Anti-duplication checks

### 5.3 Geofencing & Location Rules

 Vendor location lock
 Redemption radius enforcement
 Time-based redemption limits

### 5.4 Printed Token Security

 Unique QR per token
 Copy-resistant design validation

### 5.2 Face-Match (Privacy-Aware)

 Temporary face hash generation
 No permanent image storage
 No Aadhaar or government ID usage
 Face hash data is used strictly for short-term misuse prevention and is never used for identity profiling or long-term tracking.

### 5.5 AI Fraud Detection & Intelligent Abuse Prevention

The pApAmA platform includes a comprehensive, intelligent fraud detection framework designed to proactively prevent misuse, abuse, and manipulation across beneficiaries, vendors, and tokens. The system continuously monitors real-time activity and behavioral patterns to ensure fairness, security, and trust.
The fraud detection coverage includes:
Beneficiary-Level Protection - Detection of repeated redemption attempts by the same individual using privacy-safe face-hash comparison - Monitoring of redemption frequency within defined time windows - Enforcement of radius and city-level limits to prevent multiple redemptions
Vendor-Level Protection - Identification of unusually high redemption volumes in short durations - Comparison of vendor activity against historical usage and approved capacity - Detection of abnormal scan retries or failed scan patterns. Optional capture of food-serving evidence (non-identifiable images) to support fraud detection, misuse analysis, and audit validation.
Token-Level Protection - Prevention of duplicate or reused QR tokens - Detection of cloned, tampered, or altered QR codes - Automatic rejection of expired or invalid tokens
Location & GPS Integrity - Detection of redemptions outside approved geofenced areas - Identification of GPS spoofing or location manipulation attempts
Behavioral & Pattern Analysis - Identification of clustered redemptions indicating organized misuse - Detection of coordinated abuse across multiple vendors or locations
Automated Controls & Alerts - Real-time flagging of suspicious activity - Automatic temporary blocking of tokens or vendors when thresholds are breached - Centralized admin visibility of fraud alerts, trends, and actions
All fraud detection mechanisms are implemented with strict privacy safeguards and without storing any personal identity data.
 Pattern recognition
 Vendor anomaly detection

## 6. Payment & Settlement Scope

The payment and settlement framework is designed to support individual donors, institutional donors, and CSR-driven contributions with complete financial transparency and administrative control.
 Secure integration with approved payment gateways for donor contributions.
 Donor funds are strictly locked to the food-token lifecycle and cannot be withdrawn.
 Vendor settlement is configurable (daily / twice-weekly / weekly).
 Administrative override is supported to delay, hold, or review settlements when required.
 Automated reconciliation between donations, redemptions, and vendor payouts.
 Full traceability and auditability of every financial transaction within the system.

## 7. Training & Awareness Module

- A short explainer video accessible via QR code and web portal.
 • Covers:
 PAPAMA philosophy
 Token lifecycle (Donor → Beneficiary → Vendor → Payment Lock → Settlement)
 Roles and responsibilities of each stakeholder • User manual (PDF + video format) available. • Accessible across web and mobile platforms.
Pilot & Performance Testing
- PAPAMA will initially be piloted in one selected city. • Real-user testing will be conducted to validate performance, usability, and operational flow. • Observations and refinements will be incorporated before broader rollout.
Multi-Language Support
Phase 1:
- English
- Hindi
- Tamil
Future expansion may include additional Indian regional languages.