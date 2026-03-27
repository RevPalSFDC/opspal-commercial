#!/usr/bin/env node

/**
 * Unit Tests for detect-environment.sh
 *
 * Covers the shared shell environment helpers used by hooks.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/detect-environment.sh');

function runShell(script, env = {}) {
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env
    }
  });
}

function runDetector(functionName, input, env = {}) {
  const result = runShell(
    `source "${LIB_PATH}"; ${functionName} "$DETECT_INPUT"`,
    { DETECT_INPUT: input, ...env }
  );

  assert.strictEqual(result.status, 0, result.stderr || `${functionName} should succeed`);
  return result.stdout.trim();
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
  console.log('\n[Tests] detect-environment.sh\n');

  const results = [];

  results.push(await runTest('Library exists and is valid', async () => {
    assert(fs.existsSync(LIB_PATH), 'Library file should exist');
    const result = spawnSync('bash', ['-n', LIB_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Library should have valid bash syntax');
  }));

  results.push(await runTest('Uses cached Salesforce org info before alias heuristics', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-environment-'));
    const cachePath = path.join(tempDir, 'sf-org-info-client-primary.json');

    try {
      fs.writeFileSync(cachePath, JSON.stringify({
        orgType: 'production',
        isSandbox: false
      }, null, 2), 'utf8');

      const detected = runDetector('detect_salesforce_environment', 'client-primary', {
        TMPDIR: tempDir
      });

      assert.strictEqual(detected, 'production');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Falls back to Salesforce sandbox heuristics when no cache exists', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-environment-'));
    const fakeSf = path.join(tempDir, 'sf');

    try {
      fs.writeFileSync(fakeSf, '#!/usr/bin/env bash\nexit 1\n', 'utf8');
      fs.chmodSync(fakeSf, 0o755);

      const detected = runDetector('detect_salesforce_environment', 'acme-sbx', {
        PATH: `${tempDir}:${process.env.PATH}`
      });

      assert.strictEqual(detected, 'sandbox');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Detects HubSpot environments from portal registry and naming', async () => {
    const production = runDetector('detect_hubspot_environment', '123456', {
      HUBSPOT_PRODUCTION_PORTAL_IDS: '123456,987654'
    });
    const sandbox = runDetector('detect_hubspot_environment', 'qa-sandbox');

    assert.strictEqual(production, 'production');
    assert.strictEqual(sandbox, 'sandbox');
  }));

  results.push(await runTest('Detects Marketo environments from domain and instance naming', async () => {
    const sandbox = runDetector('detect_marketo_environment', 'https://123-ABC-456.mktosandbox.com/rest/v1/leads.json');
    const production = runDetector('detect_marketo_environment', 'https://123-ABC-456.mktorest.com/rest/v1/leads.json');

    assert.strictEqual(sandbox, 'sandbox');
    assert.strictEqual(production, 'production');
  }));

  results.push(await runTest('Discovers instance paths by org alias from ORG_CONTEXT metadata', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-environment-'));
    const instancePath = path.join(tempDir, 'instances', 'sandbox');

    try {
      fs.mkdirSync(path.join(instancePath, 'configs'), { recursive: true });
      fs.writeFileSync(
        path.join(instancePath, 'configs', 'ORG_CONTEXT.json'),
        JSON.stringify({ org: 'client-staging' }, null, 2),
        'utf8'
      );

      const result = runShell(
        `source "${LIB_PATH}"; discover_instance_path_for_alias "$DETECT_ALIAS" "$DETECT_ROOT"`,
        {
          DETECT_ALIAS: 'client-staging',
          DETECT_ROOT: tempDir
        }
      );

      assert.strictEqual(result.status, 0, result.stderr || 'discover_instance_path_for_alias should succeed');
      assert.strictEqual(result.stdout.trim(), instancePath, 'Should return the matched instance directory instead of assuming alias == directory name');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(result => result.passed).length;
  const failed = results.filter(result => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
