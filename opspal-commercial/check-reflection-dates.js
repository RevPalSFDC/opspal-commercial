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

async function checkDates() {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const { data, error } = await client
    .from('reflections')
    .select('id, created_at, reflection_status')
    .eq('reflection_status', 'new')
    .gte('created_at', fiveDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\n📅 Reflections from past 5 days with status=\'new\':\n');
  console.log(`Total: ${data.length} reflections`);

  if (data.length > 0) {
    console.log('\nDate range:');
    console.log(`  Oldest: ${new Date(data[data.length - 1].created_at).toLocaleString()}`);
    console.log(`  Newest: ${new Date(data[0].created_at).toLocaleString()}`);

    // Group by date
    const byDate = {};
    data.forEach(r => {
      const date = new Date(r.created_at).toLocaleDateString();
      byDate[date] = (byDate[date] || 0) + 1;
    });

    console.log('\nBreakdown by date:');
    Object.entries(byDate).sort().reverse().forEach(([date, count]) => {
      console.log(`  ${date}: ${count} reflections`);
    });
  }
}

checkDates();
