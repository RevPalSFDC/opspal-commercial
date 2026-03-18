#!/usr/bin/env node

/**
 * Update Reflections to Implemented Status
 *
 * Updates reflections to 'implemented' status for cohorts with deployed fixes
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Reflections to update (from FP-003, FP-004, FP-005, FP-009)
const IMPLEMENTED_REFLECTIONS = [
  {
    id: '1b84ed7d-6083-4386-add0-ce878b48d643',
    cohorts: ['FP-003', 'FP-004'],
    fixes: 'CLI Command Validator + Smart Query Batcher'
  },
  {
    id: '6abf5cdb-7301-4d93-9888-d02fc2a67eb5',
    cohorts: ['FP-003', 'FP-004'],
    fixes: 'CLI Command Validator + Smart Query Batcher'
  },
  {
    id: '1ae79555-ae05-4698-b048-fee141126a34',
    cohorts: ['FP-003', 'FP-004'],
    fixes: 'CLI Command Validator + Smart Query Batcher'
  },
  {
    id: '6744a5a0-50d3-474e-b343-9f6c82dffe07',
    cohorts: ['FP-005'],
    fixes: 'CLI Format Auto-Converter'
  },
  {
    id: 'faab34b1-be9d-4426-b7da-8e81bc00dbdf',
    cohorts: ['FP-005'],
    fixes: 'CLI Format Auto-Converter'
  },
  {
    id: 'ab56aae4-2f21-4f35-9f30-81a758bbea25',
    cohorts: ['FP-005'],
    fixes: 'CLI Format Auto-Converter'
  },
  {
    id: 'c4733821-662e-4442-9b9b-03860ac913b7',
    cohorts: ['FP-009'],
    fixes: 'Metadata Reference Resolver'
  },
  {
    id: 'f8252ff4-42bf-4a2d-bf72-7b7e7afbf5a3',
    cohorts: ['FP-009'],
    fixes: 'Metadata Reference Resolver'
  }
];

function httpsRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function updateReflection(reflectionId, fixes) {
  const url = `${SUPABASE_URL}/rest/v1/reflections?id=eq.${reflectionId}`;

  const payload = {
    reflection_status: 'implemented',
    reviewed_at: new Date().toISOString(),
    reviewed_by: `auto-processing: ${fixes} (v3.35.0, commit dbe5e38)`
  };

  const options = {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  };

  return httpsRequest(url, options);
}

async function main() {
  console.log('🔄 Updating Reflections to Implemented Status\n');
  console.log(`Updating ${IMPLEMENTED_REFLECTIONS.length} reflections...\n`);

  let success = 0;
  let failed = 0;

  for (const reflection of IMPLEMENTED_REFLECTIONS) {
    try {
      await updateReflection(reflection.id, reflection.fixes);
      console.log(`✅ ${reflection.id}`);
      console.log(`   Fixes: ${reflection.fixes}`);
      success++;
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.log(`❌ ${reflection.id}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Update Complete: ${success} updated, ${failed} failed`);
  console.log(`\nStatus changed: 'under_review' → 'implemented'`);
  console.log(`Deployed in: v3.35.0 (commit dbe5e38)`);
}

main().catch(console.error);
