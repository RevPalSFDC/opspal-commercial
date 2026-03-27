#!/usr/bin/env node

/**
 * Unit Tests for task-graph-policy-enforcer.sh
 *
 * Syntax validation + allow-path validation (safe, non-executing).
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/task-graph-policy-enforcer.sh');

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
  console.log('\n[Tests] task-graph-policy-enforcer.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Allows read-only tool without enforcement', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH, 'Read', '{}'], {
      encoding: 'utf8',
      input: '{}',
      env: { ...process.env, HOME: tempHome }
    });

    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Should allow read-only tool');
  }));

  results.push(await runTest('Does not fail when preferred log root is unwritable', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'Read', '{}'], {
      encoding: 'utf8',
      input: '{}',
      env: {
        ...process.env,
        CLAUDE_HOOK_LOG_ROOT: '/proc/1/forbidden-log-root'
      }
    });

    assert.strictEqual(result.status, 0, 'Should allow execution using fallback log root');
  }));

  results.push(await runTest('Reads live stdin tool payloads without CLI args', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' }
      }),
      env: { ...process.env, HOME: tempHome }
    });

    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Should allow execution from live stdin payloads');
  }));

  results.push(await runTest('Allows OpsPal runtime maintenance bash payloads', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const command = [
      'CLAUDE_ROOTS=("/home/revpal/.claude" "/mnt/c/Users/revpal/.claude")',
      'UPDATE_SCRIPT=$(find_script "plugin-update-manager.js")',
      'HOOK_RECONCILE_SCRIPT=$(find_script "reconcile-hook-registration.js")',
      'HOOK_HEALTH_SCRIPT=$(find_script "hook-health-checker.js")',
      'STATE_SCRIPT=$(find_script "routing-state-manager.js")',
      'ROUTING_VALIDATOR=$(find_ci_script "validate-routing.sh")',
      'SETTINGS_FILE="$HOME/.claude/settings.json"',
      'node "$UPDATE_SCRIPT" --fix',
      'node "$HOOK_RECONCILE_SCRIPT" --project-root "$PWD"',
      'node "$HOOK_HEALTH_SCRIPT" --quick --format json',
      'node "$STATE_SCRIPT" clear-expired',
      'bash "$ROUTING_VALIDATOR"',
      'rm -rf "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core/2.42.10"'
    ].join(' && ');

    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command }
      }),
      env: { ...process.env, HOME: tempHome }
    });

    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Should allow OpsPal runtime maintenance commands');
  }));

  results.push(await runTest('Still blocks raw cache purge commands outside OpsPal maintenance flow', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf "$HOME/.claude/plugins/cache"' }
      }),
      env: { ...process.env, HOME: tempHome }
    });

    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 3, 'Should continue blocking raw cache purge commands');
    assert(result.stderr.includes('BLOCKED: Matches forbidden pattern: rm -rf'), 'Should report the blocked rm -rf pattern');
  }));


  // ==========================================================================
  // Production detection + read-only allowlist tests
  // ==========================================================================

  results.push(await runTest('Allows read-only sf data query on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sf data query --query "SELECT Id FROM Account" --target-org aspireiq-production --json' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Read-only query on production should be allowed');
  }));

  results.push(await runTest('Allows read-only sfdx data query on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sfdx data query --query "SELECT Id FROM Account" --target-org production --json' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Read-only sfdx query on production should be allowed');
  }));

  results.push(await runTest('Allows sf sobject describe on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sf sobject describe Account --target-org production --json' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'sobject describe on production should be allowed');
  }));

  results.push(await runTest('Allows sf project retrieve on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sf project retrieve start --metadata CustomObject:Account --target-org production' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Retrieve on production should be allowed');
  }));

  results.push(await runTest('Escalates sf project deploy on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sf project deploy start --source-dir force-app --target-org production' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 2, 'Deploy to production should trigger escalation (exit 2)');
    assert(result.stderr.includes('PRODUCTION_DETECTED'), 'Should report production detection');
  }));

  results.push(await runTest('Escalates sf data delete on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sf data delete record --sobject Account --record-id 001xx --target-org prod-org' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 2, 'Data delete on production should trigger escalation (exit 2)');
  }));

  results.push(await runTest('Allows sf data query on sandbox org (no prod detection)', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'sf data query --query "SELECT Id FROM Account" --target-org sandbox-dev --json' }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 0, 'Sandbox query should pass through without escalation');
  }));

  results.push(await runTest('Escalates disguised mutation hidden in a production pipeline', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: {
          command: 'sf data query --query "SELECT Id FROM Account" --target-org production --json | xargs sf data delete bulk --sobject Account --target-org production'
        }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 2, 'Pipeline-hidden mutation on production should escalate');
    assert(result.stderr.includes('PRODUCTION_DETECTED'), 'Should report production detection for hidden mutation');
  }));

  results.push(await runTest('Escalates eval-wrapped mutation on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: {
          command: 'CMD="sf data delete bulk --sobject Account --target-org production"; eval "$CMD"'
        }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 2, 'eval-wrapped mutation on production should escalate');
    assert(result.stderr.includes('PRODUCTION_DETECTED'), 'Should report production detection for eval-wrapped mutation');
  }));

  results.push(await runTest('Denies ambiguous command-substitution query on production org', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
    const result = spawnSync('bash', [HOOK_PATH], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: {
          command: 'RESULT=$(sf data query --query "SELECT Id FROM Account" --target-org production --json); echo "$RESULT"'
        }
      }),
      env: { ...process.env, HOME: tempHome }
    });
    fs.rmSync(tempHome, { recursive: true, force: true });
    assert.strictEqual(result.status, 2, 'Ambiguous wrapped query on production should not be allowed');
    assert(result.stderr.includes('PRODUCTION_DETECTED'), 'Ambiguous wrapped query should be escalated at the higher-risk tier');
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`
Results: ${passed} passed, ${failed} failed
`);

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
