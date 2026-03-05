#!/usr/bin/env node

/**
 * Update Completed Reflection Statuses in Supabase
 * Marks reflections as 'completed' when work is done
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://REDACTED_SUPABASE_PROJECT.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_63OlbhjPE6U_TlUx_2EBSQ_7gMXma2V';

// Define status updates for completed work
const STATUS_UPDATES = [
  // Completed user tasks (using 'implemented' since 'completed' is not a valid status)
  {
    id: '068c7cf7-7087-4a29-940e-ba25163505c6',
    new_status: 'implemented',
    reason: 'Completed Batch #5 of Salesforce merge operations (10 merges, 100% success)'
  },
  {
    id: '1fe0e053-d108-464e-a4f9-aaee843f690f',
    new_status: 'implemented',
    reason: 'Completed HubSpot-Salesforce duplicate cleanup (77 duplicates cleaned up)'
  },
  {
    id: '71f0f0de-0049-4980-b86c-730ea210e3c0',
    new_status: 'implemented',
    reason: 'Successfully replicated Salesforce IQ Ad Targeting report in HubSpot'
  },
  {
    id: 'af0ac3a6-3192-4a1f-889a-52215a8ae864',
    new_status: 'implemented',
    reason: 'Successfully created HubSpot integration fields on Contact object'
  },
  // Process improvements implemented
  {
    id: '5e2e73c2-0483-4cf7-9061-441d508fbf74',
    new_status: 'implemented',
    reason: 'Meta-reflection about /reflect command - fixed by making Supabase submission mandatory'
  },
  {
    id: '9a97a34a-d86e-4b76-adeb-a2a8812466d8',
    new_status: 'implemented',
    reason: 'Supabase JSONB payload format issue - resolved with proper data structure'
  }
];

function updateReflectionStatus(reflectionId, newStatus, reason) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/reflections?id=eq.${reflectionId}`;

    const payload = JSON.stringify({
      reflection_status: newStatus
    });

    const options = {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            resolve({ success: true, data: jsonData });
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🔄 Updating completed reflection statuses in Supabase...\n');

  let successCount = 0;
  let errorCount = 0;
  let notFoundCount = 0;

  for (const update of STATUS_UPDATES) {
    try {
      console.log(`📝 Updating ${update.id.substring(0, 8)}...`);
      console.log(`   Status: → ${update.new_status}`);
      console.log(`   Reason: ${update.reason}`);

      const result = await updateReflectionStatus(update.id, update.new_status, update.reason);

      if (result.success && result.data.length > 0) {
        console.log(`   ✅ SUCCESS\n`);
        successCount++;
      } else if (result.success && result.data.length === 0) {
        console.log(`   ⚠️  No matching record found (may already be updated or ID incorrect)\n`);
        notFoundCount++;
      }

    } catch (error) {
      console.error(`   ❌ ERROR: ${error.message}\n`);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successfully updated: ${successCount}`);
  console.log(`   ⚠️  Not found: ${notFoundCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📋 Total attempted: ${STATUS_UPDATES.length}`);
}

main();
