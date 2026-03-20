#!/usr/bin/env node

/**
 * Regression test for the /finishopspalupdate command wrapper.
 *
 * Validates that the first bash block remains quote-safe when executed through
 * `bash -c`, which is the path that previously failed on embedded single quotes.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const COMMAND_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/commands/finishopspalupdate.md');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/finish-opspal-update.sh');

function extractFirstBashBlock(markdown) {
  const match = markdown.match(/```bash\n([\s\S]*?)\n```/);
  assert(match, 'Expected finishopspalupdate.md to contain a bash code block');
  return match[1];
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
  console.log('\n[Tests] finishopspalupdate command wrapper Tests\n');

  const results = [];

  results.push(await runTest('Standalone finish script has valid bash syntax', async () => {
    assert(fs.existsSync(SCRIPT_PATH), 'finish-opspal-update.sh should exist');
    const result = spawnSync('bash', ['-n', SCRIPT_PATH], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'finish-opspal-update.sh should have valid bash syntax');
  }));

  results.push(await runTest('First bash block stays quote-safe under bash -c', async () => {
    const markdown = fs.readFileSync(COMMAND_PATH, 'utf8');
    const bashBlock = extractFirstBashBlock(markdown);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finishopspalupdate-command-'));
    const fakeScript = path.join(tempRoot, 'plugins/opspal-core/scripts/finish-opspal-update.sh');

    try {
      fs.mkdirSync(path.dirname(fakeScript), { recursive: true });
      fs.writeFileSync(
        fakeScript,
        '#!/usr/bin/env bash\nprintf "wrapper-ok:%s\\n" "$*"\n',
        'utf8'
      );

      assert(!bashBlock.includes("'"), 'First bash block should not contain single quotes that break bash -c');

      const result = spawnSync('bash', ['-c', bashBlock], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: path.join(tempRoot, 'home'),
          ARGUMENTS: '--skip-fix --strict'
        }
      });

      assert.strictEqual(result.status, 0, `Expected wrapper to exit 0, got ${result.status}: ${result.stderr}`);
      assert(
        result.stdout.includes('wrapper-ok:--skip-fix --strict'),
        `Expected wrapper to invoke the standalone script with parsed args. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`
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
