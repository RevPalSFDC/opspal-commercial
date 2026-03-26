#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const childProcess = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const VALIDATOR = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/validate-routing-state-semantics.js');
const {
  findLegacyRoutingFieldUsages
} = require(path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/validate-routing-state-semantics.js'));

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
  console.log('\n[Tests] validate-routing-state-semantics.js\n');
  const results = [];

  results.push(await runTest('Flags legacy routing fields in active routing consumers', async () => {
    const violations = findLegacyRoutingFieldUsages(
      `
const state = {
  recommended_agent: 'opspal-salesforce:sfdc-cpq-assessor',
  action: 'BLOCKED',
  blocked: true,
  status: 'cleared'
};
if (event.requiresSpecialist && !event.promptGuidanceOnly) {
  return true;
}
      `,
      'test/hooks/unit/unified-router.test.js'
    );

    const codes = new Set(violations.map((violation) => violation.code));
    assert(codes.has('legacy_recommended_agent'), 'Should flag recommended_agent');
    assert(codes.has('legacy_action_field'), 'Should flag legacy action tokens');
    assert(codes.has('legacy_blocked_field'), 'Should flag blocked field reads');
    assert(codes.has('legacy_status_alias'), 'Should flag status alias usage');
    assert(codes.has('execution_gate_inference'), 'Should flag prompt-guidance inference');
  }));

  results.push(await runTest('Allows compatibility-layer files to keep isolated legacy translation logic', async () => {
    const violations = findLegacyRoutingFieldUsages(
      'const legacy = entry.blocked || entry.action || entry.routingActionType;',
      'scripts/lib/routing-semantics.js'
    );

    assert.strictEqual(violations.length, 0, 'Compatibility files should be allowlisted');
  }));

  results.push(await runTest('Flags ambiguous recommendedAgent naming in task-router routing contexts', async () => {
    const violations = findLegacyRoutingFieldUsages(
      'return { recommendedAgent: "opspal-core:implementation-planner" };',
      'scripts/lib/task-router.js'
    );

    assert(violations.some((violation) => violation.code === 'legacy_recommended_agent'), 'Should flag recommendedAgent in task-router.js');
  }));

  results.push(await runTest('Fails if the legacy prompt router artifact is reintroduced', async () => {
    const violations = findLegacyRoutingFieldUsages(
      '#!/bin/bash\necho legacy\n',
      'hooks/user-prompt-router.sh'
    );

    assert(violations.some((violation) => violation.code === 'legacy_prompt_router_artifact'), 'Should flag the deleted prompt router artifact');
  }));

  results.push(await runTest('Flags stale references to the deleted prompt router', async () => {
    const violations = findLegacyRoutingFieldUsages(
      'const hook = ".claude-plugins/opspal-core/hooks/user-prompt-router.sh";',
      'scripts/setup-auto-routing.sh'
    );

    assert(violations.some((violation) => violation.code === 'legacy_prompt_router_reference'), 'Should flag deleted prompt router references');
  }));

  results.push(await runTest('Validator passes against the current workspace', async () => {
    childProcess.execFileSync('node', [VALIDATOR], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
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
