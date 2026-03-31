#!/usr/bin/env node

/**
 * Shell Robustness Tests
 *
 * Tests hooks under adverse runtime conditions: missing jq, missing
 * CLAUDE_PLUGIN_ROOT, missing HOME, missing sf CLI, non-existent TMPDIR.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const HOOKS = {
  sfDispatcher: 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh',
  contractValidation: 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh',
  hubspotCurl: 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh',
  marketoCurl: 'plugins/opspal-marketo/hooks/pre-bash-marketo-api.sh'
};

function hookExists(hookKey) {
  const hookPath = HOOKS[hookKey];
  const fullPath = path.isAbsolute(hookPath) ? hookPath : path.join(PROJECT_ROOT, hookPath);
  return fs.existsSync(fullPath);
}

function createTester(hookKey) {
  return new HookTester(HOOKS[hookKey], { timeout: 15000 });
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

// Build a PATH that excludes jq but keeps bash, node, and other essentials
function pathWithoutJq() {
  const dirs = (process.env.PATH || '').split(':');
  // Create a temp dir with symlinks to everything except jq
  const tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), 'no-jq-'));
  const essentials = ['bash', 'node', 'cat', 'grep', 'sed', 'printf', 'tr', 'head', 'env', 'test', 'mkdir', 'chmod'];

  for (const d of dirs) {
    try {
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        if (entry === 'jq') continue;
        const src = path.join(d, entry);
        const dest = path.join(tmpBin, entry);
        if (!fs.existsSync(dest)) {
          try { fs.symlinkSync(src, dest); } catch { /* ignore duplicates */ }
        }
      }
    } catch { /* dir not readable */ }
  }

  return tmpBin;
}

// Build a PATH that excludes sf/sfdx
function pathWithoutSf() {
  const dirs = (process.env.PATH || '').split(':');
  const filtered = dirs.filter(d => {
    try {
      return !fs.existsSync(path.join(d, 'sf')) && !fs.existsSync(path.join(d, 'sfdx'));
    } catch {
      return true;
    }
  });
  return filtered.join(':');
}

const SAFE_ENV = {
  HOOK_TEST_MODE: '1',
  ROUTING_ENFORCEMENT_ENABLED: '0',
  OVERRIDE_REASON: 'shell-robustness-test'
};

async function runAllTests() {
  console.log('\n[Tests] Shell Robustness Tests\n');

  const results = [];

  // =========================================================================
  // ROB-01: Missing jq — hooks that guard with jq check should exit 0
  // =========================================================================
  const noJqBinDir = pathWithoutJq();

  if (hookExists('contractValidation')) {
    results.push(await runTest('ROB-01a: Missing jq — contractValidation exits 0 with JSON warning', async () => {
      const tester = createTester('contractValidation');
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: { command: 'sf data query --target-org prod' }
        },
        env: {
          ...SAFE_ENV,
          PATH: noJqBinDir
        }
      });
      assert.strictEqual(result.exitCode, 0,
        'contractValidation must exit 0 when jq is missing');
      // It should emit a JSON warning about jq not being installed
      if (result.stdout.trim()) {
        assert(result.stdout.trim().startsWith('{'),
          'Stdout should be JSON even when jq is missing (hardcoded fallback)');
      }
    }));
  }

  if (hookExists('hubspotCurl')) {
    results.push(await runTest('ROB-01b: Missing jq — hubspotCurl exits 0', async () => {
      const tester = createTester('hubspotCurl');
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{}'`
          }
        },
        env: {
          ...SAFE_ENV,
          PATH: noJqBinDir
        }
      });
      // The hook sources classify-bash-command.sh which also uses jq-optional paths
      // But set -euo pipefail may cause it to fail if jq is used before the guard
      // This test documents the actual behavior
      assert.strictEqual(result.exitCode, 0,
        'hubspotCurl must exit 0 when jq is missing');
    }));
  }

  // Cleanup temp bin dir
  try { fs.rmSync(noJqBinDir, { recursive: true, force: true }); } catch { /* ignore */ }

  // =========================================================================
  // ROB-02: Missing sf CLI — environment detection graceful fallback
  // =========================================================================
  const noSfPath = pathWithoutSf();

  results.push(await runTest('ROB-02: Missing sf CLI — detect-environment falls back to alias', async () => {
    const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/detect-environment.sh');
    const result = spawnSync('bash', ['-c',
      `source "${LIB_PATH}"; detect_salesforce_environment "acme-prod"`
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: noSfPath,
        SALESFORCE_ENVIRONMENT: ''
      }
    });
    assert.strictEqual(result.status, 0, 'detect_salesforce_environment should succeed');
    assert.strictEqual(result.stdout.trim(), 'production',
      'Falls back to alias heuristics when sf CLI is missing');
  }));

  // =========================================================================
  // ROB-03: Non-existent TMPDIR
  // =========================================================================
  results.push(await runTest('ROB-03: Non-existent TMPDIR — cache miss is graceful', async () => {
    const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/detect-environment.sh');
    const result = spawnSync('bash', ['-c',
      `source "${LIB_PATH}"; read_cached_salesforce_environment "my-org"`
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TMPDIR: '/nonexistent/path/that/does/not/exist'
      }
    });
    assert.strictEqual(result.status, 0, 'read_cached_salesforce_environment should succeed');
    assert.strictEqual(result.stdout.trim(), 'unknown',
      'Non-existent TMPDIR should return unknown (cache miss)');
  }));

  // =========================================================================
  // ROB-04: Missing HOME directory — hooks that write to ~/.claude/
  // =========================================================================
  if (hookExists('contractValidation')) {
    results.push(await runTest('ROB-04: Missing HOME — contractValidation exits 0', async () => {
      const tester = createTester('contractValidation');
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: { command: 'echo hello' }
        },
        env: {
          ...SAFE_ENV,
          HOME: '/nonexistent/home/path'
        }
      });
      assert.strictEqual(result.exitCode, 0,
        'contractValidation must exit 0 with nonexistent HOME');
    }));
  }

  // =========================================================================
  // ROB-05: Read-only log directory
  // =========================================================================
  results.push(await runTest('ROB-05: Read-only log directory — no crash on write failure', async () => {
    if (!hookExists('contractValidation')) return;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robustness-'));
    const logDir = path.join(tmpDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    // Make log dir read-only
    fs.chmodSync(logDir, 0o444);

    const tester = createTester('contractValidation');
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' }
      },
      env: {
        ...SAFE_ENV,
        HOME: tmpDir,
        CLAUDE_HOOK_LOG_ROOT: logDir
      }
    });
    assert.strictEqual(result.exitCode, 0,
      'contractValidation must not crash when log directory is read-only');

    // Cleanup
    fs.chmodSync(logDir, 0o755);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }));

  // =========================================================================
  // ROB-06: Missing CLAUDE_PLUGIN_ROOT — fallback to SCRIPT_DIR
  // =========================================================================
  if (hookExists('hubspotCurl')) {
    results.push(await runTest('ROB-06: Missing CLAUDE_PLUGIN_ROOT — hubspotCurl uses SCRIPT_DIR', async () => {
      const tester = createTester('hubspotCurl');
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: { command: 'curl -s https://api.hubapi.com/crm/v3/objects/contacts/123' }
        },
        env: {
          HOOK_TEST_MODE: '1'
          // No CLAUDE_PLUGIN_ROOT — hook should derive from SCRIPT_DIR
        }
      });
      assert.strictEqual(result.exitCode, 0,
        'hubspotCurl must exit 0 without CLAUDE_PLUGIN_ROOT');
    }));
  }

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
