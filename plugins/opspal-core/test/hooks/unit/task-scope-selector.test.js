#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/task-scope-selector.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

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
  console.log('\n[Tests] task-scope-selector.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Scopes Salesforce discovery tasks to Salesforce plus core', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-hook-salesforce-'));

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          message: 'Catalog Lula staging Salesforce flows and prepare deployment validation guidance.'
        },
        env: {
          HOME: home,
          CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT
        }
      });

      const statePath = path.join(home, '.claude', 'session-context', 'task-scope.json');
      const scope = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert(result.output?.hookSpecificOutput?.additionalContext.includes('opspal-salesforce'), 'Should inject Salesforce scope guidance');
      assert(result.output?.hookSpecificOutput?.additionalContext.includes('opspal-core'), 'Should keep opspal-core in scope');
      assert.deepStrictEqual(scope.selectedPlugins.slice(0, 2), ['opspal-core', 'opspal-salesforce'], 'Should persist minimal Salesforce allowlist');
      assert(!scope.selectedPlugins.includes('opspal-hubspot'), 'Should not include HubSpot in the active allowlist');
      assert(scope.suppressedPlugins.includes('opspal-hubspot'), 'Should suppress unrelated HubSpot plugin');
      assert(scope.suppressedPlugins.includes('opspal-marketo'), 'Should suppress unrelated Marketo plugin');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows cross-platform tasks to include both HubSpot and Salesforce', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-hook-cross-platform-'));

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'UserPromptSubmit',
          userPrompt: 'Plan a cross-platform dedup sync between HubSpot and Salesforce for contacts and companies.'
        },
        env: {
          HOME: home,
          CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT
        }
      });

      const statePath = path.join(home, '.claude', 'session-context', 'task-scope.json');
      const scope = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert(scope.selectedPlugins.includes('opspal-salesforce'), 'Should include Salesforce for cross-platform sync');
      assert(scope.selectedPlugins.includes('opspal-hubspot'), 'Should include HubSpot for cross-platform sync');
      assert(scope.selectedPlugins.includes('opspal-data-hygiene'), 'Should include data-hygiene sidecar for dedup tasks');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
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
