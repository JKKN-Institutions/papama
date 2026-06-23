import {
  DonationResponse,
  CreditsResponse,
  ConvertResponse,
  TokensResponse,
  DashboardResponse,
  NotificationsResponse,
  TokenItem,
  CreditTransaction,
  NotificationItem,
  RedemptionHistoryItem
} from '../types/contract';
import { DashboardService } from './dashboardService';

const STORAGE_KEYS = {
  CREDITS: 'papama_mock_credits',
  TOKENS: 'papama_mock_tokens',
  DASHBOARD: 'papama_mock_dashboard',
  NOTIFICATIONS: 'papama_mock_notifications',
};

// Helper for generating UUIDs
function generateUUID(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

// Initial Data representing contract-aligned mockup values
const INITIAL_CREDITS: CreditsResponse = {
  credit_balance: 150,
  threshold: 50,
  threshold_reached: true,
  convertible_tokens: 3,
  withdrawable: false,
  transactions: [
    { id: 'tx_001', type: 'purchase', amount: 1000, at: '2026-06-10T10:00:00Z' },
    { id: 'tx_002', type: 'donation', amount: -600, at: '2026-06-11T12:30:00Z' },
    { id: 'tx_003', type: 'donation', amount: -250, at: '2026-06-14T15:00:00Z' }
  ],
};

const INITIAL_TOKENS: TokenItem[] = [
  {
    token_id: 'tok_001',
    type: 'standard',
    status: 'redeemed',
    qr_payload: 'PAPAMA:TOKEN:tok_001:sig',
    value: 50,
    issued_at: '2026-06-11T12:30:00Z',
    expires_at: '2026-09-11T12:30:00Z',
    redeemed_at: '2026-06-17T13:00:00Z',
    vendor_name: 'Anna Canteen',
    location: 'T. Nagar, Chennai',
    meal_info: 'Lunch — Veg Thali',
    beneficiary_category: 'pregnant_women',
  },
  {
    token_id: 'tok_002',
    type: 'standard',
    status: 'active',
    qr_payload: 'PAPAMA:TOKEN:tok_002:sig',
    value: 50,
    issued_at: '2026-06-11T12:30:00Z',
    expires_at: '2026-09-11T12:30:00Z',
    redeemed_at: null,
  },
  {
    token_id: 'tok_003',
    type: 'standard',
    status: 'redeemed',
    qr_payload: 'PAPAMA:TOKEN:tok_003:sig',
    value: 50,
    issued_at: '2026-06-14T15:00:00Z',
    expires_at: '2026-09-14T15:00:00Z',
    redeemed_at: '2026-06-18T12:45:00Z',
    vendor_name: 'Sri Sai Kitchen',
    location: 'Velachery, Chennai',
    meal_info: 'Lunch — Sambar Rice',
    beneficiary_category: 'disability',
  },
  {
    token_id: 'tok_004',
    type: 'special_care',
    status: 'expired',
    qr_payload: 'PAPAMA:TOKEN:tok_004:sig',
    value: 50,
    issued_at: '2026-03-01T10:00:00Z',
    expires_at: '2026-06-01T00:00:00Z',
    redeemed_at: null,
    is_special_care: true,
    special_instructions: 'Diabetic friendly, low salt, high protein',
  },
  {
    token_id: 'tok_005',
    type: 'standard',
    status: 'invalidated',
    qr_payload: 'PAPAMA:TOKEN:tok_005:sig',
    value: 50,
    issued_at: '2026-06-14T15:00:00Z',
    expires_at: '2026-09-14T15:00:00Z',
    redeemed_at: null,
  },
];

const INITIAL_DASHBOARD: DashboardResponse = {
  total_credit: 150,
  total_donations: 1200,
  total_tokens: 12,
  meals_sponsored: 12,
  monthly_summary: [
    { month: '2026-05', donated: 400, meals: 4 },
    { month: '2026-06', donated: 800, meals: 8 },
  ],
  donation_history: [
    { id: 'don_101', amount: 600, at: '2026-06-11T12:30:00Z' },
    { id: 'don_102', amount: 600, at: '2026-06-14T15:00:00Z' },
  ],
  redemption_history: [
    {
      token_id: 'tok_001',
      vendor_name: 'Anna Canteen',
      location: 'T. Nagar, Chennai',
      time: '2026-06-17T13:00:00Z',
      meal_info: 'Lunch — Veg Thali',
      beneficiary_category: 'pregnant_women',
    },
    {
      token_id: 'tok_003',
      vendor_name: 'Sri Sai Kitchen',
      location: 'Velachery, Chennai',
      time: '2026-06-18T12:45:00Z',
      meal_info: 'Lunch — Sambar Rice',
      beneficiary_category: 'disability',
    },
  ],
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif_101',
    type: 'redemption',
    title: 'Your meal was served',
    body: 'A standard token you funded was redeemed for a hot meal.',
    read: false,
    created_at: '2026-06-17T13:05:00Z',
    meta: {
      vendor_name: 'Anna Canteen',
      location: 'T. Nagar, Chennai',
      time: '2026-06-17T13:00:00Z',
      meal_info: 'Lunch — Veg Thali',
      beneficiary_category: 'pregnant_women',
    },
  },
  {
    id: 'notif_102',
    type: 'threshold',
    title: 'Conversion Threshold Met',
    body: 'Your credit balance is ₹150. You can now convert credits into food tokens!',
    read: false,
    created_at: '2026-06-18T10:00:00Z',
    meta: null,
  },
];

// Browser Local Mock DB Class
class MockDb {
  private isClient = typeof window !== 'undefined';

  private get<T>(key: string, defaultValue: T): T {
    if (!this.isClient) return defaultValue;
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  }

  private set<T>(key: string, value: T): void {
    if (!this.isClient) return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  getCredits(): CreditsResponse {
    return this.get(STORAGE_KEYS.CREDITS, INITIAL_CREDITS);
  }

  saveCredits(data: CreditsResponse): void {
    this.set(STORAGE_KEYS.CREDITS, data);
  }

  getTokens(): TokenItem[] {
    return this.get(STORAGE_KEYS.TOKENS, INITIAL_TOKENS);
  }

  saveTokens(data: TokenItem[]): void {
    this.set(STORAGE_KEYS.TOKENS, data);
  }

  getDashboard(): DashboardResponse {
    return this.get(STORAGE_KEYS.DASHBOARD, INITIAL_DASHBOARD);
  }

  saveDashboard(data: DashboardResponse): void {
    this.set(STORAGE_KEYS.DASHBOARD, data);
  }

  getNotifications(): NotificationItem[] {
    return this.get(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
  }

  saveNotifications(data: NotificationItem[]): void {
    this.set(STORAGE_KEYS.NOTIFICATIONS, data);
  }

  resetAll(): void {
    if (!this.isClient) return;
    localStorage.removeItem(STORAGE_KEYS.CREDITS);
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.DASHBOARD);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
  }
}

const mockDb = new MockDb();

// Main Fetcher with Fallback
async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const forceMock = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';

  // Only call out to an external API server when one is actually configured.
  // In the unified app there is no separate /api/donor/* backend, so without a
  // base URL we go straight to the local mock path (no 404 noise).
  if (baseUrl && !forceMock) {
    try {
      const res = await fetch(`${baseUrl}${path}`, options);
      if (res.ok) {
        return await res.json() as T;
      }
      console.warn(`API ${path} returned status ${res.status}. Falling back to mock database.`);
    } catch (e) {
      console.warn(`API ${path} request failed. Falling back to mock database.`, e);
    }
  }

  // Handle Mock Requests
  return handleMockRequest<T>(path, options);
}

function handleMockRequest<T>(path: string, options?: RequestInit): T {
  const method = options?.method?.toUpperCase() || 'GET';
  const body = options?.body ? JSON.parse(options.body as string) : null;

  // Route: POST /api/donations/create
  if (path.startsWith('/api/donations/create') && method === 'POST') {
    const { amount, payment_method, donor_id } = body;
    const donationId = generateUUID();
    const now = new Date().toISOString();

    const credits = mockDb.getCredits();
    const oldBalance = credits.credit_balance;
    const newBalance = oldBalance + amount;
    const thresholdReached = newBalance >= 50;

    // Update Credits
    credits.credit_balance = newBalance;
    credits.threshold_reached = thresholdReached;
    credits.convertible_tokens = Math.floor(newBalance / credits.threshold);
    credits.transactions.unshift({
      id: generateUUID(),
      type: 'purchase',
      amount: amount,
      at: now,
    });
    mockDb.saveCredits(credits);

    // Update Dashboard if logged in
    if (donor_id) {
      const dashboard = mockDb.getDashboard();
      dashboard.total_credit = newBalance;
      dashboard.total_donations += amount;
      dashboard.donation_history.unshift({
        id: donationId,
        amount: amount,
        at: now,
      });

      // Update monthly summary
      const currentMonth = now.substring(0, 7); // YYYY-MM
      const monthlyItem = dashboard.monthly_summary.find((m) => m.month === currentMonth);
      if (monthlyItem) {
        monthlyItem.donated += amount;
      } else {
        dashboard.monthly_summary.push({
          month: currentMonth,
          donated: amount,
          meals: 0,
        });
      }
      mockDb.saveDashboard(dashboard);
    }

    // Add Notification
    const notifs = mockDb.getNotifications();
    notifs.unshift({
      id: generateUUID(),
      type: 'donation_success',
      title: 'Donation Completed Successfully',
      body: `Thank you! Your donation of ₹${amount} was processed using ${payment_method.toUpperCase()}.`,
      read: false,
      created_at: now,
      meta: null,
    });

    if (!credits.threshold_reached && thresholdReached) {
      notifs.unshift({
        id: generateUUID(),
        type: 'threshold',
        title: 'Conversion Threshold Met',
        body: `Your credit balance is ₹${newBalance}. You can now convert credits into food tokens!`,
        read: false,
        created_at: now,
        meta: null,
      });
    }
    mockDb.saveNotifications(notifs);

    const response: DonationResponse = {
      donation_id: donationId,
      amount,
      payment_method,
      status: 'success',
      credit_added: amount,
      credit_balance: newBalance,
      threshold_reached: thresholdReached,
      created_at: now,
    };
    return response as unknown as T;
  }

  // Route: GET /api/donor/credits
  if (path.startsWith('/api/donor/credits') && method === 'GET') {
    return mockDb.getCredits() as unknown as T;
  }

  // Route: POST /api/tokens/convert
  if (path.startsWith('/api/tokens/convert') && method === 'POST') {
    const { amount, token_type, special_instructions } = body;
    const now = new Date().toISOString();
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 3); // 3 months validity
    const expiresAt = expiry.toISOString();

    const credits = mockDb.getCredits();
    if (credits.credit_balance < amount) {
      throw new Error('Insufficient credit balance');
    }

    const tokenCount = Math.floor(amount / credits.threshold);
    const newBalance = credits.credit_balance - amount;

    // Deduct credits
    credits.credit_balance = newBalance;
    credits.threshold_reached = newBalance >= 50;
    credits.convertible_tokens = Math.floor(newBalance / credits.threshold);
    credits.transactions.unshift({
      id: generateUUID(),
      type: 'donation',
      amount: -amount,
      at: now,
    });
    mockDb.saveCredits(credits);

    // Create new tokens
    const tokensList = mockDb.getTokens();
    const newTokens: TokenItem[] = Array.from({ length: tokenCount }, (_, i) => {
      const tokenId = generateUUID();
      const serialNum = `PPM-${token_type === 'special_care' ? 'SPC' : 'STD'}-${Math.floor(10000 + Math.random() * 90000)}`;
      return {
        token_id: tokenId,
        type: token_type,
        status: 'active',
        qr_payload: `PAPAMA:TOKEN:${tokenId}:${Math.random().toString(36).substring(7)}`,
        value: 50,
        issued_at: now,
        expires_at: expiresAt,
        redeemed_at: null,
        is_special_care: token_type === 'special_care',
        special_instructions: special_instructions || undefined,
      };
    });

    tokensList.unshift(...newTokens);
    mockDb.saveTokens(tokensList);

    // Update Dashboard
    const dashboard = mockDb.getDashboard();
    dashboard.total_credit = newBalance;
    dashboard.total_tokens += tokenCount;
    mockDb.saveDashboard(dashboard);

    // Create Notification
    const notifs = mockDb.getNotifications();
    notifs.unshift({
      id: generateUUID(),
      type: 'token_generated',
      title: 'Tokens Generated Successfully',
      body: `Converted ₹${amount} credits into ${tokenCount} ${token_type} food tokens.`,
      read: false,
      created_at: now,
      meta: null,
    });
    mockDb.saveNotifications(notifs);

    const response: ConvertResponse = {
      tokens: newTokens.map((t) => ({
        token_id: t.token_id,
        type: t.type,
        qr_payload: t.qr_payload,
        status: t.status,
        expires_at: t.expires_at,
      })),
      credit_balance: newBalance,
      converted: amount,
    };

    // Simulate auto-redemption of standard tokens in the background to show dynamic updates
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        simulateBackgroundRedemption(newTokens[0]?.token_id);
      }, 5000);
    }

    return response as unknown as T;
  }

  // Route: GET /api/donor/tokens
  if (path.startsWith('/api/donor/tokens') && method === 'GET') {
    return { tokens: mockDb.getTokens() } as unknown as T;
  }

  // Route: GET /api/donor/dashboard
  if (path.startsWith('/api/donor/dashboard') && method === 'GET') {
    const dashboard = mockDb.getDashboard();
    const credits = mockDb.getCredits();
    // Synchronize credit balance
    dashboard.total_credit = credits.credit_balance;
    return dashboard as unknown as T;
  }

  // Route: GET /api/donor/notifications
  if (path.startsWith('/api/donor/notifications') && method === 'GET') {
    return { notifications: mockDb.getNotifications() } as unknown as T;
  }

  throw new Error(`Mock endpoint not implemented: ${method} ${path}`);
}

// Background simulator to showcase dynamic trust/impact updates when a token is redeemed
function simulateBackgroundRedemption(tokenId?: string): void {
  if (!tokenId) return;

  const tokens = mockDb.getTokens();
  const tokenIndex = tokens.findIndex((t) => t.token_id === tokenId && t.status === 'active');
  if (tokenIndex === -1) return;

  const now = new Date().toISOString();
  const vendors = [
    { name: 'Anna Canteen', location: 'T. Nagar, Chennai', info: 'Lunch — Veg Thali', cat: 'pregnant_women' },
    { name: 'Sri Sai Kitchen', location: 'Velachery, Chennai', info: 'Lunch — Sambar Rice', cat: 'disability' },
    { name: 'Community Meals Hub', location: 'Royapettah, Chennai', info: 'Dinner — Upma', cat: 'patient' },
  ];
  const selectedVendor = vendors[Math.floor(Math.random() * vendors.length)];

  // Update Token
  tokens[tokenIndex].status = 'redeemed';
  tokens[tokenIndex].redeemed_at = now;
  tokens[tokenIndex].vendor_name = selectedVendor.name;
  tokens[tokenIndex].location = selectedVendor.location;
  tokens[tokenIndex].meal_info = selectedVendor.info;
  tokens[tokenIndex].beneficiary_category = selectedVendor.cat;
  mockDb.saveTokens(tokens);

  // Update Dashboard
  const dashboard = mockDb.getDashboard();
  dashboard.meals_sponsored += 1;
  dashboard.redemption_history.unshift({
    token_id: tokenId,
    vendor_name: selectedVendor.name,
    location: selectedVendor.location,
    time: now,
    meal_info: selectedVendor.info,
    beneficiary_category: selectedVendor.cat as RedemptionHistoryItem['beneficiary_category'],
  });

  const currentMonth = now.substring(0, 7);
  const monthlyItem = dashboard.monthly_summary.find((m) => m.month === currentMonth);
  if (monthlyItem) {
    monthlyItem.meals += 1;
  } else {
    dashboard.monthly_summary.push({
      month: currentMonth,
      donated: 0,
      meals: 1,
    });
  }
  mockDb.saveDashboard(dashboard);

  // Create Notification
  const notifs = mockDb.getNotifications();
  notifs.unshift({
    id: generateUUID(),
    type: 'redemption',
    title: 'Your meal was served',
    body: `A meal you funded was redeemed at ${selectedVendor.name}.`,
    read: false,
    created_at: now,
    meta: {
      vendor_name: selectedVendor.name,
      location: selectedVendor.location,
      time: now,
      meal_info: selectedVendor.info,
      beneficiary_category: selectedVendor.cat as RedemptionHistoryItem['beneficiary_category'],
    },
  });
  mockDb.saveNotifications(notifs);

  // Dispatch global event for visual updates if matching components are listening
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('papama_data_update'));
  }
}

export const ApiClient = {
  // Section 1
  async createDonation(amount: number, paymentMethod: string, donorId: string | null): Promise<DonationResponse> {
    return apiRequest<DonationResponse>('/api/donations/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, payment_method: paymentMethod, donor_id: donorId }),
    });
  },

  async getCredits(): Promise<CreditsResponse> {
    return apiRequest<CreditsResponse>('/api/donor/credits', {
      method: 'GET',
    });
  },

  async convertCreditToToken(amount: number, tokenType: 'standard' | 'special_care', specialInstructions?: string): Promise<ConvertResponse> {
    return apiRequest<ConvertResponse>('/api/tokens/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, token_type: tokenType, special_instructions: specialInstructions }),
    });
  },

  // Section 2
  async getTokens(): Promise<TokensResponse> {
    return apiRequest<TokensResponse>('/api/donor/tokens', {
      method: 'GET',
    });
  },

  // Section 3
  async getDashboard(donorId?: string): Promise<DashboardResponse> {
    // Only hit Supabase with a real donor id (a UUID from the session). Without
    // one (guest), go straight to the API/mock so we never query with a bad id.
    if (donorId) {
      try {
        return await DashboardService.getDashboardData(donorId);
      } catch (err) {
        console.warn('Failed to fetch dashboard from Supabase, falling back to API/mock:', err);
      }
    }
    return apiRequest<DashboardResponse>('/api/donor/dashboard', {
      method: 'GET',
    });
  },

  // Section 4
  async getNotifications(): Promise<NotificationsResponse> {
    return apiRequest<NotificationsResponse>('/api/donor/notifications', {
      method: 'GET',
    });
  },

  async markNotificationRead(id: string): Promise<void> {
    // If mock mode, we update the local db
    const notifs = mockDb.getNotifications();
    const item = notifs.find((n) => n.id === id);
    if (item) {
      item.read = true;
      mockDb.saveNotifications(notifs);
    }

    // Try posting to API if online
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const forceMock = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';
    if (!forceMock) {
      try {
        await fetch(`${baseUrl}/api/donor/notifications/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      } catch (e) {
        // Ignored, we already processed locally
      }
    }
  },

  // Developer utility to reset local db state if needed
  resetMockDb(): void {
    mockDb.resetAll();
  }
};
