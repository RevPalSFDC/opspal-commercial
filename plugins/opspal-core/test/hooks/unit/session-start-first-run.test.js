#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/session-start-first-run.sh');

function createTester() {
  return new HookTester('plugins/opspal-core/hooks/session-start-first-run.sh', {
    timeout: 10000,
    verbose: process.env.VERBOSE === '1'
  });
}

function writeValidLicenseCache(homeDir) {
  const opspalDir = path.join(homeDir, '.opspal');
  fs.mkdirSync(opspalDir, { recursive: true });
  fs.writeFileSync(path.join(opspalDir, 'license-cache.json'), JSON.stringify({
    valid: true,
    license_key: 'OPSPAL-PRO-123456',
    tier: 'professional',
    organization: 'Acme Corp',
    allowed_asset_tiers: ['core'],
    key_bundle_version: 2,
    grace_until: '2099-01-01T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    key_bundle: {
      version: 2,
      keys: {
        core: Buffer.alloc(32, 1).toString('base64')
      }
    }
  }, null, 2));
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
  console.log('\n[Tests] session-start-first-run.sh Tests\n');

  const results = [];
  const tester = createTester();

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Startup emits onboarding guidance when activation and initialization are missing', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-home-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-workspace-'));
    const envFile = path.join(tempHome, 'claude-env.sh');

    const result = await tester.run({
      input: {
        hook_event_name: 'SessionStart',
        source: 'startup',
        cwd: workspaceDir
      },
      env: {
        HOME: tempHome,
        CLAUDE_ENV_FILE: envFile
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should exit 0');
    assert.strictEqual(result.output.systemMessage.includes('/activate-license'), true, 'System message should point to activation');
    assert.strictEqual(result.output.hookSpecificOutput.hookEventName, 'SessionStart', 'Hook output should be for SessionStart');
    assert.strictEqual(result.output.hookSpecificOutput.additionalContext.includes('/initialize'), true, 'Additional context should mention initialization');
    assert.strictEqual(fs.readFileSync(envFile, 'utf8').includes('OPSPAL_FIRST_RUN_MODE'), true, 'Hook should persist first-run env vars');
  }));

  results.push(await runTest('Clear sessions return empty output even when onboarding is incomplete', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-home-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-workspace-'));

    const result = await tester.run({
      input: {
        hook_event_name: 'SessionStart',
        source: 'clear',
        cwd: workspaceDir
      },
      env: {
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should exit 0');
    assert.deepStrictEqual(result.output, {}, 'Clear sessions should not inject onboarding guidance');
  }));

  results.push(await runTest('Ready workspaces stay silent on startup', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-home-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-workspace-'));
    writeValidLicenseCache(tempHome);
    fs.writeFileSync(path.join(workspaceDir, 'CLAUDE.md'), '# Ready\n');

    const result = await tester.run({
      input: {
        hook_event_name: 'SessionStart',
        source: 'startup',
        cwd: workspaceDir
      },
      env: {
        HOME: tempHome
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should exit 0');
    assert.deepStrictEqual(result.output, {}, 'Ready workspaces should not inject onboarding guidance');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
