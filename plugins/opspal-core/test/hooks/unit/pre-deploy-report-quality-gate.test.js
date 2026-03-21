#!/usr/bin/env node

/**
 * Unit Tests for pre-deploy-report-quality-gate.sh
 *
 * Focus on skip behavior and empty deploy dir handling.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-deploy-report-quality-gate.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
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
  console.log('\n[Tests] pre-deploy-report-quality-gate.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when report quality gate disabled', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --target-org test-org'
        }
      },
      env: {
        SKIP_REPORT_QUALITY_GATE: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(
      result.stderr.includes('Report quality gate skipped'),
      'Should note skipped validation'
    );
  }));

  results.push(await runTest('Skips deploy lifecycle and status commands', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy report --job-id 0Af000000000123AAA --target-org test-org --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert.strictEqual(result.output, null, 'Should skip lifecycle commands entirely');
    assert(!result.stderr.includes('Report Quality Gate - Pre-Deployment Validation'), 'Should not start the report quality gate for deploy report');
  }));

  results.push(await runTest('Honors command-visible SKIP_REPORT_QUALITY_GATE flag', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'SKIP_REPORT_QUALITY_GATE=1 sf project deploy start --target-org test-org'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert(
      result.stderr.includes('Report quality gate skipped'),
      'Should honor inline skip flag'
    );
  }));

  results.push(await runTest('Reports no files when deploy dir empty', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-report-gate-'));
    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf project deploy start --target-org test-org'
          }
        },
        env: {
          SF_DEPLOY_DIR: tempDir
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert(
        result.stderr.includes('No reports or dashboards to validate'),
        'Should report no files to validate'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Validates only reports and dashboards in the resolved deploy scope', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-report-scope-'));
    try {
      const reportDir = path.join(tempDir, 'force-app/main/default/reports/Public');
      const layoutDir = path.join(tempDir, 'force-app/main/default/layouts');
      fs.mkdirSync(reportDir, { recursive: true });
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.writeFileSync(
        path.join(reportDir, 'Pipeline.report-meta.xml'),
        '<Report xmlns="http://soap.sforce.com/2006/04/metadata"></Report>',
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
            command: 'sf project deploy start --source-dir force-app/main/default/layouts --target-org test-org'
          }
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
      assert(
        result.stderr.includes('No reports or dashboards to validate in deploy scope'),
        'Should ignore unrelated report metadata outside the selected deploy scope'
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
