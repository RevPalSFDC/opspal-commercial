#!/usr/bin/env node

/**
 * Dry Run: Reflection Status Updates
 *
 * Shows what WOULD be updated without making actual changes
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');

function loadJSON(filename) {
  const filepath = path.join(REPORTS_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function main() {
  console.log('🔍 DRY RUN: Reflection Status Update Preview\n');

  const fixPlans = loadJSON('fix-plans-2025-10-22T21-35-14-766Z.json');
  const cohorts = loadJSON('reflection-cohorts-2025-10-22T21-32-32-154Z.json');

  console.log(`Loaded ${fixPlans.fix_plans.length} fix plans`);
  console.log(`Loaded ${cohorts.cohorts.length} cohorts\n`);

  let totalReflections = 0;
  const reflectionMapping = [];

  for (const [index, fixPlan] of fixPlans.fix_plans.entries()) {
    const cohortId = fixPlan.cohort_id;
    const fixPlanId = fixPlan.fix_plan_id;
    const cohortNumber = String(index + 1).padStart(2, '0');

    const cohort = cohorts.cohorts.find(c => c.cohort_id === cohortId);

    if (!cohort) {
      console.error(`⚠️  Cohort ${cohortId} not found`);
      continue;
    }

    const reflectionIds = cohort.reflections.map(r => r.id);
    totalReflections += reflectionIds.length;

    reflectionMapping.push({
      cohort_number: cohortNumber,
      fix_plan_id: fixPlanId,
      cohort_id: cohortId,
      reflection_count: reflectionIds.length,
      taxonomy: fixPlan.cohort_summary.taxonomy,
      root_cause: fixPlan.cohort_summary.root_cause_summary.substring(0, 80) + '...',
      reflections: reflectionIds
    });
  }

  console.log('📊 SUMMARY\n');
  console.log(`Total cohorts: ${reflectionMapping.length}`);
  console.log(`Total reflections to update: ${totalReflections}\n`);

  console.log('📦 COHORTS TO UPDATE\n');

  for (const mapping of reflectionMapping) {
    console.log(`Cohort ${mapping.cohort_number}: ${mapping.fix_plan_id}`);
    console.log(`  Taxonomy: ${mapping.taxonomy}`);
    console.log(`  Root Cause: ${mapping.root_cause}`);
    console.log(`  Reflections: ${mapping.reflection_count}`);
    console.log(`  Cohort ID: ${mapping.cohort_id}`);
    console.log('');

    console.log('  Reflection IDs:');
    for (const id of mapping.reflections) {
      console.log(`    - ${id}`);
    }
    console.log('');

    console.log('  Update SQL (example for first reflection):');
    console.log(`    UPDATE reflections`);
    console.log(`    SET reflection_status = 'under_review',`);
    console.log(`        asana_task_id = 'PENDING_MANUAL_CREATION_${mapping.cohort_number}',`);
    console.log(`        asana_task_url = 'https://app.asana.com/0/1211617834659194/PENDING',`);
    console.log(`        reviewed_at = NOW(),`);
    console.log(`        reviewed_by = 'auto-processing',`);
    console.log(`        cohort_id = '${mapping.cohort_id}',`);
    console.log(`        fix_plan_id = '${mapping.fix_plan_id}'`);
    console.log(`    WHERE id = '${mapping.reflections[0]}';`);
    console.log('');
    console.log('-'.repeat(80));
    console.log('');
  }

  console.log('✅ DRY RUN COMPLETE\n');
  console.log('To execute actual updates, run:');
  console.log('  node scripts/update-reflections-simple.js\n');
}

main();
