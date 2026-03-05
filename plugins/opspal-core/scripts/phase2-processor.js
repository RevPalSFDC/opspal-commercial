#!/usr/bin/env node

/**
 * Phase 2 Reflection Processing
 * Generates fix plans, creates Asana tasks, updates Supabase reflection statuses
 *
 * Usage: node phase2-processor.js [--dry-run] [--cohort-id <id>]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  phase1DataPath: path.join(__dirname, '../output/reflection-processing/phase1-data-2026-01-27.json'),
  outputDir: path.join(__dirname, '../output/reflection-processing/phase2'),
  dryRun: process.argv.includes('--dry-run'),
  specificCohort: process.argv.find(arg => arg.startsWith('--cohort-id='))?.split('=')[1]
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

console.log('\n=== Phase 2 Reflection Processing ===\n');
console.log(`Mode: ${CONFIG.dryRun ? 'DRY RUN' : 'LIVE EXECUTION'}`);
console.log(`Input: ${CONFIG.phase1DataPath}`);
console.log(`Output: ${CONFIG.outputDir}`);

// Load Phase 1 data
console.log('\n[1/5] Loading Phase 1 data...');
const phase1Data = JSON.parse(fs.readFileSync(CONFIG.phase1DataPath, 'utf8'));

console.log(`  ✓ Loaded ${phase1Data.reflections?.length || 0} reflections`);
console.log(`  ✓ Loaded ${phase1Data.cohorts?.length || 0} cohorts`);

// Filter cohorts if specific ID provided
let cohortsToProcess = phase1Data.cohorts || [];
if (CONFIG.specificCohort) {
  cohortsToProcess = cohortsToProcess.filter(c => c.cohort_id === CONFIG.specificCohort);
  console.log(`  → Processing single cohort: ${CONFIG.specificCohort}`);
}

// Validate data structure
console.log('\n[2/5] Validating data structure...');
const validation = {
  hasReflections: Array.isArray(phase1Data.reflections) && phase1Data.reflections.length > 0,
  hasCohorts: Array.isArray(cohortsToProcess) && cohortsToProcess.length > 0,
  cohortsHaveIds: cohortsToProcess.every(c => c.cohort_id),
  cohortsHaveReflections: cohortsToProcess.every(c => Array.isArray(c.reflection_ids) && c.reflection_ids.length > 0),
  cohortsHaveTaxonomy: cohortsToProcess.every(c => c.taxonomy),
  cohortsHaveRootCause: cohortsToProcess.every(c => c.root_cause)
};

const validationPassed = Object.values(validation).every(v => v);
console.log(`  ${validationPassed ? '✓' : '✗'} Validation ${validationPassed ? 'passed' : 'FAILED'}`);

if (!validationPassed) {
  console.log('\n  Validation details:');
  Object.entries(validation).forEach(([key, value]) => {
    console.log(`    ${value ? '✓' : '✗'} ${key}`);
  });
  process.exit(1);
}

// Summary of what will be processed
console.log('\n[3/5] Processing summary:');
console.log(`  → ${cohortsToProcess.length} cohorts to process`);

const totalReflections = cohortsToProcess.reduce((sum, c) => sum + c.reflection_ids.length, 0);
const totalROI = cohortsToProcess.reduce((sum, c) => sum + (c.total_roi_annual_value || 0), 0);

console.log(`  → ${totalReflections} reflections to update`);
console.log(`  → $${totalROI.toLocaleString()} total annual ROI`);

// Priority breakdown
const priorityBreakdown = {};
cohortsToProcess.forEach(c => {
  priorityBreakdown[c.priority] = (priorityBreakdown[c.priority] || 0) + 1;
});

console.log('\n  Priority breakdown:');
Object.entries(priorityBreakdown).forEach(([priority, count]) => {
  console.log(`    ${priority}: ${count} cohorts`);
});

// Export cohort list for further processing
const cohortList = {
  timestamp: new Date().toISOString(),
  source: CONFIG.phase1DataPath,
  totalCohorts: cohortsToProcess.length,
  totalReflections,
  totalROI,
  priorityBreakdown,
  cohorts: cohortsToProcess.map(c => ({
    cohort_id: c.cohort_id,
    taxonomy: c.taxonomy,
    priority: c.priority,
    reflection_count: c.reflection_ids.length,
    roi_annual_value: c.total_roi_annual_value,
    root_cause_summary: c.root_cause.substring(0, 200),
    affected_components: c.affected_components.slice(0, 5),
    reflection_ids: c.reflection_ids
  }))
};

const cohortListPath = path.join(CONFIG.outputDir, 'cohorts-for-processing.json');
fs.writeFileSync(cohortListPath, JSON.stringify(cohortList, null, 2));
console.log(`\n  ✓ Exported cohort list: ${cohortListPath}`);

// Generate processing plan
console.log('\n[4/5] Next steps (to be executed):');
console.log('\n  Step A: Generate Fix Plans (supabase-fix-planner)');
console.log('    For each cohort:');
console.log('    - 5-Why root cause analysis');
console.log('    - Solution design with file modifications');
console.log('    - Alternative solutions with pros/cons/ROI');
console.log('    - Success criteria');
console.log('    - Implementation effort estimate');

console.log('\n  Step B: Create Asana Tasks (supabase-asana-bridge)');
console.log('    For each cohort:');
console.log('    - Title: [Reflection Cohort] Fix {taxonomy} issues ({count} reflections)');
console.log('    - Description: Root cause, affected components, ROI, fix plan');
console.log('    - Priority: CRITICAL→High, HIGH→Medium, MEDIUM→Low');
console.log('    - Custom fields: reflection_ids, cohort_id, ROI');

console.log('\n  Step C: Update Reflection Statuses (Saga pattern)');
console.log('    For each cohort (transactional):');
console.log('    1. Create Asana task');
console.log('    2. Update reflections:');
console.log('       - reflection_status = "under_review"');
console.log('       - asana_task_id = {task.gid}');
console.log('       - asana_task_url = {task.permalink_url}');
console.log('       - reviewed_at = NOW()');
console.log('       - cohort_id = {cohort_id}');
console.log('    3. Verify persistence (wait 1s, re-query)');
console.log('    4. Rollback Asana task if update fails');

console.log('\n[5/5] Phase 2 preparation complete');
console.log(`\n  ✓ Data validated and ready`);
console.log(`  ✓ Cohort list exported`);
console.log(`  → Ready to invoke specialized agents`);

if (CONFIG.dryRun) {
  console.log('\n  [DRY RUN] No changes made. Remove --dry-run to execute.');
} else {
  console.log('\n  → Invoke agents to proceed with Phase 2 execution');
}

// Export summary
const summary = {
  timestamp: new Date().toISOString(),
  phase: 'Phase 2 Preparation',
  status: 'ready',
  mode: CONFIG.dryRun ? 'dry-run' : 'ready-for-execution',
  validation: validationPassed ? 'passed' : 'failed',
  statistics: {
    totalCohorts: cohortsToProcess.length,
    totalReflections,
    totalROI,
    priorityBreakdown
  },
  nextSteps: [
    'Generate fix plans with supabase-fix-planner',
    'Create Asana tasks with supabase-asana-bridge',
    'Update reflection statuses with Saga pattern',
    'Verify persistence and generate report'
  ],
  outputFiles: {
    cohortList: cohortListPath
  }
};

const summaryPath = path.join(CONFIG.outputDir, 'phase2-preparation-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`\n  ✓ Summary: ${summaryPath}\n`);

process.exit(0);
