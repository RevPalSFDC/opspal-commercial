#!/usr/bin/env node

/**
 * Unit Tests for pre-tool-use/soql-enhancer.sh
 *
 * Focus on skip paths and argument handling.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/hooks/pre-tool-use/soql-enhancer.sh');

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

function runHook(args, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', [HOOK_PATH, ...args], {
      env: { ...process.env, ...env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });

    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', err => reject(err));
  });
}

function createFakeEnhancementRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-soql-engine-'));
  const scriptDir = path.join(tempRoot, 'scripts/lib');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptDir, 'soql-enhancement-engine.js'),
    `#!/usr/bin/env node
'use strict';

const [, , command, org, query] = process.argv;
if (command === 'enhance') {
  process.stdout.write(query || '');
}
`,
    'utf8'
  );
  return tempRoot;
}

async function runAllTests() {
  console.log('\n[Tests] pre-tool-use/soql-enhancer.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips non-Bash tool', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-soql-'));
    try {
      const result = await runHook(['ReadFile', 'hello'], {
        PROJECT_ROOT: tempRoot,
        CLAUDE_PLUGIN_ROOT: tempRoot
      });

      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert.strictEqual(result.stdout.trim(), 'hello', 'Should echo input unchanged');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Skips non-SF command', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-soql-'));
    try {
      const result = await runHook(['Bash', 'echo hello'], {
        PROJECT_ROOT: tempRoot,
        CLAUDE_PLUGIN_ROOT: tempRoot
      });

      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert.strictEqual(result.stdout.trim(), 'echo hello', 'Should return command unchanged');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Skips when no org context', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-soql-'));
    const input = '{"command":"sf data query --query \\\"SELECT Id FROM Account\\\""}';
    try {
      const result = await runHook(['Bash', input], {
        PROJECT_ROOT: tempRoot,
        CLAUDE_PLUGIN_ROOT: tempRoot,
        ERROR_PREVENTION_ENABLED: 'false'
      });

      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert.strictEqual(result.stdout.trim(), input, 'Should return original input');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Skips when enhancement disabled', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-soql-'));
    const input = '{"command":"sf data query --query \\\"SELECT Id FROM Account\\\""}';
    try {
      const result = await runHook(['Bash', input], {
        PROJECT_ROOT: tempRoot,
        CLAUDE_PLUGIN_ROOT: tempRoot,
        SF_TARGET_ORG: 'sandbox',
        SOQL_ENHANCEMENT_ENABLED: 'false',
        ERROR_PREVENTION_ENABLED: 'false'
      });

      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert.strictEqual(result.stdout.trim(), input, 'Should return original input');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Does not fail when error prevention is enabled without PROJECT_ROOT env', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-soql-'));
    const command = 'sf data query --query \"SELECT Id FROM Account\" --target-org sandbox --json';
    try {
      const result = await runHook(['Bash', command], {
        CLAUDE_PLUGIN_ROOT: tempRoot,
        ERROR_PREVENTION_ENABLED: 'true',
        SOQL_ENHANCEMENT_ENABLED: 'false'
      });

      assert.strictEqual(result.code, 0, 'Should exit with 0 instead of unbound variable failure');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Auto-escapes embedded apostrophes before enhancement', async () => {
    const tempRoot = createFakeEnhancementRoot();
    const command = 'sf data query --query "SELECT Id FROM Account WHERE Name IN (\'O\'Brien\')" --target-org sandbox --json';
    try {
      const result = await runHook(['Bash', command], {
        CLAUDE_PLUGIN_ROOT: tempRoot,
        ERROR_PREVENTION_ENABLED: 'false',
        SOQL_ENHANCEMENT_ENABLED: 'true',
        SOQL_LIVE_FIRST: 'false',
        SF_TARGET_ORG: 'sandbox'
      });

      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert(
        result.stdout.trim().includes('O\\\'Brien'),
        'Should rewrite the command with an escaped apostrophe before enhancement'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
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
