#!/usr/bin/env node

/**
 * test-supervisor.js - Test the Supervisor-Auditor system
 */

const SupervisorAuditor = require('./lib/supervisor-auditor');

const supervisor = new SupervisorAuditor();

// Test 1: Multiple independent targets (should be parallel)
console.log('='.repeat(60));
console.log('TEST 1: Generate READMEs for all 8 plugins');
console.log('='.repeat(60));

const task1 = 'Generate READMEs for salesforce-plugin, hubspot-plugin, gtm-planning-plugin, cross-platform-plugin, developer-tools-plugin, hubspot-core-plugin, hubspot-marketing-sales-plugin, and hubspot-analytics-governance-plugin';

const plan1 = supervisor.plan({
  task: task1,
  complexity: 0.6
});

console.log('\nAUDIT:');
console.log(`  Problem Decomposition: ${plan1.AUDIT.problem_decomposition.length} units`);
plan1.AUDIT.problem_decomposition.forEach((desc, i) => {
  console.log(`    ${i + 1}. ${desc.substring(0, 60)}...`);
});

console.log(`\n  Independence Check:`);
plan1.AUDIT.independence_check.forEach(check => {
  console.log(`    ${check.unit}: ${check.can_run_in_parallel ? '✓ PARALLEL' : '✗ SEQUENTIAL'}`);
});

console.log(`\n  Subagent Matching:`);
plan1.AUDIT.subagent_match.slice(0, 3).forEach(match => {
  console.log(`    ${match.unit} → ${match.chosen}`);
  console.log(`      Why: ${match.why}`);
});

console.log(`\n  Risk Checks:`);
plan1.AUDIT.risk_checks.forEach(risk => {
  console.log(`    - ${risk}`);
});

console.log('\nPLAN:');
console.log(`  Parallel Groups: ${plan1.PLAN.parallel_groups.length}`);
plan1.PLAN.parallel_groups.forEach(group => {
  console.log(`    ${group.group_id}: ${group.units.length} units (parallel: ${group.runs_in_parallel})`);
});

console.log(`  Sequential Barriers: ${plan1.PLAN.sequential_barriers.length}`);

console.log('\nEXECUTION POLICY:');
console.log(`  Parallelism Target: ${plan1.EXECUTION_POLICY.parallelism_target}`);
console.log(`  Retry Policy: ${plan1.EXECUTION_POLICY.retry_policy.retries} retries`);

// Test 2: Sequential actions (analyze THEN deploy)
console.log('\n\n' + '='.repeat(60));
console.log('TEST 2: Analyze quality AND generate reports');
console.log('='.repeat(60));

const task2 = 'Analyze quality across all plugins and then generate quality reports';

const plan2 = supervisor.plan({
  task: task2,
  complexity: 0.7
});

console.log('\nAUDIT:');
console.log(`  Problem Decomposition: ${plan2.AUDIT.problem_decomposition.length} units`);
plan2.AUDIT.problem_decomposition.forEach((desc, i) => {
  console.log(`    ${i + 1}. ${desc}`);
});

console.log(`\n  Independence Check:`);
plan2.AUDIT.independence_check.forEach(check => {
  console.log(`    ${check.unit}: ${check.can_run_in_parallel ? '✓ PARALLEL' : '✗ SEQUENTIAL'} - ${check.why}`);
});

console.log('\nPLAN:');
console.log(`  Parallel Groups: ${plan2.PLAN.parallel_groups.length}`);
plan2.PLAN.parallel_groups.forEach(group => {
  console.log(`    ${group.group_id}: ${group.units.length} units`);
  group.units.forEach(unit => {
    console.log(`      - ${unit.unit_id}: ${unit.agent_or_tool}`);
  });
});

console.log(`\n  Sequential Barriers: ${plan2.PLAN.sequential_barriers.length}`);
plan2.PLAN.sequential_barriers.forEach(barrier => {
  console.log(`    After ${barrier.after_groups.join(', ')}: ${barrier.reason}`);
});

// Test 3: Single complex task
console.log('\n\n' + '='.repeat(60));
console.log('TEST 3: Deploy metadata to production');
console.log('='.repeat(60));

const task3 = 'Deploy metadata to production';

const plan3 = supervisor.plan({
  task: task3,
  complexity: 0.8
});

console.log('\nAUDIT:');
console.log(`  Problem Decomposition: ${plan3.AUDIT.problem_decomposition.length} units`);
console.log(`  Risk Checks:`);
plan3.AUDIT.risk_checks.forEach(risk => {
  console.log(`    - ${risk}`);
});

console.log('\nPLAN:');
console.log(`  Parallel Groups: ${plan3.PLAN.parallel_groups.length}`);
console.log(`  Agent Selected: ${plan3.PLAN.parallel_groups[0]?.units[0]?.agent_or_tool}`);

console.log('\n\n' + '='.repeat(60));
console.log('TESTS COMPLETE');
console.log('='.repeat(60));
