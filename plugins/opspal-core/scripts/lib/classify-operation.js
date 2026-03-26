#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAgentsMatchingRequirements, normalizeStringArray } = require('./agent-tool-registry');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MCP_POLICY_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'mcp-tool-policies.json');
const DEFAULT_ROUTING_CAPABILITY_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'routing-capability-rules.json');

const SALESFORCE_ALIAS_PATTERNS = {
  production: /(^|[-_])(prod|production|prd|live|main)([-_0-9]|$)/i,
  sandbox: /(^|[-_])(sandbox|sbx|dev|test|qa|uat|staging|stage|stg|sit)([-_0-9]|$)/i,
  scratch: /(^|[-_])(scratch|scratchorg|so)([-_0-9]|$)/i
};

const HUBSPOT_ENV_PATTERNS = {
  production: /\b(prod|production|live)\b/i,
  sandbox: /\b(sandbox|developer|dev|test|qa|uat|staging|stage|stg)\b/i
};

const MARKETO_ENV_PATTERNS = {
  production: /\b(prod|production|live)\b/i,
  sandbox: /\b(mktosandbox\.com|sandbox|dev|test|qa|uat|staging|stage|stg)\b/i
};

const PERMISSION_SECURITY_OBJECT_REGEX = /PermissionSetAssignment|PermissionSetGroupAssignment|PermissionSetLicenseAssign|PermissionSetGroup|PermissionSet|MutingPermissionSet|ObjectPermissions|FieldPermissions|SetupEntityAccess|UserRole|Profile/i;
const CORE_UPSERT_OBJECT_REGEX = /(^|[\s])(Lead|Contact|Account)([\s]|$)|--sobject[\s]+(Lead|Contact|Account)/i;
const CORE_QUERY_OBJECT_REGEX = /from[\s]+(Lead|Contact|Account|Opportunity|Case)\b/i;
const TERRITORY_OBJECT_REGEX = /Territory2|Territory2Model|Territory2Type|UserTerritory2Association|ObjectTerritory2Association/i;
const VALIDATION_RULE_REGEX = /ValidationRule|validation[._ -]?rule/i;
const ROUTING_CAPABILITY_CONFIG_CACHE = new Map();

function stripWrappingQuotes(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/^["']|["']$/g, '');
}

function loadRoutingCapabilityConfig(configPath = DEFAULT_ROUTING_CAPABILITY_CONFIG_PATH) {
  if (!ROUTING_CAPABILITY_CONFIG_CACHE.has(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    ROUTING_CAPABILITY_CONFIG_CACHE.set(configPath, JSON.parse(raw));
  }

  return ROUTING_CAPABILITY_CONFIG_CACHE.get(configPath);
}

function getSalesforceRoutingRule(ruleId, options = {}) {
  try {
    const config = options.routingCapabilityConfig || loadRoutingCapabilityConfig(
      options.routingCapabilityConfigPath || DEFAULT_ROUTING_CAPABILITY_CONFIG_PATH
    );
    const rules = config?.salesforce?.rules || [];
    return rules.find((rule) => (
      String(rule.rule_id || rule.ruleId || '').trim() === String(ruleId || '').trim()
    )) || null;
  } catch {
    return null;
  }
}

function getSalesforceDeployPolicy(policyName, options = {}) {
  try {
    const config = options.routingCapabilityConfig || loadRoutingCapabilityConfig(
      options.routingCapabilityConfigPath || DEFAULT_ROUTING_CAPABILITY_CONFIG_PATH
    );
    return config?.salesforce?.deployPolicies?.[policyName] || null;
  } catch {
    return null;
  }
}

function buildRoutingDecision(ruleId, defaults = {}, options = {}) {
  const rule = getSalesforceRoutingRule(ruleId, options);
  const requiredCapabilities = normalizeStringArray(
    rule?.required_capabilities || rule?.requiredCapabilities || defaults.requiredCapabilities
  );
  const requiredTools = normalizeStringArray(
    rule?.required_tools || rule?.requiredTools || defaults.requiredTools
  );
  const allowedActorTypes = normalizeStringArray(
    rule?.allowed_actor_types || rule?.allowedActorTypes || defaults.allowedActorTypes
  );
  const preferredAgent = String(
    rule?.preferred_agent || rule?.preferredAgent || defaults.requiredAgent || ''
  ).trim();

  let clearanceAgents = getAgentsMatchingRequirements({
    preferredAgent,
    requiredCapabilities,
    requiredTools,
    allowedActorTypes
  }, options.pluginRoot || PROJECT_ROOT);

  if (preferredAgent && !clearanceAgents.includes(preferredAgent)) {
    clearanceAgents = [preferredAgent, ...clearanceAgents];
  }

  return {
    decision: defaults.decision || String(rule?.escalation || 'block').trim(),
    ruleId,
    requiredAgent: preferredAgent || clearanceAgents[0] || '',
    clearanceAgents,
    approvedAgents: clearanceAgents,
    requiredCapabilities,
    requiredTools,
    allowedActorTypes,
    reason: defaults.reason || '',
    warningMessage: defaults.warningMessage || ''
  };
}

function toLower(value) {
  return String(value || '').toLowerCase();
}

function normalizeEnvironment(value, patterns = SALESFORCE_ALIAS_PATTERNS) {
  const normalized = stripWrappingQuotes(String(value || '').trim());
  if (!normalized) {
    return 'unknown';
  }

  if (/^(scratch|sandbox|production|unknown)$/i.test(normalized)) {
    return toLower(normalized);
  }

  if (patterns.scratch && patterns.scratch.test(normalized)) {
    return 'scratch';
  }

  if (patterns.sandbox && patterns.sandbox.test(normalized)) {
    return 'sandbox';
  }

  if (patterns.production && patterns.production.test(normalized)) {
    return 'production';
  }

  return 'unknown';
}

function environmentResult(environment, source, metadata = {}) {
  return {
    environment,
    source,
    isProduction: environment === 'production',
    isSandbox: environment === 'sandbox' || environment === 'scratch',
    orgType: environment,
    ...metadata
  };
}

function getSalesforceCachePath(alias, options = {}) {
  const targetAlias = stripWrappingQuotes(alias);
  const tempDir = options.tempDir || process.env.TMPDIR || '/tmp';

  if (!targetAlias) {
    return '';
  }

  return path.join(tempDir, `sf-org-info-${targetAlias}.json`);
}

function normalizeSalesforcePayload(parsed, alias, source) {
  const data = parsed && parsed.result && typeof parsed.result === 'object'
    ? parsed.result
    : parsed || {};
  const orgTypeRaw = String(data.orgType || '').trim();
  const orgTypeLower = orgTypeRaw.toLowerCase();
  let environment = 'unknown';

  if (typeof data.isSandbox === 'boolean') {
    if (data.isSandbox) {
      environment = orgTypeLower.includes('scratch') ? 'scratch' : 'sandbox';
    } else if (orgTypeLower.includes('developer edition')) {
      environment = 'sandbox';
    } else {
      environment = 'production';
    }
  } else if (orgTypeLower.includes('scratch')) {
    environment = 'scratch';
  } else if (orgTypeLower.includes('sandbox') || orgTypeLower.includes('developer edition')) {
    environment = 'sandbox';
  } else if (orgTypeLower.includes('production')) {
    environment = 'production';
  }

  return environmentResult(environment, source, {
    alias,
    orgType: environment === 'unknown' ? (orgTypeRaw || 'unknown') : environment,
    orgTypeRaw: orgTypeRaw || null,
    instanceUrl: data.instanceUrl || null
  });
}

function readSalesforceOrgInfoCache(alias, options = {}) {
  const cachePath = getSalesforceCachePath(alias, options);
  if (!cachePath || !fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeSalesforcePayload(parsed, alias, 'cache');
    if (normalized.environment === 'unknown') {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function escapeShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function querySalesforceOrgInfo(alias, options = {}) {
  if (!alias || options.querySfCli === false) {
    return null;
  }

  try {
    const output = execSync(
      `sf org display --target-org ${escapeShellArg(alias)} --json`,
      {
        encoding: 'utf8',
        timeout: options.timeout || 15000,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    const parsed = JSON.parse(output);
    const normalized = normalizeSalesforcePayload(parsed, alias, 'sf org display');
    if (normalized.environment === 'unknown') {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function detectSalesforceEnvironment(target, options = {}) {
  const alias = stripWrappingQuotes(
    target ||
    options.alias ||
    process.env.SALESFORCE_ENVIRONMENT ||
    process.env.TARGET_ORG ||
    process.env.SF_TARGET_ORG ||
    process.env.SFDX_DEFAULTUSERNAME ||
    ''
  );

  if (!alias) {
    return environmentResult('unknown', 'none', { alias: null });
  }

  if (/^(production|sandbox|scratch)$/i.test(alias)) {
    return environmentResult(normalizeEnvironment(alias), 'explicit-environment', { alias });
  }

  if (options.useCache !== false) {
    const cached = readSalesforceOrgInfoCache(alias, options);
    if (cached) {
      return cached;
    }
  }

  const queried = querySalesforceOrgInfo(alias, options);
  if (queried) {
    return queried;
  }

  const heuristic = normalizeEnvironment(alias, SALESFORCE_ALIAS_PATTERNS);
  return environmentResult(heuristic, 'alias-heuristic', { alias });
}

function csvHasValue(csv, needle) {
  const normalizedCsv = toLower(csv).replace(/\s+/g, '');
  const normalizedNeedle = toLower(needle).replace(/\s+/g, '');

  if (!normalizedCsv || !normalizedNeedle) {
    return false;
  }

  return `,${normalizedCsv},`.includes(`,${normalizedNeedle},`);
}

function detectHubspotEnvironment(target, options = {}) {
  const candidate = stripWrappingQuotes(
    target ||
    options.portalId ||
    options.baseUrl ||
    process.env.HUBSPOT_ENVIRONMENT ||
    process.env.HUBSPOT_PORTAL_ENVIRONMENT ||
    process.env.HUBSPOT_PORTAL_ID ||
    process.env.HUBSPOT_PORTAL ||
    ''
  );

  if (!candidate) {
    return environmentResult('unknown', 'none', { portal: null });
  }

  if (/^\d+$/.test(candidate)) {
    if (csvHasValue(options.sandboxPortalIds || process.env.HUBSPOT_SANDBOX_PORTAL_IDS, candidate)) {
      return environmentResult('sandbox', 'portal-registry', { portal: candidate });
    }

    if (csvHasValue(options.productionPortalIds || process.env.HUBSPOT_PRODUCTION_PORTAL_IDS, candidate)) {
      return environmentResult('production', 'portal-registry', { portal: candidate });
    }
  }

  const environment = normalizeEnvironment(candidate, HUBSPOT_ENV_PATTERNS);
  return environmentResult(environment, 'name-heuristic', { portal: candidate });
}

function detectMarketoEnvironment(target, options = {}) {
  const candidate = stripWrappingQuotes(
    target ||
    options.baseUrl ||
    options.instanceName ||
    process.env.MARKETO_ENVIRONMENT ||
    process.env.MARKETO_INSTANCE_ENVIRONMENT ||
    process.env.MARKETO_BASE_URL ||
    process.env.MARKETO_INSTANCE_URL ||
    process.env.MARKETO_INSTANCE_NAME ||
    ''
  );

  if (!candidate) {
    return environmentResult('unknown', 'none', { instance: null });
  }

  if (MARKETO_ENV_PATTERNS.sandbox.test(candidate)) {
    return environmentResult('sandbox', 'name-heuristic', { instance: candidate });
  }

  if (/mktorest\.com|marketo\.com/i.test(candidate)) {
    return environmentResult('production', 'domain-heuristic', { instance: candidate });
  }

  const environment = normalizeEnvironment(candidate, MARKETO_ENV_PATTERNS);
  return environmentResult(environment, 'name-heuristic', { instance: candidate });
}

function splitShellCommandClauses(command) {
  const raw = String(command || '').trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(/(?:&&|\|\||;|\n)+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function matchesAnyShellClause(command, ...patterns) {
  const clauses = splitShellCommandClauses(command);
  const candidates = clauses.length > 0 ? clauses : [String(command || '')];

  return candidates.some((clause) => (
    patterns.some((pattern) => pattern.test(clause))
  ));
}

function isSalesforceCliCommand(command) {
  return matchesAnyShellClause(command, /^[\s]*(sf|sfdx)([\s]|$)/i);
}

function extractSalesforceTargetAlias(command) {
  const match = String(command || '').match(/(?:^|\s)(?:--target-org|--username|-u|-o)(?:=|\s+)("[^"]+"|'[^']+'|[^\s]+)/i);
  return stripWrappingQuotes(match ? match[1] : '');
}

function isSfDataQueryCommand(command) {
  return matchesAnyShellClause(
    command,
    /^[\s]*(sf|sfdx)\s+data\s+query([\s]|$)/i,
    /^[\s]*sfdx\s+force:data:soql:query([\s]|$)/i
  );
}

function isSfDeployCommand(command) {
  return matchesAnyShellClause(
    command,
    /^[\s]*(sf|sfdx)\s+project\s+deploy([\s]|$)/i,
    /^[\s]*sfdx\s+force:source:deploy([\s]|$)/i
  );
}

function usesSfBulkApiContract(command) {
  return matchesAnyShellClause(
    command,
    /^[\s]*(sf|sfdx)\s+data\s+(export|import)([\s]|$)/i,
    /^[\s]*(sf|sfdx)\s+data\s+bulk\s+(create|update|upsert|delete)([\s]|$)/i,
    /^[\s]*(sf|sfdx)\s+data\s+upsert\s+bulk([\s]|$)/i,
    /^[\s]*sfdx\s+force:data:(bulk:(create|update|upsert|delete)|tree:import)([\s]|$)/i
  );
}

function isSfBulkMutationCommand(command) {
  return matchesAnyShellClause(
    command,
    /^[\s]*(sf|sfdx)\s+data\s+(bulk\s+(create|update|upsert|delete)|upsert\s+bulk)([\s]|$)/i,
    /^[\s]*sfdx\s+force:data:bulk:(create|update|upsert|delete)([\s]|$)/i
  );
}

function isSfWriteLikeCommand(command) {
  return isSfDeployCommand(command) ||
    matchesAnyShellClause(
      command,
      /^[\s]*(sf|sfdx)\s+data\s+(create|update|upsert|delete|record\s+create|record\s+update|record\s+upsert|record\s+delete|bulk\s+(create|update|upsert|delete))([\s]|$)/i,
      /^[\s]*sfdx\s+force:data:record:(create|update|upsert|delete)([\s]|$)/i
    );
}

function classifySalesforceCommand(command, options = {}) {
  const targetAlias = extractSalesforceTargetAlias(command);
  const target = detectSalesforceEnvironment(targetAlias, options);
  let intent = 'unknown';
  let volume = 'single';

  if (matchesAnyShellClause(command, /^[\s]*(sf|sfdx)\s+org\s+(assign|user)\s+perm(set|ission)([\s]|$)/i)) {
    intent = 'permission';
  } else if (isSfDeployCommand(command)) {
    intent = 'deploy';
    volume = 'bounded';
  } else if (matchesAnyShellClause(command, /^[\s]*(sf|sfdx)\s+apex\s+tail([\s]|$)|^[\s]*sfdx\s+force:apex:log:tail([\s]|$)/i)) {
    intent = 'debug';
  } else if (usesSfBulkApiContract(command) && !matchesAnyShellClause(command, /^[\s]*(sf|sfdx)\s+data\s+export([\s]|$)/i)) {
    intent = 'bulk-mutate';
    volume = /\b(all|entire)\b/i.test(command || '') ? 'mass' : 'bulk';
  } else if (isSfWriteLikeCommand(command)) {
    intent = 'mutate';
  } else if (
    isSfDataQueryCommand(command) ||
    matchesAnyShellClause(
      command,
      /^[\s]*(sf|sfdx)\s+(sobject\s+(describe|list)|org\s+(display|list)|data\s+(export|get))([\s]|$)/i,
      /^[\s]*sfdx\s+force:(schema:sobject:list|sobject:describe)([\s]|$)/i
    )
  ) {
    intent = 'read';
    volume = usesSfBulkApiContract(command) ? 'bulk' : 'single';
  }

  return {
    platform: 'salesforce',
    interface: 'cli',
    intent,
    target: target.environment,
    targetMetadata: target,
    volume,
    reversibility: inferReversibility(intent, command),
    tool: command,
    namespace: 'salesforce'
  };
}

function extractCurlUrl(command) {
  const match = String(command || '').match(/https?:\/\/[^\s"'`]+/i);
  return match ? match[0] : '';
}

function extractCurlPath(command) {
  const url = extractCurlUrl(command);
  if (!url) {
    return '/';
  }

  try {
    return new URL(url).pathname || '/';
  } catch {
    const withoutProtocol = url.replace(/^https?:\/\//i, '');
    const pathPart = withoutProtocol.slice(withoutProtocol.indexOf('/'));
    return pathPart ? pathPart.split('?')[0] : '/';
  }
}

function detectHttpMethod(command) {
  const explicitMatch = String(command || '').match(/(?:--request|-X)(?:=|\s+)([A-Za-z]+)/i);
  if (explicitMatch) {
    return explicitMatch[1].toUpperCase();
  }

  if (/(^|\s)(--head|-I)(\s|$)/.test(command || '')) {
    return 'HEAD';
  }

  if (/(^|\s)(--data|-d|--data-raw|--data-binary|--form|-F)(=|\s|$)/.test(command || '')) {
    return 'POST';
  }

  return 'GET';
}

function classifyHubspotCurl(command, options = {}) {
  const commandLower = toLower(command);
  if (!/(^|\s)curl(\s|$)/.test(commandLower)) {
    return null;
  }

  if (!/https?:\/\/[^\s]*(api\.(hubapi|hubspot)\.com)/.test(commandLower)) {
    return null;
  }

  const method = detectHttpMethod(command);
  const pathLower = toLower(extractCurlPath(command));
  const target = detectHubspotEnvironment(extractCurlUrl(command), options);
  const intent = (method === 'GET' || method === 'HEAD' || /\/search($|\/)|\/batch\/read($|\/)/.test(pathLower))
    ? 'read'
    : 'mutate';

  return {
    platform: 'hubspot',
    interface: 'api',
    intent,
    target: target.environment,
    targetMetadata: target,
    volume: /\/batch\//.test(pathLower) ? 'bulk' : 'single',
    reversibility: inferReversibility(intent, command),
    tool: command,
    namespace: 'hubspot'
  };
}

function classifyMarketoCurl(command, options = {}) {
  const commandLower = toLower(command);
  if (!/(^|\s)curl(\s|$)/.test(commandLower)) {
    return null;
  }

  if (!/https?:\/\/[^\s]*((mktorest|marketo)\.com)/.test(commandLower)) {
    return null;
  }

  const method = detectHttpMethod(command);
  const pathLower = toLower(extractCurlPath(command));
  const target = detectMarketoEnvironment(extractCurlUrl(command), options);
  const intent = (method === 'GET' || method === 'HEAD') ? 'read' : 'mutate';

  return {
    platform: 'marketo',
    interface: 'api',
    intent,
    target: target.environment,
    targetMetadata: target,
    volume: /\/bulk\//.test(pathLower) ? 'bulk' : 'single',
    reversibility: inferReversibility(intent, command),
    tool: command,
    namespace: 'marketo'
  };
}

function inferNamespace(toolName) {
  if (!toolName) {
    return 'unknown';
  }

  const namespaced = toolName.match(/^mcp__([^_]+)__.+$/);
  if (namespaced) {
    return namespaced[1];
  }

  const legacy = toolName.match(/^mcp_([^_]+)(?:_|$)/);
  if (legacy) {
    return legacy[1];
  }

  return 'unknown';
}

function inferIntentFromToolName(toolName, mutability = 'unknown') {
  const normalized = String(toolName || '');

  if (mutability === 'read_only') {
    if (/_debug_log|_trace/i.test(normalized)) {
      return 'debug';
    }

    if (/_status|_monitor|_report|_coverage/i.test(normalized)) {
      return 'monitor';
    }

    return 'read';
  }

  if (/_deploy|_publish/i.test(normalized)) {
    return 'deploy';
  }

  if (/permission|_assign/i.test(normalized)) {
    return 'permission';
  }

  if (/_debug_log|_trace/i.test(normalized)) {
    return 'debug';
  }

  if (/_status|_monitor|_report|_coverage/i.test(normalized)) {
    return 'monitor';
  }

  if (/_create|_update|_delete|_upsert|_merge|_clone|_activate|_deactivate|_schedule|_request|_approve|_archive|_restore|_associate|_execute|_sync|_enqueue|_cancel/i.test(normalized)) {
    return 'mutate';
  }

  return 'unknown';
}

function inferVolumeFromInput(toolName, toolInput) {
  const normalizedName = toLower(toolName);
  if (/bulk|batch/.test(normalizedName)) {
    return 'bulk';
  }

  if (!toolInput || typeof toolInput !== 'object') {
    return 'single';
  }

  const arrayLength = Object.values(toolInput)
    .filter(Array.isArray)
    .reduce((max, value) => Math.max(max, value.length), 0);

  if (arrayLength > 1000) {
    return 'mass';
  }

  if (arrayLength > 1) {
    return 'bulk';
  }

  return 'single';
}

function extractSoqlQuery(command) {
  const match = String(command || '').match(/(?:--query|-q)(?:=|\s+)("[^"]+"|'[^']+'|.+)$/i);
  return stripWrappingQuotes(match ? match[1].trim() : '');
}

function estimateInClauseItems(text) {
  const source = String(text || '');
  let maxItems = 0;
  const inClauseRegex = /\bIN\s*\(([^)]+)\)/ig;
  let match;

  while ((match = inClauseRegex.exec(source)) !== null) {
    const items = match[1]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean).length;
    maxItems = Math.max(maxItems, items);
  }

  return maxItems;
}

function isSimpleCoreObjectQuery(command) {
  const normalized = String(command || '');

  return /WHERE[\s]+Id[\s]*(=|IN)/i.test(normalized) ||
    /LIMIT[\s]+[1-9]([\s]|$)/i.test(normalized) ||
    /COUNT\(\)/i.test(normalized) ||
    normalized.length < 500;
}

function classifySalesforceRoutingRequirement(command, options = {}) {
  const normalizedCommand = String(command || '');
  const classification = classifySalesforceCommand(normalizedCommand, options);
  const safeUrlThreshold = Number(process.env.SOQL_URL_SAFE_LENGTH_THRESHOLD || options.safeUrlThreshold || 6000);
  const inClauseThreshold = Number(process.env.SOQL_IN_CLAUSE_ITEM_THRESHOLD || options.inClauseThreshold || 200);

  if (!isSalesforceCliCommand(normalizedCommand)) {
    return { decision: 'none' };
  }

  if (process.env.ALLOW_DIRECT_PERMSET !== '1') {
    if (classification.intent === 'permission' ||
      (isSfWriteLikeCommand(normalizedCommand) && PERMISSION_SECURITY_OBJECT_REGEX.test(normalizedCommand))) {
      return buildRoutingDecision('sf_permission_security_write', {
        decision: 'block',
        requiredAgent: 'opspal-salesforce:sfdc-permission-orchestrator',
        requiredTools: ['Bash'],
        reason: 'Direct Salesforce permission/security write detected.'
      }, options);
    }
  }

  if (isSfUpsertOrImportCommand(normalizedCommand) && CORE_UPSERT_OBJECT_REGEX.test(normalizedCommand)) {
    return buildRoutingDecision('sf_core_object_upsert', {
      decision: 'block',
      requiredAgent: 'opspal-salesforce:sfdc-upsert-orchestrator',
      requiredTools: ['Bash'],
      reason: 'Direct lead/contact/account upsert-import workflow detected.'
    }, options);
  }

  if (isSfBulkMutationCommand(normalizedCommand) && CORE_UPSERT_OBJECT_REGEX.test(normalizedCommand)) {
    return buildRoutingDecision('sf_core_object_bulk_mutation', {
      decision: 'block',
      requiredAgent: 'opspal-salesforce:sfdc-bulkops-orchestrator',
      requiredTools: ['Bash'],
      reason: 'Direct Salesforce bulk mutation on a core object detected.'
    }, options);
  }

  if (isSfDataQueryCommand(normalizedCommand)) {
    const soqlQuery = extractSoqlQuery(normalizedCommand);
    const commandLength = normalizedCommand.length;
    const queryLength = soqlQuery.length;
    const inClauseCount = estimateInClauseItems(soqlQuery || normalizedCommand);

    if (queryLength > safeUrlThreshold || commandLength > safeUrlThreshold || inClauseCount > inClauseThreshold) {
      return buildRoutingDecision('sf_query_url_length_risk', {
        decision: 'block',
        requiredAgent: 'opspal-salesforce:sfdc-bulkops-orchestrator',
        requiredTools: ['Bash'],
        reason: `SOQL query likely exceeds safe URL limits (command_len=${commandLength} query_len=${queryLength} in_items=${inClauseCount}). Use chunked/bulk extraction workflow.`
      }, options);
    }

    if (CORE_QUERY_OBJECT_REGEX.test(normalizedCommand)) {
      if (isSimpleCoreObjectQuery(normalizedCommand)) {
        return buildRoutingDecision('sf_core_object_query', {
          decision: 'warn',
          requiredAgent: 'opspal-salesforce:sfdc-data-operations',
          requiredTools: ['Bash'],
          reason: 'Simple verification query on core object - allowed.',
          warningMessage: "[ROUTING INFO] Core-object verification query allowed. For complex queries, prefer Agent(subagent_type='opspal-salesforce:sfdc-query-specialist')."
        }, options);
      }

      return buildRoutingDecision('sf_core_object_query', {
        decision: 'block',
        requiredAgent: 'opspal-salesforce:sfdc-data-operations',
        requiredTools: ['Bash'],
        reason: 'Direct Salesforce core-object data query detected.'
      }, options);
    }

    if (PERMISSION_SECURITY_OBJECT_REGEX.test(normalizedCommand)) {
      return buildRoutingDecision('sf_permission_security_query', {
        decision: 'warn',
        requiredAgent: 'opspal-salesforce:sfdc-permission-assessor',
        requiredTools: ['Bash'],
        reason: 'Permission/security query detected.',
        warningMessage: "[ROUTING WARNING] Permission/security query detected. Prefer the Agent tool with subagent_type='opspal-salesforce:sfdc-permission-assessor'."
      }, options);
    }
  }

  if (isSfWriteLikeCommand(normalizedCommand) && TERRITORY_OBJECT_REGEX.test(normalizedCommand)) {
    return buildRoutingDecision('sf_territory_write', {
      decision: 'block',
      requiredAgent: 'opspal-salesforce:sfdc-territory-orchestrator',
      requiredTools: ['Bash'],
      reason: 'Direct Salesforce territory write workflow detected.'
    }, options);
  }

  if (isSfWriteLikeCommand(normalizedCommand) && VALIDATION_RULE_REGEX.test(normalizedCommand)) {
    return buildRoutingDecision('sf_validation_rule_write', {
      decision: 'block',
      requiredAgent: 'opspal-salesforce:validation-rule-orchestrator',
      requiredTools: ['Bash'],
      reason: 'Direct Salesforce validation rule write workflow detected.'
    }, options);
  }

  return { decision: 'none' };
}

function inferReversibility(intent, rawInput) {
  const raw = String(rawInput || '');

  if (intent === 'read' || intent === 'verify' || intent === 'debug' || intent === 'monitor') {
    return 'reversible';
  }

  if (/delete|remove|destroy|truncate|drop|merge|archive/i.test(raw)) {
    return 'irreversible';
  }

  if (intent === 'mutate' || intent === 'bulk-mutate' || intent === 'deploy' || intent === 'permission') {
    return 'partially-reversible';
  }

  return 'unknown';
}

function isReadOnly(classification = {}) {
  if (classification.mutability === 'read_only') {
    return true;
  }

  return ['read', 'verify', 'debug', 'monitor'].includes(classification.intent);
}

function requiresEscalation(classification = {}, environment) {
  const resolvedEnvironment = normalizeEnvironment(environment || classification.target);

  if (classification.volume === 'mass') {
    return true;
  }

  if (classification.intent === 'permission') {
    return true;
  }

  if (resolvedEnvironment !== 'production') {
    return false;
  }

  return !isReadOnly(classification);
}

function getApprovedCapabilities(classification = {}) {
  const capabilities = [];

  if (classification.platform && classification.platform !== 'generic') {
    capabilities.push(`platform:${classification.platform}`);
  }

  if (classification.interface && classification.interface !== 'unknown') {
    capabilities.push(`interface:${classification.interface}`);
  }

  if (classification.intent && classification.intent !== 'unknown') {
    capabilities.push(`intent:${classification.intent}`);
  }

  if (classification.target && classification.target !== 'unknown') {
    capabilities.push(`target:${classification.target}`);
  }

  capabilities.push(isReadOnly(classification) ? 'read-only' : 'operational');

  if (classification.platform && classification.intent && classification.intent !== 'unknown') {
    capabilities.push(`${classification.platform}:${classification.intent}`);
  }

  return [...new Set(capabilities)];
}

function finalizeClassification(classification) {
  return {
    ...classification,
    approvedCapabilities: getApprovedCapabilities(classification)
  };
}

function classifyBashCommand(command, options = {}) {
  const rawCommand = String(command || '');

  if (isSalesforceCliCommand(rawCommand)) {
    return finalizeClassification(classifySalesforceCommand(rawCommand, options));
  }

  const hubspot = classifyHubspotCurl(rawCommand, options);
  if (hubspot) {
    return finalizeClassification(hubspot);
  }

  const marketo = classifyMarketoCurl(rawCommand, options);
  if (marketo) {
    return finalizeClassification(marketo);
  }

  return finalizeClassification({
    platform: 'generic',
    interface: /(^|\s)curl(\s|$)/i.test(rawCommand) ? 'api' : 'script',
    intent: 'unknown',
    target: 'unknown',
    targetMetadata: environmentResult('unknown', 'none'),
    volume: 'single',
    reversibility: inferReversibility('unknown', rawCommand),
    tool: rawCommand,
    namespace: 'unknown'
  });
}

function loadMcpPolicyConfig(configPath = DEFAULT_MCP_POLICY_CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function buildUnknownMcpClassification(toolName, config = {}) {
  const defaults = config.defaults || {};

  return finalizeClassification({
    tool: toolName,
    matched: false,
    policyId: null,
    namespace: inferNamespace(toolName),
    platform: inferNamespace(toolName),
    interface: 'mcp',
    intent: 'unknown',
    target: 'unknown',
    targetMetadata: environmentResult('unknown', 'none'),
    volume: inferVolumeFromInput(toolName, null),
    reversibility: 'unknown',
    mutability: defaults.unknownMutability || 'unknown',
    pendingRouteAction: defaults.unknownPendingRouteAction || 'deny',
    matchedPattern: null,
    notes: 'No explicit MCP tool policy matched.'
  });
}

function detectTargetForMcpTool(namespace, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return environmentResult('unknown', 'none');
  }

  if (namespace === 'salesforce') {
    return detectSalesforceEnvironment(
      toolInput.targetOrg ||
      toolInput.orgAlias ||
      toolInput.org ||
      toolInput.username ||
      ''
    );
  }

  if (namespace === 'hubspot') {
    return detectHubspotEnvironment(
      toolInput.portalId ||
      toolInput.portal ||
      toolInput.baseUrl ||
      ''
    );
  }

  if (namespace === 'marketo') {
    return detectMarketoEnvironment(
      toolInput.baseUrl ||
      toolInput.instanceUrl ||
      toolInput.instance ||
      toolInput.instanceName ||
      ''
    );
  }

  return environmentResult('unknown', 'none');
}

function classifyMCPTool(toolName, toolInput = {}, config = loadMcpPolicyConfig()) {
  for (const policy of config.policies || []) {
    for (const pattern of policy.patterns || []) {
      const regex = new RegExp(pattern);
      if (!regex.test(toolName)) {
        continue;
      }

      const namespace = policy.namespace || inferNamespace(toolName);
      const target = detectTargetForMcpTool(namespace, toolInput);
      const mutability = policy.mutability || 'unknown';
      const intent = inferIntentFromToolName(toolName, mutability);

      return finalizeClassification({
        tool: toolName,
        matched: true,
        policyId: policy.id,
        namespace,
        platform: namespace,
        interface: 'mcp',
        intent,
        target: target.environment,
        targetMetadata: target,
        volume: inferVolumeFromInput(toolName, toolInput),
        reversibility: inferReversibility(intent, toolName),
        mutability,
        pendingRouteAction: policy.pendingRouteAction || 'deny',
        matchedPattern: pattern,
        notes: policy.notes || ''
      });
    }
  }

  return buildUnknownMcpClassification(toolName, config);
}

function isSfUpsertOrImportCommand(command) {
  return matchesAnyShellClause(
    command,
    /^[\s]*(sf|sfdx)\s+data\s+(upsert|import|bulk\s+upsert)([\s]|$)/i,
    /^[\s]*sfdx\s+force:data:(record:upsert|bulk:upsert|tree:import)([\s]|$)/i
  );
}

function main() {
  const [command, firstArg, secondArg] = process.argv.slice(2);

  if (command === 'bash' && firstArg) {
    console.log(JSON.stringify(classifyBashCommand(firstArg), null, 2));
    return;
  }

  if (command === 'mcp' && firstArg) {
    let toolInput = {};
    if (secondArg) {
      try {
        toolInput = JSON.parse(secondArg);
      } catch {
        console.error('Invalid MCP tool input JSON');
        process.exit(1);
      }
    }

    console.log(JSON.stringify(classifyMCPTool(firstArg, toolInput), null, 2));
    return;
  }

  if (command === 'routing' && firstArg) {
    console.log(JSON.stringify(classifySalesforceRoutingRequirement(firstArg), null, 2));
    return;
  }

  console.error('Usage: classify-operation.js bash "<command>" | mcp <tool-name> [tool-input-json] | routing "<command>"');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_MCP_POLICY_CONFIG_PATH,
  DEFAULT_ROUTING_CAPABILITY_CONFIG_PATH,
  HUBSPOT_ENV_PATTERNS,
  MARKETO_ENV_PATTERNS,
  SALESFORCE_ALIAS_PATTERNS,
  classifyBashCommand,
  classifyHubspotCurl,
  classifyMCPTool,
  classifyMarketoCurl,
  classifySalesforceCommand,
  classifySalesforceRoutingRequirement,
  detectHubspotEnvironment,
  detectHttpMethod,
  detectMarketoEnvironment,
  detectSalesforceEnvironment,
  extractCurlPath,
  extractCurlUrl,
  extractSalesforceTargetAlias,
  getSalesforceDeployPolicy,
  getApprovedCapabilities,
  getSalesforceCachePath,
  inferIntentFromToolName,
  inferNamespace,
  isReadOnly,
  isSalesforceCliCommand,
  isSfBulkMutationCommand,
  isSfUpsertOrImportCommand,
  loadMcpPolicyConfig,
  loadRoutingCapabilityConfig,
  normalizeEnvironment,
  readSalesforceOrgInfoCache,
  requiresEscalation
};
