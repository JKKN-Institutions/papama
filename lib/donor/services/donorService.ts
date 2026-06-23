import { Donor, CreditTransaction } from '@/lib/donor/types/donor';
import { isSupabaseConfigured, supabase } from './supabase';
import { getCurrentDonorId } from '@/lib/donor/auth';

export const MOCK_DONOR: Donor = {
  id: 'donor_001',
  name: 'Darshini Rajan',
  email: 'darshini.rajan@example.com',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  creditsBalance: 45,
  totalDonatedTokens: 250,
  impactScore: 250,
  joinedDate: '2026-01-15',
};

export const MOCK_CREDIT_TRANSACTIONS: CreditTransaction[] = [
  {
    id: 'tx_001',
    amount: 1500,
    type: 'purchase',
    timestamp: '2026-06-10T10:00:00Z',
    description: 'Purchased ₹1,500 credits via Net Banking',
  },
  {
    id: 'tx_002',
    amount: -4500,
    type: 'donation',
    timestamp: '2026-06-11T12:30:00Z',
    description: 'Allocated 150 tokens to Annapoorna School Breakfast Drive',
  },
  {
    id: 'tx_003',
    amount: 3000,
    type: 'purchase',
    timestamp: '2026-06-12T09:15:00Z',
    description: 'Purchased ₹3,000 credits via UPI',
  },
  {
    id: 'tx_004',
    amount: -4500,
    type: 'donation',
    timestamp: '2026-06-14T15:00:00Z',
    description: 'Allocated 100 tokens to Mercy Orphanage Nutrition Program',
  },
];

export class DonorService {
  static async getProfile(): Promise<Donor> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_DONOR;
    }

    // Identity now comes from the Supabase Auth session, not a hardcoded id.
    // Not signed in → demo profile (mock).
    const donorId = await getCurrentDonorId();
    if (!donorId) {
      return MOCK_DONOR;
    }

    try {
      // New unified schema: donor profile in `donors`, balance in `donor_credits`.
      const { data, error } = await supabase
        .from('donors')
        .select('id, name, email, avatar_url, impact_score, total_donated_tokens, joined_date')
        .eq('id', donorId)
        .single();

      if (error || !data) {
        console.warn('Supabase error fetching profile, falling back to mock data.', error);
        return MOCK_DONOR;
      }

      const { data: credit } = await supabase
        .from('donor_credits')
        .select('balance_inr')
        .eq('donor_id', donorId)
        .single();

      return {
        id: data.id,
        name: data.name ?? 'Donor',
        email: data.email ?? '',
        avatarUrl: data.avatar_url ?? undefined,
        creditsBalance: credit?.balance_inr ?? 0,
        totalDonatedTokens: data.total_donated_tokens ?? 0,
        impactScore: data.impact_score ?? 0,
        joinedDate: data.joined_date ?? '',
      };
    } catch (err) {
      console.warn('Failed to connect to Supabase, falling back to mock donor data.', err);
      return MOCK_DONOR;
    }
  }

  static async getCreditTransactions(): Promise<CreditTransaction[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_CREDIT_TRANSACTIONS;
    }

    const donorId = await getCurrentDonorId();
    if (!donorId) {
      return MOCK_CREDIT_TRANSACTIONS;
    }

    try {
      // New schema: amount_inr (signed) + created_at.
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, amount_inr, type, created_at, description')
        .eq('donor_id', donorId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        console.warn('Supabase error fetching credit transactions, falling back to mock data.', error);
        return MOCK_CREDIT_TRANSACTIONS;
      }

      return data.map((t) => ({
        id: t.id as string,
        amount: t.amount_inr as number,
        type: t.type as CreditTransaction['type'],
        timestamp: t.created_at as string,
        description: t.description as string,
      }));
    } catch (err) {
      console.warn('Failed to fetch from Supabase, falling back to mock transactions.', err);
      return MOCK_CREDIT_TRANSACTIONS;
    }
  }
}
