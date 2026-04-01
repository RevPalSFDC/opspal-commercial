#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-core/hooks/subagent-start-context.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createOrgFixture() {
  const orgSlug = `hook-subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orgRoot = path.join(PROJECT_ROOT, 'orgs', orgSlug);

  fs.mkdirSync(path.join(orgRoot, 'configs'), { recursive: true });
  fs.writeFileSync(path.join(orgRoot, 'RUNBOOK.md'), '# Runbook\nDeploy safely.\n', 'utf8');
  fs.writeFileSync(path.join(orgRoot, 'configs', 'field-dictionary.yaml'), 'fields: []\n', 'utf8');
  fs.writeFileSync(
    path.join(orgRoot, 'WORK_INDEX.yaml'),
    [
      '- title: Deploy quick actions',
      '  status: in-progress',
      '  classification: deployment'
    ].join('\n'),
    'utf8'
  );

  return { orgSlug, orgRoot };
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
  console.log('\n[Tests] subagent-start-context.sh\n');

  const tester = createTester();
  const results = [];

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Returns JSON no-op when agent metadata is missing', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'SubagentStart'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op envelope');
  }));

  results.push(await runTest('Injects runbook, field dictionary, and work context for reporting agents', async () => {
    const fixture = createOrgFixture();

    try {
      const result = await tester.run({
        input: {
          hook_event_name: 'SubagentStart',
          agent_type: 'opspal-salesforce:sfdc-revops-auditor'
        },
        env: {
          ORG_SLUG: fixture.orgSlug,
          TEMPLATE_INJECTION_ENABLED: '0'
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
      assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
      assert.strictEqual(
        result.output?.hookSpecificOutput?.hookEventName,
        'SubagentStart',
        'Should target the SubagentStart hook event'
      );

      const context = result.output?.hookSpecificOutput?.additionalContext || '';
      assert(context.includes(`RUNBOOK (${fixture.orgSlug})`), 'Should include runbook guidance');
      assert(context.includes('FIELD DICTIONARY:'), 'Should include field dictionary guidance');
      assert(context.includes(`RECENT WORK (${fixture.orgSlug})`), 'Should include recent work context');
    } finally {
      fs.rmSync(fixture.orgRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Injects scoped plugin guidance for Salesforce agents', async () => {
    const result = await tester.run({
      input: {
        hook_event_name: 'SubagentStart',
        agent_type: 'opspal-salesforce:sfdc-automation-auditor',
        prompt: 'Audit Salesforce flow deployment blockers in staging and inspect force-app flow metadata.'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    const context = result.output?.hookSpecificOutput?.additionalContext || '';
    assert(context.includes('Context:') || context.includes('Active plugins'), 'Should include scoped plugin guidance');
    assert(context.includes('opspal-salesforce'), 'Should include Salesforce in the allowlist');
    assert(context.includes('opspal-core'), 'Should retain opspal-core in the allowlist');
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
