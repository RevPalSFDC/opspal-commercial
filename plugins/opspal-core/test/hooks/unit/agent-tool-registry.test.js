#!/usr/bin/env node

/**
 * Unit Tests for agent-tool-registry.js
 *
 * Validates metadata-driven tool resolution across plugins and guards against
 * frontmatter drift that would leave agents without required tool access.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  agentHasTool,
  compareAgentMetadataSources,
  deriveRouteRequirements,
  getAgentMetadata,
  normalizeStringArray,
  parseFrontmatter
} = require('../../../scripts/lib/agent-tool-registry');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const AGENT_ROOTS = [
  path.join(PROJECT_ROOT, 'plugins/opspal-core/agents'),
  path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/agents'),
  path.join(PROJECT_ROOT, 'plugins/opspal-hubspot/agents'),
  path.join(PROJECT_ROOT, 'plugins/opspal-marketo/agents')
];

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

function getAllAgentFiles() {
  return AGENT_ROOTS.flatMap((root) => {
    if (!fs.existsSync(root)) {
      return [];
    }

    return fs.readdirSync(root)
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(root, file));
  });
}

async function runAllTests() {
  console.log('\n[Tests] agent-tool-registry.js Tests\n');

  const results = [];

  results.push(await runTest('Resolves Bash tool declarations across plugins', async () => {
    assert(
      agentHasTool('opspal-salesforce:sfdc-deployment-manager', 'Bash', PLUGIN_ROOT),
      'Salesforce deployment manager should resolve declared Bash access'
    );
    assert(
      agentHasTool('opspal-hubspot:hubspot-cms-theme-manager', 'Bash', PLUGIN_ROOT),
      'HubSpot CMS theme manager should resolve declared Bash access'
    );
    assert(
      agentHasTool('opspal-marketo:marketo-data-operations', 'Bash', PLUGIN_ROOT),
      'Marketo data operations should resolve declared Bash access'
    );
    assert(
      agentHasTool('opspal-core:instance-deployer', 'Bash', PLUGIN_ROOT),
      'Core instance deployer should resolve declared Bash access'
    );
    assert(
      !agentHasTool('opspal-salesforce:sfdc-cpq-specialist', 'Bash', PLUGIN_ROOT),
      'Agents that do not declare Bash should not resolve Bash access'
    );
    assert(
      agentHasTool('opspal-salesforce:sfdc-data-operations', 'Bash', PLUGIN_ROOT),
      'Salesforce data operations should resolve declared Bash access'
    );
    assert(
      agentHasTool('opspal-salesforce:sfdc-bulkops-orchestrator', 'Bash', PLUGIN_ROOT),
      'Salesforce bulkops orchestrator should resolve declared Bash access'
    );
  }));

  results.push(await runTest('Captures current frontmatter for audited agents', async () => {
    const upsertMetadata = getAgentMetadata('opspal-salesforce:sfdc-upsert-orchestrator', PLUGIN_ROOT);
    assert(upsertMetadata, 'Upsert orchestrator metadata should resolve');
    assert(
      normalizeStringArray(upsertMetadata.tools).includes('mcp__context7__*'),
      'Upsert orchestrator should declare Context7 after the audit fix'
    );

    const metadataAnalyzer = getAgentMetadata('opspal-salesforce:sfdc-metadata-analyzer', PLUGIN_ROOT);
    assert(metadataAnalyzer, 'Metadata analyzer metadata should resolve');
    assert(
      normalizeStringArray(metadataAnalyzer.tools).includes('Bash'),
      'Metadata analyzer should declare Bash after the audit fix'
    );
    assert(
      normalizeStringArray(metadataAnalyzer.tools).includes('mcp_salesforce_metadata_describe'),
      'Metadata analyzer should declare Salesforce metadata describe access after the audit fix'
    );
  }));

  results.push(await runTest('Finds no Context7 references without a Context7 tool declaration', async () => {
    const mismatches = [];

    for (const filePath of getAllAgentFiles()) {
      const content = fs.readFileSync(filePath, 'utf8');
      const { data, body } = parseFrontmatter(content);
      const tools = normalizeStringArray(data.tools);

      if (!/context7/i.test(body)) {
        continue;
      }

      if (!tools.some((tool) => String(tool).includes('context7'))) {
        mismatches.push(path.relative(PROJECT_ROOT, filePath));
      }
    }

    assert.deepStrictEqual(
      mismatches,
      [],
      `Agents referencing Context7 must declare a Context7 tool. Found: ${mismatches.join(', ')}`
    );
  }));

  results.push(await runTest('Keeps markdown and routing-index tool metadata in sync for critical Salesforce agents', async () => {
    for (const agentId of [
      'opspal-salesforce:sfdc-data-operations',
      'opspal-salesforce:sfdc-bulkops-orchestrator',
      'opspal-salesforce:sfdc-orchestrator'
    ]) {
      const comparison = compareAgentMetadataSources(agentId, PLUGIN_ROOT);
      assert(comparison.markdown, `${agentId} should resolve from markdown`);
      assert(comparison.routingIndex, `${agentId} should resolve from routing-index.json`);
      assert.deepStrictEqual(
        comparison.mismatches,
        [],
        `${agentId} should not drift between markdown and routing-index.json`
      );
    }
  }));

  results.push(await runTest('Derives Bash-required route requirements for Salesforce data specialists', async () => {
    const dataOpsRequirements = deriveRouteRequirements(
      'opspal-salesforce:sfdc-data-operations',
      ['opspal-salesforce:sfdc-data-operations'],
      PLUGIN_ROOT
    );
    const bulkopsRequirements = deriveRouteRequirements(
      'opspal-salesforce:sfdc-bulkops-orchestrator',
      ['opspal-salesforce:sfdc-bulkops-orchestrator'],
      PLUGIN_ROOT
    );

    assert(
      normalizeStringArray(dataOpsRequirements.requiredTools).includes('Bash'),
      'Data operations route requirements should preserve Bash'
    );
    assert(
      normalizeStringArray(bulkopsRequirements.requiredTools).includes('Bash'),
      'Bulkops orchestrator route requirements should preserve Bash'
    );
  }));

  const failed = results.filter((result) => !result.passed);

  console.log(`\n[Results] ${results.length - failed.length} passed, ${failed.length} failed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
