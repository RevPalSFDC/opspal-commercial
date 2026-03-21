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
const yaml = require('js-yaml');

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { data: {}, body: content };
  }

  try {
    const data = yaml.load(match[1]) || {};
    return {
      data: typeof data === 'object' ? data : {},
      body: content.slice(match[0].length)
    };
  } catch (error) {
    return { data: {}, body: content };
  }
}

function resolvePluginRoot(explicitPluginRoot = '') {
  const candidates = unique([
    explicitPluginRoot,
    process.env.CLAUDE_PLUGIN_ROOT,
    path.resolve(__dirname, '..', '..'),
    path.resolve(process.cwd(), 'plugins', 'opspal-core'),
    path.resolve(process.cwd(), '.claude-plugins', 'opspal-core'),
    process.env.HOME
      ? path.join(process.env.HOME, '.claude', 'plugins', 'marketplaces', 'revpal-internal-plugins', 'plugins', 'opspal-core')
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
      ? path.join(home, '.claude', 'plugins', 'marketplaces', 'revpal-internal-plugins', 'plugins', 'opspal-core', 'routing-index.json')
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

function extractAgentMetadataFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { data } = parseFrontmatter(content);
  const tools = normalizeStringArray(data.tools).map((tool) => tool === 'Task' ? 'Agent' : tool);

  return {
    name: String(data.name || path.basename(filePath, '.md')).trim(),
    tools,
    filePath
  };
}

function extractAgentMetadataFromRoutingIndex(agentName, explicitPluginRoot = '') {
  const routingIndex = loadRoutingIndex(explicitPluginRoot);
  if (!routingIndex) {
    return null;
  }

  if (routingIndex.agentsByFull?.[agentName]) {
    return routingIndex.agentsByFull[agentName];
  }

  if (routingIndex.agents?.[agentName]) {
    return routingIndex.agents[agentName];
  }

  if (routingIndex.agentsByShort?.[agentName]?.length && routingIndex.agentsByFull) {
    const firstFull = routingIndex.agentsByShort[agentName][0];
    return routingIndex.agentsByFull[firstFull] || null;
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
    return {
      ...fromIndex,
      tools: normalizeStringArray(fromIndex.tools).map((tool) => tool === 'Task' ? 'Agent' : tool)
    };
  }

  return null;
}

function toolMatches(declaredTool, requiredTool) {
  const declared = String(declaredTool || '').trim();
  const required = String(requiredTool || '').trim();

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

function agentHasTool(agentName, requiredTool, explicitPluginRoot = '') {
  const metadata = getAgentMetadata(agentName, explicitPluginRoot);
  if (!metadata) {
    return false;
  }

  return normalizeStringArray(metadata.tools).some((tool) => toolMatches(tool, requiredTool));
}

module.exports = {
  agentHasTool,
  getAgentMetadata,
  loadRoutingIndex,
  normalizeStringArray,
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

  process.stderr.write('Usage: agent-tool-registry.js <has-tool|metadata> <agentName> [toolName] [pluginRoot]\n');
  process.exit(2);
}
