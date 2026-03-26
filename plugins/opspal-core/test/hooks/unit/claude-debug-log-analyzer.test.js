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
const READ_FAILURE_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'claude-debug-read-path-failures.txt'
);
const TOOL_PROJECTION_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'claude-debug-salesforce-tool-projection-mismatch.log'
);
const ROUTE_PROFILE_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'claude-debug-spawn-time-route-profile-mismatch.txt'
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

  results.push(await runTest('Parses missing-file and directory Read failures', async () => {
    const analysis = analyzeClaudeDebugLogFile(READ_FAILURE_FIXTURE);

    assert.strictEqual(analysis.skillsAttachedMax, 439, 'Should preserve attached skill count');
    assert.strictEqual(analysis.maxAgentHookFanout, 7, 'Should capture Agent hook fanout');
    assert.strictEqual(analysis.readFailures.missingFiles.length, 2, 'Should count missing-file Read failures');
    assert.strictEqual(analysis.readFailures.directories.length, 1, 'Should count directory Read failures');
    assert.strictEqual(
      analysis.readFailures.directories[0].path,
      '/mnt/c/Users/cnace/RevPal/workspace/orgs/lula/platforms/salesforce/staging/force-app/main/default/flows',
      'Should capture the directory path that was read'
    );
  }));

  results.push(await runTest('Detects Salesforce sub-agent tool projection mismatches', async () => {
    const analysis = analyzeClaudeDebugLogFile(TOOL_PROJECTION_FIXTURE);

    assert.strictEqual(
      analysis.primaryFailure?.kind,
      'subagent_tool_projection_mismatch',
      'Should classify Read/Write-only and no-Bash specialist failures as tool projection mismatches'
    );
    assert(analysis.events.subagentToolProjectionMismatch, 'Should capture the tool projection mismatch event');
    assert.strictEqual(analysis.projectionMismatches.length >= 2, true, 'Should retain routed-agent projection mismatch details');
    assert.strictEqual(
      analysis.projectionMismatches[analysis.projectionMismatches.length - 1].agent,
      'opspal-salesforce:sfdc-bulkops-orchestrator',
      'Should associate the final mismatch with the last routed specialist'
    );
    assert(
      analysis.projectionMismatches[0].actualTools.includes('Read') &&
      analysis.projectionMismatches[0].actualTools.includes('Write'),
      'Should retain the runtime tool set that was exposed by the host'
    );
  }));

  results.push(await runTest('Separates spawn-time route/profile mismatches from host tool projection loss', async () => {
    const analysis = analyzeClaudeDebugLogFile(ROUTE_PROFILE_FIXTURE);

    assert.strictEqual(
      analysis.primaryFailure?.kind,
      'spawn_time_route_profile_mismatch',
      'Route/profile mismatches should be classified independently from host projection loss'
    );
    assert.strictEqual(analysis.routeProfileMismatches.length, 1, 'Should capture structured route/profile mismatch details');
    assert.strictEqual(
      analysis.routeProfileMismatches[0].code,
      'ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH',
      'Should preserve the specific mismatch code'
    );
    assert(
      analysis.routeProfileMismatches[0].requiredTools.includes('Bash'),
      'Should preserve required tools for route/profile mismatch triage'
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
