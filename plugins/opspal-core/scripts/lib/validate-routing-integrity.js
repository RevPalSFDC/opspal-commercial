#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const {
  agentMatchesRequirements,
  getAgentMetadata,
  normalizeStringArray,
  parseFrontmatter,
  resolveAgentFilePath,
  resolvePluginRoot
} = require('./agent-tool-registry');
const {
  buildCanonicalKeywordMap,
  collectCanonicalAgentTargets,
  loadRoutingPatterns,
  resolveCorePluginRoot
} = require('./canonical-routing-registry');
const { TaskRouter } = require('./task-router');
const { collectRoutingSemanticsViolations } = require('./validate-routing-state-semantics');

const LOCAL_PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_ROOT = resolveCorePluginRoot(LOCAL_PLUGIN_ROOT) || resolvePluginRoot(LOCAL_PLUGIN_ROOT);
const ROUTING_INDEX_PATH = path.join(PLUGIN_ROOT, 'routing-index.json');
const ROUTING_CAPABILITY_RULES_PATH = path.join(PLUGIN_ROOT, 'config', 'routing-capability-rules.json');
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

function addFailure(failures, code, message, details = {}) {
  failures.push({ code, message, ...details });
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
  const keywordMap = buildCanonicalKeywordMap(PLUGIN_ROOT);
  const routedAgents = Object.keys(keywordMap).sort();

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
  for (const agentId of Object.keys(buildCanonicalKeywordMap(PLUGIN_ROOT))) {
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

  for (const probe of PROMPT_EXPECTATIONS) {
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

function main() {
  const jsonOutput = process.argv.includes('--json');
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
    validateCapabilityRuleTargets(failures);
    validateAuthorityFiles(failures);
    validateRoutingIndexSync(failures);
    validatePromptRouting(failures);
    validateRoutingStateSemantics(failures);
  }

  const report = {
    pass: failures.length === 0,
    failureCount: failures.length,
    failures
  };

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.pass) {
    console.log('Routing integrity validation passed');
  } else {
    console.log(`Routing integrity validation failed (${report.failureCount})`);
    for (const failure of failures) {
      const fileHint = failure.file ? ` [${failure.file}]` : '';
      console.log(`- ${failure.code}: ${failure.message}${fileHint}`);
    }
  }

  process.exit(report.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { bodyRequiresTools, PROMPT_EXPECTATIONS };
