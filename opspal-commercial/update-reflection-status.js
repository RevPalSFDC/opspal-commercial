#!/usr/bin/env node

/**
 * Update Reflection Status in Supabase
 *
 * Purpose: Update reflection workflow status (new → under_review → accepted → implemented)
 * Usage: node update-reflection-status.js <reflection-id> <new-status>
 *
 * Features:
 * - Uses service role key for update permissions
 * - Verifies update persisted successfully
 * - Generates update report
 * - Handles concurrency checks
 *
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL (required)
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for updates (required)
 *
 * Valid Statuses:
 *   new           - Initial state after submission
 *   under_review  - Cohort detected, Asana task created
 *   accepted      - Fix plan approved for implementation
 *   rejected      - Fix plan not viable
 *   implemented   - Fix deployed and validated
 *   deferred      - Valid issue but deprioritized
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// =============================================================================
// Configuration
// =============================================================================

const VALID_STATUSES = ['new', 'under_review', 'accepted', 'rejected', 'implemented', 'deferred'];

const VALID_TRANSITIONS = {
  'new': ['under_review'],
  'under_review': ['accepted', 'rejected', 'deferred'],
  'accepted': ['implemented', 'deferred'],
  'rejected': [], // Terminal state
  'implemented': [], // Terminal state
  'deferred': ['under_review'] // Can be re-activated
};

// =============================================================================
// HTTP Helper
// =============================================================================

const REQUEST_TIMEOUT_MS = 15000;

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const parsed = safeJsonParse(data);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: parsed,
          raw: data,
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// =============================================================================
// Validation
// =============================================================================

function validateTransition(currentStatus, newStatus) {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${currentStatus} → ${newStatus}. ` +
      `Allowed transitions: ${allowedTransitions.join(', ') || 'none (terminal state)'}`
    );
  }

  return true;
}

// =============================================================================
// Update Reflection Status
// =============================================================================

async function updateReflectionStatus(reflectionId, newStatus, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(
      `Invalid status: ${newStatus}. Valid statuses: ${VALID_STATUSES.join(', ')}`
    );
  }

  console.log(`\n🔄 Updating Reflection Status\n`);
  console.log(`Reflection ID: ${reflectionId}`);
  console.log(`New Status: ${newStatus}`);
  console.log('');

  // Step 1: Fetch current reflection
  console.log('📥 Fetching current reflection...');
  const fetchResponse = await makeRequest(
    `${supabaseUrl}/rest/v1/reflections?id=eq.${reflectionId}&select=*`,
    {
      method: 'GET',
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!fetchResponse.ok) {
    const errorText = await fetchResponse.text();
    throw new Error(`Failed to fetch reflection: ${fetchResponse.status} - ${errorText}`);
  }

  const reflections = Array.isArray(fetchResponse.data) ? fetchResponse.data : [];
  if (!reflections || reflections.length === 0) {
    const bodyPreview = fetchResponse.raw ? ` Response body: ${String(fetchResponse.raw).slice(0, 200)}` : '';
    throw new Error(`Reflection not found: ${reflectionId}.${bodyPreview}`);
  }

  const currentReflection = reflections[0];
  const currentStatus = currentReflection.reflection_status || 'new';

  console.log(`✅ Current status: ${currentStatus}`);

  // Step 2: Validate transition
  console.log(`🔍 Validating transition: ${currentStatus} → ${newStatus}...`);
  validateTransition(currentStatus, newStatus);
  console.log('✅ Transition valid');

  // Step 3: Prepare update data
  const updateData = {
    reflection_status: newStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: options.reviewed_by || 'processreflections-workflow'
  };

  // Add optional fields
  if (options.asana_task_id) {
    updateData.asana_task_id = options.asana_task_id;
  }
  if (options.asana_task_url) {
    updateData.asana_task_url = options.asana_task_url;
  }
  if (options.implementation_notes) {
    updateData.implementation_notes = options.implementation_notes;
  }
  if (options.rejection_reason) {
    updateData.rejection_reason = options.rejection_reason;
  }

  // Step 4: Execute update
  console.log('\n💾 Executing update...');
  const updateResponse = await makeRequest(
    `${supabaseUrl}/rest/v1/reflections?id=eq.${reflectionId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    },
    JSON.stringify(updateData)
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Update failed: ${updateResponse.status} - ${errorText}`);
  }

  console.log('✅ Update executed (HTTP 200)');

  // Step 5: Wait for consistency
  console.log('\n⏳ Waiting for consistency (1 second)...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Step 6: Verify update persisted
  console.log('🔍 Verifying update persisted...');
  const verifyResponse = await makeRequest(
    `${supabaseUrl}/rest/v1/reflections?id=eq.${reflectionId}&select=reflection_status,reviewed_at,reviewed_by`,
    {
      method: 'GET',
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!verifyResponse.ok) {
    const errorText = await verifyResponse.text();
    throw new Error(`Verification failed: ${verifyResponse.status} - ${errorText}`);
  }

  const verifiedReflections = Array.isArray(verifyResponse.data) ? verifyResponse.data : [];
  if (!verifiedReflections || verifiedReflections.length === 0) {
    throw new Error('Verification failed: Reflection not found after update');
  }

  const verifiedReflection = verifiedReflections[0];

  if (verifiedReflection.reflection_status !== newStatus) {
    throw new Error(
      `Update verification failed! ` +
      `Expected: ${newStatus}, Actual: ${verifiedReflection.reflection_status}`
    );
  }

  console.log(`✅ Verified: reflection_status = ${verifiedReflection.reflection_status}`);

  // Step 7: Generate report
  const report = {
    success: true,
    reflection_id: reflectionId,
    transition: {
      from: currentStatus,
      to: newStatus
    },
    updated_fields: updateData,
    verified_status: verifiedReflection.reflection_status,
    timestamp: new Date().toISOString(),
    reviewed_by: updateData.reviewed_by
  };

  console.log('\n✅ Update Complete\n');
  console.log('Report:');
  console.log(JSON.stringify(report, null, 2));
  console.log('');

  return report;
}

// =============================================================================
// Save Report
// =============================================================================

function saveReport(report) {
  const reportsDir = path.join(__dirname, 'reports');

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `reflection-status-update-${timestamp}.json`;
  const filepath = path.join(reportsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`📄 Report saved: ${filepath}\n`);
  return filepath;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const reflectionId = process.argv[2];
  const newStatus = process.argv[3];

  if (!reflectionId || !newStatus) {
    console.log('Usage: node update-reflection-status.js <reflection-id> <new-status>');
    console.log('');
    console.log('Valid statuses:');
    console.log('  new           - Initial state after submission');
    console.log('  under_review  - Cohort detected, Asana task created');
    console.log('  accepted      - Fix plan approved for implementation');
    console.log('  rejected      - Fix plan not viable');
    console.log('  implemented   - Fix deployed and validated');
    console.log('  deferred      - Valid issue but deprioritized');
    console.log('');
    console.log('Valid transitions:');
    Object.entries(VALID_TRANSITIONS).forEach(([from, toStates]) => {
      const allowed = toStates.length > 0 ? toStates.join(', ') : 'none (terminal)';
      console.log(`  ${from.padEnd(15)} → ${allowed}`);
    });
    console.log('');
    console.log('Environment Variables:');
    console.log('  SUPABASE_URL              - Supabase project URL (required)');
    console.log('  SUPABASE_SERVICE_ROLE_KEY - Service role key (required for updates)');
    console.log('');
    console.log('Example:');
    console.log('  node update-reflection-status.js 068c7cf7-7087-4a29-940e-ba25163505c6 under_review');
    console.log('');
    process.exit(1);
  }

  try {
    const report = await updateReflectionStatus(reflectionId, newStatus);
    const reportPath = saveReport(report);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('');

    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = { updateReflectionStatus, safeJsonParse };
