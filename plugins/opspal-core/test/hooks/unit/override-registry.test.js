#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadOverrideRegistry,
  recordSessionOverrideAudit,
  readSessionOverrideAudit
} = require('../../../scripts/lib/override-registry');

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'override-registry-home-'));
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
  console.log('\n[Tests] override-registry.js\n');

  const results = [];

  results.push(await runTest('Loads the override registry with routing enforcement entry', async () => {
    const registry = loadOverrideRegistry();
    const routingOverride = registry.overrides.find((override) => override.id === 'routing_enforcement_disabled');

    assert(registry.overrides.length > 0, 'Registry should contain overrides');
    assert(routingOverride, 'Registry should include routing enforcement override');
    assert.strictEqual(routingOverride.reason_required, true, 'Routing override should require a reason');
  }));

  results.push(await runTest('Records active overrides and logs routing warning events', async () => {
    const home = createTempHome();
    const sessionId = `override-audit-${Date.now()}`;
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = home;

      const audit = recordSessionOverrideAudit({
        sessionId,
        homeDir: home,
        env: {
          ...process.env,
          HOME: home,
          CLAUDE_SESSION_ID: sessionId,
          ROUTING_ENFORCEMENT_ENABLED: '0'
        }
      });

      assert.strictEqual(audit.summary.activeCount, 1, 'Should record one active override');
      assert.strictEqual(audit.summary.warningCount, 1, 'Should warn when OVERRIDE_REASON is missing');
      assert.strictEqual(audit.activeOverrides[0].envVar, 'ROUTING_ENFORCEMENT_ENABLED', 'Should capture routing override');
      assert.strictEqual(audit.warnings[0].code, 'OVERRIDE_REASON_MISSING', 'Should emit OVERRIDE_REASON warning');
      assert(audit.auditFile && fs.existsSync(audit.auditFile), 'Should persist session audit');

      const storedAudit = readSessionOverrideAudit({ sessionId, homeDir: home });
      assert.strictEqual(storedAudit.summary.activeCount, 1, 'Stored audit should preserve active count');

      assert(Array.isArray(audit.loggedEvents), 'Should return logged routing events');
      assert(audit.loggedEvents.some((entry) => entry.type === 'override_audit'), 'Should log override_audit event');
      assert(audit.loggedEvents.some((entry) => entry.type === 'override_warning'), 'Should log override_warning event');
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      fs.rmSync(home, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Suppresses missing-reason warning when OVERRIDE_REASON is present', async () => {
    const home = createTempHome();
    const sessionId = `override-reason-${Date.now()}`;
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = home;

      const audit = recordSessionOverrideAudit({
        sessionId,
        homeDir: home,
        env: {
          ...process.env,
          HOME: home,
          CLAUDE_SESSION_ID: sessionId,
          ROUTING_ENFORCEMENT_ENABLED: '0',
          OVERRIDE_REASON: 'Incident response drill'
        }
      });

      assert.strictEqual(audit.summary.activeCount, 1, 'Should still record the override');
      assert.strictEqual(audit.summary.warningCount, 0, 'Should not warn when OVERRIDE_REASON is set');
      assert.strictEqual(audit.activeOverrides[0].reason, 'Incident response drill', 'Should capture override reason');
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

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
