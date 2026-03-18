#!/usr/bin/env node

/**
 * Update Reflection Statuses - Simple Version
 *
 * Uses Node.js https module (compatible with all Node versions)
 * Updates reflections to 'under_review' status.
 *
 * CRITICAL: Uses Supabase service role key for RLS bypass
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ============================================================================
// Configuration
// ============================================================================

const REPORTS_DIR = path.join(__dirname, '../reports');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Missing required environment variables');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;

// ============================================================================
// HTTP Helper Functions
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadJSON(filename) {
  const filepath = path.join(REPORTS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeJSON(filename, data) {
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  return filepath;
}

/**
 * Make HTTPS request
 */
function makeRequest(url, options = {}) {
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
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve(parsed);
          } catch (e) {
            resolve(null);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Execute Supabase REST API request
 */
async function supabaseRequest(method, endpoint, body = null, params = {}) {
  const url = new URL(`${SUPABASE_REST_URL}/${endpoint}`);

  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const options = {
    method,
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body
  };

  return await makeRequest(url.toString(), options);
}

/**
 * Update single reflection
 */
async function updateReflection(reflectionId, cohortId, fixPlanId, cohortNumber) {
  const updateData = {
    reflection_status: 'under_review',
    asana_task_id: `PENDING_MANUAL_CREATION_${cohortNumber}`,
    asana_task_url: 'https://app.asana.com/0/1211617834659194/PENDING',
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'auto-processing',
    cohort_id: cohortId,
    fix_plan_id: fixPlanId
  };

  // Update reflection
  await supabaseRequest(
    'PATCH',
    'reflections',
    updateData,
    { id: `eq.${reflectionId}` }
  );

  // Wait for consistency
  await sleep(1000);

  // Verify update persisted
  const verification = await supabaseRequest(
    'GET',
    'reflections',
    null,
    {
      id: `eq.${reflectionId}`,
      select: 'reflection_status,cohort_id,asana_task_id,reviewed_at'
    }
  );

  if (!verification || verification.length === 0) {
    throw new Error(`Verification failed: reflection not found after update`);
  }

  const verified = verification[0];

  if (verified.reflection_status !== 'under_review') {
    throw new Error(
      `Update verification failed! ` +
      `Expected: under_review, Actual: ${verified.reflection_status}`
    );
  }

  return verified;
}

/**
 * Rollback reflection to 'new' status
 */
async function rollbackReflection(reflectionId) {
  try {
    await supabaseRequest(
      'PATCH',
      'reflections',
      {
        reflection_status: 'new',
        asana_task_id: null,
        asana_task_url: null,
        reviewed_at: null,
        reviewed_by: null,
        cohort_id: null,
        fix_plan_id: null
      },
      { id: `eq.${reflectionId}` }
    );
    return true;
  } catch (error) {
    console.error(`   ⚠️  Rollback failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// Main Processing
// ============================================================================

async function main() {
  console.log('🔄 Reflection Status Update - Starting\n');
  console.log(`Using Supabase URL: ${SUPABASE_URL}`);
  console.log(`Using service role key: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...\n`);

  // Phase 1: Load input files
  console.log('📖 Phase 1: Loading input files...');

  const fixPlans = loadJSON('fix-plans-2025-10-22T21-35-14-766Z.json');
  const cohorts = loadJSON('reflection-cohorts-2025-10-22T21-32-32-154Z.json');

  console.log(`   ✓ Fix plans: ${fixPlans.fix_plans.length} plans`);
  console.log(`   ✓ Cohorts: ${cohorts.cohorts.length} cohorts\n`);

  // Phase 2: Build reflection mapping
  console.log('🗺️  Phase 2: Building reflection mapping...');

  const reflectionMapping = [];
  let totalReflections = 0;

  for (const [index, fixPlan] of fixPlans.fix_plans.entries()) {
    const cohortId = fixPlan.cohort_id;
    const fixPlanId = fixPlan.fix_plan_id;
    const cohortNumber = String(index + 1).padStart(2, '0');

    // Find corresponding cohort
    const cohort = cohorts.cohorts.find(c => c.cohort_id === cohortId);

    if (!cohort) {
      console.error(`   ⚠️  Warning: Cohort ${cohortId} not found in cohorts file`);
      continue;
    }

    // Extract reflection IDs
    const reflectionIds = cohort.reflections.map(r => r.id);
    totalReflections += reflectionIds.length;

    reflectionMapping.push({
      cohort_id: cohortId,
      fix_plan_id: fixPlanId,
      cohort_number: cohortNumber,
      reflection_ids: reflectionIds,
      taxonomy: fixPlan.cohort_summary.taxonomy,
      root_cause: fixPlan.cohort_summary.root_cause_summary
    });

    console.log(`   ✓ Cohort ${cohortNumber} (${fixPlanId}): ${reflectionIds.length} reflections`);
  }

  console.log(`\n   📊 Total: ${reflectionMapping.length} cohorts, ${totalReflections} reflections\n`);

  // Phase 3: Update reflections
  console.log('🔧 Phase 3: Updating reflections in Supabase...\n');

  const updateResults = {
    total_cohorts_processed: reflectionMapping.length,
    reflections_to_update: totalReflections,
    reflections_updated: 0,
    reflections_failed: 0,
    updates: [],
    failures: []
  };

  for (const mapping of reflectionMapping) {
    console.log(`📦 Cohort ${mapping.cohort_number}: ${mapping.fix_plan_id}`);
    console.log(`   Taxonomy: ${mapping.taxonomy}`);
    console.log(`   Reflections: ${mapping.reflection_ids.length}`);

    const cohortResult = {
      cohort_id: mapping.cohort_id,
      fix_plan_id: mapping.fix_plan_id,
      cohort_number: mapping.cohort_number,
      reflections_updated: [],
      reflections_failed: [],
      asana_task_url: 'https://app.asana.com/0/1211617834659194/PENDING',
      status: 'in_progress'
    };

    // Update each reflection
    for (const reflectionId of mapping.reflection_ids) {
      try {
        await updateReflection(
          reflectionId,
          mapping.cohort_id,
          mapping.fix_plan_id,
          mapping.cohort_number
        );

        cohortResult.reflections_updated.push(reflectionId);
        updateResults.reflections_updated++;
        console.log(`   ✓ ${reflectionId}`);

        // Rate limiting
        await sleep(300);

      } catch (error) {
        cohortResult.reflections_failed.push(reflectionId);
        updateResults.reflections_failed++;

        // Attempt rollback
        const rollbackSuccess = await rollbackReflection(reflectionId);

        updateResults.failures.push({
          reflection_id: reflectionId,
          cohort_id: mapping.cohort_id,
          fix_plan_id: mapping.fix_plan_id,
          error: error.message,
          rollback_status: rollbackSuccess ? 'completed' : 'failed',
          timestamp: new Date().toISOString()
        });

        console.error(`   ✗ ${reflectionId}: ${error.message}`);
      }
    }

    cohortResult.status = cohortResult.reflections_failed.length === 0 ? 'success' : 'partial';
    updateResults.updates.push(cohortResult);

    console.log('');
  }

  // Phase 4: Generate summary
  console.log('📊 Phase 4: Generating summary...\n');

  updateResults.metadata = {
    update_timestamp: new Date().toISOString(),
    updated_by: 'auto-processing',
    service_used: 'Supabase REST API (service role key)',
    verification_enabled: true,
    rollback_on_failure: true
  };

  // Write results JSON
  const jsonFile = writeJSON(`reflection-updates-${TIMESTAMP}.json`, updateResults);
  console.log(`   ✓ JSON results: ${path.basename(jsonFile)}`);

  // Generate markdown summary
  const markdownContent = generateMarkdownSummary(updateResults, reflectionMapping);
  const markdownFile = path.join(REPORTS_DIR, 'REFLECTION_UPDATE_SUMMARY.md');
  fs.writeFileSync(markdownFile, markdownContent, 'utf8');
  console.log(`   ✓ Markdown summary: ${path.basename(markdownFile)}`);

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('✅ REFLECTION STATUS UPDATE COMPLETE\n');
  console.log(`   Total cohorts processed: ${updateResults.total_cohorts_processed}`);
  console.log(`   Reflections updated: ${updateResults.reflections_updated}/${updateResults.reflections_to_update}`);

  const successRate = (updateResults.reflections_updated / updateResults.reflections_to_update * 100).toFixed(1);
  console.log(`   Success rate: ${successRate}%`);

  if (updateResults.reflections_failed > 0) {
    console.log(`\n   ⚠️  Failures: ${updateResults.reflections_failed} reflections`);
    console.log(`   See ${path.basename(jsonFile)} for details`);
  }

  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(updateResults.reflections_failed > 0 ? 1 : 0);
}

// ============================================================================
// Markdown Summary Generator
// ============================================================================

function generateMarkdownSummary(results, mapping) {
  const timestamp = new Date().toISOString();
  const successRate = ((results.reflections_updated / results.reflections_to_update) * 100).toFixed(1);

  let md = `# Reflection Status Update Summary

**Timestamp:** ${timestamp}

## Summary

- **Total cohorts processed:** ${results.total_cohorts_processed}
- **Reflections updated:** ${results.reflections_updated}/${results.reflections_to_update} (${successRate}%)
- **Reflections failed:** ${results.reflections_failed}
- **Status changed:** 'new' → 'under_review'
- **Asana tasks:** Pending manual creation

## Cohort-by-Cohort Results

| Cohort | Fix Plan | Reflections | Success | Failed | Status | Asana Task |
|--------|----------|-------------|---------|--------|--------|------------|
`;

  for (const update of results.updates) {
    const totalReflections = update.reflections_updated.length + update.reflections_failed.length;
    const statusIcon = update.status === 'success' ? '✅' : '⚠️';

    md += `| ${update.cohort_number} | ${update.fix_plan_id} | ${totalReflections} | ${update.reflections_updated.length} | ${update.reflections_failed.length} | ${statusIcon} ${update.status} | PENDING |\n`;
  }

  md += `\n## Updated Reflections by Cohort\n\n`;

  for (const update of results.updates) {
    if (update.reflections_updated.length === 0) continue;

    const cohortInfo = mapping.find(m => m.cohort_id === update.cohort_id);

    md += `### Cohort ${update.cohort_number}: ${update.fix_plan_id}\n\n`;
    md += `**Taxonomy:** ${cohortInfo?.taxonomy || 'Unknown'}\n\n`;
    md += `**Root Cause:** ${cohortInfo?.root_cause || 'Unknown'}\n\n`;
    md += `**Status:** ${update.status === 'success' ? '✅ All updated successfully' : '⚠️ Partial success'}\n\n`;

    md += `**Reflections:**\n\n`;

    for (const reflectionId of update.reflections_updated) {
      md += `- ✅ \`${reflectionId}\`\n`;
    }

    if (update.reflections_failed.length > 0) {
      md += `\n**Failed:**\n\n`;
      for (const reflectionId of update.reflections_failed) {
        const failure = results.failures.find(f => f.reflection_id === reflectionId);
        md += `- ❌ \`${reflectionId}\` - ${failure?.error || 'Unknown error'}\n`;
      }
    }

    md += `\n`;
  }

  if (results.failures.length > 0) {
    md += `## Failure Details\n\n`;

    for (const failure of results.failures) {
      md += `### \`${failure.reflection_id}\`\n\n`;
      md += `- **Cohort:** ${failure.cohort_id}\n`;
      md += `- **Fix Plan:** ${failure.fix_plan_id}\n`;
      md += `- **Error:** ${failure.error}\n`;
      md += `- **Rollback:** ${failure.rollback_status}\n`;
      md += `- **Time:** ${failure.timestamp}\n\n`;
    }
  }

  md += `## Next Steps

1. **Create Asana tasks manually** using \`asana-tasks-2025-10-22T21-40-00-000Z.json\`
2. **Update with real task URLs:**
   \`\`\`sql
   UPDATE reflections
   SET asana_task_id = '{real_task_id}',
       asana_task_url = '{real_task_url}'
   WHERE cohort_id = '{cohort_id}';
   \`\`\`
3. **Verify:**
   \`\`\`sql
   SELECT cohort_id, COUNT(*) FROM reflections
   WHERE reflection_status = 'under_review'
   AND reviewed_at > NOW() - INTERVAL '1 hour'
   GROUP BY cohort_id;
   \`\`\`

---

**Generated:** ${timestamp}
`;

  return md;
}

// ============================================================================
// Execute
// ============================================================================

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
