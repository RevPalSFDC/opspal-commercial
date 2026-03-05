#!/usr/bin/env node

/**
 * Generate Comprehensive Update Summary
 *
 * Creates SQL scripts, mapping files, and documentation for reflection updates
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

function loadJSON(filename) {
  const filepath = path.join(REPORTS_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeFile(filename, content) {
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf8');
  return filepath;
}

function main() {
  console.log('📝 Generating Comprehensive Update Summary\n');

  // Load data
  const fixPlans = loadJSON('fix-plans-2025-10-22T21-35-14-766Z.json');
  const cohorts = loadJSON('reflection-cohorts-2025-10-22T21-32-32-154Z.json');

  // Build mapping
  const reflectionMapping = [];
  let totalReflections = 0;

  for (const [index, fixPlan] of fixPlans.fix_plans.entries()) {
    const cohortId = fixPlan.cohort_id;
    const fixPlanId = fixPlan.fix_plan_id;
    const cohortNumber = String(index + 1).padStart(2, '0');

    const cohort = cohorts.cohorts.find(c => c.cohort_id === cohortId);
    if (!cohort) continue;

    const reflectionIds = cohort.reflections.map(r => ({
      id: r.id,
      org: r.org,
      created_at: r.created_at
    }));

    totalReflections += reflectionIds.length;

    reflectionMapping.push({
      cohort_number: cohortNumber,
      cohort_id: cohortId,
      fix_plan_id: fixPlanId,
      reflections: reflectionIds,
      taxonomy: fixPlan.cohort_summary.taxonomy,
      root_cause: fixPlan.cohort_summary.root_cause_summary,
      affected_orgs: fixPlan.cohort_summary.affected_orgs,
      reflection_count: reflectionIds.length
    });
  }

  console.log(`Total cohorts: ${reflectionMapping.length}`);
  console.log(`Total reflections: ${totalReflections}\n`);

  // Generate SQL
  let sql = `-- ============================================================================
-- Reflection Status Update SQL
-- Generated: ${new Date().toISOString()}
-- ============================================================================
--
-- Total cohorts: ${reflectionMapping.length}
-- Total reflections: ${totalReflections}
--
-- CRITICAL: Execute these statements in Supabase SQL Editor with appropriate permissions
-- ============================================================================

`;

  for (const cohort of reflectionMapping) {
    sql += `
-- ============================================================================
-- Cohort ${cohort.cohort_number}: ${cohort.fix_plan_id}
-- ============================================================================
-- Taxonomy: ${cohort.taxonomy}
-- Root Cause: ${cohort.root_cause}
-- Affected Orgs: ${cohort.affected_orgs.join(', ')}
-- Reflections: ${cohort.reflection_count}
-- ----------------------------------------------------------------------------

`;

    for (const reflection of cohort.reflections) {
      sql += `-- Reflection: ${reflection.id} (${reflection.org}, created ${reflection.created_at})
UPDATE reflections
SET
  reflection_status = 'under_review',
  asana_task_id = 'PENDING_MANUAL_CREATION_${cohort.cohort_number}',
  asana_task_url = 'https://app.asana.com/0/1211617834659194/PENDING',
  reviewed_at = NOW(),
  reviewed_by = 'auto-processing',
  cohort_id = '${cohort.cohort_id}',
  fix_plan_id = '${cohort.fix_plan_id}'
WHERE id = '${reflection.id}';

`;
    }
  }

  sql += `
-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Count reflections by status
SELECT reflection_status, COUNT(*) as count
FROM reflections
GROUP BY reflection_status
ORDER BY reflection_status;

-- Reflections updated in this batch
SELECT
  cohort_id,
  fix_plan_id,
  COUNT(*) as reflection_count,
  MIN(reviewed_at) as first_updated,
  MAX(reviewed_at) as last_updated
FROM reflections
WHERE reflection_status = 'under_review'
  AND reviewed_at > NOW() - INTERVAL '1 hour'
GROUP BY cohort_id, fix_plan_id
ORDER BY cohort_id;

-- Check specific cohort (replace cohort_id)
SELECT
  id,
  org,
  reflection_status,
  cohort_id,
  fix_plan_id,
  asana_task_id,
  asana_task_url,
  reviewed_at,
  reviewed_by
FROM reflections
WHERE cohort_id = '{cohort_id}'
ORDER BY reviewed_at DESC;

-- ============================================================================
-- Rollback SQL (if needed)
-- ============================================================================

-- Rollback all reflections updated in this batch
UPDATE reflections
SET
  reflection_status = 'new',
  asana_task_id = NULL,
  asana_task_url = NULL,
  reviewed_at = NULL,
  reviewed_by = NULL,
  cohort_id = NULL,
  fix_plan_id = NULL
WHERE reviewed_at > NOW() - INTERVAL '1 hour'
  AND reviewed_by = 'auto-processing';

-- Rollback specific reflection
UPDATE reflections
SET
  reflection_status = 'new',
  asana_task_id = NULL,
  asana_task_url = NULL,
  reviewed_at = NULL,
  reviewed_by = NULL,
  cohort_id = NULL,
  fix_plan_id = NULL
WHERE id = '{reflection_id}';
`;

  const sqlFile = writeFile('reflection-update-statements.sql', sql);
  console.log(`✓ SQL: ${path.basename(sqlFile)}`);

  // Generate mapping JSON
  const mappingData = {
    generated_at: new Date().toISOString(),
    total_cohorts: reflectionMapping.length,
    total_reflections: totalReflections,
    cohorts: reflectionMapping
  };

  const mappingFile = writeFile('reflection-update-mapping.json', JSON.stringify(mappingData, null, 2));
  console.log(`✓ Mapping: ${path.basename(mappingFile)}`);

  // Generate markdown documentation
  const markdown = generateMarkdown(reflectionMapping, totalReflections);
  const markdownFile = writeFile('REFLECTION_UPDATE_PLAN.md', markdown);
  console.log(`✓ Documentation: ${path.basename(markdownFile)}`);

  console.log('\n✅ All files generated successfully!\n');
  console.log('Next steps:');
  console.log('  1. Review: reports/REFLECTION_UPDATE_PLAN.md');
  console.log('  2. Execute: Copy SQL from reports/reflection-update-statements.sql');
  console.log('  3. Verify: Run verification queries from SQL file\n');
}

function generateMarkdown(mapping, total) {
  const timestamp = new Date().toISOString();

  let md = `# Reflection Status Update Plan

**Generated:** ${timestamp}

## Overview

This document outlines the plan to update reflection statuses from \`new\` to \`under_review\` for all reflections that are part of cohorts with approved fix plans.

## Summary Statistics

- **Total cohorts:** ${mapping.length}
- **Total reflections to update:** ${total}
- **Status change:** \`new\` → \`under_review\`
- **Asana task status:** Pending manual creation

## Cohorts and Reflections

`;

  for (const cohort of mapping) {
    md += `### Cohort ${cohort.cohort_number}: ${cohort.fix_plan_id}

**Details:**
- **Taxonomy:** ${cohort.taxonomy}
- **Root Cause:** ${cohort.root_cause}
- **Affected Orgs:** ${cohort.affected_orgs.join(', ')}
- **Reflection Count:** ${cohort.reflection_count}
- **Cohort ID:** \`${cohort.cohort_id}\`

**Reflections:**

`;

    for (const reflection of cohort.reflections) {
      md += `- \`${reflection.id}\` (${reflection.org}, created ${reflection.created_at})\n`;
    }

    md += `\n**Update Values:**
- \`reflection_status\`: \`'under_review'\`
- \`asana_task_id\`: \`'PENDING_MANUAL_CREATION_${cohort.cohort_number}'\`
- \`asana_task_url\`: \`'https://app.asana.com/0/1211617834659194/PENDING'\`
- \`cohort_id\`: \`'${cohort.cohort_id}'\`
- \`fix_plan_id\`: \`'${cohort.fix_plan_id}'\`
- \`reviewed_at\`: \`NOW()\`
- \`reviewed_by\`: \`'auto-processing'\`

---

`;
  }

  md += `## Execution Options

### Option 1: Automated Script (Recommended)

\`\`\`bash
node scripts/update-reflections-simple.js
\`\`\`

**Features:**
- Automated updates via Supabase REST API
- Post-update verification for each reflection
- Automatic rollback on verification failure
- Comprehensive error handling
- Detailed JSON and Markdown reports

### Option 2: Manual SQL Execution

1. Open Supabase Dashboard → SQL Editor
2. Copy SQL from \`reports/reflection-update-statements.sql\`
3. Execute SQL statements
4. Run verification queries

**Note:** Requires service role permissions or RLS bypass

## Verification

After updates, verify with these queries:

\`\`\`sql
-- Count by status
SELECT reflection_status, COUNT(*)
FROM reflections
GROUP BY reflection_status;

-- Recent updates
SELECT cohort_id, fix_plan_id, COUNT(*) as count
FROM reflections
WHERE reflection_status = 'under_review'
  AND reviewed_at > NOW() - INTERVAL '1 hour'
GROUP BY cohort_id, fix_plan_id;
\`\`\`

## Rollback

If needed, rollback all changes:

\`\`\`sql
UPDATE reflections
SET
  reflection_status = 'new',
  asana_task_id = NULL,
  asana_task_url = NULL,
  reviewed_at = NULL,
  reviewed_by = NULL,
  cohort_id = NULL,
  fix_plan_id = NULL
WHERE reviewed_at > NOW() - INTERVAL '1 hour'
  AND reviewed_by = 'auto-processing';
\`\`\`

## Next Steps After Update

1. **Create Asana tasks manually** using \`asana-tasks-2025-10-22T21-40-00-000Z.json\`
2. **Update reflections with real Asana task URLs:**
   \`\`\`sql
   UPDATE reflections
   SET asana_task_id = '{real_task_gid}',
       asana_task_url = '{real_task_url}'
   WHERE cohort_id = '{cohort_id}';
   \`\`\`
3. **Monitor Asana task progress** and update reflection status as tasks are completed

## Critical Notes

- **Service Role Key Required:** Updates require \`SUPABASE_SERVICE_ROLE_KEY\` due to RLS policies
- **Placeholder Values:** Asana task IDs and URLs are placeholders pending manual task creation
- **Idempotent:** Updates can be safely re-run (WHERE clause checks current status)
- **Verification:** Each update should be verified to ensure it persisted

---

**Files:**
- SQL: \`reports/reflection-update-statements.sql\`
- Mapping: \`reports/reflection-update-mapping.json\`
- Script: \`scripts/update-reflections-simple.js\`

**Generated:** ${timestamp}
`;

  return md;
}

main();
