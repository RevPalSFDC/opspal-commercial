#!/usr/bin/env node

/**
 * Revert incorrectly updated reflection back to 'new' status
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://REDACTED_SUPABASE_PROJECT.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_63OlbhjPE6U_TlUx_2EBSQ_7gMXma2V';

// Revert the reflection that came in this morning
const REVERT_ID = '068c7cf7-7087-4a29-940e-ba25163505c6';

function updateReflectionStatus(reflectionId, newStatus) {
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
  console.log('🔄 Reverting reflection status to "new"...\n');

  try {
    console.log(`📝 Updating ${REVERT_ID.substring(0, 8)}...`);
    console.log(`   Status: implemented → new`);
    console.log(`   Reason: Reflection came in this morning (10/14), hasn't been processed yet`);

    const result = await updateReflectionStatus(REVERT_ID, 'new');

    if (result.success && result.data.length > 0) {
      console.log(`   ✅ SUCCESS\n`);
      console.log('Reflection is now ready for /processreflections workflow');
    } else {
      console.log(`   ⚠️  No matching record found\n`);
    }

  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}\n`);
    process.exit(1);
  }
}

main();
