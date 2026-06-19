import { supabase, isSupabaseConfigured } from './supabase';
import { DashboardResponse, MonthlySummaryItem } from '@/src/types/contract';

type DonorRow = {
  id: string;
  credits_balance: number;
  total_donated_tokens: number;
  impact_score: number;
};

type DonationRow = {
  id: string;
  token_amount: number;
  fiat_amount: number;
  timestamp: string;
};

type TokenRow = {
  id: string;
  status: string;
  redeemed_at: string | null;
  beneficiary_name: string | null;
  meal_type: string | null;
  redemption_location: string | null;
};

export class DashboardService {
  static async getDashboardData(donorId: string): Promise<DashboardResponse> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      // Fetch donor profile (optimized: only needed columns)
      const { data: donorData, error: donorError } = await supabase
        .from('donors')
        .select('id, credits_balance, total_donated_tokens')
        .eq('id', donorId)
        .single();

      if (donorError) throw donorError;

      // Fetch donations (optimized: only needed columns)
      const { data: donationsData, error: donationsError } = await supabase
        .from('donations')
        .select('id, fiat_amount, timestamp')
        .eq('donor_id', donorId)
        .order('timestamp', { ascending: false });

      if (donationsError) throw donationsError;

      // Aggregate donor and donations data first
      const donor = donorData as DonorRow;
      const donations = (donationsData as DonationRow[]) || [];

      // Extract donation IDs to filter tokens
      const donationIds = donations.map((d) => d.id);

      // Fetch tokens only for this donor's donations
      const { data: tokensData, error: tokensError } = await supabase
        .from('tokens')
        .select('id, status, redeemed_at, beneficiary_name, meal_type, redemption_location, minted_at')
        .in('donation_id', donationIds)
        .order('minted_at', { ascending: false });

      if (tokensError) throw tokensError;

      // Map tokens with fallback for empty donations
      const tokens = (tokensData as TokenRow[]) || [];

      const totalDonations = donations.reduce((sum, d) => sum + d.fiat_amount, 0);
      const redemptionHistory = tokens
        .filter((t) => t.status === 'redeemed' && t.redeemed_at)
        .map((t) => ({
          token_id: t.id,
          vendor_name: t.beneficiary_name || 'Unknown Vendor',
          location: t.redemption_location || 'Unknown Location',
          time: t.redeemed_at || new Date().toISOString(),
          meal_info: t.meal_type || 'Unknown Meal',
          beneficiary_category: 'patient' as const,
        }));

      const donationHistory = donations.map((d) => ({
        id: d.id,
        amount: d.fiat_amount,
        at: d.timestamp,
      }));

      const monthlySummary = this.buildMonthlySummary(donations, tokens);

      return {
        total_credit: donor.credits_balance,
        total_donations: totalDonations,
        total_tokens: donor.total_donated_tokens,
        meals_sponsored: tokens.filter((t) => t.status === 'redeemed').length,
        monthly_summary: monthlySummary,
        donation_history: donationHistory,
        redemption_history: redemptionHistory,
      };
    } catch (err) {
      console.error('Failed to fetch dashboard from Supabase:', err);
      throw err;
    }
  }

  private static buildMonthlySummary(
    donations: DonationRow[],
    tokens: TokenRow[]
  ): MonthlySummaryItem[] {
    const monthlyMap = new Map<string, { donated: number; meals: number }>();

    // Add donations by month
    donations.forEach((d) => {
      const month = d.timestamp.substring(0, 7); // YYYY-MM
      const existing = monthlyMap.get(month) || { donated: 0, meals: 0 };
      existing.donated += d.fiat_amount;
      monthlyMap.set(month, existing);
    });

    // Add redeemed tokens by month
    tokens
      .filter((t) => t.status === 'redeemed' && t.redeemed_at)
      .forEach((t) => {
        const month = t.redeemed_at!.substring(0, 7);
        const existing = monthlyMap.get(month) || { donated: 0, meals: 0 };
        existing.meals += 1;
        monthlyMap.set(month, existing);
      });

    // Convert to array and sort by month
    return Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}
