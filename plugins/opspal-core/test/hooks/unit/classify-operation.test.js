#!/usr/bin/env node

/**
 * Unit Tests for classify-operation.js
 *
 * Covers the shared Node classification and environment helpers used by
 * runtime validators and MCP policy resolution.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const LIB_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/classify-operation.js');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-core/config/mcp-tool-policies.json');
const {
  classifyBashCommand,
  classifyMCPTool,
  classifySalesforceRoutingRequirement,
  detectHubspotEnvironment,
  detectMarketoEnvironment,
  detectSalesforceEnvironment,
  getSalesforceDeployPolicy,
  getSalesforceCachePath,
  isReadOnly,
  loadMcpPolicyConfig,
  loadRoutingCapabilityConfig,
  requiresEscalation
} = require(LIB_PATH);

function writeSalesforceCache(tempDir, alias, payload) {
  const cachePath = getSalesforceCachePath(alias, { tempDir });
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
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
  console.log('\n[Tests] classify-operation.js\n');

  const results = [];
  const config = loadMcpPolicyConfig(CONFIG_PATH);
  const routingConfig = loadRoutingCapabilityConfig();

  results.push(await runTest('Classifies Salesforce read commands with cache-backed production detection', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-operation-'));

    try {
      writeSalesforceCache(tempDir, 'client-primary', {
        username: 'admin@example.com',
        orgType: 'production',
        isSandbox: false
      });

      const classification = classifyBashCommand(
        'sf data query --query "SELECT Id FROM Account" --target-org client-primary --json',
        {
          tempDir,
          querySfCli: false
        }
      );

      assert.strictEqual(classification.platform, 'salesforce');
      assert.strictEqual(classification.intent, 'read');
      assert.strictEqual(classification.target, 'production');
      assert.strictEqual(isReadOnly(classification), true, 'Production query should still be read-only');
      assert.strictEqual(requiresEscalation(classification), false, 'Read-only production query should not escalate');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Classifies Salesforce deploy commands as production escalations', async () => {
    const classification = classifyBashCommand(
      'sfdx force:source:deploy --manifest package.xml --target-org production'
    );

    assert.strictEqual(classification.platform, 'salesforce');
    assert.strictEqual(classification.intent, 'deploy');
    assert.strictEqual(classification.target, 'production');
    assert.strictEqual(requiresEscalation(classification), true, 'Production deploys should escalate');
  }));

  results.push(await runTest('Classifies Salesforce retrieve commands as read-only retrieve operations', async () => {
    const classification = classifyBashCommand(
      'sf project retrieve start --metadata CustomObject:Account --target-org production'
    );

    assert.strictEqual(classification.platform, 'salesforce');
    assert.strictEqual(classification.intent, 'retrieve');
    assert.strictEqual(classification.target, 'production');
    assert.strictEqual(isReadOnly(classification), true, 'Retrieve should stay read-only');
    assert.strictEqual(requiresEscalation(classification), false, 'Retrieve should not escalate on production');
  }));

  results.push(await runTest('Classifies HubSpot and Marketo curl commands correctly', async () => {
    const hubspotRead = classifyBashCommand(
      `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
    );
    const marketoWrite = classifyBashCommand(
      `curl -s -X POST https://123-ABC-456.mktorest.com/bulk/v1/leads/import.json -d '{"format":"csv"}'`
    );

    assert.strictEqual(hubspotRead.platform, 'hubspot');
    assert.strictEqual(hubspotRead.intent, 'read');
    assert.strictEqual(marketoWrite.platform, 'marketo');
    assert.strictEqual(marketoWrite.intent, 'mutate');
  }));

  results.push(await runTest('Classifies MCP policies through the shared taxonomy', async () => {
    const hubspotRead = classifyMCPTool('mcp__hubspot__contacts_get', { objectId: '123' }, config);
    const marketoWrite = classifyMCPTool(
      'mcp__marketo__lead_update',
      { leads: [{ id: 1, leadStatus: 'MQL' }] },
      config
    );

    assert.strictEqual(hubspotRead.matched, true, 'HubSpot MCP read should match policy');
    assert.strictEqual(hubspotRead.intent, 'read');
    assert.strictEqual(hubspotRead.pendingRouteAction, 'allow');
    assert.strictEqual(isReadOnly(hubspotRead), true, 'HubSpot MCP read should stay read-only');

    assert.strictEqual(marketoWrite.matched, true, 'Marketo MCP write should match policy');
    assert.strictEqual(marketoWrite.intent, 'mutate');
    assert.strictEqual(marketoWrite.pendingRouteAction, 'deny');
    assert.strictEqual(isReadOnly(marketoWrite), false, 'Marketo MCP write should be operational');
  }));

  results.push(await runTest('Classifies Salesforce mandatory routing requirements', async () => {
    const writeRule = classifySalesforceRoutingRequirement(
      'sf data upsert bulk --sobject Lead --file leads.csv --target-org sandbox'
    );
    const bulkMutationRule = classifySalesforceRoutingRequirement(
      'sf data bulk update --sobject Contact --file contacts.csv --target-org sandbox'
    );
    const permissionRule = classifySalesforceRoutingRequirement(
      'sf data create record --sobject PermissionSetAssignment --values "AssigneeId=005xx PermissionSetId=0PSxx" --target-org sandbox'
    );
    const warnRule = classifySalesforceRoutingRequirement(
      'sf data query --query "SELECT Id FROM Account WHERE Id = \'001xx\'" --target-org sandbox --json'
    );

    assert.strictEqual(writeRule.decision, 'block');
    assert.strictEqual(writeRule.ruleId, 'sf_core_object_upsert');
    assert.strictEqual(writeRule.requiredAgent, 'opspal-salesforce:sfdc-upsert-orchestrator');
    assert(
      Array.isArray(writeRule.clearanceAgents) && writeRule.clearanceAgents.includes('opspal-salesforce:sfdc-data-import-manager'),
      'Capability-based routing should automatically include newly-capable specialists'
    );
    assert.deepStrictEqual(
      writeRule.requiredCapabilities,
      ['salesforce:data:core:upsert'],
      'Routing rules should expose the required capability contract'
    );
    assert(
      writeRule.requiredTools.includes('Bash'),
      'Capability-based routing should keep Bash in the active route profile'
    );

    assert.strictEqual(bulkMutationRule.decision, 'block');
    assert.strictEqual(bulkMutationRule.ruleId, 'sf_core_object_bulk_mutation');
    assert.strictEqual(bulkMutationRule.requiredAgent, 'opspal-salesforce:sfdc-bulkops-orchestrator');
    assert(
      bulkMutationRule.requiredTools.includes('Bash'),
      'Bulk mutation routing should preserve Bash as a required tool'
    );
    assert(
      bulkMutationRule.clearanceAgents.includes('opspal-salesforce:sfdc-data-operations'),
      'Bulk mutation routing should still admit compatible data-operation specialists inside the approved family'
    );

    assert.strictEqual(permissionRule.decision, 'block');
    assert.strictEqual(permissionRule.ruleId, 'sf_permission_security_write');
    assert.strictEqual(permissionRule.requiredAgent, 'opspal-salesforce:sfdc-permission-orchestrator');
    assert(
      permissionRule.clearanceAgents.includes('opspal-salesforce:sfdc-security-admin'),
      'Capability-based routing should still permit delegated security-admin execution inside the specialist path'
    );
    assert(
      permissionRule.allowedActorTypes.includes('orchestrator') && permissionRule.allowedActorTypes.includes('specialist'),
      'Permission/security routing should admit the canonical orchestrator and delegated specialist actors'
    );

    assert.strictEqual(warnRule.decision, 'warn');
    assert.strictEqual(warnRule.ruleId, 'sf_core_object_query');
    assert(
      warnRule.requiredTools.includes('Bash'),
      'Query routing warnings should preserve Bash in the active route profile'
    );
    assert(
      warnRule.allowedActorTypes.includes('specialist'),
      'Routing warnings should expose actor-type eligibility'
    );
  }));

  results.push(await runTest('Escalates mixed query-plus-bulk-mutation workflows to the bulk mutation route', async () => {
    const mixedRule = classifySalesforceRoutingRequirement(
      'sf data query --query "SELECT Id FROM Account WHERE Name LIKE \'Dup%\'" --target-org sandbox && sf data bulk update --sobject Contact --file contacts.csv --target-org sandbox'
    );

    assert.strictEqual(mixedRule.decision, 'block');
    assert.strictEqual(mixedRule.ruleId, 'sf_core_object_bulk_mutation');
    assert.strictEqual(mixedRule.requiredAgent, 'opspal-salesforce:sfdc-bulkops-orchestrator');
    assert(
      mixedRule.requiredTools.includes('Bash'),
      'Mixed query/mutation routing should preserve Bash in the active route profile'
    );
    assert(
      mixedRule.clearanceAgents.includes('opspal-salesforce:sfdc-data-operations'),
      'Mixed query/mutation routing should still admit compatible approved specialists'
    );
  }));

  results.push(await runTest('Detects disguised mutation inside a pipeline', async () => {
    const classification = classifyBashCommand(
      'sf data query --query "SELECT Id FROM Account" --target-org production --json | xargs sf data delete bulk --sobject Account --target-org production'
    );

    assert.strictEqual(classification.platform, 'salesforce');
    assert.ok(
      ['mutate', 'bulk-mutate'].includes(classification.intent),
      `Pipeline-hidden mutation should classify as mutation, got ${classification.intent}`
    );
    assert.strictEqual(requiresEscalation(classification), true, 'Hidden mutation should escalate on production');
  }));

  results.push(await runTest('Detects eval-wrapped mutation intent across the full command line', async () => {
    const classification = classifyBashCommand(
      'CMD="sf data delete bulk --sobject Account --target-org production"; eval "$CMD"'
    );

    assert.strictEqual(classification.platform, 'salesforce');
    assert.strictEqual(classification.intent, 'mutate');
    assert.strictEqual(requiresEscalation(classification), true, 'eval-wrapped mutation should escalate');
  }));

  results.push(await runTest('Treats ambiguous command-substitution reads as non-read-only', async () => {
    const classification = classifyBashCommand(
      'RESULT=$(sf data query --query "SELECT Id FROM Account" --target-org production --json); echo "$RESULT"'
    );

    assert.strictEqual(classification.platform, 'salesforce');
    assert.strictEqual(classification.intent, 'unknown');
    assert.strictEqual(isReadOnly(classification), false, 'Ambiguous command substitution should not be read-only');
  }));

  results.push(await runTest('Loads deploy policy requirements for orchestrator and specialist enforcement', async () => {
    const parentClearance = getSalesforceDeployPolicy('parent_clearance', {
      routingCapabilityConfig: routingConfig
    });
    const productionExecute = getSalesforceDeployPolicy('production_execute', {
      routingCapabilityConfig: routingConfig
    });

    assert.deepStrictEqual(
      parentClearance.required_capabilities,
      ['salesforce:deploy:plan'],
      'Parent-context deploy clearance should be capability-driven'
    );
    assert.deepStrictEqual(
      productionExecute.allowed_actor_types,
      ['specialist'],
      'Direct production deploy execution should stay specialist-only'
    );
  }));

  results.push(await runTest('Detects HubSpot and Marketo environments from shared helpers', async () => {
    const hubspotProduction = detectHubspotEnvironment('123456', {
      productionPortalIds: '123456,654321'
    });
    const hubspotSandbox = detectHubspotEnvironment('developer-sandbox');
    const marketoSandbox = detectMarketoEnvironment('https://123-ABC-456.mktosandbox.com/rest/v1/leads.json');
    const marketoProduction = detectMarketoEnvironment('https://123-ABC-456.mktorest.com/rest/v1/leads.json');

    assert.strictEqual(hubspotProduction.environment, 'production');
    assert.strictEqual(hubspotSandbox.environment, 'sandbox');
    assert.strictEqual(marketoSandbox.environment, 'sandbox');
    assert.strictEqual(marketoProduction.environment, 'production');
  }));

  results.push(await runTest('Detects Salesforce environment directly from cache when requested', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-operation-'));

    try {
      writeSalesforceCache(tempDir, 'ops-blue', {
        orgType: 'sandbox',
        isSandbox: true
      });

      const detected = detectSalesforceEnvironment('ops-blue', {
        tempDir,
        querySfCli: false
      });

      assert.strictEqual(detected.environment, 'sandbox');
      assert.strictEqual(detected.source, 'cache');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(result => result.passed).length;
  const failed = results.filter(result => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
