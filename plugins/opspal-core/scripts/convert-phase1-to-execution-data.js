#!/usr/bin/env node

/**
 * Convert Phase 1 data to Phase 2 execution data format
 *
 * Transforms the phase1-data-2026-01-27.json output into the execution-data format
 * expected by process-reflections.js --execute mode
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../output/reflection-processing/phase1-data-2026-01-27.json');
const OUTPUT_DIR = path.join(__dirname, '../../reports');

console.log('\n=== Converting Phase 1 Data to Execution Format ===\n');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load Phase 1 data
console.log('Loading Phase 1 data...');
const rawData = fs.readFileSync(INPUT_PATH, 'utf8');
const phase1Data = JSON.parse(rawData);

console.log(`  ✓ Loaded data from ${phase1Data.timestamp}`);
console.log(`  → ${phase1Data.reflections?.length || 0} reflections`);
console.log(`  → ${phase1Data.cohorts?.length || 0} cohorts\n`);

// Transform cohorts to execution data format
const executionData = {
  generatedAt: new Date().toISOString(),
  planPath: null, // Will be set by Phase 2 if plan was generated
  cohorts: [],
  fixPlans: [],
  config: {
    hourlyRate: 50,
    minCohortSize: 3
  }
};

// Process each cohort
if (phase1Data.cohorts) {
  phase1Data.cohorts.forEach((cohort, idx) => {
    console.log(`Processing cohort ${idx + 1}: ${cohort.taxonomy}`);

    // Extract reflection IDs from cohort.reflections (array of UUIDs)
    const reflectionIds = cohort.reflections || [];
    const reflectionCount = reflectionIds.length;

    // Get total ROI (field is 'total_roi', not 'total_roi_annual_value')
    const totalRoi = cohort.total_roi || 0;

    // Get root cause summary from root_causes array
    const rootCauseSummary = cohort.root_causes?.slice(0, 3).join('; ') || 'Pending detailed analysis';

    // Add to cohorts array
    executionData.cohorts.push({
      id: cohort.id,  // Field is 'id', not 'cohort_id'
      taxonomy: cohort.taxonomy,
      reflectionCount: reflectionCount,
      reflectionIds: reflectionIds,
      aggregateROI: totalRoi,
      priority: cohort.priority || 'P2'
    });

    // Create stub fix plan (will be generated in Phase 2)
    // The process-reflections.js script will call supabase-fix-planner
    executionData.fixPlans.push({
      cohortTaxonomy: cohort.taxonomy,
      cohortId: cohort.id,
      fixPlan: {
        cohort_summary: {
          taxonomy: cohort.taxonomy,
          reflection_count: reflectionCount,
          root_cause_summary: rootCauseSummary,
          affected_orgs: cohort.affected_orgs || [],
          priority: cohort.priority || 'P2'
        },
        root_cause_analysis: {
          five_why: {
            why_1: cohort.root_causes?.[0] || 'Pending analysis',
            why_2: cohort.root_causes?.[1] || 'Pending analysis'
          }
        },
        roi_analysis: {
          expected_roi_annual: totalRoi
        }
      },
      reflectionIds: reflectionIds,
      error: null
    });

    console.log(`  ✓ ${reflectionCount} reflections, ROI: $${totalRoi.toLocaleString()}`);
  });
}

console.log();

// Save execution data
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const outputPath = path.join(OUTPUT_DIR, `reflection-plan-${timestamp}-execution-data.json`);

fs.writeFileSync(outputPath, JSON.stringify(executionData, null, 2));

console.log('═'.repeat(60));
console.log('✅ CONVERSION COMPLETE\n');
console.log(`Output file: ${outputPath}`);
console.log(`Cohorts: ${executionData.cohorts.length}`);
console.log(`Total reflections: ${executionData.cohorts.reduce((sum, c) => sum + c.reflectionCount, 0)}`);
console.log(`Total annual ROI: $${executionData.cohorts.reduce((sum, c) => sum + c.aggregateROI, 0).toLocaleString()}\n`);
console.log('To execute Phase 2:');
console.log(`  node .claude/scripts/process-reflections.js --execute=${outputPath}\n`);
console.log('═'.repeat(60) + '\n');
