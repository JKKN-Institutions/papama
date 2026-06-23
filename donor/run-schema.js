const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

console.log('🔗 Project ref:', projectRef);
console.log('📄 Reading schema.sql...');

const sqlPath = path.join(__dirname, 'supabase', 'schema.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function runSchema() {
  console.log('🚀 Sending schema to Supabase via Management API...\n');

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    // Management API failed — try using the supabase-js rpc approach
    console.warn('⚠️  Management API not available, trying direct SQL via rpc...');
    await runViaRpc();
    return;
  }

  const result = await response.json();
  if (result.error) {
    console.error('❌ Error from Management API:', result.error);
    await runViaRpc();
  } else {
    console.log('✅ Schema applied successfully via Management API!');
    await verifyTables();
  }
}

async function runViaRpc() {
  // Split into individual statements and run via supabase-js
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Split SQL by semicolons, filter blanks
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📋 Running ${statements.length} SQL statements individually...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      if (error) {
        // Try via from() if exec_sql doesn't exist
        console.error(`  [${i + 1}] ⚠️  RPC not available: ${error.message}`);
        errorCount++;
        break;
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`  [${i + 1}] ❌ Error:`, err.message);
      errorCount++;
    }
  }

  if (errorCount === 0) {
    console.log(`\n✅ All ${successCount} statements ran successfully!`);
    await verifyTables();
  } else {
    console.log('\n⚠️  Some statements failed. Please run the schema manually.');
    console.log('\n📋 Steps to apply schema manually:');
    console.log('  1. Open: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('  2. Paste the contents of: supabase/schema.sql');
    console.log('  3. Click "Run"');
  }
}

async function verifyTables() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const tables = ['donors', 'donations', 'tokens', 'token_types', 'credit_transactions'];

  console.log('\n🔍 Verifying tables...');
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ✅ ${table}: OK (${data.length} row(s) found)`);
    }
  }
}

runSchema().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
