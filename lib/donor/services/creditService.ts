import { Donor } from '@/lib/donor/types/donor';
import { DonorService, MOCK_CREDIT_TRANSACTIONS, MOCK_DONOR } from './donorService';
import { DonationService, MOCK_CAMPAIGNS, MOCK_DONATION_HISTORY } from './donationService';
import { DonorNotificationService } from './donorNotificationService';
import { isSupabaseConfigured, supabase } from './supabase';
import { MOCK_TOKENS } from './tokenService';
import { getCurrentDonorId } from '@/lib/donor/auth';

type TokenInsert = {
  id: string;
  serial_number: string;
  batch_id: string;
  donation_id: string;
  token_type_id: string;
  campaign_title: string;
  status: 'unused';
  minted_at: string;
  is_special_care: boolean;
  special_instructions: string | null;
};

export class CreditService {
  static async getCreditsBalance(): Promise<number> {
    const profile = await DonorService.getProfile();
    return profile.creditsBalance;
  }

  static async addCredits(amount: number): Promise<Donor> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (!isSupabaseConfigured || !supabase) {
      const currentProfile = MOCK_DONOR;
      const oldBalance = currentProfile.creditsBalance;
      const newBalance = oldBalance + amount;
      currentProfile.creditsBalance = newBalance;
      MOCK_CREDIT_TRANSACTIONS.unshift({
        id: `tx_${Date.now()}`,
        amount,
        type: 'purchase',
        timestamp: new Date().toISOString(),
        description: `Deposited ₹${amount} credits via portal`,
      });

      // Check threshold alert rule (>= 50)
      if (oldBalance < 50 && newBalance >= 50) {
        await DonorNotificationService.createNotification(
          'Credit Threshold Reached',
          `Your credit balance reached ₹${newBalance}. You can now convert credits into food tokens!`
        );
      }

      return {
        ...currentProfile,
        creditsBalance: newBalance,
      };
    }

    try {
      const donorId = await getCurrentDonorId();
      const currentProfile = await DonorService.getProfile();
      const oldBalance = currentProfile.creditsBalance;
      const newBalance = oldBalance + amount;

      // 1. Update donors table
      const { error: donorError } = await supabase
        .from('donors')
        .update({ credits_balance: newBalance })
        .eq('id', donorId);

      if (donorError) throw donorError;

      // 2. Insert transaction
      const txId = `tx_${Date.now()}`;
      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          id: txId,
          donor_id: donorId,
          amount: amount,
          type: 'purchase',
          timestamp: new Date().toISOString(),
          description: `Deposited ₹${amount} credits via portal`,
        });

      if (txError) throw txError;

      // Check threshold alert rule (>= 50)
      if (oldBalance < 50 && newBalance >= 50) {
        await DonorNotificationService.createNotification(
          'Credit Threshold Reached',
          `Your credit balance reached ₹${newBalance}. You can now convert credits into food tokens!`
        );
      }

      return {
        ...currentProfile,
        creditsBalance: newBalance,
      };
    } catch (err) {
      console.warn('Failed to add credits in Supabase, falling back to mock data.', err);
      // Fallback update
      const currentProfile = await DonorService.getProfile();
      currentProfile.creditsBalance += amount;
      return currentProfile;
    }
  }

  static async convertCreditToToken(
    campaignId: string,
    tokenCount: number,
    isSpecialCare: boolean = false,
    specialInstructions: string = ''
  ): Promise<{ success: boolean; error?: string; txHash?: string }> {
    const tokenPrice = 50; // Standard token value is ₹50
    const cost = tokenCount * tokenPrice;

    try {
      const balance = await this.getCreditsBalance();
      if (balance < cost) {
        return { success: false, error: 'Insufficient credits balance.' };
      }

      const donationId = `don_${Date.now()}`;
      const txHash = `0x${Math.random().toString(16).substr(2, 20)}`;
      const timestamp = new Date().toISOString();

      // Get campaign details
      const campaign = await DonationService.getCampaignById(campaignId);
      const campaignTitle = campaign ? campaign.title : 'Food Campaign';

      if (!isSupabaseConfigured || !supabase) {
        // Mock update
        const profile = await DonorService.getProfile();
        profile.creditsBalance -= cost;
        profile.totalDonatedTokens += tokenCount;
        profile.impactScore += tokenCount; // 1 token = 1 meal impact
        MOCK_CREDIT_TRANSACTIONS.unshift({
          id: `tx_${donationId}`,
          amount: -cost,
          type: 'donation',
          timestamp,
          description: `Converted credits to ${tokenCount} tokens for ${campaignTitle}`,
        });
        MOCK_DONATION_HISTORY.unshift({
          id: donationId,
          campaignId,
          campaignTitle,
          tokenAmount: tokenCount,
          fiatAmount: cost,
          status: 'completed',
          timestamp,
          transactionHash: txHash,
        });
        const mockCampaign = MOCK_CAMPAIGNS.find((c) => c.id === campaignId);
        if (mockCampaign) {
          mockCampaign.raisedTokens += tokenCount;
          if (mockCampaign.raisedTokens >= mockCampaign.targetTokens) {
            mockCampaign.status = 'completed';
          }
        }

        const locationPrefix = getLocationPrefix(campaignTitle);
        const generatedTokens = Array.from({ length: tokenCount }, (_, index) => ({
          id: `tok_${donationId}_${index + 1}`,
          serialNumber: `PPM-${locationPrefix}-${Math.floor(10000 + Math.random() * 90000)}`,
          donationId,
          campaignId,
          campaignTitle,
          status: 'unused' as const,
          mintedAt: timestamp,
          isSpecialCare,
          specialInstructions: specialInstructions || undefined,
        }));
        MOCK_TOKENS.unshift(...generatedTokens);

        // Create notification
        await DonorNotificationService.createNotification(
          'Token Generated',
          `Successfully generated ${tokenCount} food tokens (value ₹${cost}) for ${campaignTitle}.`
        );

        return { success: true, txHash };
      }

      // 1. Deduct Credits from Donor
      const donorId = await getCurrentDonorId();
      const profile = await DonorService.getProfile();
      const newCreditsBalance = profile.creditsBalance - cost;
      const newTotalDonated = profile.totalDonatedTokens + tokenCount;
      const newImpactScore = profile.impactScore + tokenCount;

      const { error: donorError } = await supabase
        .from('donors')
        .update({
          credits_balance: newCreditsBalance,
          total_donated_tokens: newTotalDonated,
          impact_score: newImpactScore,
        })
        .eq('id', donorId);

      if (donorError) throw donorError;

      // 2. Insert Credit Transaction
      await supabase.from('credit_transactions').insert({
        id: `tx_don_${Date.now()}`,
        donor_id: donorId,
        amount: -cost,
        type: 'donation',
        timestamp,
        description: `Converted credits to ${tokenCount} tokens for ${campaignTitle}`,
      });

      // 3. Insert Donation
      const { error: donError } = await supabase.from('donations').insert({
        id: donationId,
        donor_id: donorId,
        token_type_id: campaignId,
        campaign_title: campaignTitle,
        token_amount: tokenCount,
        fiat_amount: cost,
        status: 'completed',
        timestamp,
        transaction_hash: txHash,
      });

      if (donError) throw donError;

      // 4. Update Campaign raised tokens
      if (campaign) {
        const newRaised = campaign.raisedTokens + tokenCount;
        await supabase
          .from('token_types')
          .update({
            raised_tokens: newRaised,
            status: newRaised >= campaign.targetTokens ? 'completed' : 'active',
          })
          .eq('id', campaignId);
      }

      // 5. Insert Token Batch
      const batchId = `batch_${donationId}`;
      await supabase.from('token_batches').insert({
        id: batchId,
        donation_id: donationId,
        token_type_id: campaignId,
        token_count: tokenCount,
        status: 'minted',
        minted_at: timestamp,
      });

      // 6. Insert Individual Tokens
      const locationPrefix = getLocationPrefix(campaignTitle);

      const tokenInserts: TokenInsert[] = [];
      for (let i = 1; i <= tokenCount; i++) {
        tokenInserts.push({
          id: `tok_${donationId}_${i}`,
          serial_number: `PPM-${locationPrefix}-${Math.floor(10000 + Math.random() * 90000)}`,
          batch_id: batchId,
          donation_id: donationId,
          token_type_id: campaignId,
          campaign_title: campaignTitle,
          status: 'unused',
          minted_at: timestamp,
          is_special_care: isSpecialCare,
          special_instructions: specialInstructions || null,
        });
      }

      if (tokenInserts.length > 0) {
        const { error: tokenError } = await supabase.from('tokens').insert(tokenInserts);
        if (tokenError) {
          // Fallback check: if schema columns don't exist yet, retry without them
          if (tokenError.code === 'PGRST204' || tokenError.message.includes('column') || tokenError.code === '42703') {
            console.warn('Columns is_special_care or special_instructions do not exist. Retrying insertion without them.');
            const fallbackInserts = tokenInserts.map((token) => ({
              id: token.id,
              serial_number: token.serial_number,
              batch_id: token.batch_id,
              donation_id: token.donation_id,
              token_type_id: token.token_type_id,
              campaign_title: token.campaign_title,
              status: token.status,
              minted_at: token.minted_at,
            }));
            await supabase.from('tokens').insert(fallbackInserts);
          } else {
            throw tokenError;
          }
        }
      }

      // Create success notification
      await DonorNotificationService.createNotification(
        'Token Generated',
        `Successfully generated ${tokenCount} food tokens (value ₹${cost}) for ${campaignTitle}.`
      );

      return { success: true, txHash };
    } catch (err) {
      console.warn('Failed to convert credits to tokens in Supabase:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Database error occurred',
      };
    }
  }
}

function getLocationPrefix(campaignTitle: string): string {
  const title = campaignTitle.toLowerCase();
  if (title.includes('salem')) return 'SLM';
  if (title.includes('coimbatore')) return 'CBE';
  if (title.includes('elderly') || title.includes('madurai')) return 'MDU';
  return 'CDL';
}
