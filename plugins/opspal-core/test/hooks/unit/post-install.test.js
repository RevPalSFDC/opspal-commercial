#!/usr/bin/env node

/**
 * Unit Tests for post-install.sh hooks
 *
 * Validates doc-version updates and hook permission fixes for plugin installs.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const PLUGIN_POST_INSTALLS = [
  {
    name: 'opspal-core',
    version: '1.8.0',
    hookPath: path.join(
      PROJECT_ROOT,
      'plugins/opspal-core/.claude-plugin/hooks/post-install.sh'
    ),
    writesDocVersion: true
  },
  {
    name: 'salesforce-plugin',
    version: '3.43.0',
    hookPath: path.join(
      PROJECT_ROOT,
      'plugins/opspal-salesforce/.claude-plugin/hooks/post-install.sh'
    ),
    writesDocVersion: true
  },
  {
    name: 'gtm-planning-plugin',
    version: '1.5.0',
    hookPath: path.join(
      PROJECT_ROOT,
      'plugins/opspal-gtm-planning/.claude-plugin/hooks/post-install.sh'
    ),
    writesDocVersion: true
  },
  {
    name: 'hubspot-plugin',
    version: '2.0.0',
    hookPath: path.join(
      PROJECT_ROOT,
      'plugins/opspal-hubspot/.claude-plugin/hooks/post-install.sh'
    ),
    writesDocVersion: false
  }
];

function createTempPluginRoot() {
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'post-install-root-'));
  const hooksDir = path.join(pluginRoot, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookFile = path.join(hooksDir, 'sample-hook.sh');
  fs.writeFileSync(hookFile, '#!/bin/bash\necho test\n');
  fs.chmodSync(hookFile, 0o644);
  return { pluginRoot, hookFile };
}

function isExecutable(filePath) {
  const mode = fs.statSync(filePath).mode;
  return (mode & 0o111) !== 0;
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

async function runAllTests() {
  console.log('\n[Tests] post-install.sh Hook Tests\n');

  const results = [];

  for (const plugin of PLUGIN_POST_INSTALLS) {
    results.push(await runTest(`${plugin.name} post-install runs`, async () => {
      assert(fs.existsSync(plugin.hookPath), 'Hook file should exist');
      const { pluginRoot, hookFile } = createTempPluginRoot();
      const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'post-install-home-'));

      try {
        const result = spawnSync('bash', [plugin.hookPath], {
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: tempHome,
            CLAUDE_PLUGIN_ROOT: pluginRoot
          }
        });

        assert.strictEqual(result.status, 0, 'Hook should exit with 0');
        assert(isExecutable(hookFile), 'Hook permissions should be executable');

        if (plugin.writesDocVersion) {
          const docVersionFile = path.join(
            tempHome,
            '.claude',
            'plugins',
            plugin.name,
            'doc-version'
          );
          assert(fs.existsSync(docVersionFile), 'Doc version file should exist');
          const version = fs.readFileSync(docVersionFile, 'utf8').trim();
          assert.strictEqual(version, plugin.version, 'Doc version should match');
        }
      } finally {
        fs.rmSync(pluginRoot, { recursive: true, force: true });
        fs.rmSync(tempHome, { recursive: true, force: true });
      }
    }));
  }

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
