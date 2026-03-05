#!/usr/bin/env node

/**
 * Unit Tests for pre-operation-org-validation.sh
 *
 * Validates pass-through and warning behavior without org mismatch blocking.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-operation-org-validation.sh';

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
  console.log('\n[Tests] pre-operation-org-validation.sh Tests\n');

  const tester = createTester();
  const results = [];
  const hookPath = tester.hookPath;

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Passes through when not in instance path', async () => {
    const input = {
      command: 'sf data query --query "SELECT Id FROM Account"'
    };

    const result = await tester.run({
      input,
      env: {
        ENABLE_CAPABILITY_CHECK: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(result.output && result.output.command === input.command, 'Should echo input unchanged');
  }));

  results.push(await runTest('Warns on org mismatch but allows', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-org-'));
    const projectDir = path.join(tempRoot, 'instances', 'expected-org', 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const input = {
      command: 'sf data query --query "SELECT Id FROM Account" --target-org other-org'
    };

    const runHook = () => new Promise((resolve, reject) => {
      const proc = spawn('bash', [hookPath], {
        cwd: projectDir,
        env: {
          ...process.env,
          HOOK_TEST_MODE: '1',
          ENABLE_CAPABILITY_CHECK: '0'
        }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });

      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();

      proc.on('close', code => resolve({ code, stdout, stderr }));
      proc.on('error', err => reject(err));
    });

    try {
      const result = await runHook();
      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert(result.stderr.includes('ORG CONTEXT WARNING'), 'Should warn about org mismatch');
      const parsed = JSON.parse(result.stdout.trim());
      assert(parsed.command === input.command, 'Should echo input unchanged');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Blocks on org mismatch when strict', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-org-'));
    const projectDir = path.join(tempRoot, 'instances', 'expected-org', 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    const input = {
      command: 'sf data query --query "SELECT Id FROM Account" --target-org other-org'
    };

    const runHook = () => new Promise((resolve, reject) => {
      const proc = spawn('bash', [hookPath], {
        cwd: projectDir,
        env: {
          ...process.env,
          HOOK_TEST_MODE: '1',
          ENABLE_CAPABILITY_CHECK: '0',
          STRICT_ORG_VALIDATION: '1'
        }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });

      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();

      proc.on('close', code => resolve({ code, stdout, stderr }));
      proc.on('error', err => reject(err));
    });

    try {
      const result = await runHook();
      assert.strictEqual(result.code, 7, 'Should exit with validation error');
      assert(result.stderr.includes('ORG CONTEXT MISMATCH'), 'Should report org mismatch');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Warns when tooling object unavailable', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-org-'));
    const projectDir = path.join(tempRoot, 'instances', 'expected-org', 'project');
    const binDir = path.join(tempRoot, 'bin');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    const fakeSf = path.join(binDir, 'sf');
    fs.writeFileSync(
      fakeSf,
      '#!/usr/bin/env bash\necho \"{\\\"status\\\":1,\\\"message\\\":\\\"sObject type does not exist\\\"}\"\\n',
      'utf8'
    );
    fs.chmodSync(fakeSf, 0o755);

    const input = {
      command: 'sf data query --query \"SELECT Id FROM FlowDefinitionView\" --target-org expected-org'
    };

    const runHook = () => new Promise((resolve, reject) => {
      const proc = spawn('bash', [hookPath], {
        cwd: projectDir,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          HOOK_TEST_MODE: '1',
          ENABLE_CAPABILITY_CHECK: '1'
        }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });

      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();

      proc.on('close', code => resolve({ code, stdout, stderr }));
      proc.on('error', err => reject(err));
    });

    try {
      const result = await runHook();
      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert(result.stderr.includes('API CAPABILITY WARNING'), 'Should warn about capability');
      assert(result.stderr.includes('FlowDefinitionView'), 'Should mention object');
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
