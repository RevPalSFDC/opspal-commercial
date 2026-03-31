#!/usr/bin/env node

/**
 * Ambiguous Alias Tests for detect-environment.sh
 *
 * Tests edge cases in environment detection: aliases containing ambiguous substrings,
 * evaluation order, cache priority over heuristics, and corrupt cache fallback.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/detect-environment.sh');
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

function runShell(script, env = {}) {
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env
    }
  });
}

function runFunction(functionName, args = '', extraEnv = {}) {
  const result = runShell(
    `source "${LIB_PATH}"; ${functionName} ${args}`.trim(),
    extraEnv
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
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] detect-environment.sh Ambiguous Alias Tests\n');

  const results = [];

  // =========================================================================
  // ADV-ENV-01: Alias containing 'dev' as substring (myorg-devops)
  // =========================================================================
  results.push(await runTest('ADV-ENV-01: myorg-devops does NOT match sandbox (word boundary)', async () => {
    const result = runFunction('normalize_environment_name', '"myorg-devops"');
    // The regex uses word boundaries: (^|[-_])(dev)([-_0-9]|$)
    // "devops" has 'dev' followed by 'o', not a boundary → does NOT match
    assert.strictEqual(result, 'unknown',
      'myorg-devops: "dev" in "devops" does not match word-bounded sandbox pattern — good design');
  }));

  // =========================================================================
  // ADV-ENV-02: Alias containing both sandbox and production keywords
  // =========================================================================
  results.push(await runTest('ADV-ENV-02: production-mirror-sandbox → sandbox (checked first)', async () => {
    const result = runFunction('normalize_environment_name', '"production-mirror-sandbox"');
    // Sandbox is checked BEFORE production in the function — sandbox wins
    assert.strictEqual(result, 'sandbox',
      'sandbox pattern checked before production — sandbox wins on ambiguous alias');
  }));

  // =========================================================================
  // ADV-ENV-03: No environment hint at all
  // =========================================================================
  results.push(await runTest('ADV-ENV-03: acme-corp (no env hint) → unknown', async () => {
    const result = runFunction('normalize_environment_name', '"acme-corp"');
    assert.strictEqual(result, 'unknown',
      'Client-branded alias with no env keyword should return unknown');
  }));

  // =========================================================================
  // ADV-ENV-04: Empty string
  // =========================================================================
  results.push(await runTest('ADV-ENV-04: empty string → unknown', async () => {
    const result = runFunction('normalize_environment_name', '""');
    assert.strictEqual(result, 'unknown', 'Empty string should return unknown');
  }));

  // =========================================================================
  // ADV-ENV-05: Numeric alias (possible HubSpot portal ID)
  // =========================================================================
  results.push(await runTest('ADV-ENV-05: numeric alias 12345 → unknown via HubSpot', async () => {
    const result = runFunction('detect_hubspot_environment', '"12345"', {
      HUBSPOT_SANDBOX_PORTAL_IDS: '',
      HUBSPOT_PRODUCTION_PORTAL_IDS: ''
    });
    assert.strictEqual(result, 'unknown',
      'Numeric ID not in any list should return unknown');
  }));

  // =========================================================================
  // ADV-ENV-06: Cache overrides alias heuristics
  // =========================================================================
  results.push(await runTest('ADV-ENV-06: Cache (production) overrides alias (sbx suffix)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const cacheFile = path.join(tmpDir, 'sf-org-info-prod-backup-sbx.json');

    // Write cache showing this is production
    const cachePath = path.join(FIXTURES_DIR, 'ambiguous-sf-org-cache.json');
    if (fs.existsSync(cachePath)) {
      fs.copyFileSync(cachePath, cacheFile);
    } else {
      fs.writeFileSync(cacheFile, JSON.stringify({ result: { isSandbox: false, orgType: 'Production' } }));
    }

    const result = runFunction('detect_salesforce_environment', '"prod-backup-sbx"', {
      TMPDIR: tmpDir,
      SALESFORCE_ENVIRONMENT: ''
    });
    // Cache should show production even though alias contains "sbx"
    assert.strictEqual(result, 'production',
      'Cache (isSandbox=false) should override alias heuristics');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }));

  // =========================================================================
  // ADV-ENV-07: Corrupt cache falls back to alias heuristics
  // =========================================================================
  results.push(await runTest('ADV-ENV-07: Corrupt cache falls back to alias heuristics', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const cacheFile = path.join(tmpDir, 'sf-org-info-acme-prod.json');

    // Write corrupt cache
    const corruptPath = path.join(FIXTURES_DIR, 'corrupt-sf-org-cache.json');
    if (fs.existsSync(corruptPath)) {
      fs.copyFileSync(corruptPath, cacheFile);
    } else {
      fs.writeFileSync(cacheFile, '{malformed json');
    }

    const result = runFunction('detect_salesforce_environment', '"acme-prod"', {
      TMPDIR: tmpDir,
      SALESFORCE_ENVIRONMENT: ''
    });
    // Corrupt cache → falls through → alias "acme-prod" contains "prod" → production
    assert.strictEqual(result, 'production',
      'Corrupt cache should fall through to alias heuristics → production');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }));

  // =========================================================================
  // ADV-ENV-08: sandbox-production → sandbox (evaluation order)
  // =========================================================================
  results.push(await runTest('ADV-ENV-08: sandbox-production → sandbox (first match)', async () => {
    const result = runFunction('normalize_environment_name', '"sandbox-production"');
    assert.strictEqual(result, 'sandbox',
      'Sandbox checked before production — first match wins');
  }));

  // =========================================================================
  // ADV-ENV-09: Scratch org patterns
  // =========================================================================
  results.push(await runTest('ADV-ENV-09: scratch org aliases detected correctly', async () => {
    const r1 = runFunction('normalize_environment_name', '"my-scratch-org"');
    const r2 = runFunction('normalize_environment_name', '"scratchorg-01"');
    const r3 = runFunction('normalize_environment_name', '"project-so-1"');

    assert.strictEqual(r1, 'scratch', 'my-scratch-org should be scratch');
    assert.strictEqual(r2, 'scratch', 'scratchorg-01 should be scratch');
    assert.strictEqual(r3, 'scratch', 'project-so-1 should be scratch');
  }));

  // =========================================================================
  // ADV-ENV-10: Quoted alias (wrapping quotes stripped)
  // =========================================================================
  results.push(await runTest('ADV-ENV-10: Quoted aliases have quotes stripped', async () => {
    const result = runFunction('normalize_environment_name', "'\"acme-prod\"'");
    assert.strictEqual(result, 'production',
      'Wrapping double quotes should be stripped before pattern matching');
  }));

  // =========================================================================
  // ADV-ENV-11: Marketo sandbox URL detection
  // =========================================================================
  results.push(await runTest('ADV-ENV-11: mktosandbox.com detected as sandbox', async () => {
    const result = runFunction('detect_marketo_environment', '', {
      MARKETO_BASE_URL: 'https://123-ABC-456.mktosandbox.com'
    });
    assert.strictEqual(result, 'sandbox',
      'mktosandbox.com domain should detect as sandbox');
  }));

  // =========================================================================
  // ADV-ENV-12: Marketo production URL default
  // =========================================================================
  results.push(await runTest('ADV-ENV-12: mktorest.com defaults to production', async () => {
    const result = runFunction('detect_marketo_environment', '', {
      MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com'
    });
    assert.strictEqual(result, 'production',
      'mktorest.com domain should detect as production');
  }));

  // =========================================================================
  // ADV-ENV-13: HubSpot portal in production list
  // =========================================================================
  results.push(await runTest('ADV-ENV-13: HubSpot portal ID in production list', async () => {
    const result = runFunction('detect_hubspot_environment', '"99999"', {
      HUBSPOT_PRODUCTION_PORTAL_IDS: '99999,88888',
      HUBSPOT_SANDBOX_PORTAL_IDS: '11111'
    });
    assert.strictEqual(result, 'production',
      'Portal ID in production list should detect as production');
  }));

  // =========================================================================
  // ADV-ENV-14: HubSpot portal in sandbox list
  // =========================================================================
  results.push(await runTest('ADV-ENV-14: HubSpot portal ID in sandbox list', async () => {
    const result = runFunction('detect_hubspot_environment', '"11111"', {
      HUBSPOT_PRODUCTION_PORTAL_IDS: '99999',
      HUBSPOT_SANDBOX_PORTAL_IDS: '11111,22222'
    });
    assert.strictEqual(result, 'sandbox',
      'Portal ID in sandbox list should detect as sandbox');
  }));

  // =========================================================================
  // Summary
  // =========================================================================
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
