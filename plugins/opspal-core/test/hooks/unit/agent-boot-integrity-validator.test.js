#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const CORE_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins', 'opspal-core');
const {
  auditPluginPromptAssets,
  validateAgentLaunch
} = require(path.join(PROJECT_ROOT, 'plugins/opspal-core/scripts/lib/agent-boot-integrity-validator.js'));

function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    testFn();
    console.log('OK');
    return { passed: true };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false };
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixture(options = {}) {
  const pluginName = options.pluginName || 'opspal-salesforce';
  const agentName = options.agentName || 'sfdc-automation-builder';
  const agentId = `${pluginName}:${agentName}`;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-boot-integrity-'));
  const pluginsRoot = path.join(root, 'plugins');
  const coreRoot = path.join(pluginsRoot, 'opspal-core');
  const pluginRoot = path.join(pluginsRoot, pluginName);
  const agentPath = path.join(pluginRoot, 'agents', `${agentName}.md`);

  writeFile(agentPath, options.agentMarkdown || '');

  Object.entries(options.extraFiles || {}).forEach(([relativePath, content]) => {
    writeFile(path.join(pluginRoot, relativePath), content);
  });

  const routingIndex = {
    agentsByFull: {},
    agents: {},
    agentsByShort: {}
  };

  if (options.routingIndexEntry) {
    routingIndex.agentsByFull[agentId] = options.routingIndexEntry;
    routingIndex.agents[agentName] = options.routingIndexEntry;
    routingIndex.agentsByShort[agentName] = [agentId];
  }

  writeFile(path.join(coreRoot, 'routing-index.json'), `${JSON.stringify(routingIndex, null, 2)}\n`);

  return {
    root,
    coreRoot,
    pluginRoot,
    pluginName,
    agentName,
    agentId,
    agentPath
  };
}

function matchingRoutingIndexEntry(pluginName, agentName, description = 'Test automation agent') {
  return {
    plugin: pluginName,
    file: `${agentName}.md`,
    path: `${pluginName}/agents/${agentName}.md`,
    name: agentName,
    description,
    tools: ['Read', 'Write'],
    triggerKeywords: ['automation', 'flow'],
    shortName: agentName,
    fullName: `${pluginName}:${agentName}`
  };
}

function removeFixture(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function collectCodes(report) {
  return report.issues.map((issue) => issue.code);
}

function collectFields(report) {
  return report.issues.map((issue) => issue.field);
}

function runAllTests() {
  console.log('\n[Tests] agent-boot-integrity-validator.js\n');
  const results = [];

  results.push(runTest('Happy path passes for sfdc-automation-builder with normal prompt', () => {
    const report = validateAgentLaunch({
      agentId: 'opspal-salesforce:sfdc-automation-builder',
      payload: {
        subagent_type: 'opspal-salesforce:sfdc-automation-builder',
        prompt: 'Build campaign structure flow package'
      },
      explicitPluginRoot: CORE_PLUGIN_ROOT
    });

    assert.strictEqual(report.pass, true, 'Expected sfdc-automation-builder boot validation to pass');
    assert.strictEqual(report.issueCount, 0, 'Happy path should have no integrity issues');
  }));

  results.push(runTest('Similarly shaped shared-import agent also passes', () => {
    const report = validateAgentLaunch({
      agentId: 'opspal-salesforce:sfdc-planner',
      payload: {
        subagent_type: 'opspal-salesforce:sfdc-planner',
        prompt: 'Plan a Salesforce automation rollout with safe deployment sequencing'
      },
      explicitPluginRoot: CORE_PLUGIN_ROOT
    });

    assert.strictEqual(report.pass, true, 'Expected sfdc-planner boot validation to pass');
    assert.strictEqual(report.issueCount, 0, 'Shared-import planner agent should not regress');
  }));

  results.push(runTest('Missing required metadata fails with structured integrity issue', () => {
    const fixture = createFixture({
      agentMarkdown: [
        '---',
        'name: sfdc-automation-builder',
        'description: Test automation agent',
        '---',
        '',
        'Prompt body'
      ].join('\n'),
      routingIndexEntry: matchingRoutingIndexEntry('opspal-salesforce', 'sfdc-automation-builder')
    });

    try {
      const report = validateAgentLaunch({
        agentId: fixture.agentId,
        payload: {
          subagent_type: fixture.agentId,
          prompt: 'Build campaign structure flow package'
        },
        explicitPluginRoot: fixture.coreRoot
      });

      assert.strictEqual(report.pass, false, 'Missing metadata should fail launch validation');
      assert(collectCodes(report).includes('agent_boot_missing_metadata_field'), 'Expected missing metadata issue');
      assert(collectFields(report).includes('tools'), 'Expected tools field to be reported as missing');
      assert(report.issues[0].repairAction, 'Structured issue should include repair guidance');
    } finally {
      removeFixture(fixture);
    }
  }));

  results.push(runTest('Missing imported prompt fragment is caught before launch', () => {
    const fixture = createFixture({
      agentMarkdown: [
        '---',
        'name: sfdc-automation-builder',
        'description: Test automation agent',
        'tools:',
        '  - Read',
        '  - Write',
        'triggerKeywords:',
        '  - automation',
        '  - flow',
        '---',
        '',
        '@import agents/shared/playbook-registry.yaml',
        '',
        'Prompt body'
      ].join('\n'),
      routingIndexEntry: matchingRoutingIndexEntry('opspal-salesforce', 'sfdc-automation-builder')
    });

    try {
      const report = validateAgentLaunch({
        agentId: fixture.agentId,
        payload: {
          subagent_type: fixture.agentId,
          prompt: 'Build campaign structure flow package'
        },
        explicitPluginRoot: fixture.coreRoot
      });

      assert.strictEqual(report.pass, false, 'Missing import should fail launch validation');
      assert(collectCodes(report).includes('agent_boot_missing_import'), 'Expected missing import issue');
      assert(report.issues.some((issue) => issue.field === 'agents/shared/playbook-registry.yaml'), 'Expected missing import path to be surfaced');
    } finally {
      removeFixture(fixture);
    }
  }));

  results.push(runTest('Stale routing-index entry is caught before launch', () => {
    const fixture = createFixture({
      agentMarkdown: [
        '---',
        'name: sfdc-automation-builder',
        'description: Current automation agent description',
        'tools:',
        '  - Read',
        '  - Write',
        'triggerKeywords:',
        '  - automation',
        '  - flow',
        '---',
        '',
        'Prompt body'
      ].join('\n'),
      routingIndexEntry: matchingRoutingIndexEntry(
        'opspal-salesforce',
        'sfdc-automation-builder',
        'Stale generated description'
      )
    });

    try {
      const report = validateAgentLaunch({
        agentId: fixture.agentId,
        payload: {
          subagent_type: fixture.agentId,
          prompt: 'Build campaign structure flow package'
        },
        explicitPluginRoot: fixture.coreRoot
      });

      assert.strictEqual(report.pass, false, 'Stale routing index should fail launch validation');
      assert(collectCodes(report).includes('agent_boot_routing_index_mismatch'), 'Expected routing index drift issue');
      assert(report.issues.some((issue) => issue.field === 'description'), 'Expected description drift to be reported');
    } finally {
      removeFixture(fixture);
    }
  }));

  results.push(runTest('Malformed payload is rejected with structured error', () => {
    const report = validateAgentLaunch({
      agentId: 'opspal-salesforce:sfdc-automation-builder',
      payload: {
        subagent_type: 'opspal-salesforce:sfdc-automation-builder',
        prompt: null
      },
      explicitPluginRoot: CORE_PLUGIN_ROOT
    });

    assert.strictEqual(report.pass, false, 'Malformed payload should fail launch validation');
    assert(collectCodes(report).includes('agent_boot_missing_launch_text'), 'Expected missing launch text issue');
    assert(report.issues[0].sourceOfTruth === 'launch-payload', 'Payload issue should point at launch-payload');
  }));

  results.push(runTest('Empty mapped context files are surfaced by plugin audit', () => {
    const fixture = createFixture({
      agentMarkdown: [
        '---',
        'name: sfdc-automation-builder',
        'description: Test automation agent',
        'tools:',
        '  - Read',
        '  - Write',
        '---',
        '',
        'Prompt body'
      ].join('\n'),
      routingIndexEntry: matchingRoutingIndexEntry('opspal-salesforce', 'sfdc-automation-builder'),
      extraFiles: {
        'contexts/metadata-manager/keyword-mapping.json': JSON.stringify({
          contexts: [
            {
              contextName: 'flow-xml-runbook-authoring',
              contextFile: 'flow-xml-runbook-authoring.md'
            }
          ]
        }, null, 2),
        'contexts/metadata-manager/flow-xml-runbook-authoring.md': ''
      }
    });

    try {
      const report = auditPluginPromptAssets('opspal-salesforce', fixture.coreRoot, { includeContexts: true });
      assert.strictEqual(report.pass, false, 'Empty mapped context should fail plugin audit');
      assert(collectCodes(report).includes('agent_boot_empty_mapped_context'), 'Expected mapped context integrity issue');
    } finally {
      removeFixture(fixture);
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
