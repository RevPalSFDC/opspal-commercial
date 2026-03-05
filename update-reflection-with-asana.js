#!/usr/bin/env node

/**
 * Update Reflection with Asana Task Links
 * Links the reflection to its Asana tasks created from the fix plans
 */

const { updateReflectionStatus } = require('./update-reflection-status.js');

async function main() {
  const reflectionId = '068c7cf7-7087-4a29-940e-ba25163505c6';

  // Asana task URLs from the creation output
  const asanaTaskUrls = [
    'https://app.asana.com/0/1211617834659194/1211640562611977',
    'https://app.asana.com/0/1211617834659194/1211640470718725'
  ];

  console.log('🔗 Updating reflection with Asana task links...\n');
  console.log(`Reflection: ${reflectionId}`);
  console.log(`Task #1 (Data Quality): ${asanaTaskUrls[0]}`);
  console.log(`Task #2 (Process Mgmt): ${asanaTaskUrls[1]}`);
  console.log('');

  // Note: Supabase reflections table likely has a single asana_task_url field
  // We'll store the primary (highest priority) task URL
  const primaryTaskUrl = asanaTaskUrls[0];
  const primaryTaskId = '1211640562611977';

  try {
    // The reflection is already in 'under_review' status, so we're just adding
    // the Asana task information without changing status
    const https = require('https');
    const { URL } = require('url');

    const supabaseUrl = process.env.SUPABASE_URL || 'https://REDACTED_SUPABASE_PROJECT.supabase.co';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
    }

    const updateData = {
      asana_task_id: primaryTaskId,
      asana_task_url: primaryTaskUrl
    };

    const url = `${supabaseUrl}/rest/v1/reflections?id=eq.${reflectionId}`;

    const response = await new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'PATCH',
        headers: {
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, data: JSON.parse(data) });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(updateData));
      req.end();
    });

    console.log('✅ Reflection updated with Asana task links');
    console.log('\n📊 Updated fields:');
    console.log(`   asana_task_id: ${primaryTaskId}`);
    console.log(`   asana_task_url: ${primaryTaskUrl}`);

    console.log('\n✅ Complete! The reflection is now linked to its Asana tasks.');
    console.log('\n📌 View tasks in Asana:');
    console.log(`   Project: https://app.asana.com/0/1211617834659194`);
    console.log(`   Task #1: ${asanaTaskUrls[0]}`);
    console.log(`   Task #2: ${asanaTaskUrls[1]}`);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
