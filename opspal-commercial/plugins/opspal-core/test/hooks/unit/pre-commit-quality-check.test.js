#!/usr/bin/env node

/**
 * Unit Tests for pre-commit-quality-check.sh
 *
 * Validates staged-file detection and blocking of cross-boundary imports.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  'plugins/hooks/pre-commit-quality-check.sh'
);

function createTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-quality-'));
  execSync('git init', { cwd: repoRoot, stdio: 'ignore' });
  return repoRoot;
}

function runHook(repoRoot) {
  return spawnSync('bash', [HOOK_PATH], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_DIR: path.join(repoRoot, '.git'),
      GIT_WORK_TREE: repoRoot
    }
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
  console.log('\n[Tests] pre-commit-quality-check.sh Tests\n');

  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    assert(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const result = spawnSync('bash', ['-n', HOOK_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Handles no staged files gracefully', async () => {
    const repoRoot = createTempRepo();
    const result = runHook(repoRoot);
    fs.rmSync(repoRoot, { recursive: true, force: true });

    assert.strictEqual(result.status, 0, 'Should exit with 0');
    assert(
      result.stdout.includes('No files staged'),
      'Should report no files staged'
    );
  }));

  results.push(await runTest('Blocks cross-boundary imports', async () => {
    const repoRoot = createTempRepo();
    const filePath = path.join(repoRoot, '.claude-plugins', 'demo', 'README.md');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '@import ../.claude/SECRET.md\n');
    execSync('git add .', { cwd: repoRoot, stdio: 'ignore' });

    const result = runHook(repoRoot);
    fs.rmSync(repoRoot, { recursive: true, force: true });

    assert.strictEqual(result.status, 1, 'Should exit with 1');
    assert(
      result.stdout.includes('BLOCKED'),
      'Should report blocked commit'
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
