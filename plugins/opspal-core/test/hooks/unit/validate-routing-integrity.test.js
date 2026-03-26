#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const childProcess = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const VALIDATOR = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/validate-routing-integrity.js');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false };
  }
}

async function runAllTests() {
  console.log('\n[Tests] validate-routing-integrity.js\n');
  const results = [];

  results.push(await runTest('Validator passes against the current workspace', async () => {
    const exported = require(path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/validate-routing-integrity.js'));
    const report = exported.validateRoutingIntegrity();

    assert.strictEqual(report.pass, true, `Expected routing integrity to pass, found ${report.failureCount} failure(s)`);

    childProcess.execFileSync('node', [VALIDATOR], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
  }));

  results.push(await runTest('Validator exposes a prompt expectation matrix in code', async () => {
    const exported = require(path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/validate-routing-integrity.js'));
    assert(Array.isArray(exported.PROMPT_EXPECTATIONS), 'PROMPT_EXPECTATIONS should be exported');
    assert(exported.PROMPT_EXPECTATIONS.length >= 9, 'Prompt expectation matrix should cover adjacent routed workflows');
    assert(
      exported.PROMPT_EXPECTATIONS.some((probe) => probe.expectedAgent === 'opspal-salesforce:sfdc-upsert-orchestrator'),
      'Prompt matrix should cover CSV-backed upsert routing'
    );
    assert(
      exported.PROMPT_EXPECTATIONS.some((probe) => probe.expectedAgent === 'opspal-salesforce:sfdc-merge-orchestrator'),
      'Prompt matrix should cover merge/delete cleanup routing'
    );
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
