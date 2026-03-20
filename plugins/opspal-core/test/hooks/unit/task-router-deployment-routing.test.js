#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const { TaskRouter } = require(path.join(
  PROJECT_ROOT,
  'plugins/opspal-core/scripts/lib/task-router.js'
));

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
  console.log('\n[Tests] task-router deployment routing\n');

  const router = new TaskRouter();
  const results = [];

  results.push(await runTest('Routes source-dir metadata deploy prompts to the Salesforce deployment manager', async () => {
    const result = router.analyze(
      'Run sf project deploy start --source-dir force-app/main/default/layouts --target-org qa for quick actions and layouts.'
    );

    assert.strictEqual(
      result.agentShortName,
      'sfdc-deployment-manager',
      'Layout and quick action deploy prompts should stay on the Salesforce deployment specialist'
    );
  }));

  results.push(await runTest('Routes package.xml deployment prompts to the Salesforce deployment manager', async () => {
    const result = router.analyze(
      'Deploy Salesforce metadata from package.xml for layouts and quick actions in force-app.'
    );

    assert.strictEqual(
      result.agentShortName,
      'sfdc-deployment-manager',
      'Manifest deploy prompts should route to the Salesforce deployment specialist'
    );
    assert(
      result.confidence >= 0.5,
      'Manifest deploy routing should carry enough confidence to avoid generic fallbacks'
    );
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
