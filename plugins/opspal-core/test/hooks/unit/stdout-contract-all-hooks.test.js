#!/usr/bin/env node

/**
 * Stdout Contract Sweep — All PreToolUse Hooks
 *
 * Systematically verifies that every PreToolUse hook across all plugins
 * emits JSON or empty stdout — no ANSI codes, no banner text, no log lines.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins');

// Discover all pre-* hooks across all plugins
function discoverPreToolUseHooks() {
  const hooks = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    const fullPath = path.join(PLUGINS_DIR, d);
    return fs.statSync(fullPath).isDirectory() && d.startsWith('opspal-');
  });

  for (const plugin of pluginDirs) {
    const hooksDir = path.join(PLUGINS_DIR, plugin, 'hooks');
    if (!fs.existsSync(hooksDir)) continue;

    const entries = fs.readdirSync(hooksDir).filter(f =>
      f.startsWith('pre-') && f.endsWith('.sh') && !f.endsWith('.disabled')
    );

    for (const hookFile of entries) {
      const fullPath = path.join(hooksDir, hookFile);
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        hooks.push({
          plugin,
          name: hookFile,
          path: path.relative(PROJECT_ROOT, fullPath),
          fullPath
        });
      } catch {
        // Not executable, skip
      }
    }
  }

  return hooks;
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

const SAFE_ENV = {
  HOOK_TEST_MODE: '1',
  ROUTING_ENFORCEMENT_ENABLED: '0',
  OVERRIDE_REASON: 'stdout-contract-test',
  TASK_GRAPH_ENABLED: '0',
  BASH_BUDGET_ENABLED: '0'
};

// Hooks that are known child hooks (invoked by dispatchers, not standalone PreToolUse)
// or have known dependencies that make them fail under minimal isolated input.
// These are tracked as findings, not hard failures.
const KNOWN_CHILD_OR_DEPENDENT_HOOKS = new Set([
  'pre-commit-config-validation.sh', // Not a PreToolUse hook — runs as git pre-commit
  'pre-fireflies-api-call.sh',       // Requires Fireflies MCP context
  'pre-gong-api-call.sh',            // Requires Gong MCP context
  'pre-operation-idempotency-check.sh', // Requires operation context
  'pre-session-path-validator.sh',    // SessionStart hook, not PreToolUse
  'pre-batch-validation.sh',         // Child hook invoked by SF dispatcher
  'pre-flow-deployment.sh',          // Child hook invoked by SF dispatcher
  'pre-high-risk-operation.sh',      // Child hook invoked by SF dispatcher
  'pre-picklist-dependency-validation.sh', // Requires deploy context
  'pre-sfdc-metadata-manager-invocation.sh', // Requires Agent context
  'pre-task-hook.sh',                // Legacy PreTask hook
  'pre-territory-write-validator.sh'  // Requires territory context
]);

async function runAllTests() {
  console.log('\n[Tests] Stdout Contract Sweep — All PreToolUse Hooks\n');

  const hooks = discoverPreToolUseHooks();
  console.log(`  Discovered ${hooks.length} PreToolUse hooks across ${new Set(hooks.map(h => h.plugin)).size} plugins\n`);

  const results = [];
  const warnings = [];
  const findings = [];

  for (const hook of hooks) {
    const isKnownChild = KNOWN_CHILD_OR_DEPENDENT_HOOKS.has(hook.name);
    const testName = `${hook.plugin}/${hook.name}: stdout contract`;

    if (isKnownChild) {
      // Track as finding, not hard failure
      results.push(await runTest(`${testName} (known child/dependent — finding)`, async () => {
        let tester;
        try {
          tester = new HookTester(hook.path, { timeout: 10000 });
        } catch (e) {
          findings.push(`${hook.plugin}/${hook.name}: Could not create tester — ${e.message}`);
          return;
        }

        const result = await tester.run({
          input: { tool_name: 'Bash', tool_input: { command: 'echo test' } },
          env: SAFE_ENV
        });

        if (result.exitCode !== 0 || (result.stdout.trim() && !result.stdout.trim().startsWith('{'))) {
          findings.push(`${hook.plugin}/${hook.name}: exit=${result.exitCode}, stdout=${result.stdout.trim().substring(0, 80) || '(empty)'}`);
        }
        // Always pass — these are findings, not failures
      }));
      continue;
    }

    results.push(await runTest(testName, async () => {
      let tester;
      try {
        tester = new HookTester(hook.path, { timeout: 10000 });
      } catch (e) {
        warnings.push(`${hook.plugin}/${hook.name}: Could not create tester — ${e.message}`);
        return; // Skip, don't fail
      }

      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: { command: 'echo test' }
        },
        env: SAFE_ENV
      });

      // Contract: exit 0
      assert.strictEqual(result.exitCode, 0,
        `${hook.name} must exit 0 (got ${result.exitCode})`);

      const trimmed = result.stdout.trim();

      if (!trimmed) {
        // Empty stdout is valid (no-op)
        return;
      }

      // Contract: stdout must be JSON (starts with '{')
      assert(trimmed.startsWith('{'),
        `${hook.name} stdout must be JSON or empty, got: ${trimmed.substring(0, 100)}`);

      // Contract: no ANSI escape codes
      assert(!/\x1b\[/.test(result.stdout),
        `${hook.name} stdout must not contain ANSI escape codes`);

      // Contract: stdout must parse as JSON
      try {
        JSON.parse(trimmed);
      } catch (e) {
        assert.fail(`${hook.name} stdout starts with '{' but is not valid JSON: ${e.message}`);
      }
    }));
  }

  // Print findings for known child/dependent hooks
  if (findings.length > 0) {
    console.log('\n  Findings (known child/dependent hooks — not standalone):');
    for (const f of findings) {
      console.log(`    FINDING: ${f}`);
    }
  }

  // Print warnings for hooks that couldn't be tested
  if (warnings.length > 0) {
    console.log('\n  Warnings (hooks that could not be evaluated):');
    for (const w of warnings) {
      console.log(`    WARNING: ${w}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed (${findings.length} findings, ${warnings.length} warnings)\n`);

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
