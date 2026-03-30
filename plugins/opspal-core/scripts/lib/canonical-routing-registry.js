'use strict';

const fs = require('fs');
const path = require('path');

const MARKETPLACE_CORE_PATH = process.env.HOME
  ? path.join(
      process.env.HOME,
      '.claude',
      'plugins',
      'marketplaces',
      'revpal-internal-plugins',
      'plugins',
      'opspal-core'
    )
  : null;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeStringArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringArray(item))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const stringValue = value.trim();
    const segments = /,|\n/.test(stringValue)
      ? stringValue.split(/[,\n]/)
      : /\s\|\s/.test(stringValue)
        ? stringValue.split(/\s\|\s/)
        : [stringValue];

    return segments
      .map((item) => item.trim().replace(/^["'`]|["'`]$/g, ''))
      .filter(Boolean);
  }

  return [];
}

function resolveCorePluginRoot(explicitPluginRoot = '') {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT
    ? path.resolve(process.env.CLAUDE_PLUGIN_ROOT)
    : '';
  const candidates = unique([
    explicitPluginRoot,
    envRoot,
    envRoot ? path.join(envRoot, 'plugins', 'opspal-core') : '',
    path.resolve(__dirname, '..', '..'),
    path.resolve(process.cwd(), 'plugins', 'opspal-core'),
    path.resolve(process.cwd(), '.claude-plugins', 'opspal-core'),
    MARKETPLACE_CORE_PATH
  ]);

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }

    const registryPath = path.join(candidate, 'config', 'routing-patterns.json');
    if (fs.existsSync(registryPath)) {
      return path.resolve(candidate);
    }
  }

  return path.resolve(__dirname, '..', '..');
}

function loadJsonCandidate(candidates) {
  for (const candidate of unique(candidates)) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }

    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (_error) {
      process.stderr.write(`[canonical-routing-registry] Failed to load routing candidate "${candidate}": ${_error.message}\n`);
      continue;
    }
  }

  process.stderr.write('[canonical-routing-registry] All routing index candidates exhausted; routing unavailable.\n');
  return null;
}

function getRoutingPatternsPath(explicitPluginRoot = '') {
  return path.join(resolveCorePluginRoot(explicitPluginRoot), 'config', 'routing-patterns.json');
}

function getRoutableMetadataPath(explicitPluginRoot = '') {
  return path.join(resolveCorePluginRoot(explicitPluginRoot), 'config', 'routable-agent-metadata.json');
}

function loadRoutingPatterns(explicitPluginRoot = '') {
  return loadJsonCandidate([
    getRoutingPatternsPath(explicitPluginRoot)
  ]) || {};
}

function loadRoutableAgentMetadata(explicitPluginRoot = '') {
  return loadJsonCandidate([
    getRoutableMetadataPath(explicitPluginRoot)
  ]) || { agents: {} };
}

function listPlatformPatternEntries(registry = {}) {
  const entries = [];

  for (const [platform, config] of Object.entries(registry.platformPatterns || {})) {
    const patterns = Array.isArray(config?.patterns) ? config.patterns : [];
    patterns.forEach((pattern, index) => {
      entries.push({
        kind: 'platform',
        platform,
        id: String(pattern.id || `${platform}-${index}`).trim(),
        agent: String(pattern.agent || '').trim(),
        keywords: normalizeStringArray(pattern.keywords),
        clearanceAgents: normalizeStringArray(pattern.clearanceAgents),
        blocking: pattern.blocking === true,
        complexity: Number.parseFloat(String(pattern.complexity || '0')) || 0,
        sourcePath: `platformPatterns.${platform}.patterns[${index}]`
      });
    });
  }

  return entries;
}

function listMandatoryPatternEntries(registry = {}) {
  return (registry.mandatoryPatterns?.patterns || []).map((pattern, index) => ({
    kind: 'mandatory',
    platform: 'mandatory',
    id: String(pattern.id || `mandatory-${index}`).trim(),
    agent: String(pattern.agent || '').trim(),
    keywords: normalizeStringArray(pattern.keywords || pattern.pattern),
    clearanceAgents: normalizeStringArray(pattern.clearanceAgents),
    blocking: true,
    complexity: 1,
    sourcePath: `mandatoryPatterns.patterns[${index}]`
  }));
}

function listCanonicalPatternEntries(explicitPluginRoot = '') {
  const registry = loadRoutingPatterns(explicitPluginRoot);
  return [
    ...listPlatformPatternEntries(registry),
    ...listMandatoryPatternEntries(registry)
  ];
}

function buildCanonicalKeywordMap(explicitPluginRoot = '') {
  const registry = loadRoutingPatterns(explicitPluginRoot);
  const keywordMap = {};

  for (const entry of listCanonicalPatternEntries(explicitPluginRoot)) {
    if (!entry.agent) {
      continue;
    }

    if (!keywordMap[entry.agent]) {
      keywordMap[entry.agent] = [];
    }

    keywordMap[entry.agent].push(...entry.keywords);
  }

  if (registry.exclusiveKeywords?.mappings && typeof registry.exclusiveKeywords.mappings === 'object') {
    for (const [keyword, agent] of Object.entries(registry.exclusiveKeywords.mappings)) {
      if (typeof agent !== 'string' || !agent.trim()) {
        continue;
      }

      if (!keywordMap[agent]) {
        keywordMap[agent] = [];
      }

      keywordMap[agent].push(String(keyword).trim());
    }
  }

  for (const agent of Object.keys(keywordMap)) {
    keywordMap[agent] = unique(normalizeStringArray(keywordMap[agent]));
  }

  return keywordMap;
}

function collectCanonicalAgentTargets(explicitPluginRoot = '') {
  const registry = loadRoutingPatterns(explicitPluginRoot);
  const references = [];

  function walk(value, currentPath = 'root') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      const nextPath = `${currentPath}.${key}`;

      if (
        (key === 'agent' || key === 'preferredAgent' || key === 'preferred_agent' ||
          key === 'requiredAgent') &&
        typeof nested === 'string'
      ) {
        references.push({ path: nextPath, agent: nested.trim(), source: 'routing-patterns.json' });
      }

      if ((key === 'clearanceAgents' || key === 'approvedAgents') && Array.isArray(nested)) {
        nested.forEach((agent, index) => {
          if (typeof agent === 'string' && agent.trim()) {
            references.push({
              path: `${nextPath}[${index}]`,
              agent: agent.trim(),
              source: 'routing-patterns.json'
            });
          }
        });
      }

      walk(nested, nextPath);
    }
  }

  walk(registry);
  return references;
}

module.exports = {
  buildCanonicalKeywordMap,
  collectCanonicalAgentTargets,
  getRoutableMetadataPath,
  getRoutingPatternsPath,
  listCanonicalPatternEntries,
  loadRoutingPatterns,
  loadRoutableAgentMetadata,
  normalizeStringArray,
  resolveCorePluginRoot
};
