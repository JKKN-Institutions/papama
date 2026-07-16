/**
 * pApAmA — Phase 1 Types Layer (T2): Zod enum schemas
 *
 * These wrap the `as const` arrays in `lib/types/enums.ts` so there is exactly
 * ONE source of truth for allowed values. Postgres enum, TS union, and Zod
 * validator all derive from the same array — they cannot drift.
 *
 * Requires the `zod` package (`npm install zod`).
 */

import { z } from "zod";

import {
    BENEFICIARY_CATEGORIES,
    BENEFICIARY_STATUSES,
    CREDIT_TRANSACTION_TYPES,
    DISTRIBUTION_CHANNELS,
    DONATION_STATUSES,
    ELIGIBILITY_STATUSES,
    ESCALATION_STATUSES,
    FRAUD_DETECTION_METHODS,
    FRAUD_FLAG_TYPES,
    FRAUD_SEVERITIES,
    FRAUD_STATUSES,
    KYC_STATUSES,
    MEAL_TYPES,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_STATUSES,
    PAYMENT_FAILURE_REASONS,
    PAYMENT_STATUSES,
    PROOF_STATUSES,
    REFUND_STATUSES,
    REGISTRATION_STATUSES,
    REPORT_TYPES,
    SETTLEMENT_CYCLES,
    SETTLEMENT_STATUSES,
    TOKEN_STATUSES,
    TOKEN_TYPES,
    USER_ROLES,
    VENDOR_STATUSES,
    VOLUNTEER_ACTIVITY_TYPES,
    VOLUNTEER_REQUEST_STATUSES,
} from "@/lib/types/enums";

export const userRoleSchema = z.enum(USER_ROLES);
export const tokenTypeSchema = z.enum(TOKEN_TYPES);
export const tokenStatusSchema = z.enum(TOKEN_STATUSES);
export const distributionChannelSchema = z.enum(DISTRIBUTION_CHANNELS);
export const volunteerRequestStatusSchema = z.enum(VOLUNTEER_REQUEST_STATUSES);

export const creditTransactionTypeSchema = z.enum(CREDIT_TRANSACTION_TYPES);
export const donationStatusSchema = z.enum(DONATION_STATUSES);

export const beneficiaryCategorySchema = z.enum(BENEFICIARY_CATEGORIES);
export const beneficiaryStatusSchema = z.enum(BENEFICIARY_STATUSES);
export const eligibilityStatusSchema = z.enum(ELIGIBILITY_STATUSES);
export const registrationStatusSchema = z.enum(REGISTRATION_STATUSES);

export const vendorStatusSchema = z.enum(VENDOR_STATUSES);
export const kycStatusSchema = z.enum(KYC_STATUSES);
export const escalationStatusSchema = z.enum(ESCALATION_STATUSES);

export const settlementCycleSchema = z.enum(SETTLEMENT_CYCLES);
export const settlementStatusSchema = z.enum(SETTLEMENT_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const proofStatusSchema = z.enum(PROOF_STATUSES);

export const fraudFlagTypeSchema = z.enum(FRAUD_FLAG_TYPES);
export const fraudSeveritySchema = z.enum(FRAUD_SEVERITIES);
export const fraudStatusSchema = z.enum(FRAUD_STATUSES);
export const fraudDetectionMethodSchema = z.enum(FRAUD_DETECTION_METHODS);

export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);

export const reportTypeSchema = z.enum(REPORT_TYPES);

export const mealTypeSchema = z.enum(MEAL_TYPES);
export const volunteerActivityTypeSchema = z.enum(VOLUNTEER_ACTIVITY_TYPES);

export const paymentFailureReasonSchema = z.enum(PAYMENT_FAILURE_REASONS);
export const refundStatusSchema = z.enum(REFUND_STATUSES);
