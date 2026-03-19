#!/usr/bin/env node

/**
 * Unit Tests for reconcile-hook-registration.js
 *
 * Validates active hook reconciliation writes the routing gate into project
 * settings and preserves user-level routing hooks in isolated environments.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function loadFreshReconciler(tempHome) {
  const helperPath = path.join(PLUGIN_ROOT, 'scripts/lib/reconcile-hook-registration.js');
  const fixesPath = path.join(PLUGIN_ROOT, 'scripts/lib/post-plugin-update-fixes.js');

  process.env.HOME = tempHome;
  delete require.cache[require.resolve(helperPath)];
  delete require.cache[require.resolve(fixesPath)];

  return require(helperPath);
}

async function runAllTests() {
  console.log('\n[Tests] reconcile-hook-registration.js Tests\n');

  const results = [];
  const originalHome = process.env.HOME;

  results.push(await runTest('Reconciles project and user hook settings in isolated workspace', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-reconcile-home-'));
    const tempProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-reconcile-project-'));
    const reminderPath = path.join(tempProjectRoot, 'docs', 'reminder.md');
    const projectSettingsPath = path.join(tempProjectRoot, '.claude', 'settings.json');
    const localSettingsPath = path.join(tempProjectRoot, '.claude', 'settings.local.json');
    const userSettingsPath = path.join(tempHome, '.claude', 'settings.json');

    try {
      fs.mkdirSync(path.dirname(reminderPath), { recursive: true });
      fs.writeFileSync(reminderPath, 'Routing reminder content');
      writeJson(projectSettingsPath, {
        permissions: {
          deny: ['Bash*', 'Read']
        },
        hooks: {
          PreToolUse: []
        }
      });
      writeJson(localSettingsPath, {
        permissions: {
          deny: ['Bash*', 'Write']
        }
      });

      const reconciler = loadFreshReconciler(tempHome);
      const result = reconciler.reconcileHookRegistration({
        projectRoot: tempProjectRoot,
        corePluginRoot: PLUGIN_ROOT,
        dryRun: false,
        verbose: false
      });

      assert.strictEqual(result.ok, true, 'Reconciliation should succeed');
      assert.strictEqual(result.projectHooks.wildcardGatePresent, true, 'Project hook reconciliation should add wildcard routing gate');
      assert(fs.existsSync(projectSettingsPath), 'Project settings should exist after reconciliation');
      assert(fs.existsSync(userSettingsPath), 'User settings should exist after reconciliation');

      const projectSettings = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8'));
      assert.strictEqual(
        reconciler.hasWildcardRoutingGate(projectSettings),
        true,
        'Project settings should contain PreToolUse(*) routing gate'
      );
      assert.deepStrictEqual(
        projectSettings.permissions.deny,
        ['Read'],
        'Project reconciliation should remove legacy blanket Bash deny rules'
      );

      const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf8'));
      const userPromptGroups = Array.isArray(userSettings?.hooks?.UserPromptSubmit)
        ? userSettings.hooks.UserPromptSubmit
        : [];
      assert(userPromptGroups.length > 0, 'User settings should contain UserPromptSubmit hooks');

      const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
      assert.deepStrictEqual(
        localSettings.permissions.deny,
        ['Write'],
        'Local settings reconciliation should remove legacy blanket Bash deny rules'
      );
      assert.strictEqual(result.localSettings.changed, true, 'Local settings cleanup should be reported');
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tempHome, { recursive: true, force: true });
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    }
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

runAllTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
