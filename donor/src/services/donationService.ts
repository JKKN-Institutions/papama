import { Campaign, DonationHistoryItem } from '@/src/types/donor';
import { isSupabaseConfigured, supabase } from './supabase';

type CampaignRow = {
  id: string;
  title: string;
  description: string;
  target_tokens: number;
  raised_tokens: number;
  token_price_in_inr: number;
  organization_name: string;
  category: Campaign['category'];
  location: string;
  image_url?: string | null;
  status: Campaign['status'];
};

type DonationRow = {
  id: string;
  token_type_id: string;
  campaign_title: string;
  token_amount: number;
  fiat_amount: number;
  status: DonationHistoryItem['status'];
  timestamp: string;
  transaction_hash?: string | null;
};

export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp_001',
    title: 'Annapoorna School Breakfast Drive',
    description: 'Providing healthy morning breakfasts to 200 government primary school children in Salem, Tamil Nadu. A nutritious breakfast boosts cognitive function, concentration, and school attendance.',
    targetTokens: 5000,
    raisedTokens: 3240,
    tokenPriceInINR: 30,
    organizationName: 'Annapoorna Trust',
    category: 'School',
    location: 'Salem, TN',
    imageUrl: 'https://images.unsplash.com/photo-1541802645635-11f2286a7482?auto=format&fit=crop&w=800&q=80',
    status: 'active',
  },
  {
    id: 'camp_002',
    title: 'Mercy Orphanage Nutrition Program',
    description: 'Supporting 80 orphaned children with balanced daily lunches including vegetables, grains, and fruits. Help us secure their nutritional requirements for the next three months.',
    targetTokens: 3000,
    raisedTokens: 1850,
    tokenPriceInINR: 45,
    organizationName: 'Mercy Foundation',
    category: 'Orphanage',
    location: 'Coimbatore, TN',
    imageUrl: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=800&q=80',
    status: 'active',
  },
  {
    id: 'camp_003',
    title: 'Elderly Care Shelter Hot Meals',
    description: 'Delivering fresh, soft, nutritious hot meals to 50 abandoned elderly residents. Meals are tailored to their health needs and prepared in hygienic community kitchens.',
    targetTokens: 2000,
    raisedTokens: 1920,
    tokenPriceInINR: 40,
    organizationName: 'Silver Lining Home',
    category: 'Community Kitchen',
    location: 'Madurai, TN',
    imageUrl: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=800&q=80',
    status: 'active',
  },
  {
    id: 'camp_004',
    title: 'Coastal Disaster Relief Kitchen',
    description: 'Setting up emergency kitchen tents to distribute food tokens and warm meals to fishing communities affected by recent heavy storms and flooding.',
    targetTokens: 4000,
    raisedTokens: 1200,
    tokenPriceInINR: 35,
    organizationName: 'Rapid Response India',
    category: 'Disaster Relief',
    location: 'Cuddalore, TN',
    imageUrl: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=800&q=80',
    status: 'active',
  },
];

export const MOCK_DONATION_HISTORY: DonationHistoryItem[] = [
  {
    id: 'don_101',
    campaignId: 'camp_001',
    campaignTitle: 'Annapoorna School Breakfast Drive',
    tokenAmount: 150,
    fiatAmount: 4500,
    status: 'completed',
    timestamp: '2026-06-11T12:30:00Z',
    transactionHash: '0x8f2c7d9e4a3b1c6d8e2f',
  },
  {
    id: 'don_102',
    campaignId: 'camp_002',
    campaignTitle: 'Mercy Orphanage Nutrition Program',
    tokenAmount: 100,
    fiatAmount: 4500,
    status: 'completed',
    timestamp: '2026-06-14T15:00:00Z',
    transactionHash: '0x3a9d8c7b6a5e4d3f2c1b',
  },
];

export class DonationService {
  static async getCampaigns(): Promise<Campaign[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_CAMPAIGNS;
    }

    try {
      const { data, error } = await supabase.from('token_types').select('*');

      if (error) {
        console.warn('Supabase error fetching token types, falling back to mock data.', error);
        return MOCK_CAMPAIGNS;
      }

      return (data as CampaignRow[]).map(mapCampaign);
    } catch (err) {
      console.warn('Failed to query Supabase token types, falling back to mock data.', err);
      return MOCK_CAMPAIGNS;
    }
  }

  static async getCampaignById(id: string): Promise<Campaign | undefined> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_CAMPAIGNS.find((c) => c.id === id);
    }

    try {
      const { data, error } = await supabase
        .from('token_types')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return MOCK_CAMPAIGNS.find((c) => c.id === id);
      }

      return mapCampaign(data as CampaignRow);
    } catch {
      return MOCK_CAMPAIGNS.find((c) => c.id === id);
    }
  }

  static async getHistory(): Promise<DonationHistoryItem[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_DONATION_HISTORY;
    }

    try {
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('donor_id', 'donor_001')
        .order('timestamp', { ascending: false });

      if (error) {
        console.warn('Supabase error fetching donation history, falling back to mock data.', error);
        return MOCK_DONATION_HISTORY;
      }

      return (data as DonationRow[]).map(mapDonation);
    } catch (err) {
      console.warn('Failed to fetch from Supabase, falling back to mock donation history.', err);
      return MOCK_DONATION_HISTORY;
    }
  }
}

function mapCampaign(campaign: CampaignRow): Campaign {
  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    targetTokens: campaign.target_tokens,
    raisedTokens: campaign.raised_tokens,
    tokenPriceInINR: campaign.token_price_in_inr,
    organizationName: campaign.organization_name,
    category: campaign.category,
    location: campaign.location,
    imageUrl: campaign.image_url ?? undefined,
    status: campaign.status,
  };
}

function mapDonation(donation: DonationRow): DonationHistoryItem {
  return {
    id: donation.id,
    campaignId: donation.token_type_id,
    campaignTitle: donation.campaign_title,
    tokenAmount: donation.token_amount,
    fiatAmount: donation.fiat_amount,
    status: donation.status,
    timestamp: donation.timestamp,
    transactionHash: donation.transaction_hash ?? undefined,
  };
}
