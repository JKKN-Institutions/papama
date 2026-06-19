import { FoodToken, TokenSummary } from '@/src/types/token';
import { DonorNotificationService } from './donorNotificationService';
import { isSupabaseConfigured, supabase } from './supabase';

type TokenRow = {
  id: string;
  serial_number: string;
  donation_id: string;
  token_type_id: string;
  campaign_title: string;
  status: FoodToken['status'];
  minted_at: string;
  allocated_at?: string | null;
  redeemed_at?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  beneficiary_name?: string | null;
  meal_type?: string | null;
  redemption_location?: string | null;
  is_special_care?: boolean;
  special_instructions?: string | null;
};

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
  },
  {
    id: 'tok_002',
    serialNumber: 'PPM-SLM-9022',
    donationId: 'don_101',
    campaignId: 'camp_001',
    campaignTitle: 'Annapoorna School Breakfast Drive',
    status: 'unused',
    mintedAt: '2026-06-11T12:30:00Z',
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
        .select('*')
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
        .select('*')
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

    return tokens.reduce(
      (acc, t) => {
        if (t.status === 'unused') acc.totalUnused++;
        else if (t.status === 'redeemed') acc.totalRedeemed++;
        else if (t.status === 'expired') acc.totalExpired++;
        else if (t.status === 'cancelled') acc.totalCancelled++;
        return acc;
      },
      { totalUnused: 0, totalRedeemed: 0, totalExpired: 0, totalCancelled: 0 }
    );
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
      const { data, error } = await supabase
        .from('tokens')
        .update({
          status: 'redeemed',
          redeemed_at: redeemedAt,
          beneficiary_name: beneficiaryName,
          meal_type: mealType,
          redemption_location: redemptionLocation,
        })
        .eq('id', id)
        .select('*')
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
  return {
    id: token.id,
    serialNumber: token.serial_number,
    donationId: token.donation_id,
    campaignId: token.token_type_id,
    campaignTitle: token.campaign_title,
    status: token.status,
    mintedAt: token.minted_at,
    allocatedAt: token.allocated_at ?? undefined,
    redeemedAt: token.redeemed_at ?? undefined,
    expiredAt: token.expired_at ?? undefined,
    cancelledAt: token.cancelled_at ?? undefined,
    beneficiaryName: token.beneficiary_name ?? undefined,
    mealType: token.meal_type ?? undefined,
    redemptionLocation: token.redemption_location ?? undefined,
    isSpecialCare: token.is_special_care ?? undefined,
    specialInstructions: token.special_instructions ?? undefined,
  };
}
