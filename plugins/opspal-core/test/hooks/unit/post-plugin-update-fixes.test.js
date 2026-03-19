#!/usr/bin/env node

/**
 * Unit Tests for post-plugin-update-fixes.js
 *
 * Validates installed runtime reconciliation repairs the active cache bundle
 * and updates installed_plugins.json to the current versioned install path.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const CURRENT_MARKETPLACE_NAME = 'opspal-commercial';
const LEGACY_MARKETPLACE_NAME = 'revpal-internal-plugins';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function loadFreshFixer(tempHome) {
  const fixesPath = path.join(PLUGIN_ROOT, 'scripts/lib/post-plugin-update-fixes.js');

  process.env.HOME = tempHome;
  delete require.cache[require.resolve(fixesPath)];

  return require(fixesPath).PostPluginUpdateFixes;
}

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

function assertInstalledRuntimeRepair(tempHome, marketplaceName) {
  const pluginVersion = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  ).version;

  const staleVersion = '2.0.0';
  const staleInstallPath = path.join(
    tempHome,
    '.claude',
    'plugins',
    'cache',
    marketplaceName,
    'opspal-core',
    staleVersion
  );
  const installedPluginsPath = path.join(tempHome, '.claude', 'plugins', 'installed_plugins.json');
  const pluginKey = `opspal-core@${marketplaceName}`;

  writeJson(path.join(staleInstallPath, '.claude-plugin', 'plugin.json'), {
    name: 'opspal-core',
    version: staleVersion
  });
  writeJson(path.join(staleInstallPath, '.claude-plugin', 'hooks.json'), {
    hooks: {
      UserPromptSubmit: [],
      PreToolUse: []
    }
  });
  writeJson(installedPluginsPath, {
    version: 2,
    plugins: {
      [pluginKey]: [
        {
          scope: 'user',
          installPath: staleInstallPath,
          version: staleVersion,
          installedAt: '2026-03-01T00:00:00.000Z',
          lastUpdated: '2026-03-01T00:00:00.000Z'
        }
      ]
    }
  });

  const PostPluginUpdateFixes = loadFreshFixer(tempHome);
  const fixer = new PostPluginUpdateFixes({
    projectRoot: PROJECT_ROOT,
    corePluginRoot: PLUGIN_ROOT,
    dryRun: false,
    verbose: false
  });

  const preCheck = fixer.checkInstalledRuntime();
  assert.strictEqual(preCheck.needsFix, true, 'Stale install record should require repair');

  const repair = fixer.reconcileInstalledRuntime();
  assert.strictEqual(repair.fixed, true, 'Repair should update the installed runtime');

  const expectedInstallPath = path.join(
    tempHome,
    '.claude',
    'plugins',
    'cache',
    marketplaceName,
    'opspal-core',
    pluginVersion
  );

  assert(fs.existsSync(expectedInstallPath), 'Expected cache version should exist after repair');
  assert(
    fs.existsSync(path.join(expectedInstallPath, 'scripts/lib/routing-state-manager.js')),
    'Expected runtime bundle should include routing-state-manager.js'
  );

  const updatedPlugins = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf8'));
  const updatedEntry = updatedPlugins.plugins[pluginKey][0];
  assert.strictEqual(updatedEntry.version, pluginVersion, 'Installed version should be updated');
  assert.strictEqual(updatedEntry.installPath, expectedInstallPath, 'installPath should point at the repaired cache bundle');

  const cachedHooks = JSON.parse(
    fs.readFileSync(path.join(expectedInstallPath, '.claude-plugin', 'hooks.json'), 'utf8')
  );
  const userPromptHooks = cachedHooks.hooks.UserPromptSubmit
    .flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : []);
  const unifiedRouterHook = userPromptHooks.find((hook) => hook?.command?.includes('unified-router.sh'));
  assert(unifiedRouterHook, 'Repaired cache bundle should contain unified-router hook');
  assert(
    unifiedRouterHook.command.includes('ROUTING_ADAPTIVE_CONTINUE=1'),
    'Repaired cache bundle should preserve unified-router env overrides'
  );

  const wildcardGate = cachedHooks.hooks.PreToolUse.some((group) => (
    group?.matcher === '*' &&
    Array.isArray(group?.hooks) &&
    group.hooks.some((hook) => hook?.command?.includes('pre-tool-use-contract-validation.sh'))
  ));
  assert.strictEqual(wildcardGate, true, 'Repaired cache bundle should restore wildcard PreToolUse routing gate');

  const postCheck = fixer.checkInstalledRuntime();
  assert.strictEqual(postCheck.needsFix, false, 'Installed runtime should verify cleanly after repair');
}

async function runAllTests() {
  console.log('\n[Tests] post-plugin-update-fixes.js Tests\n');

  const results = [];
  const originalHome = process.env.HOME;

  results.push(await runTest('Repairs installed runtime cache and manifest drift for commercial marketplace', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'post-plugin-fixes-home-'));

    try {
      assertInstalledRuntimeRepair(tempHome, CURRENT_MARKETPLACE_NAME);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Repairs installed runtime cache and manifest drift for legacy internal marketplace installs', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'post-plugin-fixes-home-'));

    try {
      assertInstalledRuntimeRepair(tempHome, LEGACY_MARKETPLACE_NAME);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Cleans legacy Bash deny rules from user-level settings during hook reconciliation', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'post-plugin-fixes-home-'));
    const userSettingsPath = path.join(tempHome, '.claude', 'settings.json');

    try {
      writeJson(userSettingsPath, {
        permissions: {
          deny: ['Bash*', 'Read']
        },
        hooks: {
          UserPromptSubmit: []
        }
      });

      const PostPluginUpdateFixes = loadFreshFixer(tempHome);
      const fixer = new PostPluginUpdateFixes({
        projectRoot: PROJECT_ROOT,
        corePluginRoot: PLUGIN_ROOT,
        dryRun: false,
        verbose: false
      });

      const result = fixer.fixUserLevelHooks();
      assert.strictEqual(result.fixed, true, 'User hook reconciliation should rewrite stale settings');

      const repairedSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf8'));
      assert.deepStrictEqual(
        repairedSettings.permissions.deny,
        ['Read'],
        'User-level reconciliation should remove legacy blanket Bash deny rules'
      );
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const result of results.filter((item) => !item.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
