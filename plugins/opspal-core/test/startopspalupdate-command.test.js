#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const COMMAND_PATH = path.join(PROJECT_ROOT, 'commands', 'startopspalupdate.md');

function extractFirstBashBlock(markdown) {
  const match = markdown.match(/```bash\n([\s\S]*?)\n```/);
  assert(match, 'Expected startopspalupdate.md to contain a bash code block');
  return match[1];
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
  console.log('\n[Tests] startopspalupdate command wrapper\n');

  const results = [];

  results.push(await runTest('First bash block stays quote-safe under bash -c', async () => {
    const markdown = fs.readFileSync(COMMAND_PATH, 'utf8');
    const bashBlock = extractFirstBashBlock(markdown);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'startopspalupdate-command-'));
    const fakeScript = path.join(tempRoot, 'plugins', 'opspal-core', 'scripts', 'opspal-update-manager.sh');

    try {
      fs.mkdirSync(path.dirname(fakeScript), { recursive: true });
      fs.writeFileSync(fakeScript, '#!/usr/bin/env bash\nprintf "wrapper-ok:%s\\n" "$*"\n', 'utf8');
      fs.chmodSync(fakeScript, 0o755);

      assert(!bashBlock.includes("'"), 'First bash block should not contain single quotes that break bash -c');

      const result = spawnSync('bash', ['-c', bashBlock], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: path.join(tempRoot, 'home'),
          ARGUMENTS: '--dry-run --only opspal-core --skip-confirm'
        }
      });

      assert.strictEqual(result.status, 0, `Expected wrapper to exit 0, got ${result.status}: ${result.stderr}`);
      assert(
        result.stdout.includes('wrapper-ok:--dry-run --only opspal-core --skip-confirm'),
        `Expected wrapper to invoke the update script with parsed args. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Can resolve script from direct ~/.claude/plugins install path', async () => {
    const markdown = fs.readFileSync(COMMAND_PATH, 'utf8');
    const bashBlock = extractFirstBashBlock(markdown);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'startopspalupdate-home-'));
    const homeDir = path.join(tempRoot, 'home');
    const fakeScript = path.join(homeDir, '.claude', 'plugins', 'opspal-core', 'scripts', 'opspal-update-manager.sh');

    try {
      fs.mkdirSync(path.dirname(fakeScript), { recursive: true });
      fs.writeFileSync(fakeScript, '#!/usr/bin/env bash\necho "home-path-ok"\n', 'utf8');
      fs.chmodSync(fakeScript, 0o755);

      const result = spawnSync('bash', ['-c', bashBlock], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected wrapper to resolve home install path. stderr=${result.stderr}`);
      assert(result.stdout.includes('home-path-ok'), `Expected home install path script to run. stdout=${result.stdout}`);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Passes workspace, Claude root, and JSON flags through to the script', async () => {
    const markdown = fs.readFileSync(COMMAND_PATH, 'utf8');
    const bashBlock = extractFirstBashBlock(markdown);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'startopspalupdate-flags-'));
    const fakeScript = path.join(tempRoot, 'plugins', 'opspal-core', 'scripts', 'opspal-update-manager.sh');

    try {
      fs.mkdirSync(path.dirname(fakeScript), { recursive: true });
      fs.writeFileSync(fakeScript, '#!/usr/bin/env bash\nprintf "wrapper-flags:%s\\n" "$*"\n', 'utf8');
      fs.chmodSync(fakeScript, 0o755);

      const result = spawnSync('bash', ['-c', bashBlock], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: path.join(tempRoot, 'home'),
          ARGUMENTS: '--preflight --json --workspace /tmp/test-workspace --claude-root /tmp/test-claude'
        }
      });

      assert.strictEqual(result.status, 0, `Expected wrapper to pass through extended flags. stderr=${result.stderr}`);
      assert(
        result.stdout.includes('wrapper-flags:--preflight --json --workspace /tmp/test-workspace --claude-root /tmp/test-claude'),
        `Expected wrapper to preserve extended flags. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
