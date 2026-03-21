#!/usr/bin/env node

/**
 * Unit Tests for cohort-runbook-guard.js
 */

const assert = require('assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const guard = require(path.join(
  PROJECT_ROOT,
  'plugins/opspal-core/scripts/lib/cohort-runbook-guard.js'
));

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] cohort-runbook-guard.js Tests\n');

  const results = [];

  results.push(await runTest('Detects schema/parse cohort from task payload', async () => {
    const payload = {
      subagent_type: 'opspal-salesforce:sfdc-data-operations',
      prompt: "Fix SOQL error: No such column AccountId on ObjectTerritory2Association"
    };
    const data = guard.assessTask(payload, { workspaceRoot: PROJECT_ROOT });

    assert(Array.isArray(data.matched_cohorts), 'matched_cohorts should be an array');
    assert(data.matched_cohorts.includes('schema/parse'), 'schema/parse should be detected');
    assert(data.required_artifacts.length > 0, 'required artifacts should be returned');
  }));

  results.push(await runTest('Guidance text uses canonical absolute paths and discovery-first guidance', async () => {
    const payload = {
      subagent_type: 'opspal-salesforce:sfdc-data-operations',
      prompt: "Fix SOQL error: No such column AccountId on ObjectTerritory2Association"
    };
    const data = guard.assessTask(payload, { workspaceRoot: PROJECT_ROOT });

    assert(
      data.required_artifacts.every((artifact) => artifact.absolute_path.startsWith(PROJECT_ROOT)),
      'required artifacts should resolve to absolute paths under the workspace root'
    );
    assert(
      data.guidance_text.includes(PROJECT_ROOT),
      'guidance text should surface absolute runtime paths'
    );
    assert(
      data.guidance_text.includes('use LS or Glob before Read'),
      'guidance text should enforce discover-before-read when path certainty is low'
    );
  }));

  results.push(await runTest('Flags missing runbook evidence in output', async () => {
    const output = 'SOQL parser failed with malformed query and invalid field reference.';
    const data = guard.verifyOutput(output, {
      workspaceRoot: PROJECT_ROOT,
      expectedCohorts: ['schema/parse']
    });

    assert.strictEqual(data.verified, false, 'verification should fail without evidence');
    assert(
      data.missing_evidence_cohorts.includes('schema/parse'),
      'schema/parse should be listed as missing evidence'
    );
  }));

  results.push(await runTest('Accepts explicit runbook evidence in output', async () => {
    const output = [
      'Addressed schema issue using runbook guidance.',
      'Referenced docs/runbooks/territory-management/10-troubleshooting-guide.md for the object model fix.'
    ].join(' ');
    const data = guard.verifyOutput(output, {
      workspaceRoot: PROJECT_ROOT,
      expectedCohorts: ['schema/parse']
    });

    assert.strictEqual(data.verified, true, 'verification should pass with runbook evidence');
    assert.strictEqual(data.missing_evidence_cohorts.length, 0, 'no missing evidence cohorts expected');
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
