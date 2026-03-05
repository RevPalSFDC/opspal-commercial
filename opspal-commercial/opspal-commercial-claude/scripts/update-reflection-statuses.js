#!/usr/bin/env node

/**
 * Update Reflection Statuses to 'pending_review'
 *
 * Updates all reflections that are part of cohorts with fix plans,
 * linking them to placeholder Asana tasks pending manual creation.
 *
 * CRITICAL: Uses Supabase service role key for RLS bypass
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// Configuration
// ============================================================================

const REPORTS_DIR = path.join(__dirname, '../reports');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

// Supabase configuration - MUST use service role key
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Missing required environment variables');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

// Initialize Supabase client with SERVICE ROLE KEY (required for updates)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load JSON file
 */
function loadJSON(filename) {
  const filepath = path.join(REPORTS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

/**
 * Write JSON file
 */
function writeJSON(filename, data) {
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  return filepath;
}

/**
 * Verify reflection status update persisted
 */
async function verifyUpdate(reflectionId, expectedStatus) {
  await sleep(500); // Wait for consistency

  const { data, error } = await supabase
    .from('reflections')
    .select('reflection_status, cohort_id, asana_task_id, reviewed_at')
    .eq('id', reflectionId)
    .single();

  if (error) {
    throw new Error(`Verification query failed: ${error.message}`);
  }

  if (data.reflection_status !== expectedStatus) {
    throw new Error(
      `Update verification failed! ` +
      `Expected: ${expectedStatus}, Actual: ${data.reflection_status}`
    );
  }

  return data;
}

/**
 * Rollback reflection to 'new' status
 */
async function rollbackReflection(reflectionId) {
  const { error } = await supabase
    .from('reflections')
    .update({
      reflection_status: 'new',
      asana_task_id: null,
      asana_task_url: null,
      reviewed_at: null,
      reviewed_by: null,
      cohort_id: null,
      fix_plan_id: null
    })
    .eq('id', reflectionId);

  if (error) {
    console.error(`   ⚠️  Rollback failed for ${reflectionId}: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Update single reflection status
 */
async function updateReflection(reflectionId, cohortId, fixPlanId, taskId, taskUrl) {
  const updateData = {
    reflection_status: 'pending_review',  // Changed from 'under_review' - tasks need manual creation
    asana_task_id: taskId,
    asana_task_url: taskUrl,
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'auto-processing',
    cohort_id: cohortId,
    fix_plan_id: fixPlanId
  };

  // Attempt update
  const { error: updateError } = await supabase
    .from('reflections')
    .update(updateData)
    .eq('id', reflectionId);

  if (updateError) {
    throw new Error(`Update failed: ${updateError.message}`);
  }

  // Verify update persisted
  try {
    await verifyUpdate(reflectionId, 'pending_review');
    return { success: true };
  } catch (verifyError) {
    // Verification failed - attempt rollback
    await rollbackReflection(reflectionId);
    throw verifyError;
  }
}

// ============================================================================
// Main Processing
// ============================================================================

async function main() {
  console.log('🔄 Reflection Status Update - Starting\n');

  // Phase 1: Load input files (Updated to 2025-10-26 files)
  console.log('📖 Phase 1: Loading input files...');

  const cohorts = loadJSON('cohorts-detected-2025-10-26.json');
  const asanaTasks = loadJSON('asana-tasks-created-2025-10-26.json');

  console.log(`   ✓ Cohorts: ${cohorts.cohorts.length} cohorts`);
  console.log(`   ✓ Asana tasks: ${asanaTasks.tasks.length} tasks (placeholders)\n`);

  // Phase 2: Build reflection mapping from top 10 P0 cohorts
  console.log('🗺️  Phase 2: Building reflection mapping from top 10 P0 cohorts...');

  const reflectionMapping = [];
  let totalReflections = 0;

  // Create cohort lookup map
  const cohortMap = new Map();
  cohorts.cohorts.forEach(cohort => {
    cohortMap.set(cohort.cohort_id, cohort);
  });

  // Process each Asana task (top 10 P0 cohorts)
  for (const [index, task] of asanaTasks.tasks.entries()) {
    const cohort = cohortMap.get(task.cohort_id);

    if (!cohort) {
      console.error(`   ⚠️  Warning: Cohort ${task.cohort_id} not found`);
      continue;
    }

    // Extract reflection IDs
    const reflectionIds = cohort.reflections.map(r => r.id);
    totalReflections += reflectionIds.length;

    reflectionMapping.push({
      cohort_id: task.cohort_id,
      fix_plan_id: task.fix_plan_id,
      cohort_number: String(index + 1).padStart(2, '0'),
      task_id: task.task_id,
      task_url: task.task_url,
      reflection_ids: reflectionIds,
      taxonomy: task.taxonomy,
      title: task.title,
      priority: task.priority
    });

    console.log(`   ✓ Cohort ${index + 1} (${task.fix_plan_id}): ${reflectionIds.length} reflections`);
  }

  console.log(`\n   📊 Total: ${reflectionMapping.length} cohorts, ${totalReflections} reflections\n`);

  // Phase 3: Update reflections
  console.log('🔧 Phase 3: Updating reflections in Supabase...\n');

  const updateResults = {
    generation_timestamp: new Date().toISOString(),
    total_cohorts_processed: reflectionMapping.length,
    reflections_to_update: totalReflections,
    reflections_updated: 0,
    reflections_failed: 0,
    updates: [],
    failures: []
  };

  for (const mapping of reflectionMapping) {
    console.log(`📦 Cohort ${mapping.cohort_number}: ${mapping.fix_plan_id}`);
    console.log(`   Title: ${mapping.title}`);
    console.log(`   Taxonomy: ${mapping.taxonomy}`);
    console.log(`   Priority: ${mapping.priority}`);
    console.log(`   Reflections: ${mapping.reflection_ids.length}`);

    const cohortResult = {
      cohort_id: mapping.cohort_id,
      fix_plan_id: mapping.fix_plan_id,
      cohort_number: mapping.cohort_number,
      title: mapping.title,
      taxonomy: mapping.taxonomy,
      priority: mapping.priority,
      task_id: mapping.task_id,
      task_url: mapping.task_url,
      reflections_updated: [],
      reflections_failed: [],
      status: 'in_progress'
    };

    // Update each reflection
    for (const reflectionId of mapping.reflection_ids) {
      try {
        await updateReflection(
          reflectionId,
          mapping.cohort_id,
          mapping.fix_plan_id,
          mapping.task_id,
          mapping.task_url
        );

        cohortResult.reflections_updated.push(reflectionId);
        updateResults.reflections_updated++;
        console.log(`   ✓ ${reflectionId.substring(0, 8)}... → pending_review`);

        // Rate limiting - avoid overwhelming Supabase
        await sleep(100);

      } catch (error) {
        cohortResult.reflections_failed.push(reflectionId);
        updateResults.reflections_failed++;

        updateResults.failures.push({
          reflection_id: reflectionId,
          cohort_id: mapping.cohort_id,
          fix_plan_id: mapping.fix_plan_id,
          error: error.message,
          rollback_attempted: true,
          timestamp: new Date().toISOString()
        });

        console.error(`   ✗ ${reflectionId.substring(0, 8)}...: ${error.message}`);
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
    service_used: 'Supabase (service role key)',
    verification_enabled: true,
    rollback_on_failure: true,
    status_set: 'pending_review',
    note: 'Asana tasks require manual creation - status will be updated to under_review after task creation'
  };

  // Write results JSON
  const jsonFile = writeJSON('reflection-status-updates-2025-10-26.json', updateResults);
  console.log(`   ✓ JSON results: ${path.basename(jsonFile)}`);

  // Generate markdown summary
  const markdownContent = generateMarkdownSummary(updateResults);
  const markdownFile = path.join(REPORTS_DIR, 'REFLECTION_STATUS_UPDATE_SUMMARY.md');
  fs.writeFileSync(markdownFile, markdownContent, 'utf8');
  console.log(`   ✓ Markdown summary: ${path.basename(markdownFile)}`);

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('✅ REFLECTION STATUS UPDATE COMPLETE\n');
  console.log(`   Total cohorts processed: ${updateResults.total_cohorts_processed}`);
  console.log(`   Reflections updated: ${updateResults.reflections_updated}/${updateResults.reflections_to_update}`);
  console.log(`   Success rate: ${((updateResults.reflections_updated / updateResults.reflections_to_update) * 100).toFixed(1)}%`);

  if (updateResults.reflections_failed > 0) {
    console.log(`\n   ⚠️  Failures: ${updateResults.reflections_failed} reflections`);
    console.log(`   See ${path.basename(jsonFile)} for details`);
  }

  console.log('\n📝 Next Steps:');
  console.log('   1. Manually create Asana tasks using asana-tasks-created-2025-10-26.json');
  console.log('   2. Record actual task IDs/URLs after creation');
  console.log('   3. Run second update to set actual task IDs and change status to under_review');

  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(updateResults.reflections_failed > 0 ? 1 : 0);
}

// ============================================================================
// Markdown Summary Generator
// ============================================================================

function generateMarkdownSummary(results) {
  const timestamp = new Date().toISOString();
  const successRate = ((results.reflections_updated / results.reflections_to_update) * 100).toFixed(1);

  let md = `# Reflection Status Update Summary

**Timestamp:** ${timestamp}

## Summary

- **Total cohorts processed:** ${results.total_cohorts_processed}
- **Reflections updated:** ${results.reflections_updated}/${results.reflections_to_update} (${successRate}%)
- **Reflections failed:** ${results.reflections_failed}
- **Status changed:** 'new' → 'pending_review'
- **Asana tasks:** Pending manual creation
- **Source files:**
  - Cohorts: \`cohorts-detected-2025-10-26.json\`
  - Asana tasks: \`asana-tasks-created-2025-10-26.json\`

## Cohort-by-Cohort Results

| # | Fix Plan | Title | Priority | Taxonomy | Reflections | Success | Failed | Status |
|---|----------|-------|----------|----------|-------------|---------|--------|--------|
`;

  for (const update of results.updates) {
    const totalReflections = update.reflections_updated.length + update.reflections_failed.length;
    const statusIcon = update.status === 'success' ? '✅' : '⚠️';
    const titleShort = update.title.substring(0, 60) + (update.title.length > 60 ? '...' : '');

    md += `| ${update.cohort_number} | ${update.fix_plan_id} | ${titleShort} | ${update.priority} | ${update.taxonomy} | ${totalReflections} | ${update.reflections_updated.length} | ${update.reflections_failed.length} | ${statusIcon} |\n`;
  }

  md += `\n## Updated Reflections by Cohort\n\n`;

  for (const update of results.updates) {
    if (update.reflections_updated.length === 0) continue;

    md += `### Cohort ${update.cohort_number}: ${update.fix_plan_id}\n\n`;
    md += `**Title:** ${update.title}\n\n`;
    md += `**Status:** ${update.status === 'success' ? '✅ All updated successfully' : '⚠️ Partial success'}\n`;
    md += `**Task ID:** ${update.task_id}\n`;
    md += `**Task URL:** ${update.task_url}\n\n`;
    md += `**Updated reflections (${update.reflections_updated.length}):**\n\n`;

    for (const reflectionId of update.reflections_updated) {
      md += `- ✅ \`${reflectionId}\`\n`;
    }

    if (update.reflections_failed.length > 0) {
      md += `\n**Failed (${update.reflections_failed.length}):**\n\n`;
      for (const reflectionId of update.reflections_failed) {
        const failure = results.failures.find(f => f.reflection_id === reflectionId);
        md += `- ❌ \`${reflectionId}\` - ${failure?.error || 'Unknown error'}\n`;
      }
    }

    md += `\n`;
  }

  if (results.failures.length > 0) {
    md += `## Failures\n\n`;
    md += `**Total failures:** ${results.failures.length}\n\n`;

    for (const failure of results.failures) {
      md += `### Reflection: \`${failure.reflection_id}\`\n\n`;
      md += `- **Cohort:** ${failure.cohort_id}\n`;
      md += `- **Fix Plan:** ${failure.fix_plan_id}\n`;
      md += `- **Error:** ${failure.error}\n`;
      md += `- **Rollback:** ${failure.rollback_attempted ? 'Attempted' : 'Not attempted'}\n`;
      md += `- **Timestamp:** ${failure.timestamp}\n\n`;
    }
  }

  md += `## Next Steps

1. **Create Asana tasks manually** using instructions in \`asana-tasks-created-2025-10-26.json\`
   - Open Asana project: https://app.asana.com/0/1211617834659194
   - For each task, copy title and full description
   - Set due date, priority (High), and tags
   - Record actual task GID and URL

2. **After task creation**, run second update with real task IDs:
   \`\`\`bash
   # Create script to update with real task IDs
   node scripts/update-reflection-task-ids.js
   \`\`\`

3. **Verify all reflections** are properly linked:
   \`\`\`sql
   SELECT cohort_id, COUNT(*) as reflection_count,
          reflection_status, asana_task_id
   FROM reflections
   WHERE reflection_status = 'pending_review'
     AND reviewed_at > NOW() - INTERVAL '1 hour'
   GROUP BY cohort_id, reflection_status, asana_task_id
   ORDER BY cohort_id;
   \`\`\`

## Verification Queries

### Count reflections by status
\`\`\`sql
SELECT reflection_status, COUNT(*) as count
FROM reflections
GROUP BY reflection_status;
\`\`\`

### Reflections updated in this batch
\`\`\`sql
SELECT cohort_id, fix_plan_id,
       COUNT(*) as reflection_count,
       asana_task_id, asana_task_url
FROM reflections
WHERE reflection_status = 'pending_review'
  AND reviewed_at > NOW() - INTERVAL '1 hour'
GROUP BY cohort_id, fix_plan_id, asana_task_id, asana_task_url
ORDER BY cohort_id;
\`\`\`

### Check specific cohort
\`\`\`sql
SELECT id, org, reflection_status, cohort_id, fix_plan_id,
       asana_task_id, asana_task_url, reviewed_at, reviewed_by
FROM reflections
WHERE cohort_id = '{cohort_id}'
ORDER BY created_at;
\`\`\`

## Troubleshooting

### If updates didn't persist (HTTP 200 but no change):

**Cause:** Anon key was used instead of service role key

**Solution:**
1. Verify \`SUPABASE_SERVICE_ROLE_KEY\` is set
2. Re-run script: \`node scripts/update-reflection-statuses.js\`

### If verification fails:

**Cause:** RLS policy blocking updates or propagation delay

**Solution:**
1. Check RLS policies on reflections table
2. Ensure service role key is configured to bypass RLS
3. Verify network connectivity to Supabase

### If rollback fails:

**Cause:** Database permissions or constraint violations

**Solution:**
1. Manually revert via SQL:
   \`\`\`sql
   UPDATE reflections
   SET reflection_status = 'new',
       asana_task_id = NULL,
       asana_task_url = NULL,
       reviewed_at = NULL,
       reviewed_by = NULL,
       cohort_id = NULL,
       fix_plan_id = NULL
   WHERE id = '{reflection_id}';
   \`\`\`

---

**Generated by:** \`scripts/update-reflection-statuses.js\`
**Timestamp:** ${timestamp}
**Source cohorts:** cohorts-detected-2025-10-26.json
**Source tasks:** asana-tasks-created-2025-10-26.json
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
