import { VolunteerTokenRequest, VolunteerRequestStatus } from '@/lib/donor/types/volunteer';
import { supabase, isSupabaseConfigured } from './supabase';

type VolunteerRequestRow = {
  id: string;
  volunteer_id: string;
  requested_count: number;
  approved_count: number;
  status: string;
  created_at: string;
  approved_at?: string | null;
  fulfilled_at?: string | null;
  notes?: string | null;
};

// Mock data for fallback
export const MOCK_REQUESTS: VolunteerTokenRequest[] = [
  {
    id: 'req_001',
    volunteerId: 'vol_001',
    requestedCount: 50,
    approvedCount: 50,
    status: VolunteerRequestStatus.APPROVED,
    createdAt: '2026-06-15T10:00:00Z',
    approvedAt: '2026-06-15T11:00:00Z',
  },
  {
    id: 'req_002',
    volunteerId: 'vol_002',
    requestedCount: 100,
    approvedCount: 75,
    status: VolunteerRequestStatus.APPROVED,
    createdAt: '2026-06-18T09:00:00Z',
    approvedAt: '2026-06-18T15:00:00Z',
  },
  {
    id: 'req_003',
    volunteerId: 'vol_003',
    requestedCount: 30,
    approvedCount: 0,
    status: VolunteerRequestStatus.PENDING,
    createdAt: '2026-06-20T14:00:00Z',
  },
];

export class VolunteerRequestService {
  static async getRequests(): Promise<VolunteerTokenRequest[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_REQUESTS;
    }

    try {
      const { data, error } = await supabase
        .from('volunteer_token_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase error fetching requests, falling back to mock data.', error);
        return MOCK_REQUESTS;
      }

      return (data as VolunteerRequestRow[]).map(mapRequest);
    } catch (err) {
      console.warn('Failed to fetch requests, falling back to mock data.', err);
      return MOCK_REQUESTS;
    }
  }

  static async getRequestById(id: string): Promise<VolunteerTokenRequest | undefined> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_REQUESTS.find((r) => r.id === id);
    }

    try {
      const { data, error } = await supabase
        .from('volunteer_token_requests')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return MOCK_REQUESTS.find((r) => r.id === id);
      }

      return mapRequest(data as VolunteerRequestRow);
    } catch {
      return MOCK_REQUESTS.find((r) => r.id === id);
    }
  }

  static async getRequestsByVolunteer(volunteerId: string): Promise<VolunteerTokenRequest[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_REQUESTS.filter((r) => r.volunteerId === volunteerId);
    }

    try {
      const { data, error } = await supabase
        .from('volunteer_token_requests')
        .select('*')
        .eq('volunteer_id', volunteerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase error fetching volunteer requests, falling back to mock data.', error);
        return MOCK_REQUESTS.filter((r) => r.volunteerId === volunteerId);
      }

      return (data as VolunteerRequestRow[]).map(mapRequest);
    } catch (err) {
      console.warn('Failed to fetch volunteer requests, falling back to mock data.', err);
      return MOCK_REQUESTS.filter((r) => r.volunteerId === volunteerId);
    }
  }

  static async getPendingRequests(): Promise<VolunteerTokenRequest[]> {
    const requests = await this.getRequests();
    return requests.filter((r) => r.status === VolunteerRequestStatus.PENDING || r.status === 'pending');
  }

  static async getApprovedRequests(): Promise<VolunteerTokenRequest[]> {
    const requests = await this.getRequests();
    return requests.filter((r) => r.status === VolunteerRequestStatus.APPROVED || r.status === 'approved');
  }
}

function mapRequest(row: VolunteerRequestRow): VolunteerTokenRequest {
  return {
    id: row.id,
    volunteerId: row.volunteer_id,
    requestedCount: row.requested_count,
    approvedCount: row.approved_count,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    fulfilledAt: row.fulfilled_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}
