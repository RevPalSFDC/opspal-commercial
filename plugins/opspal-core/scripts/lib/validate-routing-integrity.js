#!/usr/bin/env node

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  agentMatchesRequirements,
  compareAgentMetadataSources,
  deriveRouteRequirements,
  getAgentMetadata,
  normalizeStringArray,
  parseFrontmatter,
  resolveAgentFilePath,
  resolvePluginRoot
} = require('./agent-tool-registry');
const {
  auditPluginPromptAssets,
  validateAgentLaunch
} = require('./agent-boot-integrity-validator');
const {
  buildCanonicalKeywordMap,
  collectCanonicalAgentTargets,
  loadRoutingPatterns,
  resolveCorePluginRoot
} = require('./canonical-routing-registry');
const { RoutingIndexBuilder } = require('./routing-index-builder');
const { TaskRouter } = require('./task-router');
const { collectRoutingSemanticsViolations } = require('./validate-routing-state-semantics');

const LOCAL_PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_ROOT = resolveCorePluginRoot(LOCAL_PLUGIN_ROOT) || resolvePluginRoot(LOCAL_PLUGIN_ROOT);
const ROUTING_INDEX_PATH = path.join(PLUGIN_ROOT, 'routing-index.json');
const ROUTING_CAPABILITY_RULES_PATH = path.join(PLUGIN_ROOT, 'config', 'routing-capability-rules.json');
const AGENT_TOOL_REGISTRY_PATH = path.join(PLUGIN_ROOT, 'scripts', 'lib', 'agent-tool-registry.js');
const AUTHORITY_FILES = [
  path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'),
  path.join(PLUGIN_ROOT, 'scripts/lib/task-router.js'),
  path.join(PLUGIN_ROOT, 'scripts/lib/pre-execution-validator.js'),
  path.join(PLUGIN_ROOT, 'scripts/lib/__tests__/task-router.test.js')
];
const BANNED_ALIASES = [
  'unified-orchestrator',
  'unified-data-quality-validator',
  'sequential-planner',
  'uat-test-orchestrator',
  'gtm-territory-planner'
];
const TARGETED_SALESFORCE_BASH_AGENTS = [
  'opspal-salesforce:sfdc-data-operations',
  'opspal-salesforce:sfdc-bulkops-orchestrator',
  'opspal-salesforce:sfdc-orchestrator',
  'opspal-salesforce:sfdc-query-specialist',
  'opspal-salesforce:sfdc-data-export-manager',
  'opspal-salesforce:sfdc-csv-enrichment',
  'opspal-salesforce:sfdc-merge-orchestrator',
  'opspal-salesforce:sfdc-dedup-safety-copilot'
];
const PROMPT_EXPECTATIONS = [
  {
    prompt: 'create a HubSpot workflow for lead routing',
    expectedAgent: 'opspal-hubspot:hubspot-workflow-builder'
  },
  {
    prompt: 'audit a HubSpot workflow and identify automation issues',
    expectedAgent: 'opspal-hubspot:hubspot-workflow-auditor'
  },
  {
    prompt: 'review a Gong call and surface deal risk',
    expectedAgent: 'opspal-core:gong-deal-intelligence-agent'
  },
  {
    prompt: 'review a meeting transcript and identify action items',
    expectedAgent: 'opspal-core:fireflies-meeting-intelligence-agent'
  },
  {
    prompt: 'develop an implementation plan for Salesforce lead assignment changes',
    expectedAgent: 'opspal-salesforce:sfdc-planner'
  },
  {
    prompt: 'audit data quality issues across Salesforce objects',
    expectedAgent: 'opspal-salesforce:sfdc-quality-auditor'
  },
  {
    prompt: 'load a CSV and upsert Contacts into Salesforce by external ID',
    expectedAgent: 'opspal-salesforce:sfdc-upsert-orchestrator'
  },
  {
    prompt: 'merge duplicate Contacts and delete the obsolete duplicates in Salesforce',
    expectedAgent: 'opspal-salesforce:sfdc-merge-orchestrator'
  },
  {
    prompt: 'query duplicate Accounts, export the matches, then bulk update Contacts to point at the surviving Account in Salesforce',
    expectedAgent: 'opspal-salesforce:sfdc-bulkops-orchestrator'
  },
  {
    prompt: 'plan GTM territory design for enterprise sales coverage',
    expectedAgent: 'opspal-gtm-planning:gtm-territory-designer'
  },
  {
    prompt: 'build UAT test cases and execute acceptance testing for the release',
    expectedAgent: 'opspal-core:uat-orchestrator'
  }
];

function declaresTool(metadata, expectedTool) {
  return normalizeStringArray(metadata?.tools).some((tool) => {
    const normalized = String(tool || '').trim();
    if (expectedTool === 'Agent') {
      return normalized === 'Agent' || normalized === 'Task';
    }
    return normalized === expectedTool || normalized.startsWith(`${expectedTool}(`);
  });
}

function bodyRequiresTools(body = '') {
  const text = String(body || '');
  return {
    Bash: /```bash|(^|\s)(node scripts\/|sf\s|sfdx\s|jq\s|curl\s)/im.test(text),
    Agent: /Task\(|Use Task tool|subagent_type/im.test(text),
    Context7: /context7/i.test(text)
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => String(left).localeCompare(String(right)));
}

function normalizeComparableValue(value) {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeComparableValue(item));
    if (normalized.every((item) => (
      item === null ||
      ['string', 'number', 'boolean'].includes(typeof item)
    ))) {
      return uniqueSorted(normalized);
    }
    return normalized;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce((result, key) => {
        result[key] = normalizeComparableValue(value[key]);
        return result;
      }, {});
  }

  return value;
}

function stripVolatileRoutingIndexFields(index = {}) {
  const clone = JSON.parse(JSON.stringify(index || {}));
  delete clone.buildDate;
  return normalizeComparableValue(clone);
}

function buildGeneratedRoutingIndex() {
  const builder = new RoutingIndexBuilder();
  const pluginsRoot = path.resolve(PLUGIN_ROOT, '..');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-index-'));
  const tempFile = path.join(tempDir, 'routing-index.json');
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  if (process.env.ROUTING_INDEX_BUILDER_VERBOSE !== '1') {
    console.log = () => {};
    console.error = () => {};
  }

  try {
    builder.build(pluginsRoot);
    builder.save(tempFile);
    return builder.getIndex();
  } finally {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function collectRoutingIndexArtifactDrift() {
  if (!fs.existsSync(ROUTING_INDEX_PATH)) {
    return {
      driftDetected: true,
      issues: [
        {
          kind: 'missing_routing_index',
          section: 'routing-index.json'
        }
      ]
    };
  }

  const current = stripVolatileRoutingIndexFields(readJson(ROUTING_INDEX_PATH));
  const generated = stripVolatileRoutingIndexFields(buildGeneratedRoutingIndex());
  const issues = [];
  const currentAgents = current.agentsByFull || {};
  const generatedAgents = generated.agentsByFull || {};
  const allAgents = uniqueSorted([
    ...Object.keys(currentAgents),
    ...Object.keys(generatedAgents)
  ]);

  for (const agentId of allAgents) {
    const currentAgent = currentAgents[agentId];
    const generatedAgent = generatedAgents[agentId];

    if (!currentAgent || !generatedAgent) {
      issues.push({
        kind: 'agent_presence',
        agent: agentId,
        currentPresent: Boolean(currentAgent),
        generatedPresent: Boolean(generatedAgent)
      });
      continue;
    }

    const changedFields = [
      'actorType',
      'capabilities',
      'tools',
      'triggerKeywords',
      'description',
      'tier',
      'file'
    ].filter((field) => (
      JSON.stringify(currentAgent[field] ?? null) !== JSON.stringify(generatedAgent[field] ?? null)
    ));

    if (
      changedFields.length > 0 ||
      JSON.stringify(currentAgent) !== JSON.stringify(generatedAgent)
    ) {
      issues.push({
        kind: 'agent_metadata',
        agent: agentId,
        fields: changedFields.length > 0 ? changedFields : ['metadata'],
        current: currentAgent,
        generated: generatedAgent
      });
    }
  }

  if (!issues.some((issue) => issue.kind === 'agent_metadata' || issue.kind === 'agent_presence')) {
    const generatedSections = [
      'byKeyword',
      'byKeywordFull',
      'byPlugin',
      'byPluginFull',
      'byTier',
      'byTierFull',
      'agentsByShort',
      'duplicateShortNames',
      'commands',
      'hooks',
      'routingRules',
      'stats'
    ];

    for (const section of generatedSections) {
      if (JSON.stringify(current[section] ?? null) !== JSON.stringify(generated[section] ?? null)) {
        issues.push({
          kind: 'generated_section',
          section
        });
      }
    }
  }

  return {
    driftDetected: issues.length > 0 || JSON.stringify(current) !== JSON.stringify(generated),
    issues
  };
}

function addFailure(failures, code, message, details = {}) {
  failures.push({ code, message, ...details });
}

function collectAuditedSalesforceAgents() {
  const agents = [...TARGETED_SALESFORCE_BASH_AGENTS];
  const capabilityConfig = readJson(ROUTING_CAPABILITY_RULES_PATH);
  const routingPatterns = readJson(path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'));

  for (const rule of capabilityConfig?.salesforce?.rules || []) {
    const preferredAgent = String(rule.preferred_agent || rule.preferredAgent || '').trim();
    if (preferredAgent.startsWith('opspal-salesforce:')) {
      agents.push(preferredAgent);
    }
  }

  const allPatterns = routingPatterns?.mandatoryPatterns?.patterns || [];

  for (const pattern of allPatterns) {
    const preferredAgent = String(pattern.agent || '').trim();
    if (preferredAgent.startsWith('opspal-salesforce:')) {
      agents.push(preferredAgent);
    }

    for (const clearanceAgent of normalizeStringArray(pattern.clearanceAgents)) {
      if (String(clearanceAgent).startsWith('opspal-salesforce:')) {
        agents.push(clearanceAgent);
      }
    }
  }

  return Array.from(new Set(agents)).sort();
}

function validateCanonicalTargets(failures) {
  for (const reference of collectCanonicalAgentTargets(PLUGIN_ROOT)) {
    if (!reference.agent.includes(':')) {
      addFailure(
        failures,
        'non_fully_qualified_target',
        `Routing target must be fully qualified: ${reference.agent}`,
        { file: reference.source, path: reference.path, agent: reference.agent }
      );
      continue;
    }

    const filePath = resolveAgentFilePath(reference.agent, PLUGIN_ROOT);
    if (!filePath) {
      addFailure(
        failures,
        'missing_routing_target',
        `Routing target does not resolve to an on-disk agent: ${reference.agent}`,
        { file: reference.source, path: reference.path, agent: reference.agent }
      );
    }
  }
}

function validateRoutedAgentMetadata(failures) {
  const routedAgents = collectAuditedSalesforceAgents();

  for (const agentId of routedAgents) {
    const filePath = resolveAgentFilePath(agentId, PLUGIN_ROOT);
    if (!filePath) {
      continue;
    }

    const metadata = getAgentMetadata(agentId, PLUGIN_ROOT);
    const content = fs.readFileSync(filePath, 'utf8');
    const { data, body } = parseFrontmatter(content);
    const triggerKeywords = normalizeStringArray(metadata?.triggerKeywords || data.triggerKeywords || data.trigger_keywords);
    const toolRequirements = bodyRequiresTools(body);

    if (!metadata || metadata.fullName !== agentId) {
      addFailure(
        failures,
        'missing_metadata',
        `Routed agent metadata is incomplete for ${agentId}`,
        { file: filePath, agent: agentId }
      );
      continue;
    }

    if (!metadata.actorType) {
      addFailure(
        failures,
        'missing_actor_type',
        `Routed agent is missing actorType: ${agentId}`,
        { file: filePath, agent: agentId }
      );
    }

    if (!Array.isArray(metadata.capabilities) || metadata.capabilities.length === 0) {
      addFailure(
        failures,
        'missing_capabilities',
        `Routed agent is missing capabilities: ${agentId}`,
        { file: filePath, agent: agentId }
      );
    }

    if (triggerKeywords.length === 0) {
      addFailure(
        failures,
        'missing_trigger_keywords',
        `Routed agent is missing trigger keywords: ${agentId}`,
        { file: filePath, agent: agentId }
      );
    }

    if (toolRequirements.Bash && !declaresTool(metadata, 'Bash')) {
      addFailure(
        failures,
        'missing_bash_tool',
        `Agent body requires Bash but the tool is not declared: ${agentId}`,
        { file: filePath, agent: agentId }
      );
    }

    if (toolRequirements.Agent && !declaresTool(metadata, 'Agent')) {
      addFailure(
        failures,
        'missing_agent_tool',
        `Agent body requires Task/Agent but the tool is not declared: ${agentId}`,
        { file: filePath, agent: agentId }
      );
    }

    if (toolRequirements.Context7 && !normalizeStringArray(metadata.tools).some((tool) => String(tool).includes('context7'))) {
      addFailure(
        failures,
        'missing_context7_tool',
        `Agent body references Context7 but does not declare a Context7 tool: ${agentId}`,
        { file: filePath, agent: agentId }
      );
    }
  }
}

function validateMetadataSourceSync(failures) {
  const auditedAgents = collectAuditedSalesforceAgents();

  for (const agentId of auditedAgents) {
    const comparison = compareAgentMetadataSources(agentId, PLUGIN_ROOT);
    if (comparison.markdown && comparison.routingIndex && comparison.mismatches.length > 0) {
      for (const mismatch of comparison.mismatches) {
        addFailure(
          failures,
          'routing_metadata_drift',
          `Agent metadata drift detected for ${agentId}: ${mismatch.field} differs between markdown and routing-index.json`,
          {
            file: ROUTING_INDEX_PATH,
            agent: agentId,
            field: mismatch.field,
            markdown: mismatch.markdown,
            routingIndex: mismatch.routingIndex
          }
        );
      }
    }

    if (!TARGETED_SALESFORCE_BASH_AGENTS.includes(agentId)) {
      continue;
    }

    const markdownTools = normalizeStringArray(comparison.markdown?.tools || []);
    const routingIndexTools = normalizeStringArray(comparison.routingIndex?.tools || []);
    const activeTools = normalizeStringArray(comparison.active?.tools || []);

    if (comparison.markdown && !markdownTools.includes('Bash')) {
      addFailure(
        failures,
        'salesforce_agent_missing_declared_bash',
        `Targeted Salesforce agent does not declare Bash in markdown: ${agentId}`,
        { agent: agentId, file: comparison.markdown.filePath || resolveAgentFilePath(agentId, PLUGIN_ROOT) }
      );
    }

    if (comparison.routingIndex && !routingIndexTools.includes('Bash')) {
      addFailure(
        failures,
        'salesforce_agent_missing_indexed_bash',
        `Targeted Salesforce agent is missing Bash in routing-index.json: ${agentId}`,
        { agent: agentId, file: ROUTING_INDEX_PATH }
      );
    }

    if (comparison.active && !activeTools.includes('Bash')) {
      addFailure(
        failures,
        'salesforce_agent_missing_active_bash',
        `Targeted Salesforce agent is missing Bash in active metadata: ${agentId}`,
        { agent: agentId }
      );
    }
  }
}

function validateCapabilityRuleTargets(failures) {
  const config = readJson(ROUTING_CAPABILITY_RULES_PATH);

  for (const rule of config?.salesforce?.rules || []) {
    const preferredAgent = String(rule.preferred_agent || rule.preferredAgent || '').trim();
    if (!preferredAgent) {
      continue;
    }

    if (!resolveAgentFilePath(preferredAgent, PLUGIN_ROOT)) {
      addFailure(
        failures,
        'missing_capability_rule_target',
        `Capability rule preferred agent is missing: ${preferredAgent}`,
        { file: ROUTING_CAPABILITY_RULES_PATH, ruleId: rule.rule_id || rule.ruleId || '' }
      );
      continue;
    }

    const matches = agentMatchesRequirements(preferredAgent, {
      requiredCapabilities: rule.required_capabilities || rule.requiredCapabilities || [],
      requiredTools: rule.required_tools || rule.requiredTools || [],
      allowedActorTypes: rule.allowed_actor_types || rule.allowedActorTypes || []
    }, PLUGIN_ROOT);

    if (!matches) {
      addFailure(
        failures,
        'capability_rule_mismatch',
        `Capability rule preferred agent does not satisfy its own declared requirements: ${preferredAgent}`,
        { file: ROUTING_CAPABILITY_RULES_PATH, ruleId: rule.rule_id || rule.ruleId || '', agent: preferredAgent }
      );
    }
  }
}

function validateRouteRequirementDerivation(failures) {
  const routingPatterns = readJson(path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'));
  const mixedCleanupPattern = (routingPatterns?.mandatoryPatterns?.patterns || []).find((pattern) => pattern.id === 'mixed-salesforce-data-cleanup');
  const mergePattern = (routingPatterns?.mandatoryPatterns?.patterns || []).find((pattern) => pattern.id === 'record-dedup-merge');
  const routeChecks = [
    {
      label: 'sfdc-data-operations',
      preferredAgent: 'opspal-salesforce:sfdc-data-operations',
      clearanceAgents: ['opspal-salesforce:sfdc-data-operations']
    },
    {
      label: 'sfdc-bulkops-orchestrator',
      preferredAgent: 'opspal-salesforce:sfdc-bulkops-orchestrator',
      clearanceAgents: ['opspal-salesforce:sfdc-bulkops-orchestrator']
    },
    {
      label: 'mixed-salesforce-data-cleanup',
      preferredAgent: mixedCleanupPattern?.agent || 'opspal-salesforce:sfdc-orchestrator',
      clearanceAgents: mixedCleanupPattern?.clearanceAgents || []
    },
    {
      label: 'record-dedup-merge',
      preferredAgent: mergePattern?.agent || 'opspal-salesforce:sfdc-merge-orchestrator',
      clearanceAgents: mergePattern?.clearanceAgents || []
    },
    {
      label: 'sfdc-upsert-orchestrator',
      preferredAgent: 'opspal-salesforce:sfdc-upsert-orchestrator',
      clearanceAgents: ['opspal-salesforce:sfdc-upsert-orchestrator']
    }
  ];

  for (const routeCheck of routeChecks) {
    const requirements = deriveRouteRequirements(
      routeCheck.preferredAgent,
      routeCheck.clearanceAgents,
      PLUGIN_ROOT
    );

    if (!normalizeStringArray(requirements.requiredTools).includes('Bash')) {
      addFailure(
        failures,
        'route_requirements_missing_bash',
        `Derived route requirements dropped Bash for ${routeCheck.label}`,
        {
          agent: routeCheck.preferredAgent,
          requiredTools: requirements.requiredTools,
          allowedAgents: requirements.allowedAgents
        }
      );
    }

    for (const allowedAgent of normalizeStringArray(requirements.allowedAgents)) {
      if (!agentMatchesRequirements(allowedAgent, requirements, PLUGIN_ROOT)) {
        addFailure(
          failures,
          'route_requirements_family_mismatch',
          `Allowed agent ${allowedAgent} does not satisfy derived route requirements for ${routeCheck.label}`,
          {
            agent: allowedAgent,
            preferredAgent: routeCheck.preferredAgent,
            requiredTools: requirements.requiredTools,
            requiredCapabilities: requirements.requiredCapabilities,
            allowedActorTypes: requirements.allowedActorTypes
          }
        );
      }
    }
  }
}

function validateMixedCleanupRouteContract(failures) {
  const routingPatterns = readJson(path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'));
  const mixedCleanupPattern = (routingPatterns?.mandatoryPatterns?.patterns || []).find((pattern) => pattern.id === 'mixed-salesforce-data-cleanup');
  const expectedPreferredAgent = 'opspal-salesforce:sfdc-orchestrator';
  const expectedFamily = [
    'opspal-salesforce:sfdc-orchestrator',
    'opspal-salesforce:sfdc-query-specialist',
    'opspal-salesforce:sfdc-data-export-manager',
    'opspal-salesforce:sfdc-csv-enrichment',
    'opspal-salesforce:sfdc-bulkops-orchestrator',
    'opspal-salesforce:sfdc-merge-orchestrator',
    'opspal-salesforce:sfdc-dedup-safety-copilot'
  ];

  if (!mixedCleanupPattern) {
    addFailure(
      failures,
      'mixed_cleanup_route_missing',
      'Mandatory mixed-salesforce-data-cleanup route is missing from routing-patterns.json',
      { file: path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'), routeId: 'mixed-salesforce-data-cleanup' }
    );
    return;
  }

  if (mixedCleanupPattern.agent !== expectedPreferredAgent) {
    addFailure(
      failures,
      'mixed_cleanup_route_wrong_preferred_agent',
      `mixed-salesforce-data-cleanup must remain orchestrator-led and target ${expectedPreferredAgent}`,
      {
        file: path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'),
        routeId: 'mixed-salesforce-data-cleanup',
        expectedAgent: expectedPreferredAgent,
        actualAgent: mixedCleanupPattern.agent || null
      }
    );
  }

  const currentFamily = normalizeStringArray(mixedCleanupPattern.clearanceAgents);
  const missingAgents = expectedFamily.filter((agentId) => !currentFamily.includes(agentId));

  if (missingAgents.length > 0) {
    addFailure(
      failures,
      'mixed_cleanup_route_family_drift',
      'mixed-salesforce-data-cleanup no longer preserves the orchestrator-led specialist family',
      {
        file: path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json'),
        routeId: 'mixed-salesforce-data-cleanup',
        expectedFamily,
        actualFamily: currentFamily,
        missingAgents
      }
    );
  }

  const requirements = deriveRouteRequirements(
    mixedCleanupPattern.agent,
    mixedCleanupPattern.clearanceAgents || [],
    PLUGIN_ROOT
  );
  const resolvedFamily = normalizeStringArray(requirements.allowedAgents);
  const unresolvedAgents = normalizeStringArray(requirements.unresolvedAgents);

  if (unresolvedAgents.length > 0) {
    addFailure(
      failures,
      'mixed_cleanup_route_unresolved_family_member',
      'mixed-salesforce-data-cleanup includes unresolved family members',
      {
        routeId: 'mixed-salesforce-data-cleanup',
        unresolvedAgents
      }
    );
  }

  const missingResolvedAgents = expectedFamily.filter((agentId) => !resolvedFamily.includes(agentId));
  if (missingResolvedAgents.length > 0) {
    addFailure(
      failures,
      'mixed_cleanup_route_resolution_drift',
      'Derived mixed-salesforce-data-cleanup route requirements no longer resolve to the full orchestrator-led family',
      {
        routeId: 'mixed-salesforce-data-cleanup',
        expectedFamily,
        resolvedFamily,
        missingAgents: missingResolvedAgents
      }
    );
  }
}

function validateAgentToolRegistryCliContract(failures) {
  const fixtures = [
    {
      agent: 'opspal-salesforce:sfdc-data-operations',
      clearanceAgents: ['opspal-salesforce:sfdc-data-operations']
    },
    {
      agent: 'opspal-salesforce:sfdc-bulkops-orchestrator',
      clearanceAgents: ['opspal-salesforce:sfdc-bulkops-orchestrator']
    },
    {
      agent: 'opspal-salesforce:sfdc-upsert-orchestrator',
      clearanceAgents: ['opspal-salesforce:sfdc-upsert-orchestrator']
    },
    {
      agent: 'opspal-salesforce:sfdc-orchestrator',
      clearanceAgents: [
        'opspal-salesforce:sfdc-orchestrator',
        'opspal-salesforce:sfdc-query-specialist',
        'opspal-salesforce:sfdc-data-export-manager',
        'opspal-salesforce:sfdc-csv-enrichment',
        'opspal-salesforce:sfdc-bulkops-orchestrator',
        'opspal-salesforce:sfdc-merge-orchestrator',
        'opspal-salesforce:sfdc-dedup-safety-copilot'
      ]
    }
  ];

  for (const fixture of fixtures) {
    try {
      const output = execFileSync(
        'node',
        [
          AGENT_TOOL_REGISTRY_PATH,
          'route-requirements',
          fixture.agent,
          JSON.stringify(fixture.clearanceAgents),
          PLUGIN_ROOT
        ],
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(output);
      if (!normalizeStringArray(parsed.requiredTools).includes('Bash')) {
        addFailure(
          failures,
          'route_requirements_cli_missing_bash',
          `route-requirements CLI returned a non-Bash profile for ${fixture.agent}`,
          { agent: fixture.agent, requiredTools: parsed.requiredTools || [] }
        );
      }
    } catch (error) {
      addFailure(
        failures,
        'route_requirements_cli_unavailable',
        `agent-tool-registry route-requirements CLI failed for ${fixture.agent}`,
        { agent: fixture.agent, error: error.message }
      );
    }
  }
}

function validateRoutingIndexArtifactSync(failures) {
  const drift = collectRoutingIndexArtifactDrift();

  if (drift.issues.some((issue) => issue.kind === 'missing_routing_index')) {
    return;
  }

  for (const issue of drift.issues) {
    if (issue.kind === 'agent_presence') {
      addFailure(
        failures,
        'routing_index_stale_agent_presence',
        `routing-index.json is stale for ${issue.agent}: presence differs from regenerated artifact`,
        {
          file: ROUTING_INDEX_PATH,
          agent: issue.agent,
          currentPresent: issue.currentPresent,
          generatedPresent: issue.generatedPresent
        }
      );
      continue;
    }

    if (issue.kind === 'agent_metadata') {
      addFailure(
        failures,
        'routing_index_stale_agent_metadata',
        `routing-index.json is stale for ${issue.agent}: ${issue.fields.join(', ')} differ from the regenerated artifact`,
        {
          file: ROUTING_INDEX_PATH,
          agent: issue.agent,
          fields: issue.fields,
          current: issue.current,
          generated: issue.generated
        }
      );
      continue;
    }

    if (issue.kind === 'generated_section') {
      addFailure(
        failures,
        'routing_index_stale_generated_section',
        `routing-index.json is stale for generated section "${issue.section}"`,
        {
          file: ROUTING_INDEX_PATH,
          section: issue.section
        }
      );
    }
  }
}

function validateAuthorityFiles(failures) {
  for (const filePath of AUTHORITY_FILES) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    for (const alias of BANNED_ALIASES) {
      if (content.includes(alias)) {
        addFailure(
          failures,
          'stale_alias_reference',
          `Authority file still references stale routing alias "${alias}"`,
          { file: filePath, alias }
        );
      }
    }
  }
}

function validateRoutingIndexSync(failures) {
  if (!fs.existsSync(ROUTING_INDEX_PATH)) {
    addFailure(
      failures,
      'missing_routing_index',
      'routing-index.json is missing',
      { file: ROUTING_INDEX_PATH }
    );
    return;
  }

  const routingIndex = readJson(ROUTING_INDEX_PATH);
  for (const agentId of collectAuditedSalesforceAgents()) {
    const metadata = routingIndex.agentsByFull?.[agentId];
    if (!metadata) {
      addFailure(
        failures,
        'routing_index_missing_agent',
        `routing-index.json is missing canonical routed agent ${agentId}`,
        { file: ROUTING_INDEX_PATH, agent: agentId }
      );
      continue;
    }

    if (!metadata.actorType) {
      addFailure(
        failures,
        'routing_index_missing_actor_type',
        `routing-index.json is missing actorType for ${agentId}`,
        { file: ROUTING_INDEX_PATH, agent: agentId }
      );
    }

    if (!Array.isArray(metadata.capabilities) || metadata.capabilities.length === 0) {
      addFailure(
        failures,
        'routing_index_missing_capabilities',
        `routing-index.json is missing capabilities for ${agentId}`,
        { file: ROUTING_INDEX_PATH, agent: agentId }
      );
    }

    if (!Array.isArray(metadata.triggerKeywords) || metadata.triggerKeywords.length === 0) {
      addFailure(
        failures,
        'routing_index_missing_keywords',
        `routing-index.json is missing trigger keywords for ${agentId}`,
        { file: ROUTING_INDEX_PATH, agent: agentId }
      );
    }
  }
}

function validatePromptRouting(failures) {
  const router = new TaskRouter({ verbose: false });
  const auditedAgents = new Set(collectAuditedSalesforceAgents());

  for (const probe of PROMPT_EXPECTATIONS) {
    if (!auditedAgents.has(probe.expectedAgent)) {
      continue;
    }

    const result = router.analyze(probe.prompt);
    if (result.agent !== probe.expectedAgent) {
      addFailure(
        failures,
        'prompt_route_mismatch',
        `Prompt routed to ${result.agent || 'none'} instead of ${probe.expectedAgent}`,
        { prompt: probe.prompt, expectedAgent: probe.expectedAgent, actualAgent: result.agent || null }
      );
      continue;
    }

    if (!resolveAgentFilePath(result.agent, PLUGIN_ROOT)) {
      addFailure(
        failures,
        'prompt_route_missing_agent',
        `Prompt routed to a non-existent agent: ${result.agent}`,
        { prompt: probe.prompt, agent: result.agent }
      );
    }
  }
}

function validateRoutingStateSemantics(failures) {
  for (const violation of collectRoutingSemanticsViolations(PLUGIN_ROOT)) {
    addFailure(
      failures,
      violation.code,
      violation.message,
      {
        file: path.join(PLUGIN_ROOT, violation.file),
        line: violation.line,
        excerpt: violation.excerpt
      }
    );
  }
}

function validateAgentBootIntegrity(failures) {
  const launchProbes = [
    {
      agentId: 'opspal-salesforce:sfdc-automation-builder',
      payload: { prompt: 'Build campaign structure flow package' }
    },
    {
      agentId: 'opspal-salesforce:sfdc-planner',
      payload: { prompt: 'Plan a Salesforce automation rollout with safe deployment sequencing' }
    }
  ];

  for (const probe of launchProbes) {
    const report = validateAgentLaunch({
      agentId: probe.agentId,
      payload: probe.payload,
      explicitPluginRoot: PLUGIN_ROOT
    });

    for (const issue of report.issues) {
      addFailure(
        failures,
        issue.code,
        issue.message,
        {
          agent: issue.agentId || probe.agentId,
          file: issue.assetPath || null,
          field: issue.field || null,
          sourceOfTruth: issue.sourceOfTruth || null,
          checkedSources: issue.checkedSources || [],
          repairAction: issue.repairAction || null
        }
      );
    }
  }

  for (const pluginName of ['opspal-salesforce', 'opspal-core']) {
    const report = auditPluginPromptAssets(pluginName, PLUGIN_ROOT, {
      includeContexts: pluginName === 'opspal-salesforce'
    });

    for (const issue of report.issues) {
      addFailure(
        failures,
        issue.code,
        issue.message,
        {
          agent: issue.agentId || null,
          file: issue.assetPath || null,
          field: issue.field || null,
          sourceOfTruth: issue.sourceOfTruth || null,
          checkedSources: issue.checkedSources || [],
          repairAction: issue.repairAction || null
        }
      );
    }
  }
}

function formatDetailValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatRoutingIntegrityFailure(failure) {
  const details = [];

  for (const [label, value] of [
    ['route', failure.routeId],
    ['agent', failure.agent],
    ['rule', failure.ruleId],
    ['section', failure.section],
    ['field', failure.field],
    ['fields', Array.isArray(failure.fields) ? failure.fields.join(', ') : failure.fields],
    ['expectedAgent', failure.expectedAgent],
    ['actualAgent', failure.actualAgent],
    ['sourceOfTruth', failure.sourceOfTruth],
    ['checkedSources', failure.checkedSources],
    ['repairAction', failure.repairAction],
    ['expectedTools', failure.expectedTools],
    ['actualTools', failure.actualTools],
    ['requiredTools', failure.requiredTools],
    ['requiredCapabilities', failure.requiredCapabilities],
    ['allowedActorTypes', failure.allowedActorTypes],
    ['missingAgents', failure.missingAgents],
    ['unresolvedAgents', failure.unresolvedAgents]
  ]) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    details.push(`${label}=${formatDetailValue(value)}`);
  }

  if (failure.markdown !== undefined && failure.routingIndex !== undefined) {
    details.push(`markdown=${formatDetailValue(failure.markdown)}`);
    details.push(`routingIndex=${formatDetailValue(failure.routingIndex)}`);
  }

  if (failure.file) {
    details.push(`file=${failure.file}`);
  }

  return details.length > 0
    ? `${failure.code}: ${failure.message} (${details.join('; ')})`
    : `${failure.code}: ${failure.message}`;
}

function writeReportFile(reportFile, report) {
  if (!reportFile) {
    return;
  }

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function validateRoutingIntegrity() {
  const failures = [];
  const registry = loadRoutingPatterns(PLUGIN_ROOT);

  if (!registry || typeof registry !== 'object' || !registry.platformPatterns) {
    addFailure(
      failures,
      'invalid_routing_registry',
      'routing-patterns.json could not be loaded',
      { file: path.join(PLUGIN_ROOT, 'config', 'routing-patterns.json') }
    );
  } else {
    validateCanonicalTargets(failures);
    validateRoutedAgentMetadata(failures);
    validateMetadataSourceSync(failures);
    validateCapabilityRuleTargets(failures);
    validateRouteRequirementDerivation(failures);
    validateMixedCleanupRouteContract(failures);
    validateAgentToolRegistryCliContract(failures);
    validateRoutingIndexSync(failures);
    validateRoutingIndexArtifactSync(failures);
    validateAuthorityFiles(failures);
    validatePromptRouting(failures);
    validateRoutingStateSemantics(failures);
    validateAgentBootIntegrity(failures);
  }

  return {
    pass: failures.length === 0,
    failureCount: failures.length,
    failures
  };
}

function main() {
  const jsonOutput = process.argv.includes('--json');
  const reportFileIndex = process.argv.indexOf('--report-file');
  const reportFile = reportFileIndex >= 0 && process.argv[reportFileIndex + 1]
    ? path.resolve(process.argv[reportFileIndex + 1])
    : '';
  const report = validateRoutingIntegrity();

  writeReportFile(reportFile, report);

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.pass) {
    console.log('Routing integrity validation passed');
  } else {
    console.log(`Routing integrity validation failed (${report.failureCount})`);
    for (const failure of report.failures) {
      console.log(`- ${formatRoutingIntegrityFailure(failure)}`);
    }
  }

  process.exit(report.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  bodyRequiresTools,
  collectRoutingIndexArtifactDrift,
  formatRoutingIntegrityFailure,
  PROMPT_EXPECTATIONS,
  validateRoutingIntegrity
};
