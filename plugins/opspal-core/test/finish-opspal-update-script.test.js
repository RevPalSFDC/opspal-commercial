#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'finish-opspal-update.sh');

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function scaffoldWorkspace(options = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-opspal-update-'));
  const homeDir = path.join(tempRoot, 'home');
  const claudeDir = path.join(homeDir, '.claude');
  const pluginRoot = path.join(tempRoot, 'plugins', 'opspal-core');
  const libDir = path.join(pluginRoot, 'scripts', 'lib');
  const ciDir = path.join(pluginRoot, 'scripts', 'ci');

  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(ciDir, { recursive: true });
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(path.join(tempRoot, 'CLAUDE.md'), '# Test\n\nCRITICAL: Agent Routing Rules\n', 'utf8');
  fs.writeFileSync(path.join(pluginRoot, 'routing-index.json'), JSON.stringify({ agents: {} }), 'utf8');
  fs.writeFileSync(path.join(pluginRoot, '.claude-plugin', 'hooks.json'), '{"hooks":[]}\n', 'utf8');

  const staleSettings = {
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: '/tmp/opspal-core/hooks/unified-router.sh'
            }
          ]
        }
      ]
    }
  };
  if (options.existingStatusLine) {
    staleSettings.statusLine = options.existingStatusLine;
  }
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(staleSettings, null, 2) + '\n', 'utf8');

  writeExecutable(path.join(libDir, 'plugin-update-manager.js'), `#!/usr/bin/env node
process.exit(${options.pluginUpdateExitCode ?? 0});
`);
  writeExecutable(path.join(libDir, 'post-plugin-update-fixes.js'), `#!/usr/bin/env node
if (process.argv.includes('--verify-runtime')) {
  process.exit(${options.verifyRuntimeExitCode ?? 0});
}
process.exit(${options.fixScriptExitCode ?? 0});
`);
  writeExecutable(path.join(libDir, 'reconcile-hook-registration.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  writeExecutable(path.join(libDir, 'routing-state-manager.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  writeExecutable(path.join(libDir, 'routing-index-builder.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  writeExecutable(path.join(libDir, 'agent-alias-resolver.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  writeExecutable(path.join(libDir, 'hook-health-checker.js'), `#!/usr/bin/env node
process.exit(${options.hookHealthExitCode ?? 0});
`);
  writeExecutable(path.join(libDir, 'sync-claudemd.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  writeExecutable(path.join(pluginRoot, 'scripts', 'opspal-statusline.js'), '#!/usr/bin/env node\nconsole.log("OpsPal");\n');
  writeExecutable(path.join(libDir, 'routing-context-refresher.js'), `#!/usr/bin/env node
const fs = require('fs');
const output = process.argv.find((arg) => arg.startsWith('--output='));
if (output) {
  fs.mkdirSync(require('path').dirname(output.slice(9)), { recursive: true });
  fs.writeFileSync(output.slice(9), 'condensed');
}
process.exit(0);
`);
  writeExecutable(path.join(ciDir, 'validate-routing.sh'), `#!/usr/bin/env bash
exit ${options.routingValidateExitCode ?? 0}
`);

  return { tempRoot, homeDir, claudeDir };
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
  console.log('\n[Tests] finish-opspal-update.sh\n');

  const results = [];

  results.push(await runTest('Continues through warning paths and prints final summary', async () => {
    const { tempRoot, homeDir } = scaffoldWorkspace({
      pluginUpdateExitCode: 1,
      verifyRuntimeExitCode: 2,
      hookHealthExitCode: 2
    });

    try {
      const result = spawnSync('bash', [SCRIPT_PATH, '--skip-fix'], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.notStrictEqual(result.status, 0, 'Expected warning-path execution to return non-zero');
      assert(result.stdout.includes('🧹 Step 2'), 'Expected script to continue past Step 1');
      assert(result.stdout.includes('📝 Step 7'), 'Expected script to continue into later steps');
      assert(result.stdout.includes('Update Complete'), 'Expected final summary banner');
      assert(result.stdout.includes('Post-update tasks completed with some warnings.'), 'Expected warning summary text');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('--skip-fix reports stale hooks without mutating settings.json', async () => {
    const { tempRoot, homeDir, claudeDir } = scaffoldWorkspace();
    const settingsPath = path.join(claudeDir, 'settings.json');
    const before = fs.readFileSync(settingsPath, 'utf8');

    try {
      const result = spawnSync('bash', [SCRIPT_PATH, '--skip-fix'], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected report-only execution to succeed. stderr=${result.stderr}`);
      assert(
        result.stdout.includes('Found 1 stale plugin hook(s)') || result.stdout.includes('Stale hook cleanup check completed in report-only mode'),
        `Expected stale-hook report output. stdout=${result.stdout}`
      );
      assert(result.stdout.includes('Would activate OpsPal statusline') || result.stdout.includes('OpsPal statusline'), `Expected statusline report output. stdout=${result.stdout}`);
      assert.strictEqual(fs.readFileSync(settingsPath, 'utf8'), before, 'Expected --skip-fix to leave settings.json unchanged');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Resumes the persisted update session and emits a JSON finish report', async () => {
    const { tempRoot, homeDir } = scaffoldWorkspace();
    const sessionDir = path.join(homeDir, '.claude', 'session-context');
    const sessionPath = path.join(sessionDir, 'opspal-update-session.json');
    const otherCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-opspal-othercwd-'));

    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify({
        sessionId: 'session-123',
        workspaceRoot: tempRoot,
        finishPending: true,
        status: 'runner_generated',
        startReportFile: path.join(homeDir, '.claude', 'logs', 'opspal-update-start-last.json')
      }, null, 2) + '\n', 'utf8');

      const result = spawnSync('bash', [SCRIPT_PATH, '--skip-fix', '--json'], {
        cwd: otherCwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected JSON finish run to succeed. stderr=${result.stderr}`);
      const report = parseJson(result.stdout);
      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

      assert.strictEqual(report.status, 'finish_completed');
      assert.strictEqual(report.sessionId, 'session-123');
      assert.strictEqual(report.workspaceRoot, tempRoot);
      assert.strictEqual(report.resumedFromStartSession, true);
      assert.strictEqual(report.startSessionPending, true);
      assert(Array.isArray(report.steps), 'Expected finish report to include structured step results');
      assert.strictEqual(report.summary.stepCount, 10, `Expected ten recorded finish steps. report=${result.stdout}`);
      assert(report.steps.some((step) => step.key === 'step3-runtime-reconciliation'), 'Expected runtime reconciliation step metadata');
      assert(report.summary.rollbackCount >= 1, `Expected at least one rollback artifact in the report. report=${result.stdout}`);
      assert(fs.existsSync(report.reportFile), `Expected finish report to exist at ${report.reportFile}`);
      assert.strictEqual(session.finishPending, false, 'Expected finish run to clear finishPending');
      assert.strictEqual(session.finishStatus, 'finish_completed');
    } finally {
      fs.rmSync(otherCwd, { recursive: true, force: true });
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Treats persisted null claudeRootOverride as unset when resuming finish validation', async () => {
    const { tempRoot, homeDir } = scaffoldWorkspace();
    const sessionDir = path.join(homeDir, '.claude', 'session-context');
    const sessionPath = path.join(sessionDir, 'opspal-update-session.json');
    const otherCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-opspal-othercwd-'));

    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify({
        sessionId: 'session-null-root',
        workspaceRoot: tempRoot,
        claudeRootOverride: null,
        finishPending: true,
        status: 'runner_generated',
        startReportFile: path.join(homeDir, '.claude', 'logs', 'opspal-update-start-last.json')
      }, null, 2) + '\n', 'utf8');

      const result = spawnSync('bash', [SCRIPT_PATH, '--skip-fix', '--json'], {
        cwd: otherCwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected finish run to ignore null Claude root override. stderr=${result.stderr}`);
      const report = parseJson(result.stdout);
      assert.strictEqual(report.sessionId, 'session-null-root');
      assert.strictEqual(report.workspaceRoot, tempRoot);
    } finally {
      fs.rmSync(otherCwd, { recursive: true, force: true });
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Accepts routing index from installed marketplace path during routing promotion', async () => {
    const { tempRoot, homeDir } = scaffoldWorkspace();
    const workspaceIndexPath = path.join(tempRoot, 'plugins', 'opspal-core', 'routing-index.json');
    const marketplaceIndexPath = path.join(
      homeDir,
      '.claude',
      'plugins',
      'marketplaces',
      'opspal-commercial',
      'plugins',
      'opspal-core',
      'routing-index.json'
    );

    try {
      fs.rmSync(workspaceIndexPath, { force: true });
      fs.mkdirSync(path.dirname(marketplaceIndexPath), { recursive: true });
      fs.writeFileSync(marketplaceIndexPath, JSON.stringify({ agents: {} }), 'utf8');

      const result = spawnSync('bash', [SCRIPT_PATH, '--skip-fix', '--json'], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected finish validation to succeed. stderr=${result.stderr}`);
      const report = parseJson(result.stdout);
      const routingPromotionStep = report.steps.find((step) => step.key === 'step8-routing-promotion');

      assert(routingPromotionStep, 'Expected routing promotion step in finish report');
      assert.notStrictEqual(
        routingPromotionStep.status,
        'degraded',
        `Expected routing promotion to resolve installed routing index. report=${result.stdout}`
      );
      assert(
        !routingPromotionStep.message.includes('Routing index not found'),
        `Expected routing promotion message to avoid false missing-index warning. report=${result.stdout}`
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Backs up settings.json before mutating stale hook entries', async () => {
    const { tempRoot, homeDir, claudeDir } = scaffoldWorkspace();
    const settingsPath = path.join(claudeDir, 'settings.json');
    const backupDir = path.join(homeDir, '.claude', 'backups', 'opspal-update');
    const before = fs.readFileSync(settingsPath, 'utf8');

    try {
      const result = spawnSync('bash', [SCRIPT_PATH, '--workspace', tempRoot], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected mutation run to succeed. stderr=${result.stderr}`);
      assert(fs.existsSync(backupDir), `Expected backup directory to exist at ${backupDir}`);
      const backups = fs.readdirSync(backupDir);
      assert(backups.some((name) => name.startsWith('settings.json.settings-pre-finish.')), `Expected settings backup file. backups=${backups.join(',')}`);
      assert(result.stdout.includes('━━━ Step Results ━━━'), 'Expected finish summary to include structured step results');
      assert(result.stdout.includes('rollback:'), 'Expected finish summary to surface rollback restore paths');
      const after = fs.readFileSync(settingsPath, 'utf8');
      assert.notStrictEqual(after, before, 'Expected stale hook cleanup to mutate settings.json');
      assert(!after.includes('unified-router.sh'), 'Expected stale hook entry to be removed from settings.json');
      const settings = JSON.parse(after);
      assert.deepStrictEqual(settings.statusLine?.type, 'command', `Expected OpsPal statusline type to be command. settings=${after}`);
      assert(/opspal-statusline\.js/.test(settings.statusLine?.command || ''), `Expected OpsPal statusline command to be activated. settings=${after}`);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Preserves an unrelated custom statusLine instead of overwriting it', async () => {
    const customCommand = 'node /custom/statusline.js';
    const { tempRoot, homeDir, claudeDir } = scaffoldWorkspace({
      existingStatusLine: {
        type: 'command',
        command: customCommand
      }
    });
    const settingsPath = path.join(claudeDir, 'settings.json');

    try {
      const result = spawnSync('bash', [SCRIPT_PATH, '--workspace', tempRoot], {
        cwd: tempRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir
        }
      });

      assert.strictEqual(result.status, 0, `Expected run with custom statusline to succeed. stderr=${result.stderr}`);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.strictEqual(settings.statusLine?.command, customCommand, `Expected existing custom statusLine to remain unchanged. settings=${JSON.stringify(settings)}`);
      assert(result.stdout.includes('Preserved existing custom statusLine'), `Expected preserve message in output. stdout=${result.stdout}`);
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
