#!/usr/bin/env node

/**
 * Unit Tests for pre-org-operation-validation.sh
 *
 * Covers no-alias path to avoid external sf CLI calls.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-org-operation-validation.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
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
  console.log('\n[Tests] pre-org-operation-validation.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Approves when no explicit org alias', async () => {
    const result = await tester.run({
      input: {
        command: 'sf data query --query "SELECT Id FROM Account"'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(result.output && result.output.status === 'approve', 'Should approve by default');
    assert(
      result.output && result.output.message.includes('No explicit org alias'),
      'Should mention default org usage'
    );
  }));

  results.push(await runTest('Approves when explicit org alias validates', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-node-'));
    const fakeNode = path.join(tempDir, 'node');
    fs.writeFileSync(fakeNode, '#!/usr/bin/env bash\necho \"{}\"\\n', 'utf8');
    fs.chmodSync(fakeNode, 0o755);

    try {
      const result = await tester.run({
        input: {
          command: 'sf data query --target-org sandbox'
        },
        env: {
          PATH: `${tempDir}:${process.env.PATH}`
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert(result.output && result.output.status === 'approve', 'Should approve validated org');
      assert(
        result.output && result.output.message.includes('Org alias validated'),
        'Should confirm validation'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Rejects when org alias validation fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-node-'));
    const fakeNode = path.join(tempDir, 'node');
    const failurePayload = JSON.stringify({
      suggestions: ['Did you mean: sandbox?']
    });

    fs.writeFileSync(
      fakeNode,
      `#!/usr/bin/env bash\necho '${failurePayload}'\nexit 1\n`,
      'utf8'
    );
    fs.chmodSync(fakeNode, 0o755);

    try {
      const result = await tester.run({
        stdin: 'sf data query --target-org badalias',
        env: {
          PATH: `${tempDir}:${process.env.PATH}`
        }
      });

      assert.strictEqual(result.exitCode, 1, 'Should exit with 1');
      assert(result.output && result.output.status === 'reject', 'Should reject invalid org');
      assert(
        result.output && result.output.message.includes('validation failed'),
        'Should mention validation failure'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
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

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
