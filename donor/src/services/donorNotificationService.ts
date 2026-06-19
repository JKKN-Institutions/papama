import { isSupabaseConfigured, supabase } from './supabase';

export interface DonorNotification {
  id: string;
  donorId: string;
  title: string;
  message: string;
  status: 'unread' | 'read';
  createdAt: string;
}

type NotificationRow = {
  id: string;
  donor_id: string;
  title: string;
  message: string;
  status: DonorNotification['status'];
  created_at: string;
};

export const MOCK_NOTIFICATIONS: DonorNotification[] = [
  {
    id: 'notif_001',
    donorId: 'donor_001',
    title: 'Tokens minted',
    message: 'Your donated meal tokens are ready for distribution.',
    status: 'unread',
    createdAt: new Date().toISOString(),
  }
];

export class DonorNotificationService {
  static async getNotifications(): Promise<DonorNotification[]> {
    if (!isSupabaseConfigured || !supabase) {
      return MOCK_NOTIFICATIONS;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('donor_id', 'donor_001')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase error fetching notifications:', error);
        return MOCK_NOTIFICATIONS;
      }

      return (data as NotificationRow[]).map(mapNotification);
    } catch (err) {
      console.warn('Failed to load notifications from Supabase:', err);
      return MOCK_NOTIFICATIONS;
    }
  }

  static async createNotification(title: string, message: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      MOCK_NOTIFICATIONS.unshift({
        id: `notif_${Date.now()}`,
        donorId: 'donor_001',
        title,
        message,
        status: 'unread',
        createdAt: new Date().toISOString(),
      });
      return;
    }

    try {
      await supabase.from('notifications').insert({
        id: `notif_${Date.now()}`,
        donor_id: 'donor_001',
        title,
        message,
        status: 'unread',
      });
    } catch (err) {
      console.warn('Failed to insert notification into Supabase:', err);
    }
  }

  static async markAsRead(id: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      const notif = MOCK_NOTIFICATIONS.find((n) => n.id === id);
      if (notif) notif.status = 'read';
      return;
    }

    try {
      await supabase
        .from('notifications')
        .update({ status: 'read' })
        .eq('id', id);
    } catch (err) {
      console.warn('Failed to update notification status in Supabase:', err);
    }
  }
}

function mapNotification(row: NotificationRow): DonorNotification {
  return {
    id: row.id,
    donorId: row.donor_id,
    title: row.title,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}
