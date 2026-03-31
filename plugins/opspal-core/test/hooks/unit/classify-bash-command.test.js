#!/usr/bin/env node

/**
 * Unit Tests for classify-bash-command.sh
 *
 * Covers the shared Bash classifier helpers used by routing and policy hooks.
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

function runClassifier(functionName, command, extraEnv = {}, extraArgs = '') {
  const result = runShell(
    `source "${LIB_PATH}"; ${functionName} "$COMMAND_INPUT" ${extraArgs}`.trim(),
    { COMMAND_INPUT: command, ...extraEnv }
  );

  assert.strictEqual(result.status, 0, result.stderr || `${functionName} should succeed`);
  return result.stdout.trim();
}

function runPredicate(functionName, command, extraEnv = {}) {
  const result = runShell(
    `source "${LIB_PATH}"; if ${functionName} "$COMMAND_INPUT"; then echo true; else echo false; fi`,
    { COMMAND_INPUT: command, ...extraEnv }
  );

  assert.strictEqual(result.status, 0, result.stderr || `${functionName} should succeed`);
  return result.stdout.trim() === 'true';
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
  console.log('\n[Tests] classify-bash-command.sh Tests\n');

  const results = [];

  results.push(await runTest('Library exists and is valid', async () => {
    assert(fs.existsSync(LIB_PATH), 'Library file should exist');
    const result = spawnSync('bash', ['-n', LIB_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Library should have valid bash syntax');
  }));

  results.push(await runTest('Classifies Salesforce query commands as read', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
    );
    assert.strictEqual(classification, 'read', 'SOQL queries should classify as read');
  }));

  results.push(await runTest('Classifies Salesforce deploy commands as deploy', async () => {
    const classification = runClassifier(
      'classify_sf_command',
      'sfdx force:source:deploy --manifest package.xml --target-org production'
    );
    assert.strictEqual(classification, 'deploy', 'Deploy commands should classify as deploy');
  }));

  results.push(await runTest('Detects production and sandbox Salesforce targets', async () => {
    const production = runClassifier(
      'detect_target_environment',
      'sf data query --query "SELECT Id FROM Account" --target-org live-production --json',
      {
        PROD_PATTERN: 'prod|production|live',
        SANDBOX_PATTERN: 'sandbox|sbx|dev|qa|uat|test|stage|staging'
      },
      '"$PROD_PATTERN" "$SANDBOX_PATTERN"'
    );
    const sandbox = runClassifier(
      'detect_target_environment',
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox-dev --json',
      {
        PROD_PATTERN: 'prod|production|live',
        SANDBOX_PATTERN: 'sandbox|sbx|dev|qa|uat|test|stage|staging'
      },
      '"$PROD_PATTERN" "$SANDBOX_PATTERN"'
    );

    assert.strictEqual(production, 'production', 'Production-looking aliases should classify as production');
    assert.strictEqual(sandbox, 'sandbox', 'Sandbox-looking aliases should classify as sandbox');
  }));

  results.push(await runTest('Treats HubSpot search POST as read-only', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
    );
    assert.strictEqual(classification, 'read', 'HubSpot search POST should stay read-only');
  }));

  results.push(await runTest('Treats HubSpot PATCH as a mutation', async () => {
    const classification = runClassifier(
      'classify_hubspot_curl',
      `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{"firstname":"Updated"}}'`
    );
    assert.strictEqual(classification, 'mutate', 'HubSpot PATCH should classify as mutating');
  }));

  results.push(await runTest('Treats Marketo GET as read-only and POST as a mutation', async () => {
    const readClassification = runClassifier(
      'classify_marketo_curl',
      'curl -s https://123-ABC-456.mktorest.com/rest/v1/leads.json?filterType=id&filterValues=1'
    );
    const writeClassification = runClassifier(
      'classify_marketo_curl',
      `curl -s -X POST https://123-ABC-456.mktorest.com/bulk/v1/leads/import.json -d '{"format":"csv"}'`
    );

    assert.strictEqual(readClassification, 'read', 'Marketo GET should classify as read-only');
    assert.strictEqual(writeClassification, 'mutate', 'Marketo POST should classify as mutating');
  }));

  results.push(await runTest('is_read_only_command recognizes cross-platform read flows', async () => {
    const sfRead = runPredicate(
      'is_read_only_command',
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
    );
    const hubspotRead = runPredicate(
      'is_read_only_command',
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
    );
    const marketoWrite = runPredicate(
      'is_read_only_command',
      `curl -s -X POST https://123-ABC-456.mktorest.com/bulk/v1/leads/import.json -d '{"format":"csv"}'`
    );

    assert.strictEqual(sfRead, true, 'Salesforce queries should be read-only');
    assert.strictEqual(hubspotRead, true, 'HubSpot search POST should be read-only');
    assert.strictEqual(marketoWrite, false, 'Marketo import POST should not be read-only');
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

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
