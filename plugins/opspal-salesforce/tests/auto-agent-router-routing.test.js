#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const AutoAgentRouter = require('../scripts/auto-agent-router');

const pluginRoot = path.join(__dirname, '..');
const agentTriggersPath = path.join(pluginRoot, '.claude-plugin', 'agent-triggers.json');

function routeOperation(operation) {
  const router = new AutoAgentRouter();
  const complexity = router.calculateComplexity(operation);
  return {
    complexity,
    match: router.findBestAgent(operation, complexity)
  };
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function testRoutingConfigExists() {
  assert.ok(fs.existsSync(agentTriggersPath), 'Expected .claude/agent-triggers.json to exist');

  const config = JSON.parse(fs.readFileSync(agentTriggersPath, 'utf8'));
  assert.ok(config.triggers, 'Expected routing config to contain triggers');
  assert.ok(config.triggers.mandatory.patterns.length >= 3, 'Expected mandatory routing patterns');
}

function testCliRoutingLoadsConfigWithoutWarning() {
  const result = spawnSync(
    'node',
    ['scripts/auto-agent-router.js', 'route', 'Deploy Auto_Assign flow to staging', '--json'],
    { cwd: pluginRoot, encoding: 'utf8' }
  );

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.ok(!/Could not load agent triggers config/.test(result.stderr), 'Expected routing config to load without warnings');
  assert.ok(/"agent":"sfdc-deployment-manager"/.test(result.stdout), 'Expected deploy-only routing to use sfdc-deployment-manager');
}

function testMixedWorkflowRoutesToOrchestrator() {
  const { complexity, match } = routeOperation(
    'Grant State__c FLS to all profiles, deploy Auto_Assign flow to staging, populate State__c on four accounts, and verify junction creation'
  );

  assert.ok(complexity >= 0.5, `Expected mixed workflow complexity boost, got ${complexity}`);
  assert.ok(match, 'Expected a routing match');
  assert.strictEqual(match.agent, 'sfdc-orchestrator');
  assert.ok(/Cross-domain workflow/.test(match.reason), `Expected orchestration reason, got: ${match.reason}`);
}

function testMetadataCreationAndDeployRouteToOrchestrator() {
  const createAndDeploy = routeOperation('Create a new text field on custom object Address__c and deploy it to wedgewood-uat');
  assert.strictEqual(createAndDeploy.match.agent, 'sfdc-orchestrator');
  assert.ok(/Metadata creation plus deployment/.test(createAndDeploy.match.reason), `Expected metadata deploy orchestration reason, got: ${createAndDeploy.match.reason}`);

  const siblingVariant = routeOperation('Add a custom field to Address__c, then deploy the metadata to wedgewood-uat');
  assert.strictEqual(siblingVariant.match.agent, 'sfdc-orchestrator');
}

function testPermissionOnlyAndDeployOnlyRouteToSpecialists() {
  const permissionOnly = routeOperation('Grant State__c FLS to all profiles');
  assert.strictEqual(permissionOnly.match.agent, 'sfdc-permission-orchestrator');

  const deployOnly = routeOperation('Deploy Auto_Assign flow to staging');
  assert.strictEqual(deployOnly.match.agent, 'sfdc-deployment-manager');

  const metadataOnly = routeOperation('Create a new field on custom object Address__c');
  assert.strictEqual(metadataOnly.match.agent, 'sfdc-metadata-manager');
}

function testMixedSecurityAndDeployPatternIsMandatory() {
  const config = JSON.parse(fs.readFileSync(agentTriggersPath, 'utf8'));
  const hasMixedPattern = config.triggers.mandatory.patterns.some((pattern) => pattern.agent === 'sfdc-orchestrator');
  assert.ok(hasMixedPattern, 'Expected a mandatory orchestrator pattern for mixed-domain workflows');
}

function testDocumentationCarriesMultiStepRoutingGuidance() {
  const orchestratorDoc = readFile('agents/sfdc-orchestrator.md');
  const permissionDoc = readFile('agents/sfdc-permission-orchestrator.md');
  const claudeDoc = readFile('CLAUDE.md');

  assert.ok(orchestratorDoc.includes('Grant `State__c` FLS, deploy the Auto_Assign flow to staging'), 'Expected explicit orchestrator workflow example');
  assert.ok(permissionDoc.includes('Route the parent task through `sfdc-orchestrator`'), 'Expected permission agent to defer mixed workflows to orchestrator');
  assert.ok(claudeDoc.includes('sfdc-data-operations'), 'Expected CLAUDE.md to include the data-operations split');
}

function main() {
  testRoutingConfigExists();
  testCliRoutingLoadsConfigWithoutWarning();
  testMixedWorkflowRoutesToOrchestrator();
  testMetadataCreationAndDeployRouteToOrchestrator();
  testPermissionOnlyAndDeployOnlyRouteToSpecialists();
  testMixedSecurityAndDeployPatternIsMandatory();
  testDocumentationCarriesMultiStepRoutingGuidance();
  console.log('OK: auto-agent-router routing tests passed');
}

main();
