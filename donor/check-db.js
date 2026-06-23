const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qxdxefofeykzvegykitt.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZHhlZm9mZXlrenZlZ3lraXR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzc2NTgsImV4cCI6MjA5NzE1MzY1OH0.t3ETvCrCvTHhvSfmQQDK-oEFHkC6a0hEXOCnB28X-HI';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ZHhlZm9mZXlrenZlZ3lraXR0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU3NzY1OCwiZXhwIjoyMDk3MTUzNjU4fQ.pS_wcNvJGEmDozHphkgrZNmIXU_BCau8-Bpg97PLSV0';

console.log('Testing Supabase Connection...');
console.log('URL:', supabaseUrl);

async function check() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.from('donors').select('*').limit(1);
  if (error) {
    console.error('Anon client test failed:', error.message, error.code);
  } else {
    console.log('Anon client test success! Found donors:', data);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: dataAdmin, error: errorAdmin } = await adminClient.from('donors').select('*').limit(1);
  if (errorAdmin) {
    console.error('Service role client test failed:', errorAdmin.message, errorAdmin.code);
  } else {
    console.log('Service role client test success! Found donors:', dataAdmin);
  }
}

check();
