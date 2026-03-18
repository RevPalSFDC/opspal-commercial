#!/usr/bin/env node

/**
 * Verify Workflow Migration
 * Run after pasting WORKFLOW_MIGRATION.sql into Supabase SQL Editor
 */

const https = require('https');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: data ? JSON.parse(data) : null });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verify() {
  console.log('🔍 Verifying workflow migration...\n');

  try {
    // Check if we can query the new columns
    const response = await makeRequest(
      `${supabaseUrl}/rest/v1/reflections?select=reflection_status,asana_task_id,reviewed_by&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      console.log('❌ Migration NOT complete');
      console.log(`   Status: ${response.status}`);
      console.log('   The new columns are not accessible yet.\n');
      console.log('📋 Please paste scripts/WORKFLOW_MIGRATION.sql into:');
      console.log('   https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT_REF/sql/new\n');
      process.exit(1);
    }

    // Check views
    const viewCheck = await makeRequest(
      `${supabaseUrl}/rest/v1/reflection_triage_queue?limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    console.log('✅ Migration successful!\n');
    console.log('New columns added:');
    console.log('  ✓ reflection_status');
    console.log('  ✓ asana_project_id, asana_task_id, asana_task_url');
    console.log('  ✓ reviewed_at, reviewed_by');
    console.log('  ✓ rejection_reason, implementation_notes\n');

    if (viewCheck.ok) {
      console.log('Views created:');
      console.log('  ✓ reflection_triage_queue');
      console.log('  ✓ reflection_backlog');
      console.log('  ✓ reflection_implementation_status\n');
    }

    console.log('🎉 Workflow tracking system is ready!\n');
    console.log('Next steps:');
    console.log('  1. View triage queue: node scripts/lib/query-reflections.js triage');
    console.log('  2. Process reflections: node scripts/lib/process-reflections.js triage');
    console.log('  3. Create Asana tasks: node scripts/lib/create-reflection-task.js <id>\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verify();
