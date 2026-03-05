#!/usr/bin/env node

/**
 * Update Reflection Statuses - Minimal Version
 *
 * Only updates reflection_status field (schema-safe version)
 * Does NOT update cohort_id, fix_plan_id, asana_task_id (columns don't exist yet)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPORTS_DIR = path.join(__dirname, '../reports');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function loadJSON(filename) {
  const files = fs.readdirSync(REPORTS_DIR);
  const matchingFile = files.find(f => f.includes(filename));
  if (!matchingFile) throw new Error(`No file matching ${filename}`);
  return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, matchingFile), 'utf8'));
}

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

async function updateReflection(reflectionId) {
  const url = `${SUPABASE_URL}/rest/v1/reflections?id=eq.${reflectionId}`;

  const payload = {
    reflection_status: 'under_review',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'auto-processing'
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
  console.log('🔄 Minimal Reflection Status Update\n');

  // Load fix plans to get cohorts (use exact filenames)
  const fixPlans = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'fix-plans-2025-10-22T21-35-14-766Z.json'), 'utf8'));
  const cohorts = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'reflection-cohorts-2025-10-22T21-32-32-154Z.json'), 'utf8'));

  // Build reflection list (extract IDs from objects)
  const reflectionsToUpdate = [];
  for (const plan of fixPlans.fix_plans) {
    const cohort = cohorts.cohorts.find(c => c.cohort_id === plan.cohort_id);
    if (cohort) {
      // Extract 'id' field from reflection objects
      const ids = cohort.reflections.map(r => typeof r === 'string' ? r : r.id);
      reflectionsToUpdate.push(...ids);
    }
  }

  const uniqueReflections = [...new Set(reflectionsToUpdate)];
  console.log(`📊 Found ${uniqueReflections.length} unique reflections to update\n`);

  let success = 0;
  let failed = 0;

  for (const refId of uniqueReflections) {
    try {
      await updateReflection(refId);
      console.log(`✓ ${refId}`);
      success++;
      await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit
    } catch (error) {
      console.log(`✗ ${refId}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Complete: ${success} updated, ${failed} failed`);

  // Save summary
  const summary = {
    timestamp: new Date().toISOString(),
    total: uniqueReflections.length,
    success,
    failed,
    reflections: uniqueReflections
  };

  const outPath = path.join(REPORTS_DIR, `reflection-updates-minimal-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 Summary saved: ${path.basename(outPath)}`);
}

main().catch(console.error);
