#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const {
  analyzeClaudeDebugLogFile
} = require(path.join(
  __dirname,
  '../../../../../scripts/lib/claude-debug-log-analyzer.js'
));

const FIXTURE_PATH = path.join(
  __dirname,
  '..',
  'fixtures',
  'claude-debug-salesforce-deploy-incident.log'
);

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
  console.log('\n[Tests] Claude debug log analyzer\n');

  const results = [];

  results.push(await runTest('Reconstructs hook fan-out, context bloat, and primary failure', async () => {
    const analysis = analyzeClaudeDebugLogFile(FIXTURE_PATH);

    assert.strictEqual(analysis.hookFanout['SessionStart:clear'], 10, 'Should capture SessionStart hook fan-out');
    assert.strictEqual(analysis.hookFanout['PreToolUse:Bash'], 15, 'Should capture Bash pre-hook fan-out');
    assert.strictEqual(analysis.hookFanout['PostToolUse:Bash'], 10, 'Should capture Bash post-hook fan-out');
    assert.strictEqual(analysis.enabledPlugins, 10, 'Should capture enabled plugin count');
    assert.strictEqual(analysis.loadedPluginCommands, 272, 'Should capture loaded command count');
    assert.strictEqual(analysis.loadedPluginSkills, 162, 'Should capture loaded skill count');
    assert.strictEqual(analysis.skillsAttachedMax, 439, 'Should capture subagent skill attachment bloat');
    assert(analysis.plainTextHookOutputs >= 4, 'Should count plain-text hook output noise');
    assert(analysis.treeSitterFallbacks >= 1, 'Should detect the tree-sitter fallback path');
    assert.strictEqual(
      analysis.primaryFailure?.kind,
      'flow_validation_scope_mismatch',
      'Should identify the deploy-scope mismatch as the primary failure once the correct deployment agent is invoked'
    );
    assert(analysis.events.directDeployBlocked, 'Should detect the initial direct deploy guardrail');
    assert(analysis.events.instanceDeployerEISDIR, 'Should detect the instance-deployer misroute');
    assert(analysis.events.postToolUseAgentError, 'Should detect downstream Agent hook noise');
    assert(analysis.events.postToolUseBashError, 'Should detect downstream Bash hook noise');
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
