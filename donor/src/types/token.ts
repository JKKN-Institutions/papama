// Token Lifecycle Status (authoritative from token_flow.md)
export enum TokenStatus {
  GENERATED = 'generated',
  LIVE = 'live',
  IN_ADMIN_POOL = 'in_admin_pool',
  ASSIGNED_TO_VOLUNTEER = 'assigned_to_volunteer',
  DISTRIBUTED = 'distributed',
  REDEEMED = 'redeemed',
  EXPIRED = 'expired',
}

// Backward compatibility mapping for old statuses
export const STATUS_MAPPING: Record<string, TokenStatus> = {
  'unused': TokenStatus.LIVE,
  'cancelled': TokenStatus.EXPIRED,
};

export enum TokenType {
  STANDARD = 'standard',
  SPECIAL_CARE = 'special_care',
}

// Token Holder Classification
export enum CurrentHolderType {
  DONOR = 'donor',
  POOL = 'pool',
  VOLUNTEER = 'volunteer',
}

// Token Distribution Channels
export enum DistributionChannel {
  DONOR_SELF = 'donor_self',
  ADMIN_TO_VOLUNTEER = 'admin_to_volunteer',
  VOLUNTEER_REQUEST_GRANT = 'volunteer_request_grant',
  VOLUNTEER_TO_BENEFICIARY = 'volunteer_to_beneficiary',
}

export interface FoodToken {
  id: string; // UUID
  serialNumber: string;
  donationId: string;
  campaignId: string;
  campaignTitle: string;
  tokenTypeId?: string; // UUID reference to token_types table
  status: TokenStatus | string; // Can be new enum or mapped from old values
  mintedAt: string;
  allocatedAt?: string;
  redeemedAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  beneficiaryName?: string; // e.g. "Govt School Student (A.K.)"
  mealType?: string; // e.g. "Mid-day Noon Meal"
  redemptionLocation?: string; // e.g. "School Canteen A"
  isSpecialCare?: boolean; // Base support for Special Care tokens (legacy)
  specialInstructions?: string; // Additional instruction details for Special Care
  // Developer 2 Contract Support
  value?: number; // Token value in paise (e.g. 5000 = ₹50)
  qrPayload?: string; // QR code payload for redemption
  expiresAt?: string; // Token expiration timestamp (ISO 8601)
  tokenType?: TokenType | 'standard' | 'special_care'; // Token type enum
  // Token Holder Support (token_flow.md)
  currentHolderType?: CurrentHolderType | string; // who currently holds this token
  currentHolderId?: string; // ID of the current holder (UUID or string)
}

export interface TokenSummary {
  // New status counts (from token_flow.md)
  generated?: number;
  live?: number;
  inAdminPool?: number;
  assignedToVolunteer?: number;
  distributed?: number;
  redeemed?: number;
  expired?: number;

  // Legacy counts (for backward compatibility)
  totalUnused?: number;
  totalRedeemed?: number;
  totalExpired?: number;
  totalCancelled?: number;

  // Metrics
  totalValue?: number; // Total value of all tokens in paise
  expiringWithin7Days?: number; // Count of tokens expiring within 7 days
  expiringWithin30Days?: number; // Count of tokens expiring within 30 days
}

