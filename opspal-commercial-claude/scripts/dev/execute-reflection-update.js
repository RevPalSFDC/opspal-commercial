#!/usr/bin/env node

/**
 * Execute Reflection Status Update
 * Updates reflections from 'new' to 'under_review' after cohort detection
 */

const https = require('https');

// Configuration from environment
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REFLECTION_IDS = [
  'd448b6bf-e045-42df-ac77-f07cca526b21', // rentable-production
  '894217fb-2629-4d13-85e6-ae3185b5e557'  // hivemq
];

async function executeUpdate() {
  console.log('🔄 Updating reflection statuses...\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables');
    console.error('   SUPABASE_URL:', SUPABASE_URL ? 'set' : 'NOT SET');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET');
    process.exit(1);
  }

  const updateData = {
    reflection_status: 'under_review',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'auto-processing'
  };

  let updatedCount = 0;

  for (const reflectionId of REFLECTION_IDS) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/reflections?id=eq.${reflectionId}`;

      const result = await makeRequest(url, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      });

      if (result.success) {
        console.log(`✅ Updated: ${reflectionId.substring(0, 8)}...`);
        updatedCount++;
      } else {
        console.error(`❌ Failed: ${reflectionId.substring(0, 8)}... - ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${reflectionId}:`, error.message);
    }
  }

  console.log(`\n📊 Results: ${updatedCount}/${REFLECTION_IDS.length} reflections updated`);

  if (updatedCount === REFLECTION_IDS.length) {
    console.log('✅ All reflections successfully updated to under_review');
  } else {
    console.error('⚠️  Some updates failed - check errors above');
    process.exit(1);
  }
}

function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data: data });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Execute
executeUpdate().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
