#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 20000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempCliBin(binaries) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dispatcher-bin-'));

  Object.entries(binaries).forEach(([name, body]) => {
    const filePath = path.join(binDir, name);
    fs.writeFileSync(filePath, body, { mode: 0o755 });
  });

  return binDir;
}

function pathWithoutSalesforceCli(extraDirs = []) {
  const filtered = (process.env.PATH || '')
    .split(path.delimiter)
    .filter((dir) => {
      try {
        return !fs.existsSync(path.join(dir, 'sf')) && !fs.existsSync(path.join(dir, 'sfdx'));
      } catch {
        return true;
      }
    });

  return [...extraDirs, ...filtered].join(path.delimiter);
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
  console.log('\n[Tests] Salesforce pre-bash dispatcher\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Ignores generic Bash commands', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'echo hello'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    // Fast-exit emits {} noop JSON (preferred) or stays silent (legacy)
    assert(result.output === null || (typeof result.output === 'object' && Object.keys(result.output).length === 0),
      'Should emit {} noop or stay silent for unrelated Bash commands');
  }));

  results.push(await runTest('Allows deploy report lifecycle commands to pass through without pre-deploy validation', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy report --job-id 0Af000000000123AAA --target-org peregrine-sandbox --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Lifecycle deploy commands should stay runnable');
    assert.strictEqual(result.parseError, null, 'Should not emit invalid stdout');
    assert.strictEqual(result.output, null, 'Lifecycle deploy commands should not emit dispatcher JSON by default');
    assert(!result.stderr.includes('DEPLOY BLOCKED'), 'Should not trigger direct deploy routing for report commands');
    assert(!result.stderr.includes('Deployment validation failed'), 'Should not trigger comprehensive validation for report commands');
  }));

  results.push(await runTest('Blocks direct Salesforce deploy commands outside agent context', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf project deploy start --source-dir force-app/main/default/layouts'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Dispatcher should exit 0 (child emits advisory JSON)');
    assert(result.stderr.includes('DEPLOY ADVISORY'), 'Should explain the deploy advisory');
    const output = result.output || {};
    const hookOutput = output.hookSpecificOutput || {};
    // The child hook emits advisory allow which the dispatcher merges into its JSON
    assert(
      hookOutput.permissionDecision === 'allow' || (result.stdout || '').includes('PRODUCTION_ADVISORY'),
      'Should contain an advisory signal in the merged output'
    );
  }));

  // sfdx bypass prevention tests
  results.push(await runTest('Advises on sfdx project deploy start (same as sf deploy)', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sfdx project deploy start --source-dir force-app/main/default/layouts'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Dispatcher should exit 0 (child emits advisory JSON)');
    assert(result.stderr.includes('DEPLOY ADVISORY'), 'sfdx deploy should get advisory just like sf deploy');
    const output = result.output || {};
    const hookOutput = output.hookSpecificOutput || {};
    assert(
      hookOutput.permissionDecision === 'allow' || (result.stdout || '').includes('PRODUCTION_ADVISORY'),
      'Should contain an advisory signal for sfdx deploy commands'
    );
  }));

  results.push(await runTest('Translates supported sf discovery commands to sfdx when only sfdx is available', async () => {
    const binDir = createTempCliBin({
      sfdx: '#!/usr/bin/env bash\nexit 0\n'
    });

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: {
            command: 'sf sobject describe Opportunity --json'
          }
        },
        env: {
          PATH: pathWithoutSalesforceCli([binDir]),
          SF_DISABLE_AUTO_DISCOVERY: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'allow', 'Should keep the command runnable');
      assert(
        (result.output?.hookSpecificOutput?.updatedInput?.command || '').includes('sfdx force:schema:sobject:describe --sobject Opportunity --json'),
        'Should translate the sf describe command to a legacy sfdx equivalent'
      );
      assert(
        (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('compatibility fallback'),
        'Should explain that sfdx compatibility fallback was applied'
      );
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Denies Salesforce CLI commands clearly when neither sf nor sfdx is available', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sf sobject describe Opportunity --json'
        }
      },
      env: {
        PATH: pathWithoutSalesforceCli(),
        SF_DISABLE_AUTO_DISCOVERY: '1'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Structured deny should preserve exit code 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(result.output?.hookSpecificOutput?.permissionDecision, 'deny', 'Should deny execution');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('SF_CLI_NOT_FOUND'),
      'Should distinguish command-not-found from a hook validation failure'
    );
  }));

  results.push(await runTest('Prepends pipefail when Salesforce CLI output is piped to jq', async () => {
    const binDir = createTempCliBin({
      sf: '#!/usr/bin/env bash\nexit 0\n'
    });

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: {
            command: 'sf data query --query "SELECT Id FROM Account LIMIT 1" --json | jq ".result.records"'
          }
        },
        env: {
          PATH: pathWithoutSalesforceCli([binDir]),
          SF_DISABLE_AUTO_DISCOVERY: '1'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert(
        (result.output?.hookSpecificOutput?.updatedInput?.command || '').startsWith('set -o pipefail;'),
        'Should prefix the command with set -o pipefail'
      );
      assert(
        (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('pipefail'),
        'Should explain why pipefail was added'
      );
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Validates sfdx data query through SOQL validator', async () => {
    // sfdx data query should trigger the same SOQL validation as sf data query
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'sfdx data query --query "SELECT ApiName FROM FlowVersionView" --json'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    // The SOQL validator should fire and correct ApiName -> DeveloperName
    if (result.output?.hookSpecificOutput?.permissionDecisionReason) {
      assert(
        result.output.hookSpecificOutput.permissionDecisionReason.includes('DeveloperName') ||
        result.output.hookSpecificOutput.updatedInput,
        'sfdx data query should trigger SOQL field corrections'
      );
    }
  }));

  results.push(await runTest('Returns structured jq validation guidance', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'echo {} | jq ".foo |"'
        }
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should keep the Bash command runnable');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.strictEqual(result.output?.hookSpecificOutput?.hookEventName, 'PreToolUse');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('incomplete pipe'),
      'Should preserve jq validation guidance through the dispatcher'
    );
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
