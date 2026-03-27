#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-task-agent-validator.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createAgentEvent(toolInput = {}) {
  return {
    tool_name: 'Agent',
    tool_input: toolInput
  };
}

function createIsolatedEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-boot-hook-'));
  return {
    CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    HOME: home,
    CLAUDE_SESSION_ID: `agent-boot-hook-${Date.now()}`,
    ...extra
  };
}

function writeStubValidator(filePath) {
  const contents = `#!/usr/bin/env node
'use strict';

process.stdout.write(JSON.stringify({
  pass: false,
  issueCount: 1,
  issues: [
    {
      code: 'agent_boot_missing_import',
      agentId: 'opspal-salesforce:sfdc-automation-builder',
      field: 'agents/shared/playbook-registry.yaml',
      sourceOfTruth: 'agent-import',
      message: 'agent asset imports missing prompt fragment agents/shared/playbook-registry.yaml.',
      repairAction: 'Restore agents/shared/playbook-registry.yaml in the owning plugin or remove the @import.'
    }
  ]
}, null, 2) + '\\n');
process.exit(1);
`;

  fs.writeFileSync(filePath, contents, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false };
  }
}

async function runAllTests() {
  console.log('\n[Tests] agent-boot-integrity hook integration\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Pre-task agent validator blocks launch with structured boot integrity error', async () => {
    const env = createIsolatedEnv();
    const stubValidator = path.join(env.HOME, 'boot-integrity-stub.js');
    writeStubValidator(stubValidator);

    const result = await tester.run({
      input: createAgentEvent({
        subagent_type: 'opspal-salesforce:sfdc-automation-builder',
        prompt: 'Build campaign structure flow package'
      }),
      env: {
        ...env,
        AGENT_BOOT_INTEGRITY_VALIDATOR: stubValidator
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Hook should return Claude contract JSON, not shell failure');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Boot integrity failure should deny launch'
    );
    const reason = result.output?.hookSpecificOutput?.permissionDecisionReason || '';
    assert(reason.includes('AGENT_BOOT_INTEGRITY_ERROR'), 'Structured deny should use boot integrity error code');
    assert(reason.includes('agents/shared/playbook-registry.yaml'), 'Structured deny should expose the missing field or asset');
    assert(reason.includes('Suggested repair:'), 'Structured deny should include repair guidance');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
