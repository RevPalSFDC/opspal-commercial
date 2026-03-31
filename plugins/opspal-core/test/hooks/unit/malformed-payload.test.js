#!/usr/bin/env node

/**
 * Malformed Payload Tests
 *
 * Tests security-critical hooks against malformed, truncated, oversized,
 * wrong-schema, unicode, and null-byte payloads to ensure graceful degradation.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

const HOOKS = {
  sfDispatcher: 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh',
  contractValidation: 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh',
  hubspotCurl: 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh',
  marketoCurl: 'plugins/opspal-marketo/hooks/pre-bash-marketo-api.sh'
};

function createTester(hookKey) {
  const hookPath = HOOKS[hookKey];
  if (!hookPath) throw new Error(`Unknown hook key: ${hookKey}`);
  return new HookTester(hookPath, { timeout: 15000 });
}

function hookExists(hookKey) {
  const hookPath = HOOKS[hookKey];
  const fullPath = path.isAbsolute(hookPath)
    ? hookPath
    : path.join(PROJECT_ROOT, hookPath);
  return fs.existsSync(fullPath);
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

// Shared env that prevents hooks from calling live APIs
const SAFE_ENV = {
  HOOK_TEST_MODE: '1',
  ROUTING_ENFORCEMENT_ENABLED: '0',
  OVERRIDE_REASON: 'malformed-payload-test'
};

async function runAllTests() {
  console.log('\n[Tests] Malformed Payload Tests\n');

  const results = [];

  // =========================================================================
  // MAL-01: Truncated JSON
  // =========================================================================
  for (const hookKey of Object.keys(HOOKS)) {
    if (!hookExists(hookKey)) continue;

    results.push(await runTest(`MAL-01: Truncated JSON — ${hookKey}`, async () => {
      const tester = createTester(hookKey);
      const result = await tester.run({
        stdin: '{"tool_name":"Bash","tool_input":{"command":"sf data q',
        env: SAFE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${hookKey} must not crash on truncated JSON (got exit ${result.exitCode})`);
    }));
  }

  // =========================================================================
  // MAL-02: tool_name as number
  // =========================================================================
  results.push(await runTest('MAL-02: tool_name as number — contractValidation', async () => {
    if (!hookExists('contractValidation')) return;
    const tester = createTester('contractValidation');
    const result = await tester.run({
      stdin: '{"tool_name":42,"tool_input":{"command":"sf data query"}}',
      env: SAFE_ENV
    });
    assert.strictEqual(result.exitCode, 0,
      'contractValidation must not crash on numeric tool_name');
  }));

  // =========================================================================
  // MAL-03: tool_input as string instead of object
  // =========================================================================
  for (const hookKey of ['sfDispatcher', 'hubspotCurl', 'marketoCurl']) {
    if (!hookExists(hookKey)) continue;

    results.push(await runTest(`MAL-03: tool_input as string — ${hookKey}`, async () => {
      const tester = createTester(hookKey);
      const result = await tester.run({
        stdin: '{"tool_name":"Bash","tool_input":"sf data query --target-org prod"}',
        env: SAFE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${hookKey} must not crash on string tool_input`);
    }));
  }

  // =========================================================================
  // MAL-04: Oversized payload (>1MB)
  // =========================================================================
  const oversizedPath = path.join(FIXTURES_DIR, 'oversized-command-payload.json');
  if (fs.existsSync(oversizedPath)) {
    for (const hookKey of ['contractValidation', 'sfDispatcher']) {
      if (!hookExists(hookKey)) continue;

      results.push(await runTest(`MAL-04: Oversized payload (>1MB) — ${hookKey}`, async () => {
        const tester = createTester(hookKey);
        const oversizedPayload = fs.readFileSync(oversizedPath, 'utf8');
        const result = await tester.run({
          stdin: oversizedPayload,
          env: SAFE_ENV
        });
        assert.strictEqual(result.exitCode, 0,
          `${hookKey} must handle oversized payload without crash or hang`);
      }));
    }
  }

  // =========================================================================
  // MAL-05: Unicode in command field
  // =========================================================================
  results.push(await runTest('MAL-05: Unicode in command field — sfDispatcher', async () => {
    if (!hookExists('sfDispatcher')) return;
    const tester = createTester('sfDispatcher');
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'sf data query --query "SELECT Id FROM Account WHERE Name=\'Acme\u2122\'" --target-org prod --json'
        }
      },
      env: SAFE_ENV
    });
    assert.strictEqual(result.exitCode, 0,
      'sfDispatcher must not crash on unicode command');
  }));

  // =========================================================================
  // MAL-06: Null byte in command field
  // =========================================================================
  results.push(await runTest('MAL-06: Null byte in command field', async () => {
    if (!hookExists('sfDispatcher')) return;
    const tester = createTester('sfDispatcher');
    // JSON.stringify with a null byte — jq should handle or reject gracefully
    const payloadWithNull = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'sf data query\x00 --target-org prod' }
    });
    const result = await tester.run({
      stdin: payloadWithNull,
      env: SAFE_ENV
    });
    assert.strictEqual(result.exitCode, 0,
      'sfDispatcher must not crash on null byte in command');
  }));

  // =========================================================================
  // MAL-07: Empty tool_name with populated tool_input
  // =========================================================================
  for (const hookKey of ['sfDispatcher', 'hubspotCurl', 'marketoCurl']) {
    if (!hookExists(hookKey)) continue;

    results.push(await runTest(`MAL-07: Empty tool_name — ${hookKey}`, async () => {
      const tester = createTester(hookKey);
      const result = await tester.run({
        stdin: '{"tool_name":"","tool_input":{"command":"sf data delete --sobject Account"}}',
        env: SAFE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${hookKey} must not crash on empty tool_name`);
    }));
  }

  // =========================================================================
  // MAL-08: Deeply nested objects (100 levels)
  // =========================================================================
  results.push(await runTest('MAL-08: Deeply nested objects (100 levels)', async () => {
    if (!hookExists('contractValidation')) return;
    let nested = { value: 'deep' };
    for (let i = 0; i < 100; i++) {
      nested = { nested };
    }
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello', extra: nested }
    });
    const tester = createTester('contractValidation');
    const result = await tester.run({
      stdin: payload,
      env: SAFE_ENV
    });
    assert.strictEqual(result.exitCode, 0,
      'contractValidation must handle deeply nested input');
  }));

  // =========================================================================
  // MAL-09: Completely empty stdin
  // =========================================================================
  for (const hookKey of Object.keys(HOOKS)) {
    if (!hookExists(hookKey)) continue;

    results.push(await runTest(`MAL-09: Empty stdin — ${hookKey}`, async () => {
      const tester = createTester(hookKey);
      const result = await tester.run({
        stdin: '',
        env: SAFE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${hookKey} must not crash on empty stdin`);
    }));
  }

  // =========================================================================
  // MAL-10: Garbled non-JSON content
  // =========================================================================
  for (const hookKey of Object.keys(HOOKS)) {
    if (!hookExists(hookKey)) continue;

    results.push(await runTest(`MAL-10: Garbled non-JSON — ${hookKey}`, async () => {
      const tester = createTester(hookKey);
      const result = await tester.run({
        stdin: 'not valid json {{{',
        env: SAFE_ENV
      });
      assert.strictEqual(result.exitCode, 0,
        `${hookKey} must not crash on garbled input`);
    }));
  }

  // =========================================================================
  // MAL-11: JSON with only whitespace
  // =========================================================================
  results.push(await runTest('MAL-11: Whitespace-only stdin — contractValidation', async () => {
    if (!hookExists('contractValidation')) return;
    const tester = createTester('contractValidation');
    const result = await tester.run({
      stdin: '   \n  \t  ',
      env: SAFE_ENV
    });
    assert.strictEqual(result.exitCode, 0,
      'contractValidation must not crash on whitespace-only stdin');
  }));

  // =========================================================================
  // MAL-12: Array instead of object
  // =========================================================================
  results.push(await runTest('MAL-12: JSON array instead of object — contractValidation', async () => {
    if (!hookExists('contractValidation')) return;
    const tester = createTester('contractValidation');
    const result = await tester.run({
      stdin: '[{"tool_name":"Bash"}]',
      env: SAFE_ENV
    });
    assert.strictEqual(result.exitCode, 0,
      'contractValidation must not crash on JSON array');
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
