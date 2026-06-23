// Volunteer Token Request Types (from token_flow.md)

export enum VolunteerRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FULFILLED = 'fulfilled',
}

export interface VolunteerTokenRequest {
  id: string;
  volunteerId: string;
  requestedCount: number;
  approvedCount: number;
  status: VolunteerRequestStatus | string;
  createdAt: string;
  approvedAt?: string;
  fulfilledAt?: string;
  notes?: string;
}
