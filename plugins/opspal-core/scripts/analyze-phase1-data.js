#!/usr/bin/env node

/**
 * Phase 1 Data Analyzer
 * Analyzes the phase1-data JSON file to understand cohort structure
 */

const fs = require('fs');
const path = require('path');

const phase1Path = path.join(__dirname, '../output/reflection-processing/phase1-data-2026-01-27.json');

console.log('Loading Phase 1 data...');
const data = JSON.parse(fs.readFileSync(phase1Path, 'utf8'));

console.log('\n=== Phase 1 Data Summary ===\n');
console.log(`Timestamp: ${data.timestamp}`);
console.log(`Total Reflections: ${data.reflections?.length || 0}`);
console.log(`Total Cohorts: ${data.cohorts?.length || 0}`);

if (data.cohorts) {
  console.log('\n=== Cohort Breakdown ===\n');

  data.cohorts.forEach((cohort, idx) => {
    console.log(`\nCohort ${idx + 1}:`);
    console.log(`  ID: ${cohort.cohort_id}`);
    console.log(`  Taxonomy: ${cohort.taxonomy}`);
    console.log(`  Priority: ${cohort.priority}`);
    console.log(`  Reflection Count: ${cohort.reflection_ids.length}`);
    console.log(`  Total ROI: $${cohort.total_roi_annual_value?.toLocaleString() || 0}`);
    console.log(`  Root Cause: ${cohort.root_cause.substring(0, 80)}...`);
    console.log(`  Affected Components: ${cohort.affected_components.slice(0, 3).join(', ')}${cohort.affected_components.length > 3 ? '...' : ''}`);
  });
}

console.log('\n=== Taxonomy Distribution ===\n');
const taxonomyGroups = {};
if (data.reflections) {
  data.reflections.forEach(r => {
    taxonomyGroups[r.taxonomy] = (taxonomyGroups[r.taxonomy] || 0) + 1;
  });

  Object.entries(taxonomyGroups)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tax, count]) => {
      console.log(`  ${tax}: ${count} reflections`);
    });
}

console.log('\n=== Ready for Phase 2 ===');
console.log(`✓ Cohorts defined and prioritized`);
console.log(`✓ Root causes analyzed`);
console.log(`→ Next: Generate fix plans for each cohort`);
console.log(`→ Next: Create Asana tasks`);
console.log(`→ Next: Update reflection statuses to 'under_review'`);
