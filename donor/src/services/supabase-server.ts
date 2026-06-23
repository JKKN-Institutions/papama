import { createClient } from '@supabase/supabase-js';

// 🔒 SERVER-SIDE ONLY - Uses service role key
// This file should ONLY be imported in server-side code:
// - API routes (/app/api/**)
// - Server components (marked with 'use server')
// - Server-side middleware

// NEVER import this in React components!
// NEVER expose this to the browser!

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('⚠️ Missing Supabase server configuration in .env.local');
  console.error('Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

// Service role client has full admin access to database
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// 🔐 Security Guidelines:
// 1. Only use supabaseAdmin in server-side code
// 2. Never pass supabaseAdmin to React components
// 3. Keep SUPABASE_SERVICE_ROLE_KEY in .env.local only
// 4. Add .env.local to .gitignore to prevent accidental commits
// 5. Rotate keys if accidentally exposed to git
