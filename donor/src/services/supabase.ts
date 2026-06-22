import { createClient } from '@supabase/supabase-js';

// ✅ FRONTEND CLIENT - Uses anonymous key (safe for client-side)
// This is the ONLY way to access Supabase from React components
// Never use service_role_key on the frontend!

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 🔒 Security Note:
// - NEXT_PUBLIC_* variables are exposed to the browser (intentional)
// - Anon key has limited permissions (safe for frontend)
// - Service role key is NEVER accessed from frontend
// - Server-side code uses .env.local SUPABASE_SERVICE_ROLE_KEY (backend only)
