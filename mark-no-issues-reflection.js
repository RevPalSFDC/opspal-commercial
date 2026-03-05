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

async function markReflection() {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { error } = await client
    .from('reflections')
    .update({
      reflection_status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: 'auto-processing',
      rejection_reason: 'No actionable issues identified in reflection'
    })
    .eq('id', '852cec96-affc-423d-90dc-6ec28a82be58');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('✅ Marked reflection as rejected (no issues to act on)');
}

markReflection();
