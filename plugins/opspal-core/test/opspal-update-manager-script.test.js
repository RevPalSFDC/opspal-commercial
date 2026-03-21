#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'opspal-update-manager.sh');

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function scaffoldWorkspace() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-update-manager-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const homeDir = path.join(tempRoot, 'home');
  const claudeRoot = path.join(homeDir, '.claude');
  const binDir = path.join(tempRoot, 'bin');
  const pluginRoot = path.join(workspaceRoot, 'plugins', 'opspal-core');

  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(claudeRoot, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  fs.writeFileSync(
    path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'opspal-core', version: '9.9.9' }, null, 2) + '\n',
    'utf8'
  );

  writeExecutable(path.join(binDir, 'claude'), `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "auth" ] && [ "\${2:-}" = "status" ]; then
  echo '{"loggedIn":true}'
  exit 0
fi
if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "install" ]; then
  echo "installed \${3:-unknown}"
  exit 0
fi
echo "unsupported claude invocation: $*" >&2
exit 1
`);

  return { tempRoot, workspaceRoot, homeDir, claudeRoot, binDir };
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
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
  console.log('\n[Tests] opspal-update-manager.sh\n');

  const results = [];

  results.push(await runTest('External mode writes a resumable JSON session report', async () => {
    const { tempRoot, workspaceRoot, homeDir, claudeRoot, binDir } = scaffoldWorkspace();

    try {
      const result = spawnSync(
        'bash',
        [SCRIPT_PATH, '--mode', 'external', '--skip-confirm', '--json', '--workspace', workspaceRoot, '--claude-root', claudeRoot],
        {
          cwd: workspaceRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: homeDir,
            PATH: `${binDir}:${process.env.PATH || ''}`
          }
        }
      );

      assert.strictEqual(result.status, 0, `Expected external mode to succeed. stderr=${result.stderr}`);
      const report = parseJson(result.stdout);
      const sessionPath = path.join(homeDir, '.claude', 'session-context', 'opspal-update-session.json');

      assert.strictEqual(report.status, 'runner_generated');
      assert.strictEqual(report.workspaceRoot, workspaceRoot);
      assert.strictEqual(report.claudeRootOverride, claudeRoot);
      assert.strictEqual(report.requiresFinish, true);
      assert(Array.isArray(report.claudeRoots) && report.claudeRoots.includes(claudeRoot), `Expected report to include the resolved Claude root. report=${result.stdout}`);
      assert(Array.isArray(report.selectedPlugins) && report.selectedPlugins.includes('opspal-core'), `Expected selected plugin list in the report. report=${result.stdout}`);
      assert(report.runnerPath, 'Expected a runner path in the JSON report');
      assert(fs.existsSync(report.runnerPath), `Expected generated runner to exist at ${report.runnerPath}`);
      assert(fs.existsSync(report.reportFile), `Expected start report to exist at ${report.reportFile}`);
      assert(fs.existsSync(sessionPath), `Expected session file to exist at ${sessionPath}`);

      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      assert.strictEqual(session.finishPending, true, 'Expected start session to require /finishopspalupdate');
      assert.strictEqual(session.runnerPath, report.runnerPath);
      assert.strictEqual(session.workspaceRoot, workspaceRoot);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Preflight mode validates the workspace and exits without requiring finish', async () => {
    const { tempRoot, workspaceRoot, homeDir, claudeRoot, binDir } = scaffoldWorkspace();

    try {
      const result = spawnSync(
        'bash',
        [SCRIPT_PATH, '--preflight', '--json', '--workspace', workspaceRoot, '--claude-root', claudeRoot],
        {
          cwd: workspaceRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: homeDir,
            PATH: `${binDir}:${process.env.PATH || ''}`
          }
        }
      );

      assert.strictEqual(result.status, 0, `Expected preflight mode to succeed. stderr=${result.stderr}`);
      const report = parseJson(result.stdout);
      const sessionPath = path.join(homeDir, '.claude', 'session-context', 'opspal-update-session.json');
      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      assert.strictEqual(report.status, 'preflight_passed');
      assert.strictEqual(report.requiresFinish, false);
      assert.strictEqual(report.workspaceRoot, workspaceRoot);
      assert.strictEqual(report.claudeRootOverride, claudeRoot);
      assert(Array.isArray(report.claudeRoots) && report.claudeRoots.includes(claudeRoot), `Expected preflight report to include the resolved Claude root. report=${result.stdout}`);
      assert(Array.isArray(report.selectedPlugins) && report.selectedPlugins.includes('opspal-core'), `Expected discovered plugin list in preflight report. report=${result.stdout}`);
      assert.strictEqual(session.finishPending, false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Refuses to start when the update lock is already held', async () => {
    const { tempRoot, workspaceRoot, homeDir } = scaffoldWorkspace();
    const lockDir = path.join(homeDir, '.claude', 'locks', 'opspal-update.lock');

    try {
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, 'pid'), `${process.pid}\n`, 'utf8');

      const result = spawnSync(
        'bash',
        [SCRIPT_PATH, '--dry-run', '--json', '--workspace', workspaceRoot],
        {
          cwd: workspaceRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: homeDir
          }
        }
      );

      assert.strictEqual(result.status, 1, `Expected lock contention to return 1. stderr=${result.stderr}`);
      const report = parseJson(result.stdout);
      assert.strictEqual(report.status, 'lock_unavailable');
      assert(report.message.includes('already running'), `Expected lock warning message. report=${result.stdout}`);
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
