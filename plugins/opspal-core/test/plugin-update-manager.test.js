#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  PluginUpdateManager,
  formatAppliedFix
} = require(path.join(__dirname, '..', 'scripts', 'lib', 'plugin-update-manager.js'));

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
  console.log('\n[Tests] plugin-update-manager.js\n');

  const results = [];

  results.push(await runTest('Formats object fixes into readable summary text', async () => {
    const formatted = formatAppliedFix({
      type: 'default_applied',
      variable: 'ENABLE_SUBAGENT_BOOST',
      value: '1'
    });

    assert.strictEqual(formatted, 'Applied default ENABLE_SUBAGENT_BOOST=1');
  }));

  results.push(await runTest('Falls back to routing-index.json when routing-patterns.json is missing', async () => {
    const manager = new PluginUpdateManager({ plugin: 'opspal-core' });
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const routingPatternsPath = path.join(__dirname, '..', 'config', 'routing-patterns.json');
    const routingIndexPath = path.join(__dirname, '..', 'routing-index.json');

    try {
      fs.existsSync = (candidatePath) => {
        if (candidatePath === routingPatternsPath) {
          return false;
        }
        if (candidatePath === routingIndexPath) {
          return true;
        }
        return originalExistsSync(candidatePath);
      };

      fs.readFileSync = (candidatePath, ...rest) => {
        if (candidatePath === routingIndexPath) {
          return JSON.stringify({ agents: {} });
        }
        return originalReadFileSync(candidatePath, ...rest);
      };

      await manager.checkRoutingRegistry();

      assert.strictEqual(manager.results.routingRegistry.failed.length, 0, 'Expected fallback path to avoid a hard failure');
      assert(
        manager.results.routingRegistry.passed.some((entry) => entry.name === 'routing-index.json fallback'),
        'Expected routing-index fallback to be recorded as passed'
      );
      assert(
        manager.results.routingRegistry.warnings.some((entry) => entry.name === 'routing-patterns.json'),
        'Expected missing routing-patterns.json to be downgraded to a warning'
      );
    } finally {
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
    }
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
