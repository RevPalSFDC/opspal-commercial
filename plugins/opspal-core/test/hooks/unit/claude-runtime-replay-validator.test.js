#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const { analyzeClaudeDebugLogFile } = require(path.join(
  __dirname,
  '../../../../../scripts/lib/claude-debug-log-analyzer.js'
));
const { validateAnalysis } = require(path.join(
  __dirname,
  '../../../../../scripts/validate-claude-runtime-replay.js'
));

const DEPLOY_INCIDENT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'claude-debug-salesforce-deploy-incident.log'
);
const READ_FAILURE_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'claude-debug-read-path-failures.txt'
);

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] Claude runtime replay validator\n');

  const results = [];

  results.push(await runTest('Flags plain-text hook output, attachment bloat, and Agent fanout', async () => {
    const analysis = analyzeClaudeDebugLogFile(DEPLOY_INCIDENT_FIXTURE);
    const { failures } = validateAnalysis(analysis);

    assert(failures.some((failure) => failure.includes('Plain-text hook outputs exceeded budget')), 'Should flag plain-text hook outputs');
    assert(failures.some((failure) => failure.includes('Attached skills exceeded budget')), 'Should flag oversized skill attachments');
  }));

  results.push(await runTest('Flags Read failures from the read-path fixture', async () => {
    const analysis = analyzeClaudeDebugLogFile(READ_FAILURE_FIXTURE);
    const { failures } = validateAnalysis(analysis);

    assert(failures.some((failure) => failure.includes('Attached skills exceeded budget')), 'Should flag oversized skill attachments');
    assert(failures.some((failure) => failure.includes('PreToolUse:Agent hook fanout exceeded budget')), 'Should flag excessive Agent hook fanout');
    assert(failures.some((failure) => failure.includes('Missing-file Read failures detected')), 'Should flag missing-file Read attempts');
    assert(failures.some((failure) => failure.includes('Directory Read failures detected')), 'Should flag directory Read attempts');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
