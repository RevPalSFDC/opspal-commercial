const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key] = valueParts.join('=');
      }
    }
  });
}

const { createClient } = require('@supabase/supabase-js');

async function checkReflection() {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  const { data, error } = await client
    .from('reflections')
    .select('*')
    .eq('reflection_status', 'new')
    .limit(10);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\n📋 Remaining reflections with status=\'new\':\n');
  console.log(`Total: ${data.length} reflections\n`);

  data.forEach((r, i) => {
    console.log(`${i + 1}. ID: ${r.id}`);
    console.log(`   Created: ${new Date(r.created_at).toLocaleString()}`);
    console.log(`   Org: ${r.org || 'N/A'}`);
    console.log(`   Focus: ${r.focus_area || 'N/A'}`);
    console.log(`   Issues: ${r.data?.issues_identified?.length || 0}`);
    console.log(`   Outcome: ${r.outcome || 'N/A'}`);
    console.log();
  });
}

checkReflection();
