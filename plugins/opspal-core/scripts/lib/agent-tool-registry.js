'use strict';

/**
 * Agent Tool Registry
 *
 * Resolves declared agent tools from frontmatter, with routing-index fallback,
 * so runtime hooks can enforce tool contracts from source metadata instead of
 * maintaining brittle hardcoded allowlists.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const fs = require('fs');
const path = require('path');
let yaml = null;

try {
  yaml = require('js-yaml');
} catch (_error) {
  process.stderr.write('[agent-tool-registry] js-yaml not available; complex YAML agent files may not parse correctly.\n');
  yaml = null;
}

const AGENT_METADATA_LIST_CACHE = new Map();

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function intersectNormalizedArrays(collections = []) {
  const groups = collections
    .map((items) => unique(normalizeStringArray(items)))
    .filter((items) => items.length > 0);

  if (groups.length === 0) {
    return [];
  }

  return groups[0].filter((candidate) => groups.every((items) => items.includes(candidate)));
}

function normalizeToolArray(value) {
  return normalizeStringArray(value).map((tool) => tool === 'Task' ? 'Agent' : tool);
}

function normalizeComparableArray(value) {
  return unique(normalizeStringArray(value)).sort((left, right) => left.localeCompare(right));
}

function normalizeStringArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringArray(item))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\n|]/)
      .map((item) => item.trim().replace(/^["'`]|["'`]$/g, ''))
      .filter(Boolean);
  }

  return [];
}

function normalizeActorType(value) {
  return String(value || '').trim().toLowerCase();
}

function stripMatchingQuotes(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function splitInlineSequence(value) {
  const items = [];
  let current = '';
  let quote = '';

  for (const char of String(value || '')) {
    if ((char === '"' || char === '\'') && (!quote || quote === char)) {
      quote = quote === char ? '' : char;
      current += char;
      continue;
    }

    if (char === ',' && !quote) {
      items.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items.filter(Boolean);
}

function parseFallbackScalar(rawValue) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return '';
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }

    return splitInlineSequence(inner).map((item) => stripMatchingQuotes(item));
  }

  return stripMatchingQuotes(value);
}

function parseFallbackFrontmatter(frontmatterText) {
  const data = {};
  let currentKey = '';

  for (const line of String(frontmatterText || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = data[currentKey] ? [data[currentKey]] : [];
      }
      data[currentKey].push(parseFallbackScalar(arrayMatch[1]));
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!keyValueMatch) {
      if (currentKey && !Array.isArray(data[currentKey])) {
        data[currentKey] = `${data[currentKey]}\n${stripMatchingQuotes(trimmed)}`.trim();
      }
      continue;
    }

    const [, key, rawValue] = keyValueMatch;
    currentKey = key;

    if (!rawValue) {
      data[currentKey] = [];
      continue;
    }

    data[currentKey] = parseFallbackScalar(rawValue);
  }

  return data;
}

function patternMatches(declaredPattern, requiredValue) {
  const declared = String(declaredPattern || '').trim();
  const required = String(requiredValue || '').trim();

  if (!declared || !required) {
    return false;
  }

  if (declared === required) {
    return true;
  }

  if (declared.startsWith(`${required}(`)) {
    return true;
  }

  if (declared.endsWith('*')) {
    return required.startsWith(declared.slice(0, -1));
  }

  return false;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { data: {}, body: content };
  }

  if (yaml) {
    try {
      const data = yaml.load(match[1]) || {};
      return {
        data: typeof data === 'object' ? data : {},
        body: content.slice(match[0].length)
      };
    } catch (_error) {
      // Fall through to the dependency-free parser below.
    }
  }

  return {
    data: parseFallbackFrontmatter(match[1]),
    body: content.slice(match[0].length)
  };
}

function resolvePluginRoot(explicitPluginRoot = '') {
  const candidates = unique([
    explicitPluginRoot,
    process.env.CLAUDE_PLUGIN_ROOT,
    path.resolve(__dirname, '..', '..'),
    path.resolve(process.cwd(), 'plugins', 'opspal-core'),
    path.resolve(process.cwd(), '.claude-plugins', 'opspal-core'),
    process.env.HOME
      ? path.join(process.env.HOME, '.claude', 'plugins', 'marketplaces', 'opspal-commercial', 'plugins', 'opspal-core')
      : null
  ]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!fs.existsSync(candidate)) continue;
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return path.resolve(candidate);
      }
    } catch (error) {
      continue;
    }
  }

  return path.resolve(__dirname, '..', '..');
}

function resolvePluginsRoot(explicitPluginRoot = '') {
  return path.resolve(resolvePluginRoot(explicitPluginRoot), '..');
}

function getRoutingIndexCandidates(explicitPluginRoot = '') {
  const pluginRoot = resolvePluginRoot(explicitPluginRoot);
  const home = process.env.HOME || '';

  return unique([
    path.join(pluginRoot, 'routing-index.json'),
    path.join(process.cwd(), 'plugins', 'opspal-core', 'routing-index.json'),
    path.join(process.cwd(), 'routing-index.json'),
    path.join(process.cwd(), '.claude-plugins', 'opspal-core', 'routing-index.json'),
    home
      ? path.join(home, '.claude', 'plugins', 'marketplaces', 'opspal-commercial', 'plugins', 'opspal-core', 'routing-index.json')
      : null
  ]);
}

function loadRoutingIndex(explicitPluginRoot = '') {
  for (const candidate of getRoutingIndexCandidates(explicitPluginRoot)) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

function resolveAgentFilePath(agentName, explicitPluginRoot = '') {
  if (!agentName || !String(agentName).includes(':')) {
    return null;
  }

  const [pluginName, shortName] = String(agentName).split(':', 2);
  if (!pluginName || !shortName) {
    return null;
  }

  const pluginsRoot = resolvePluginsRoot(explicitPluginRoot);
  const directPath = path.join(pluginsRoot, pluginName, 'agents', `${shortName}.md`);

  if (fs.existsSync(directPath)) {
    return directPath;
  }

  return null;
}

function inferPluginFromFilePath(filePath) {
  return path.basename(path.dirname(path.dirname(filePath)));
}

function normalizeAgentMetadata(metadata = {}, fallback = {}) {
  const name = String(metadata.name || fallback.name || '').trim();
  const plugin = String(metadata.plugin || fallback.plugin || '').trim();
  const actorType = normalizeActorType(metadata.actorType || metadata.actor_type || fallback.actorType || fallback.actor_type);
  const capabilities = unique(normalizeStringArray(metadata.capabilities || fallback.capabilities));
  const tools = unique(normalizeToolArray(metadata.tools || fallback.tools));
  const triggerKeywords = unique(normalizeStringArray(
    metadata.triggerKeywords ||
    metadata.trigger_keywords ||
    fallback.triggerKeywords ||
    fallback.trigger_keywords
  ));
  const shortName = String(metadata.shortName || fallback.shortName || name).trim() || name;
  const fullName = String(metadata.fullName || fallback.fullName || (plugin && shortName ? `${plugin}:${shortName}` : '')).trim();

  return {
    ...metadata,
    name: name || shortName,
    shortName: shortName || name,
    fullName,
    plugin: plugin || (fullName.includes(':') ? fullName.split(':', 1)[0] : ''),
    actorType,
    capabilities,
    tools,
    triggerKeywords
  };
}

function extractAgentMetadataFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { data } = parseFrontmatter(content);
  const plugin = inferPluginFromFilePath(filePath);
  const shortName = path.basename(filePath, '.md');

  return normalizeAgentMetadata({
    name: String(data.name || shortName).trim(),
    shortName,
    fullName: `${plugin}:${String(data.name || shortName).trim()}`,
    plugin,
    actorType: data.actorType || data.actor_type || '',
    capabilities: data.capabilities || [],
    tools: data.tools || [],
    triggerKeywords: data.triggerKeywords || data.trigger_keywords || [],
    filePath
  });
}

function extractAgentMetadataFromRoutingIndex(agentName, explicitPluginRoot = '') {
  const routingIndex = loadRoutingIndex(explicitPluginRoot);
  if (!routingIndex) {
    return null;
  }

  if (routingIndex.agentsByFull?.[agentName]) {
    return normalizeAgentMetadata(routingIndex.agentsByFull[agentName], { fullName: agentName });
  }

  if (routingIndex.agents?.[agentName]) {
    return normalizeAgentMetadata(routingIndex.agents[agentName], { shortName: agentName });
  }

  if (routingIndex.agentsByShort?.[agentName]?.length && routingIndex.agentsByFull) {
    const firstFull = routingIndex.agentsByShort[agentName][0];
    return normalizeAgentMetadata(routingIndex.agentsByFull[firstFull] || null, { fullName: firstFull });
  }

  return null;
}

function getAgentMetadata(agentName, explicitPluginRoot = '') {
  const fromFile = extractAgentMetadataFromFile(resolveAgentFilePath(agentName, explicitPluginRoot));
  if (fromFile) {
    return fromFile;
  }

  const fromIndex = extractAgentMetadataFromRoutingIndex(agentName, explicitPluginRoot);
  if (fromIndex) {
    return normalizeAgentMetadata(fromIndex, {
      shortName: agentName.includes(':') ? agentName.split(':', 2)[1] : agentName,
      fullName: agentName.includes(':') ? agentName : ''
    });
  }

  return null;
}

function listAgentMetadata(explicitPluginRoot = '') {
  const cacheKey = resolvePluginRoot(explicitPluginRoot);
  if (AGENT_METADATA_LIST_CACHE.has(cacheKey)) {
    return AGENT_METADATA_LIST_CACHE.get(cacheKey).map((metadata) => ({ ...metadata }));
  }

  const pluginsRoot = resolvePluginsRoot(explicitPluginRoot);
  const metadataList = [];

  if (fs.existsSync(pluginsRoot)) {
    const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const agentsDir = path.join(pluginsRoot, entry.name, 'agents');
      if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
        continue;
      }

      const files = fs.readdirSync(agentsDir)
        .filter((file) => file.endsWith('.md'))
        .sort();

      for (const file of files) {
        const metadata = extractAgentMetadataFromFile(path.join(agentsDir, file));
        if (!metadata) {
          continue;
        }

        metadataList.push(metadata);
      }
    }
  }

  AGENT_METADATA_LIST_CACHE.set(cacheKey, metadataList);
  return metadataList.map((metadata) => ({ ...metadata }));
}

function toolMatches(declaredTool, requiredTool) {
  return patternMatches(declaredTool, requiredTool);
}

function agentHasTool(agentName, requiredTool, explicitPluginRoot = '') {
  const metadata = getAgentMetadata(agentName, explicitPluginRoot);
  if (!metadata) {
    return false;
  }

  return normalizeStringArray(metadata.tools).some((tool) => toolMatches(tool, requiredTool));
}

function capabilityMatches(declaredCapability, requiredCapability) {
  return patternMatches(declaredCapability, requiredCapability);
}

function agentHasCapability(agentName, requiredCapability, explicitPluginRoot = '') {
  const metadata = getAgentMetadata(agentName, explicitPluginRoot);
  if (!metadata) {
    return false;
  }

  return normalizeStringArray(metadata.capabilities).some((capability) => capabilityMatches(capability, requiredCapability));
}

function agentMatchesRequirements(agentName, requirements = {}, explicitPluginRoot = '') {
  const metadata = getAgentMetadata(agentName, explicitPluginRoot);
  if (!metadata) {
    return false;
  }

  const allowedAgents = unique(normalizeStringArray(
    requirements.allowedAgents || requirements.allowed_agents
  ));
  const requiredCapabilities = normalizeStringArray(
    requirements.requiredCapabilities || requirements.required_capabilities
  );
  const allowedActorTypes = normalizeStringArray(
    requirements.allowedActorTypes || requirements.allowed_actor_types
  ).map(normalizeActorType);
  const requiredTools = normalizeToolArray(
    requirements.requiredTools || requirements.required_tools
  );
  const capabilityMatchMode = String(
    requirements.capabilityMatchMode || requirements.capability_match_mode || 'all'
  ).trim().toLowerCase();
  const toolMatchMode = String(
    requirements.toolMatchMode || requirements.tool_match_mode || 'all'
  ).trim().toLowerCase();

  if (allowedAgents.length > 0 && !allowedAgents.includes(agentName)) {
    return false;
  }

  if (allowedActorTypes.length > 0 && !allowedActorTypes.includes(normalizeActorType(metadata.actorType))) {
    return false;
  }

  if (requiredTools.length > 0) {
    const matchedToolCount = requiredTools.filter((requiredTool) => (
      metadata.tools.some((tool) => toolMatches(tool, requiredTool))
    )).length;

    if (toolMatchMode === 'any') {
      if (matchedToolCount === 0) {
        return false;
      }
    } else if (matchedToolCount !== requiredTools.length) {
      return false;
    }
  }

  if (requiredCapabilities.length === 0) {
    return true;
  }

  const matchedCount = requiredCapabilities.filter((requiredCapability) => (
    metadata.capabilities.some((capability) => capabilityMatches(capability, requiredCapability))
  )).length;

  if (capabilityMatchMode === 'any') {
    return matchedCount > 0;
  }

  return matchedCount === requiredCapabilities.length;
}

function deriveRouteRequirements(preferredAgent, clearanceAgents = [], explicitPluginRoot = '') {
  const preferredAgentId = String(preferredAgent || '').trim();
  const allowedAgents = unique([
    preferredAgentId,
    ...normalizeStringArray(clearanceAgents)
  ]);
  const metadataList = allowedAgents
    .map((agentName) => getAgentMetadata(agentName, explicitPluginRoot))
    .filter(Boolean);
  const preferredMetadata = preferredAgentId
    ? getAgentMetadata(preferredAgentId, explicitPluginRoot)
    : null;

  const sourceMetadata = metadataList.length > 0
    ? metadataList
    : (preferredMetadata ? [preferredMetadata] : []);

  const unresolvedAgents = allowedAgents.filter((agentName) => !getAgentMetadata(agentName, explicitPluginRoot));
  const requiredTools = intersectNormalizedArrays(
    sourceMetadata.map((metadata) => normalizeToolArray(metadata.tools))
  );
  const requiredCapabilities = intersectNormalizedArrays(
    sourceMetadata.map((metadata) => normalizeStringArray(metadata.capabilities))
  );
  const allowedActorTypes = unique(
    sourceMetadata
      .map((metadata) => normalizeActorType(metadata.actorType))
      .filter(Boolean)
  );

  return {
    preferredAgent: preferredAgentId,
    allowedAgents,
    allowedActorTypes,
    requiredCapabilities,
    requiredTools,
    capabilityMatchMode: 'all',
    toolMatchMode: 'all',
    preferredActorType: normalizeActorType(preferredMetadata?.actorType || ''),
    preferredCapabilities: unique(normalizeStringArray(preferredMetadata?.capabilities || [])),
    preferredTools: unique(normalizeToolArray(preferredMetadata?.tools || [])),
    unresolvedAgents,
    sourceOfTruth: resolveAgentFilePath(preferredAgentId, explicitPluginRoot) ? 'agent-markdown' : 'routing-index'
  };
}

function compareAgentMetadataSources(agentName, explicitPluginRoot = '') {
  const markdown = extractAgentMetadataFromFile(resolveAgentFilePath(agentName, explicitPluginRoot));
  const routingIndex = extractAgentMetadataFromRoutingIndex(agentName, explicitPluginRoot);
  const mismatches = [];

  if (!markdown || !routingIndex) {
    return {
      agentName,
      markdown,
      routingIndex,
      active: markdown || routingIndex || null,
      mismatches
    };
  }

  [
    ['actorType', [normalizeActorType(markdown.actorType)], [normalizeActorType(routingIndex.actorType)]],
    ['capabilities', normalizeComparableArray(markdown.capabilities), normalizeComparableArray(routingIndex.capabilities)],
    ['tools', normalizeComparableArray(normalizeToolArray(markdown.tools)), normalizeComparableArray(normalizeToolArray(routingIndex.tools))]
  ].forEach(([field, markdownValues, indexValues]) => {
    const left = Array.isArray(markdownValues) ? markdownValues : [markdownValues];
    const right = Array.isArray(indexValues) ? indexValues : [indexValues];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({
        field,
        markdown: left,
        routingIndex: right
      });
    }
  });

  return {
    agentName,
    markdown,
    routingIndex,
    active: markdown,
    mismatches
  };
}

function getAgentsMatchingRequirements(requirements = {}, explicitPluginRoot = '') {
  const preferredAgent = String(requirements.preferredAgent || requirements.preferred_agent || '').trim();
  const matches = listAgentMetadata(explicitPluginRoot)
    .filter((metadata) => metadata.fullName)
    .filter((metadata) => agentMatchesRequirements(metadata.fullName, requirements, explicitPluginRoot))
    .map((metadata) => metadata.fullName);

  matches.sort((left, right) => {
    if (left === preferredAgent) {
      return -1;
    }
    if (right === preferredAgent) {
      return 1;
    }
    return left.localeCompare(right);
  });

  return unique(matches);
}

module.exports = {
  agentHasCapability,
  agentHasTool,
  agentMatchesRequirements,
  capabilityMatches,
  compareAgentMetadataSources,
  deriveRouteRequirements,
  getAgentsMatchingRequirements,
  getAgentMetadata,
  listAgentMetadata,
  loadRoutingIndex,
  normalizeStringArray,
  normalizeActorType,
  patternMatches,
  parseFrontmatter,
  resolveAgentFilePath,
  resolvePluginRoot,
  resolvePluginsRoot,
  toolMatches
};

if (require.main === module) {
  const [command, agentName, toolName, explicitPluginRoot] = process.argv.slice(2);

  if (command === 'has-tool') {
    const hasTool = agentHasTool(agentName, toolName, explicitPluginRoot || '');
    process.stdout.write(hasTool ? 'true\n' : 'false\n');
    process.exit(hasTool ? 0 : 1);
  }

  if (command === 'metadata') {
    const metadata = getAgentMetadata(agentName, explicitPluginRoot || '');
    if (!metadata) {
      process.stdout.write('{}\n');
      process.exit(1);
    }

    process.stdout.write(`${JSON.stringify(metadata)}\n`);
    process.exit(0);
  }

  if (command === 'has-capability') {
    const hasCapability = agentHasCapability(agentName, toolName, explicitPluginRoot || '');
    process.stdout.write(hasCapability ? 'true\n' : 'false\n');
    process.exit(hasCapability ? 0 : 1);
  }

  if (command === 'matches-requirements') {
    let requirements = {};

    try {
      requirements = JSON.parse(toolName || '{}');
    } catch (_error) {
      process.stderr.write('Invalid requirements JSON\n');
      process.exit(2);
    }

    const matches = agentMatchesRequirements(agentName, requirements, explicitPluginRoot || '');
    process.stdout.write(matches ? 'true\n' : 'false\n');
    process.exit(matches ? 0 : 1);
  }

  if (command === 'route-requirements') {
    let clearanceAgents = [];

    try {
      clearanceAgents = JSON.parse(toolName || '[]');
    } catch (_error) {
      process.stderr.write('Invalid clearance agents JSON\n');
      process.exit(2);
    }

    process.stdout.write(`${JSON.stringify(deriveRouteRequirements(agentName, clearanceAgents, explicitPluginRoot || ''))}\n`);
    process.exit(0);
  }

  if (command === 'resolve-requirements') {
    let requirements = {};

    try {
      requirements = JSON.parse(agentName || '{}');
    } catch (_error) {
      process.stderr.write('Invalid requirements JSON\n');
      process.exit(2);
    }

    process.stdout.write(`${JSON.stringify(getAgentsMatchingRequirements(requirements, toolName || ''))}\n`);
    process.exit(0);
  }

  process.stderr.write('Usage: agent-tool-registry.js <has-tool|has-capability|metadata|matches-requirements|route-requirements|resolve-requirements> <agentName|requirements> [toolName|requirements] [pluginRoot]\n');
  process.exit(2);
}
