export type TokenStatus = 'unused' | 'redeemed' | 'expired' | 'cancelled';

export interface FoodToken {
  id: string;
  serialNumber: string;
  donationId: string;
  campaignId: string;
  campaignTitle: string;
  status: TokenStatus;
  mintedAt: string;
  allocatedAt?: string;
  redeemedAt?: string;
  expiredAt?: string;
  cancelledAt?: string;
  beneficiaryName?: string; // e.g. "Govt School Student (A.K.)"
  mealType?: string; // e.g. "Mid-day Noon Meal"
  redemptionLocation?: string; // e.g. "School Canteen A"
  isSpecialCare?: boolean; // Base support for Special Care tokens
  specialInstructions?: string; // Additional instruction details for Special Care
}

export interface TokenSummary {
  totalUnused: number;
  totalRedeemed: number;
  totalExpired: number;
  totalCancelled: number;
}

