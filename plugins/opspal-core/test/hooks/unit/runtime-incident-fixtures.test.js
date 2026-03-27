#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const {
  analyzeClaudeDebugLogFile
} = require(path.join(
  PROJECT_ROOT,
  'scripts/lib/claude-debug-log-analyzer.js'
));
const {
  classifyRuntimeIncident,
  validateIncidentFixtures
} = require(path.join(
  PROJECT_ROOT,
  'scripts/validate-runtime-incident-fixtures.js'
));

const TOOL_PROJECTION_FIXTURE = path.join(
  PROJECT_ROOT,
  'plugins/opspal-core/test/hooks/fixtures/claude-debug-salesforce-tool-projection-mismatch.txt'
);
const ROUTE_PROFILE_FIXTURE = path.join(
  PROJECT_ROOT,
  'plugins/opspal-core/test/hooks/fixtures/claude-debug-spawn-time-route-profile-mismatch.txt'
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
  console.log('\n[Tests] runtime incident fixtures\n');

  const results = [];

  results.push(await runTest('Configured runtime incident fixtures pass with current repo metadata', async () => {
    const report = validateIncidentFixtures();
    assert.strictEqual(report.ok, true, `Expected fixture validation to pass, found ${report.failures.length} failure(s)`);
    assert.strictEqual(report.fixtureCount >= 4, true, 'Expected adjacent route-profile fixture coverage to be configured');
  }));

  results.push(await runTest('Classifies no-Bash tool projection as host runtime drift when repo metadata passes', async () => {
    const analysis = analyzeClaudeDebugLogFile(TOOL_PROJECTION_FIXTURE);
    const classification = classifyRuntimeIncident(analysis, {
      repoRoutingReport: {
        pass: true,
        failureCount: 0,
        failures: []
      }
    });

    assert.strictEqual(classification.incidentClass, 'external_runtime_projection_loss');
    assert.strictEqual(classification.sourceOfTruth, 'host-runtime');
    assert.strictEqual(classification.diagnostics.agent, 'opspal-salesforce:sfdc-bulkops-orchestrator');
    assert(classification.diagnostics.missingTools.includes('Bash'), 'Projection loss should identify missing Bash');
  }));

  results.push(await runTest('Classifies the same projection incident as repo metadata drift when routing integrity already reports Bash drift', async () => {
    const analysis = analyzeClaudeDebugLogFile(TOOL_PROJECTION_FIXTURE);
    const classification = classifyRuntimeIncident(analysis, {
      repoRoutingReport: {
        pass: false,
        failureCount: 1,
        failures: [
          {
            code: 'salesforce_agent_missing_indexed_bash',
            agent: 'opspal-salesforce:sfdc-bulkops-orchestrator',
            message: 'Targeted Salesforce agent is missing Bash in routing-index.json: opspal-salesforce:sfdc-bulkops-orchestrator'
          }
        ]
      }
    });

    assert.strictEqual(classification.incidentClass, 'repo_metadata_index_drift');
    assert.strictEqual(classification.sourceOfTruth, 'repo-metadata/index');
    assert(classification.diagnostics.repoSideIndicators.includes('routing_integrity_validator_failed'));
  }));

  results.push(await runTest('Classifies route-profile mismatch incidents separately from runtime projection loss', async () => {
    const analysis = analyzeClaudeDebugLogFile(ROUTE_PROFILE_FIXTURE);
    const classification = classifyRuntimeIncident(analysis, {
      repoRoutingReport: {
        pass: true,
        failureCount: 0,
        failures: []
      }
    });

    assert.strictEqual(classification.incidentClass, 'spawn_time_route_profile_mismatch');
    assert.strictEqual(classification.sourceOfTruth, 'routing-enforcement');
    assert.strictEqual(classification.diagnostics.code, 'ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH');
    assert.strictEqual(classification.diagnostics.selectedAgent, 'opspal-salesforce:sfdc-cpq-specialist');
    assert(classification.diagnostics.requiredTools.includes('Bash'), 'Profile mismatch should expose required tools');
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
