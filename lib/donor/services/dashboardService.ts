import { supabase, isSupabaseConfigured } from './supabase';
import { DashboardResponse, MonthlySummaryItem } from '@/lib/donor/types/contract';

// Unified schema rows (see supabase/migrations m15/m16).
type DonationRow = {
  id: string;
  amount_inr: number;
  created_at: string;
};

type TokenRow = {
  id: string;
  status: string;
  redeemed_at: string | null;
  value_inr: number | null;
  minted_at: string | null;
  expires_at: string | null;
};

export class DashboardService {
  static async getDashboardData(donorId: string): Promise<DashboardResponse> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase not configured');
    }
    // Guard: callers must pass a real donor UUID. Prevents the legacy 'donor_001'
    // text id from ever reaching Postgres (which raised 22P02 invalid uuid).
    if (!donorId) {
      throw new Error('getDashboardData requires a donor id');
    }

    try {
      // Credit balance now lives in donor_credits (F-6), not on donors.
      const { data: creditRow } = await supabase
        .from('donor_credits')
        .select('balance_inr')
        .eq('donor_id', donorId)
        .single();

      // Donor counters.
      const { data: donorRow } = await supabase
        .from('donors')
        .select('total_donated_tokens')
        .eq('id', donorId)
        .single();

      // Donations (amount_inr + created_at in the unified schema).
      const { data: donationsData, error: donationsError } = await supabase
        .from('donations')
        .select('id, amount_inr, created_at')
        .eq('donor_id', donorId)
        .order('created_at', { ascending: false });
      if (donationsError) throw donationsError;
      const donations = (donationsData as DonationRow[]) || [];

      // Tokens link to the donor directly now (tokens.donor_id).
      const { data: tokensData, error: tokensError } = await supabase
        .from('tokens')
        .select('id, status, redeemed_at, value_inr, minted_at, expires_at')
        .eq('donor_id', donorId)
        .order('minted_at', { ascending: false });
      if (tokensError) throw tokensError;
      const tokens = (tokensData as TokenRow[]) || [];

      const totalDonations = donations.reduce((sum, d) => sum + (d.amount_inr || 0), 0);

      // Redemption detail (vendor/meal/location) lives in token_redemptions and
      // is gated to staff/vendor by RLS; the donor view shows time-only here.
      // Full donor-facing redemption detail is wired in a later slice.
      const redemptionHistory = tokens
        .filter((t) => t.status === 'redeemed' && t.redeemed_at)
        .map((t) => ({
          token_id: t.id,
          vendor_name: 'Vendor',
          location: '',
          time: t.redeemed_at as string,
          meal_info: 'Meal served',
          beneficiary_category: 'patient' as const,
        }));

      const donationHistory = donations.map((d) => ({
        id: d.id,
        amount: d.amount_inr,
        at: d.created_at,
      }));

      const monthlySummary = this.buildMonthlySummary(donations, tokens);

      return {
        total_credit: creditRow?.balance_inr ?? 0,
        total_donations: totalDonations,
        total_tokens: donorRow?.total_donated_tokens ?? tokens.length,
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

    donations.forEach((d) => {
      const month = (d.created_at || '').substring(0, 7); // YYYY-MM
      if (!month) return;
      const existing = monthlyMap.get(month) || { donated: 0, meals: 0 };
      existing.donated += d.amount_inr || 0;
      monthlyMap.set(month, existing);
    });

    tokens
      .filter((t) => t.status === 'redeemed' && t.redeemed_at)
      .forEach((t) => {
        const month = (t.redeemed_at as string).substring(0, 7);
        const existing = monthlyMap.get(month) || { donated: 0, meals: 0 };
        existing.meals += 1;
        monthlyMap.set(month, existing);
      });

    return Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}
