#!/usr/bin/env node

/**
 * Unit Tests for pre-deployment-comprehensive-validation.sh
 *
 * Validates skip behavior when comprehensive validation is disabled.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-deployment-comprehensive-validation.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 20000,
    verbose: process.env.VERBOSE === '1'
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
  console.log('\n[Tests] pre-deployment-comprehensive-validation.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when comprehensive validation disabled', async () => {
    const result = await tester.run({
      input: {},
      env: {
        SKIP_COMPREHENSIVE_VALIDATION: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Does not crash when sourced after readonly core color globals', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --target-org test-org'
        }
      },
      env: {
        PRETOOLUSE_MODE: '1',
        SKIP_COMPREHENSIVE_VALIDATION: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit cleanly in PreToolUse mode');
    assert(
      !result.stderr.includes('readonly variable'),
      'Validator library should not reassign readonly color globals'
    );
  }));

  results.push(await runTest('Honors command-visible SKIP_COMPREHENSIVE_VALIDATION flag', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'SKIP_COMPREHENSIVE_VALIDATION=1 sf project deploy start --source-dir force-app/main/default/layouts'
        }
      },
      env: {
        PRETOOLUSE_MODE: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert(
      result.stderr.includes('Comprehensive validation skipped') ||
      result.stderr.includes('Validation disabled via environment variable'),
      'Should honor inline skip flag'
    );
  }));

  results.push(await runTest('Stages non-root source-dir deploys instead of scanning the full source tree', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-comprehensive-scope-'));
    try {
      const flowDir = path.join(tempDir, 'force-app/main/default/flows');
      const layoutDir = path.join(tempDir, 'force-app/main/default/layouts');
      fs.mkdirSync(flowDir, { recursive: true });
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.writeFileSync(
        path.join(flowDir, 'Broken.flow-meta.xml'),
        '<Flow><broken></Flow>',
        'utf8'
      );
      fs.writeFileSync(
        path.join(layoutDir, 'Account-Layout.layout-meta.xml'),
        '<Layout xmlns="http://soap.sforce.com/2006/04/metadata"></Layout>',
        'utf8'
      );

      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          cwd: tempDir,
          tool_input: {
            command: 'sf project deploy start --source-dir force-app/main/default/layouts'
          }
        },
        env: {
          PRETOOLUSE_MODE: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
      assert(
        result.stderr.includes('Deploy Scope:') && result.stderr.includes('force-app/main/default/layouts'),
        'Should report only the selected deploy scope'
      );
      assert(
        /Deployment Dir: .*opspal-deploy-scope-/.test(result.stderr),
        'Leaf source-dir deploys should use a staged scope root instead of the raw layout directory'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
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
