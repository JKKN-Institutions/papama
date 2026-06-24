import { FoodToken, TokenSummary, TokenStatus, STATUS_MAPPING } from '@/lib/donor/types/token';
import { DonorNotificationService } from './donorNotificationService';
import { isSupabaseConfigured, supabase } from './supabase';

// Unified schema row (supabase/migrations m16_tokens).
type TokenRow = {
  id: string; // UUID
  serial_number: string;
  qr_hash?: string | null;
  token_type?: string | null; // 'standard' | 'special_care'
  value_inr?: number | null; // token value in rupees
  status: string; // token_status enum
  donor_id?: string | null;
  donation_id?: string | null;
  campaign_id?: string | null;
  beneficiary_id?: string | null;
  special_instructions?: string | null;
  expires_at?: string | null;
  minted_at?: string | null;
  redeemed_at?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
};

// Explicit column list for the unified tokens table.
const TOKEN_COLUMNS =
  'id, serial_number, qr_hash, token_type, value_inr, status, donor_id, donation_id, campaign_id, beneficiary_id, special_instructions, expires_at, minted_at, redeemed_at, expired_at, cancelled_at';

export const MOCK_TOKENS: FoodToken[] = [
  {
    id: 'tok_001',
    serialNumber: 'PPM-SLM-9021',
    donationId: 'don_101',
    campaignId: 'camp_001',
    campaignTitle: 'Annapoorna School Breakfast Drive',
    status: 'redeemed',
    mintedAt: '2026-06-11T12:30:00Z',
    allocatedAt: '2026-06-12T07:15:00Z',
    redeemedAt: '2026-06-12T08:00:00Z',
    beneficiaryName: 'Aravind K. (Std V)',
    mealType: 'Hot Rava Pongal & Sambar',
    redemptionLocation: 'Govt Primary School, Salem - Canteen A',
    value: 5000,
    qrPayload: 'QR_PPM_SLM_9021',
    expiresAt: '2026-09-11T12:30:00Z',
    tokenType: 'standard',
  },
  {
    id: 'tok_002',
    serialNumber: 'PPM-SLM-9022',
    donationId: 'don_101',
    campaignId: 'camp_001',
    campaignTitle: 'Annapoorna School Breakfast Drive',
    status: 'unused',
    mintedAt: '2026-06-11T12:30:00Z',
    value: 5000,
    qrPayload: 'QR_PPM_SLM_9022',
    expiresAt: '2026-09-11T12:30:00Z',
    tokenType: 'standard',
  },
  {
    id: 'tok_003',
    serialNumber: 'PPM-CBE-8140',
    donationId: 'don_102',
    campaignId: 'camp_002',
    campaignTitle: 'Mercy Orphanage Nutrition Program',
    status: 'redeemed',
    mintedAt: '2026-06-14T15:00:00Z',
    allocatedAt: '2026-06-15T11:45:00Z',
    redeemedAt: '2026-06-15T12:30:00Z',
    beneficiaryName: 'Orphanage Child #104',
    mealType: 'Rice, Dal & Vegetable Poriyal',
    redemptionLocation: 'Mercy Home Dining Centre',
    value: 7500,
    qrPayload: 'QR_PPM_CBE_8140',
    expiresAt: '2026-09-14T15:00:00Z',
    tokenType: 'special_care',
    isSpecialCare: true,
  },
  {
    id: 'tok_004',
    serialNumber: 'PPM-CBE-8141',
    donationId: 'don_102',
    campaignId: 'camp_002',
    campaignTitle: 'Mercy Orphanage Nutrition Program',
    status: 'expired',
    mintedAt: '2026-05-01T10:00:00Z',
    expiredAt: '2026-06-01T00:00:00Z',
    value: 5000,
    qrPayload: 'QR_PPM_CBE_8141',
    expiresAt: '2026-06-01T00:00:00Z',
    tokenType: 'standard',
  },
  {
    id: 'tok_005',
    serialNumber: 'PPM-CBE-8142',
    donationId: 'don_102',
    campaignId: 'camp_002',
    campaignTitle: 'Mercy Orphanage Nutrition Program',
    status: 'cancelled',
    mintedAt: '2026-06-14T15:00:00Z',
    cancelledAt: '2026-06-15T09:00:00Z',
    value: 5000,
    qrPayload: 'QR_PPM_CBE_8142',
    expiresAt: '2026-09-14T15:00:00Z',
    tokenType: 'standard',
  },
];

export class TokenService {
  static async getTokens(): Promise<FoodToken[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_TOKENS;
    }

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select(TOKEN_COLUMNS)
        .order('minted_at', { ascending: false });

      if (error) {
        console.warn('Supabase error fetching tokens, falling back to mock tokens.', error);
        return MOCK_TOKENS;
      }

      return (data as TokenRow[]).map(mapToken);
    } catch (err) {
      console.warn('Failed to fetch Supabase tokens, falling back to mock tokens.', err);
      return MOCK_TOKENS;
    }
  }

  static async getTokenById(id: string): Promise<FoodToken | undefined> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_TOKENS.find((t) => t.id === id);
    }

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select(TOKEN_COLUMNS)
        .eq('id', id)
        .single();

      if (error) {
        return MOCK_TOKENS.find((t) => t.id === id);
      }

      return mapToken(data as TokenRow);
    } catch {
      return MOCK_TOKENS.find((t) => t.id === id);
    }
  }

  static async getTokenSummary(): Promise<TokenSummary> {
    const tokens = await this.getTokens();
    const now = new Date();

    const summary = tokens.reduce(
      (acc, t) => {
        const status = t.status as string;

        // New status counts (token_flow.md)
        if (status === TokenStatus.GENERATED || status === 'generated') acc.generated!++;
        else if (status === TokenStatus.LIVE || status === 'live' || status === 'unused') acc.live!++;
        else if (status === TokenStatus.IN_ADMIN_POOL || status === 'in_admin_pool') acc.inAdminPool!++;
        else if (status === TokenStatus.ASSIGNED_TO_VOLUNTEER || status === 'assigned_to_volunteer') acc.assignedToVolunteer!++;
        else if (status === TokenStatus.DISTRIBUTED || status === 'distributed') acc.distributed!++;
        else if (status === TokenStatus.REDEEMED || status === 'redeemed') acc.redeemed!++;
        else if (status === TokenStatus.EXPIRED || status === 'expired' || status === 'cancelled') acc.expired!++;

        // Add value tracking (Developer 2 Contract)
        if (t.value) {
          acc.totalValue! += t.value;
        }

        // Track expiring tokens (live tokens only)
        if (t.expiresAt && (status === TokenStatus.LIVE || status === 'live' || status === 'unused')) {
          const expiryDate = new Date(t.expiresAt);
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntilExpiry <= 7) {
            acc.expiringWithin7Days!++;
          }
          if (daysUntilExpiry <= 30) {
            acc.expiringWithin30Days!++;
          }
        }

        return acc;
      },
      {
        generated: 0,
        live: 0,
        inAdminPool: 0,
        assignedToVolunteer: 0,
        distributed: 0,
        redeemed: 0,
        expired: 0,
        totalValue: 0,
        expiringWithin7Days: 0,
        expiringWithin30Days: 0
      }
    );

    return summary;
  }

  static async markTokenRedeemed(
    id: string,
    beneficiaryName: string,
    mealType: string,
    redemptionLocation: string
  ): Promise<FoodToken | undefined> {
    const redeemedAt = new Date().toISOString();

    if (!isSupabaseConfigured || !supabase) {
      const token = MOCK_TOKENS.find((t) => t.id === id);
      if (!token) return undefined;

      token.status = 'redeemed';
      token.redeemedAt = redeemedAt;
      token.beneficiaryName = beneficiaryName;
      token.mealType = mealType;
      token.redemptionLocation = redemptionLocation;

      await DonorNotificationService.createNotification(
        'Token Redeemed',
        `${token.serialNumber} was redeemed for ${mealType} at ${redemptionLocation}.`
      );

      return token;
    }

    try {
      // Note: vendor/meal/location detail belongs in token_redemptions (vendor
      // side); the donor-side token row only tracks status + redeemed_at.
      const { data, error } = await supabase
        .from('tokens')
        .update({
          status: 'redeemed',
          redeemed_at: redeemedAt,
        })
        .eq('id', id)
        .select(TOKEN_COLUMNS)
        .single();

      if (error) throw error;

      const token = mapToken(data as TokenRow);
      await DonorNotificationService.createNotification(
        'Token Redeemed',
        `${token.serialNumber} was redeemed for ${mealType} at ${redemptionLocation}.`
      );

      return token;
    } catch (err) {
      console.warn('Failed to mark token redeemed:', err);
      return undefined;
    }
  }
}

function mapToken(token: TokenRow): FoodToken {
  // Map old statuses to new statuses for backward compatibility
  let mappedStatus: TokenStatus | string = token.status;
  if (STATUS_MAPPING[token.status]) {
    mappedStatus = STATUS_MAPPING[token.status];
  }

  return {
    id: token.id,
    serialNumber: token.serial_number,
    donationId: token.donation_id ?? '',
    campaignId: token.campaign_id ?? '',
    campaignTitle: '',
    status: mappedStatus,
    mintedAt: token.minted_at ?? '',
    redeemedAt: token.redeemed_at ?? undefined,
    expiredAt: token.expired_at ?? undefined,
    cancelledAt: token.cancelled_at ?? undefined,
    isSpecialCare: token.token_type === 'special_care',
    specialInstructions: token.special_instructions ?? undefined,
    // value_inr is in rupees; the UI expects paise (value / 100).
    value: token.value_inr != null ? token.value_inr * 100 : undefined,
    qrPayload: token.qr_hash ?? undefined,
    expiresAt: token.expires_at ?? undefined,
    tokenType: (token.token_type ?? undefined) as FoodToken['tokenType'],
  };
}
