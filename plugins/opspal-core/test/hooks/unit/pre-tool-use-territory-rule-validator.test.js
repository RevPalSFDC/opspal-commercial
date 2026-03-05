#!/usr/bin/env node

/**
 * Unit Tests for pre-tool-use-territory-rule-validator.sh
 *
 * Covers skip paths and rule-id missing path.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-tool-use-territory-rule-validator.sh';

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
  console.log('\n[Tests] pre-tool-use-territory-rule-validator.sh Tests\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when validation disabled', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        input: { command: 'sf data query --query "SELECT Id FROM Account"' }
      },
      env: {
        SKIP_TERRITORY_VALIDATION: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Skips non-Bash tool', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'ReadFile',
        input: { command: 'sf data update --sobject ObjectTerritory2AssignmentRuleItem' }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Skips non-territory command', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        input: { command: 'sf data update --sobject Account --record-id 001xx' }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Warns when rule ID missing', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        input: { command: 'sf data update --sobject ObjectTerritory2AssignmentRuleItem --record-id 0OH000000000000' }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert(
      result.stderr.includes('Could not extract parent rule ID'),
      'Should warn about missing rule id'
    );
  }));

  results.push(await runTest('Blocks when BooleanFilter exists', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-territory-'));
    const fakeSf = path.join(tempDir, 'sf');
    const response = JSON.stringify({
      status: 0,
      result: {
        records: [
          {
            Id: '0OH000000000000',
            DeveloperName: 'TestRule',
            MasterLabel: 'Test Rule',
            BooleanFilter: '(1 AND 2)',
            IsActive: true
          }
        ]
      }
    });

    fs.writeFileSync(
      fakeSf,
      `#!/usr/bin/env bash\necho '${response}'\n`,
      'utf8'
    );
    fs.chmodSync(fakeSf, 0o755);

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Bash',
          input: {
            command: "sf data update --sobject ObjectTerritory2AssignmentRuleItem --values \"ObjectTerritory2AssignmentRuleId='0OH000000000000'\""
          }
        },
        env: {
          PATH: `${tempDir}:${process.env.PATH}`
        }
      });

      assert.strictEqual(result.exitCode, 1, 'Should exit with 1 when blocked');
      assert(result.output && result.output.blocked === true, 'Should emit blocked response');
      assert(result.output && result.output.rule_id === '0OH000000000000', 'Should include rule id');
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
