export interface DonationRequest {
  amount: number; // in INR, > 0
  payment_method: 'upi' | 'qr' | 'card' | 'netbanking' | 'bank_transfer';
  donor_id: string | null; // null for guest / no-app donation
}

export interface DonationResponse {
  donation_id: string;
  amount: number;
  payment_method: 'upi' | 'qr' | 'card' | 'netbanking' | 'bank_transfer';
  status: 'success' | 'failed' | 'pending';
  credit_added: number;
  credit_balance: number;
  threshold_reached: boolean;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  type: 'donation' | 'purchase'; // wait, contract says: { id, type, amount, at }
  amount: number;
  at: string;
}

export interface CreditsResponse {
  credit_balance: number;
  threshold: number; // conversion threshold (₹50)
  threshold_reached: boolean;
  convertible_tokens: number;
  withdrawable: boolean; // always false
  transactions: CreditTransaction[];
}

export interface ConvertRequest {
  amount: number; // multiple of 50
  token_type: 'standard' | 'special_care';
  special_instructions?: string; // added to match the special instructions requirements
}

export interface ConvertTokenItem {
  token_id: string;
  type: 'standard' | 'special_care';
  qr_payload: string;
  status: 'active' | 'redeemed' | 'expired' | 'invalidated';
  expires_at: string;
}

export interface ConvertResponse {
  tokens: ConvertTokenItem[];
  credit_balance: number;
  converted: number;
}

export interface TokenItem {
  token_id: string;
  type: 'standard' | 'special_care';
  status: 'active' | 'redeemed' | 'expired' | 'invalidated';
  qr_payload: string;
  value: number; // value in INR (e.g. ₹50)
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  // Extracted from timeline journey if redeemed or if it has details:
  vendor_name?: string;
  location?: string;
  meal_info?: string;
  beneficiary_category?: string;
  is_special_care?: boolean;
  special_instructions?: string;
}

export interface TokensResponse {
  tokens: TokenItem[];
}

export interface MonthlySummaryItem {
  month: string; // "YYYY-MM"
  donated: number;
  meals: number;
}

export interface DashboardDonationHistoryItem {
  id: string;
  amount: number;
  at: string;
}

export interface RedemptionHistoryItem {
  token_id: string;
  vendor_name: string;
  location: string;
  time: string;
  meal_info: string;
  beneficiary_category: 'pregnant_women' | 'patient' | 'disability' | 'disaster_affected';
}

export interface DashboardResponse {
  total_credit: number;
  total_donations: number;
  total_tokens: number;
  meals_sponsored: number;
  monthly_summary: MonthlySummaryItem[];
  donation_history: DashboardDonationHistoryItem[];
  redemption_history: RedemptionHistoryItem[];
}

export interface NotificationMeta {
  vendor_name?: string;
  location?: string;
  time?: string;
  meal_info?: string;
  beneficiary_category?: 'pregnant_women' | 'patient' | 'disability' | 'disaster_affected';
}

export interface NotificationItem {
  id: string;
  type: 'donation_success' | 'threshold' | 'token_generated' | 'redemption' | 'thank_you';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  meta: NotificationMeta | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
}
