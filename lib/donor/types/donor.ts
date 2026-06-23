export interface Donor {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  creditsBalance: number; // remaining credits in INR
  totalDonatedTokens: number;
  impactScore: number; // e.g. meals provided
  joinedDate: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  targetTokens: number;
  raisedTokens: number;
  tokenPriceInINR: number; // price per token
  organizationName: string;
  category: 'School' | 'Orphanage' | 'Disaster Relief' | 'Community Kitchen';
  location: string;
  imageUrl?: string;
  status: 'active' | 'completed';
}

export interface DonationHistoryItem {
  id: string;
  campaignId: string;
  campaignTitle: string;
  tokenAmount: number;
  fiatAmount: number; // in INR (credits used)
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
  transactionHash?: string;
}

export interface CreditTransaction {
  id: string;
  amount: number; // positive for buy, negative for donate
  type: 'purchase' | 'donation';
  timestamp: string;
  description: string;
}
