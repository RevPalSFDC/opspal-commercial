#!/usr/bin/env node

/**
 * sfdx Variant Coverage Test
 *
 * Ensures all hooks that handle sf CLI commands also handle sfdx commands
 * with identical behavior (same exit code). This prevents sfdx bypass gaps
 * by automatically testing both prefixes.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { HookTester, sfVariants } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

// Hooks that handle SF CLI commands and their test payloads
const SF_CLI_HOOKS = [
  {
    name: 'pre-bash-dispatcher',
    path: 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh',
    commands: [
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json',
      'sf project deploy start --source-dir force-app --target-org sandbox',
      'sf sobject describe Account --target-org sandbox --json'
    ]
  },
  {
    name: 'post-bash-dispatcher',
    path: 'plugins/opspal-salesforce/hooks/post-bash-dispatcher.sh',
    commands: [
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json',
      'sf project deploy start --source-dir force-app --target-org sandbox'
    ]
  },
  {
    name: 'pre-operation-org-validation',
    path: 'plugins/opspal-salesforce/hooks/pre-operation-org-validation.sh',
    commands: [
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
    ]
  },
  {
    name: 'permission-request-handler',
    path: 'plugins/opspal-core/hooks/permission-request-handler.sh',
    commands: [
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json',
      'sf org display --target-org sandbox --json'
    ]
  },
  {
    name: 'pre-tool-execution',
    path: 'plugins/opspal-core/hooks/pre-tool-execution.sh',
    commands: [
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
    ]
  },
  {
    name: 'post-sf-command',
    path: 'plugins/opspal-salesforce/hooks/post-sf-command.sh',
    commands: [
      'sf data query --query "SELECT Id FROM Account" --target-org sandbox --json'
    ]
  }
];

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
  console.log('\n[Tests] sfdx Variant Coverage\n');

  const results = [];

  for (const hook of SF_CLI_HOOKS) {
    const hookPath = path.join(PROJECT_ROOT, hook.path);
    if (!fs.existsSync(hookPath)) {
      results.push(await runTest(`${hook.name}: hook exists`, async () => {
        assert.fail(`Hook not found: ${hook.path}`);
      }));
      continue;
    }

    const tester = new HookTester(hook.path, { timeout: 15000 });

    for (const sfCommand of hook.commands) {
      const variants = sfVariants(sfCommand);
      const sfxVariant = variants.find(v => v.startsWith('sfdx '));

      if (!sfxVariant) continue;

      results.push(await runTest(`${hook.name}: sfdx parity for "${sfCommand.slice(0, 50)}..."`, async () => {
        const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sfdx-variant-'));

        try {
          // Run sf variant
          const sfResult = await tester.run({
            input: {
              hook_event_name: 'PreToolUse',
              tool_name: 'Bash',
              tool_input: { command: sfCommand }
            },
            env: { HOME: tempHome }
          });

          // Run sfdx variant
          const sfdxResult = await tester.run({
            input: {
              hook_event_name: 'PreToolUse',
              tool_name: 'Bash',
              tool_input: { command: sfxVariant }
            },
            env: { HOME: tempHome }
          });

          assert.strictEqual(
            sfdxResult.exitCode,
            sfResult.exitCode,
            `Exit code mismatch: sf=${sfResult.exitCode}, sfdx=${sfdxResult.exitCode} for command "${sfxVariant.slice(0, 60)}"`
          );
        } finally {
          fs.rmSync(tempHome, { recursive: true, force: true });
        }
      }));
    }
  }

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
