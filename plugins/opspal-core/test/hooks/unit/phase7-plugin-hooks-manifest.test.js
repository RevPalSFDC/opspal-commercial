#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

function readHooksJson(pluginName) {
  return JSON.parse(
    fs.readFileSync(
      path.join(PROJECT_ROOT, 'plugins', pluginName, '.claude-plugin', 'hooks.json'),
      'utf8'
    )
  );
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
  console.log('\n[Tests] Phase 7 plugin hook manifests\n');

  const results = [];

  results.push(await runTest('Monday plugin registers Agent governance and MCP audit hooks', async () => {
    const hooksJson = readHooksJson('opspal-monday');
    const preToolAgent = hooksJson.hooks?.PreToolUse?.find((group) => group.matcher === 'Agent');
    const postToolMonday = hooksJson.hooks?.PostToolUse?.find((group) => group.matcher === 'mcp__monday__*');

    assert(preToolAgent, 'Monday PreToolUse Agent matcher should be registered');
    assert(
      preToolAgent.hooks.some((hook) => hook.command.endsWith('/hooks/universal-agent-governance.sh')),
      'Monday Agent matcher should invoke universal-agent-governance.sh'
    );
    assert(postToolMonday, 'Monday PostToolUse MCP matcher should be registered');
    assert(
      postToolMonday.hooks.some((hook) => hook.command.endsWith('/hooks/post-tool-use-monday-audit.sh')),
      'Monday PostToolUse matcher should invoke post-tool-use-monday-audit.sh'
    );
  }));

  results.push(await runTest('OKR plugin registers the phase gate on Agent launches', async () => {
    const hooksJson = readHooksJson('opspal-okrs');
    const preToolAgent = hooksJson.hooks?.PreToolUse?.find((group) => group.matcher === 'Agent');

    assert(preToolAgent, 'OKR PreToolUse Agent matcher should be registered');
    assert(
      preToolAgent.hooks.some((hook) => hook.command.endsWith('/hooks/pre-task-okr-approval-gate.sh')),
      'OKR Agent matcher should invoke pre-task-okr-approval-gate.sh'
    );
  }));

  results.push(await runTest('AI Consult PostToolUse matcher is narrowed to Agent only', async () => {
    const hooksJson = readHooksJson('opspal-ai-consult');
    const postToolGroups = hooksJson.hooks?.PostToolUse || [];

    assert.strictEqual(postToolGroups.length, 1, 'AI Consult should keep a single PostToolUse hook group');
    assert.strictEqual(postToolGroups[0].matcher, 'Agent', 'AI Consult PostToolUse matcher should be Agent');
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
