#!/usr/bin/env node

/**
 * Prepare Reflection Update Mapping
 *
 * Analyzes cohorts and fix plans to create SQL update statements
 * for updating reflections to 'under_review' status.
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');

function loadJSON(filename) {
  const filepath = path.join(REPORTS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function main() {
  console.log('📊 Preparing Reflection Update Mapping\n');

  // Load data files
  const fixPlans = loadJSON('fix-plans-2025-10-22T21-35-14-766Z.json');
  const cohorts = loadJSON('reflection-cohorts-2025-10-22T21-32-32-154Z.json');

  console.log(`Loaded ${fixPlans.fix_plans.length} fix plans`);
  console.log(`Loaded ${cohorts.cohorts.length} cohorts\n`);

  // Build mapping
  const mapping = [];
  let totalReflections = 0;

  for (const [index, fixPlan] of fixPlans.fix_plans.entries()) {
    const cohortId = fixPlan.cohort_id;
    const fixPlanId = fixPlan.fix_plan_id;
    const cohortNumber = String(index + 1).padStart(2, '0');

    // Find corresponding cohort
    const cohort = cohorts.cohorts.find(c => c.cohort_id === cohortId);

    if (!cohort) {
      console.error(`⚠️  Cohort ${cohortId} not found`);
      continue;
    }

    const reflectionIds = cohort.reflections.map(r => r.id);
    totalReflections += reflectionIds.length;

    mapping.push({
      cohort_number: cohortNumber,
      cohort_id: cohortId,
      fix_plan_id: fixPlanId,
      reflection_ids: reflectionIds,
      taxonomy: fixPlan.cohort_summary.taxonomy,
      root_cause: fixPlan.cohort_summary.root_cause_summary,
      affected_orgs: fixPlan.cohort_summary.affected_orgs,
      reflection_count: reflectionIds.length
    });

    console.log(`Cohort ${cohortNumber} (${fixPlanId}): ${reflectionIds.length} reflections`);
  }

  console.log(`\n📊 Total: ${mapping.length} cohorts, ${totalReflections} reflections\n`);

  // Output mapping
  const outputFile = path.join(REPORTS_DIR, 'reflection-update-mapping.json');
  fs.writeFileSync(outputFile, JSON.stringify({ mapping, totalReflections }, null, 2));

  console.log(`✅ Mapping written to: ${path.basename(outputFile)}`);

  // Generate SQL statements
  let sqlStatements = `-- Reflection Status Update SQL
-- Generated: ${new Date().toISOString()}
-- Total cohorts: ${mapping.length}
-- Total reflections: ${totalReflections}

`;

  for (const cohort of mapping) {
    sqlStatements += `
-- Cohort ${cohort.cohort_number}: ${cohort.fix_plan_id}
-- Taxonomy: ${cohort.taxonomy}
-- Reflections: ${cohort.reflection_count}
-- Root cause: ${cohort.root_cause.substring(0, 80)}...

`;

    for (const reflectionId of cohort.reflection_ids) {
      sqlStatements += `UPDATE reflections
SET
  reflection_status = 'under_review',
  asana_task_id = 'PENDING_MANUAL_CREATION_${cohort.cohort_number}',
  asana_task_url = 'https://app.asana.com/0/1211617834659194/PENDING',
  reviewed_at = NOW(),
  reviewed_by = 'auto-processing',
  cohort_id = '${cohort.cohort_id}',
  fix_plan_id = '${cohort.fix_plan_id}'
WHERE id = '${reflectionId}';

`;
    }
  }

  sqlStatements += `
-- Verification query
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
`;

  const sqlFile = path.join(REPORTS_DIR, 'reflection-update-statements.sql');
  fs.writeFileSync(sqlFile, sqlStatements);

  console.log(`✅ SQL statements written to: ${path.basename(sqlFile)}`);
  console.log(`\n💡 Next: Review SQL statements before executing`);
}

main();
