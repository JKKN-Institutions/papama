import { Donor, CreditTransaction } from '@/src/types/donor';
import { isSupabaseConfigured, supabase } from './supabase';

type DonorRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  credits_balance: number;
  total_donated_tokens: number;
  impact_score: number;
  joined_date: string;
};

type CreditTransactionRow = {
  id: string;
  amount: number;
  type: CreditTransaction['type'];
  timestamp: string;
  description: string;
};

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

    try {
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('id', 'donor_001')
        .single();

      if (error) {
        console.warn('Supabase error fetching profile, falling back to mock data.', error);
        return MOCK_DONOR;
      }

      return mapDonor(data as DonorRow);
    } catch (err) {
      console.warn('Failed to connect to Supabase, falling back to mock donor data.', err);
      return MOCK_DONOR;
    }
  }

  static async getCreditTransactions(): Promise<CreditTransaction[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_CREDIT_TRANSACTIONS;
    }

    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('donor_id', 'donor_001')
        .order('timestamp', { ascending: false });

      if (error) {
        console.warn('Supabase error fetching credit transactions, falling back to mock data.', error);
        return MOCK_CREDIT_TRANSACTIONS;
      }

      return (data as CreditTransactionRow[]).map(mapCreditTransaction);
    } catch (err) {
      console.warn('Failed to fetch from Supabase, falling back to mock transactions.', err);
      return MOCK_CREDIT_TRANSACTIONS;
    }
  }
}

function mapDonor(donor: DonorRow): Donor {
  return {
    id: donor.id,
    name: donor.name,
    email: donor.email,
    avatarUrl: donor.avatar_url ?? undefined,
    creditsBalance: donor.credits_balance,
    totalDonatedTokens: donor.total_donated_tokens,
    impactScore: donor.impact_score,
    joinedDate: donor.joined_date,
  };
}

function mapCreditTransaction(transaction: CreditTransactionRow): CreditTransaction {
  return {
    id: transaction.id,
    amount: transaction.amount,
    type: transaction.type,
    timestamp: transaction.timestamp,
    description: transaction.description,
  };
}
