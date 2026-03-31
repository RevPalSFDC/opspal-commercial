#!/usr/bin/env node

/**
 * HubSpot Classification Edge Case Tests for classify-bash-command.sh
 *
 * Tests edge cases in HubSpot curl classification: batch/archive, associations,
 * batch/read with large bodies, domain variants, HTTP method flag variants.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/classify-bash-command.sh');

function runShell(script, env = {}) {
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env
    }
  });
}

function runClassifier(functionName, command, extraEnv = {}) {
  const result = runShell(
    `source "${LIB_PATH}"; ${functionName} "$COMMAND_INPUT"`,
    { COMMAND_INPUT: command, ...extraEnv }
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
  console.log('\n[Tests] classify-bash-command.sh HubSpot Edge Cases\n');

  const results = [];

  // =========================================================================
  // ADV-HS-01: batch/archive POST — must be mutate
  // =========================================================================
  results.push(await runTest('ADV-HS-01: batch/archive POST classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/batch/archive -d '{"inputs":[{"id":"123"}]}'`
    );
    assert.strictEqual(classification, 'mutate',
      'batch/archive is a destructive operation — must be mutate');
  }));

  // =========================================================================
  // ADV-HS-02: associations batch/create POST — must be mutate
  // =========================================================================
  results.push(await runTest('ADV-HS-02: associations batch/create classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubapi.com/crm/v4/associations/contacts/companies/batch/create -d '{"inputs":[]}'`
    );
    assert.strictEqual(classification, 'mutate',
      'Association creation is a mutation');
  }));

  // =========================================================================
  // ADV-HS-03: batch/read POST — must remain read
  // =========================================================================
  results.push(await runTest('ADV-HS-03: batch/read POST classifies as read', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/batch/read -d '{"inputs":[{"id":"123"},{"id":"456"}]}'`
    );
    assert.strictEqual(classification, 'read',
      'batch/read is a read-only operation despite using POST');
  }));

  // =========================================================================
  // ADV-HS-04: api.hubspot.com domain variant (not hubapi.com)
  // =========================================================================
  results.push(await runTest('ADV-HS-04: api.hubspot.com domain recognized for search', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubspot.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
    );
    assert.strictEqual(classification, 'read',
      'api.hubspot.com should be recognized as HubSpot API domain');
  }));

  // =========================================================================
  // ADV-HS-05: --request PATCH long-form flag
  // =========================================================================
  results.push(await runTest('ADV-HS-05: --request PATCH long-form classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s --request PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{}}'`
    );
    assert.strictEqual(classification, 'mutate',
      'Long-form --request PATCH must classify as mutate');
  }));

  // =========================================================================
  // ADV-HS-06: batch/update POST — must be mutate
  // =========================================================================
  results.push(await runTest('ADV-HS-06: batch/update POST classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/batch/update -d '{"inputs":[]}'`
    );
    assert.strictEqual(classification, 'mutate',
      'batch/update is a mutation operation');
  }));

  // =========================================================================
  // ADV-HS-07: Implicit POST via --data flag (no -X)
  // =========================================================================
  results.push(await runTest('ADV-HS-07: Implicit POST via --data classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s https://api.hubapi.com/crm/v3/objects/contacts --data '{"properties":{"email":"test@test.com"}}'`
    );
    assert.strictEqual(classification, 'mutate',
      'Implicit POST via --data must classify as mutate');
  }));

  // =========================================================================
  // ADV-HS-08: Implicit POST via -d flag (short form)
  // =========================================================================
  results.push(await runTest('ADV-HS-08: Implicit POST via -d classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s https://api.hubapi.com/crm/v3/objects/contacts -d '{"properties":{"email":"test@test.com"}}'`
    );
    assert.strictEqual(classification, 'mutate',
      'Implicit POST via -d must classify as mutate');
  }));

  // =========================================================================
  // ADV-HS-09: HEAD request (explicit -I flag)
  // =========================================================================
  results.push(await runTest('ADV-HS-09: HEAD request via -I classifies as read', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      'curl -s -I https://api.hubapi.com/crm/v3/objects/contacts/123'
    );
    assert.strictEqual(classification, 'read',
      'HEAD request (-I flag) must classify as read');
  }));

  // =========================================================================
  // ADV-HS-10: --head long-form flag
  // =========================================================================
  results.push(await runTest('ADV-HS-10: HEAD request via --head classifies as read', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      'curl -s --head https://api.hubapi.com/crm/v3/objects/contacts/123'
    );
    assert.strictEqual(classification, 'read',
      'HEAD request (--head flag) must classify as read');
  }));

  // =========================================================================
  // ADV-HS-11: POST to /search with trailing slash
  // =========================================================================
  results.push(await runTest('ADV-HS-11: POST to /search/ with trailing slash classifies as read', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search/ -d '{"filterGroups":[]}'`
    );
    assert.strictEqual(classification, 'read',
      'Trailing slash on /search/ should not break read classification');
  }));

  // =========================================================================
  // ADV-HS-12: --data-raw and --data-binary variants
  // =========================================================================
  results.push(await runTest('ADV-HS-12: --data-raw implies POST, classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s https://api.hubapi.com/crm/v3/objects/contacts --data-raw '{"properties":{"email":"test@test.com"}}'`
    );
    assert.strictEqual(classification, 'mutate',
      '--data-raw implies POST, must classify as mutate');
  }));

  // =========================================================================
  // ADV-HS-13: Form upload via -F flag
  // =========================================================================
  results.push(await runTest('ADV-HS-13: -F form upload implies POST, classifies as mutate', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      'curl -s https://api.hubapi.com/filemanager/api/v3/files/upload -F file=@document.pdf'
    );
    assert.strictEqual(classification, 'mutate',
      '-F form upload implies POST, must classify as mutate');
  }));

  // =========================================================================
  // ADV-HS-14: Simple GET with no explicit method
  // =========================================================================
  results.push(await runTest('ADV-HS-14: Plain GET request classifies as read', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      'curl -s https://api.hubapi.com/crm/v3/objects/contacts/123'
    );
    assert.strictEqual(classification, 'read',
      'Plain GET request must classify as read');
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
