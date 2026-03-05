#!/usr/bin/env node

/**
 * Unit Tests for pre-agent-load.sh
 *
 * Validates MCP extraction and error handling for missing agent files.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/scripts/hooks/pre-agent-load.sh'
);

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
  console.log('\n[Tests] pre-agent-load.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Extracts required MCP servers', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-load-'));
    const agentFile = path.join(tempDir, 'agent.md');
    fs.writeFileSync(
      agentFile,
      [
        '---',
        'name: demo-agent',
        'requiresMcp: ["playwright", "other"]',
        '---',
        'Body'
      ].join('\n')
    );

    const result = spawnSync('bash', [HOOK_PATH, 'demo-agent', agentFile], {
      encoding: 'utf8'
    });

    fs.rmSync(tempDir, { recursive: true, force: true });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    const match = result.stdout.match(/LOAD_MCP_SERVERS=\"([^\"]*)\"/);
    assert(match, 'Should export LOAD_MCP_SERVERS');
    const normalized = match[1].trim().split(/\s+/).join(' ');
    assert.strictEqual(
      normalized,
      'playwright other',
      'Should export required MCP servers'
    );
  }));

  results.push(await runTest('Fails when agent file missing', async () => {
    const result = spawnSync('bash', [HOOK_PATH, 'demo-agent', '/tmp/nope.md'], {
      encoding: 'utf8'
    });

    assert.strictEqual(result.status, 1, 'Should exit with 1');
    assert(
      result.stderr.includes('Agent file not found'),
      'Should report missing agent file'
    );
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
