#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-session-silent-failure-check.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pre-session-silent-failure-home-'));
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
  console.log('\n[Tests] pre-session-silent-failure-check.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Audits active global overrides and records missing OVERRIDE_REASON', async () => {
    const home = createTempHome();
    const sessionId = `session-start-audit-${Date.now()}`;

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'SessionStart'
        },
        env: {
          HOME: home,
          CLAUDE_SESSION_ID: sessionId,
          ROUTING_ENFORCEMENT_ENABLED: '0'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Hook should exit with 0');
      assert.strictEqual(result.parseError, null, 'Hook should emit JSON');
      assert(
        result.output?.systemMessage?.includes('SILENT FAILURE WARNING'),
        'Hook should surface the critical silent failure warning'
      );
      assert(
        result.output?.systemMessage?.includes('ROUTING_ENFORCEMENT_ENABLED'),
        'Hook warning should mention the routing override'
      );

      const auditPath = path.join(home, '.claude', 'logs', 'override-audits', `${sessionId}.json`);
      assert(fs.existsSync(auditPath), 'Should persist session override audit');

      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      assert.strictEqual(audit.summary.activeCount, 1, 'Should record one active override');
      assert.strictEqual(audit.summary.warningCount, 1, 'Should record one missing-reason warning');

      const logPath = path.join(home, '.claude', 'logs', 'silent-failure-session.log');
      const logContent = fs.readFileSync(logPath, 'utf8');
      assert(logContent.includes('Session override audit:'), 'Should log session override audit summary');
      assert(logContent.includes('Override warning:'), 'Should log override warning detail');

      const routingMetricsPath = path.join(home, '.claude', 'logs', 'routing-decisions.jsonl');
      const metricsContent = fs.readFileSync(routingMetricsPath, 'utf8');
      assert(metricsContent.includes('"type":"override_warning"'), 'Should flag override warning in routing metrics');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
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
