#!/usr/bin/env node

/**
 * Runbook Registry
 *
 * Machine-readable registry of scoped runbooks per org instance.
 * Supports scope types: org, platform, project, workflow, solution, sub-agent.
 *
 * Usage (programmatic):
 *   const { loadRegistry, registerRunbook, lookupByScope } = require('./runbook-registry');
 *   const registry = loadRegistry('acme-prod');
 *   const id = registerRunbook('acme-prod', { title: 'Lead Routing', scopeType: 'workflow', scopeKey: 'lead-routing' });
 *   const match = lookupByScope('acme-prod', 'workflow', 'lead-routing');
 *
 * Usage (CLI):
 *   node runbook-registry.js --org <alias> --action list
 *   node runbook-registry.js --org <alias> --action lookup --scope-type workflow --scope-key lead-routing
 *
 * Storage: instances/{org}/runbooks/registry.json
 *
 * @module runbook-registry
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { compositeSimilarity } = require('./string-similarity');

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_SCOPE_TYPES = ['org', 'platform', 'project', 'workflow', 'solution', 'sub-agent'];
const VALID_STATUSES = ['active', 'draft', 'archived'];
const REGISTRY_VERSION = '1.0.0';

// ── Internal slug helpers ──────────────────────────────────────────────────

/**
 * Normalize a string into a slug-safe key.
 * Lowercase, replace spaces/underscores/slashes with hyphens, strip non-alnum-hyphen,
 * collapse consecutive hyphens, trim leading/trailing hyphens.
 */
function _normalizeKey(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Exported slug utilities ────────────────────────────────────────────────

/**
 * Generate a deterministic runbook ID from scope type and key.
 *
 * @param {string} scopeType - One of VALID_SCOPE_TYPES
 * @param {string} scopeKey - The specific scope identifier
 * @returns {string} Slug in format "{scopeType}-{normalizedKey}"
 */
function generateSlug(scopeType, scopeKey) {
  const normalizedType = _normalizeKey(scopeType);
  const normalizedKey = _normalizeKey(scopeKey);
  if (!normalizedType || !normalizedKey) {
    throw new Error(`generateSlug requires non-empty scopeType and scopeKey, got: "${scopeType}", "${scopeKey}"`);
  }
  return `${normalizedType}-${normalizedKey}`;
}

/**
 * Normalize an alias for lookup comparison.
 *
 * @param {string} alias
 * @returns {string} Normalized alias
 */
function normalizeAlias(alias) {
  return _normalizeKey(alias);
}

/**
 * Parse a runbook ID into its scope type and scope key components.
 *
 * @param {string} id - Runbook ID (e.g., "workflow-lead-routing")
 * @returns {{ scopeType: string, scopeKey: string }}
 */
function parseRunbookId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error(`parseRunbookId requires a non-empty string, got: "${id}"`);
  }

  // Try matching known scope types (longest first to handle "sub-agent")
  const sortedTypes = [...VALID_SCOPE_TYPES].sort((a, b) => b.length - a.length);
  for (const scopeType of sortedTypes) {
    const prefix = scopeType + '-';
    if (id.startsWith(prefix) && id.length > prefix.length) {
      return { scopeType, scopeKey: id.slice(prefix.length) };
    }
  }

  // Fallback: split on first hyphen
  const idx = id.indexOf('-');
  if (idx === -1) {
    return { scopeType: id, scopeKey: '' };
  }
  return { scopeType: id.slice(0, idx), scopeKey: id.slice(idx + 1) };
}

// ── Path resolution ────────────────────────────────────────────────────────

/**
 * Detect plugin root from this file's location.
 * This script is at: plugins/opspal-core/scripts/lib/runbook-registry.js
 * Plugin root is 2 levels up.
 */
function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

/**
 * Get the registry file path for an org.
 * Follows the flat instances/{org}/ convention used by runbook-observer.js.
 */
function _getRegistryPath(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'registry.json');
}

/**
 * Get the candidates directory path for an org.
 */
function _getCandidatesDir(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'candidates');
}

/**
 * Get the scopes directory path for an org.
 */
function _getScopesDir(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'scopes');
}

// ── Registry I/O ───────────────────────────────────────────────────────────

/**
 * Load the runbook registry for an org. Creates an empty registry if the file
 * does not exist. Never throws on missing file.
 *
 * @param {string} org - Org alias
 * @param {string} [pluginRoot] - Optional plugin root override
 * @returns {Object} RunbookRegistry object
 */
function loadRegistry(org, pluginRoot) {
  const registryPath = _getRegistryPath(org, pluginRoot);

  try {
    if (fs.existsSync(registryPath)) {
      const raw = fs.readFileSync(registryPath, 'utf-8');
      const registry = JSON.parse(raw);
      // Validate minimum shape
      if (registry && Array.isArray(registry.runbooks)) {
        return registry;
      }
    }
  } catch (err) {
    // Graceful degradation — return empty registry
    console.warn(`⚠️  Could not load registry for ${org}: ${err.message}`);
  }

  return {
    version: REGISTRY_VERSION,
    org: org,
    runbooks: [],
    updatedAt: new Date().toISOString()
  };
}

/**
 * Atomically save the registry via temp-file + rename.
 *
 * @param {string} org - Org alias
 * @param {Object} registry - RunbookRegistry object
 * @param {string} [pluginRoot] - Optional plugin root override
 */
function saveRegistry(org, registry, pluginRoot) {
  const registryPath = _getRegistryPath(org, pluginRoot);
  const dir = path.dirname(registryPath);

  fs.mkdirSync(dir, { recursive: true });

  registry.updatedAt = new Date().toISOString();

  const tmp = registryPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf-8');
  fs.renameSync(tmp, registryPath);
}

// ── Registry mutations ─────────────────────────────────────────────────────

/**
 * Register (upsert) a runbook in the registry.
 * If a runbook with the same ID exists, it is updated (preserving createdAt).
 * If no ID is provided, one is generated from scopeType + scopeKey.
 *
 * @param {string} org - Org alias
 * @param {Object} metadata - Partial RunbookMetadata
 * @param {string} [pluginRoot] - Optional plugin root override
 * @returns {string} The runbook ID
 */
function registerRunbook(org, metadata, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const now = new Date().toISOString();

  // Generate ID if not provided
  const id = metadata.id || generateSlug(metadata.scopeType, metadata.scopeKey);

  const existingIdx = registry.runbooks.findIndex(r => r.id === id);

  if (existingIdx >= 0) {
    // Update existing entry, preserving createdAt
    const existing = registry.runbooks[existingIdx];
    registry.runbooks[existingIdx] = {
      ...existing,
      ...metadata,
      id,
      createdAt: existing.createdAt,
      updatedAt: now
    };
  } else {
    // Insert new entry with defaults
    const entry = {
      id,
      title: metadata.title || id,
      scopeType: metadata.scopeType,
      scopeKey: metadata.scopeKey || '',
      parentRunbook: metadata.parentRunbook || null,
      tags: metadata.tags || [],
      aliases: metadata.aliases || [],
      linkedAgents: metadata.linkedAgents || [],
      linkedWorkflows: metadata.linkedWorkflows || [],
      linkedObjects: metadata.linkedObjects || [],
      createdAt: now,
      updatedAt: now,
      status: metadata.status || 'draft',
      candidateCount: metadata.candidateCount || 0,
      ...metadata,
      id,
      createdAt: now,
      updatedAt: now
    };
    registry.runbooks.push(entry);
  }

  saveRegistry(org, registry, pluginRoot);
  return id;
}

// ── Lookup functions ───────────────────────────────────────────────────────

/**
 * Look up a runbook by exact scope type and key.
 *
 * @param {string} org - Org alias
 * @param {string} scopeType
 * @param {string} scopeKey
 * @param {string} [pluginRoot]
 * @returns {Object|null} RunbookMetadata or null
 */
function lookupByScope(org, scopeType, scopeKey, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const normalizedKey = _normalizeKey(scopeKey);
  return registry.runbooks.find(
    r => r.scopeType === scopeType && _normalizeKey(r.scopeKey) === normalizedKey
  ) || null;
}

/**
 * Find all runbooks linked to a given agent.
 *
 * @param {string} org
 * @param {string} agentName
 * @param {string} [pluginRoot]
 * @returns {Object[]} Array of RunbookMetadata
 */
function lookupByAgent(org, agentName, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const normalized = agentName.toLowerCase();
  return registry.runbooks.filter(
    r => (r.linkedAgents || []).some(a => a.toLowerCase() === normalized)
  );
}

/**
 * Find all runbooks linked to a given workflow.
 *
 * @param {string} org
 * @param {string} workflowName
 * @param {string} [pluginRoot]
 * @returns {Object[]} Array of RunbookMetadata
 */
function lookupByWorkflow(org, workflowName, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const normalized = _normalizeKey(workflowName);
  return registry.runbooks.filter(
    r => (r.linkedWorkflows || []).some(w => _normalizeKey(w) === normalized)
  );
}

/**
 * Find all runbooks linked to a given object.
 *
 * @param {string} org
 * @param {string} objectName
 * @param {string} [pluginRoot]
 * @returns {Object[]} Array of RunbookMetadata
 */
function lookupByObject(org, objectName, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const normalized = objectName.toLowerCase();
  return registry.runbooks.filter(
    r => (r.linkedObjects || []).some(o => o.toLowerCase() === normalized)
  );
}

/**
 * Find all runbooks matching any of the given tags.
 *
 * @param {string} org
 * @param {string[]} tags
 * @param {string} [pluginRoot]
 * @returns {Object[]} Array of RunbookMetadata
 */
function lookupByTags(org, tags, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const normalizedTags = tags.map(t => t.toLowerCase());
  return registry.runbooks.filter(
    r => (r.tags || []).some(t => normalizedTags.includes(t.toLowerCase()))
  );
}

/**
 * Find a runbook by alias.
 *
 * @param {string} org
 * @param {string} alias
 * @param {string} [pluginRoot]
 * @returns {Object|null} RunbookMetadata or null
 */
function lookupByAlias(org, alias, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const normalized = normalizeAlias(alias);
  return registry.runbooks.find(
    r => (r.aliases || []).some(a => normalizeAlias(a) === normalized)
  ) || null;
}

/**
 * Find the best matching runbook(s) given multi-field criteria.
 * Scores each runbook across matching criteria using compositeSimilarity for string fields.
 *
 * @param {string} org
 * @param {Object} criteria - { scopeType?, scopeKey?, agentName?, workflowName?, objectName?, tags?, alias?, operationType? }
 * @param {string} [pluginRoot]
 * @returns {{ runbook: Object, score: number }[]} Sorted descending by score
 */
function findBestMatch(org, criteria, pluginRoot) {
  if (!criteria || Object.keys(criteria).length === 0) return [];

  const registry = loadRegistry(org, pluginRoot);
  if (registry.runbooks.length === 0) return [];

  const results = [];

  for (const runbook of registry.runbooks) {
    let totalScore = 0;
    let totalWeight = 0;

    // scopeType exact match (weight: 0.3)
    if (criteria.scopeType) {
      totalWeight += 0.3;
      if (runbook.scopeType === criteria.scopeType) {
        totalScore += 0.3;
      }
    }

    // scopeKey similarity (weight: 0.3)
    if (criteria.scopeKey) {
      totalWeight += 0.3;
      const sim = compositeSimilarity(_normalizeKey(criteria.scopeKey), _normalizeKey(runbook.scopeKey));
      totalScore += 0.3 * (sim.composite || 0);
    }

    // agentName in linkedAgents (weight: 0.15)
    if (criteria.agentName) {
      totalWeight += 0.15;
      const normalizedAgent = criteria.agentName.toLowerCase();
      if ((runbook.linkedAgents || []).some(a => a.toLowerCase() === normalizedAgent)) {
        totalScore += 0.15;
      }
    }

    // workflowName in linkedWorkflows (weight: 0.15)
    if (criteria.workflowName) {
      totalWeight += 0.15;
      const normalized = _normalizeKey(criteria.workflowName);
      if ((runbook.linkedWorkflows || []).some(w => _normalizeKey(w) === normalized)) {
        totalScore += 0.15;
      }
    }

    // objectName in linkedObjects (weight: 0.05)
    if (criteria.objectName) {
      totalWeight += 0.05;
      const normalized = criteria.objectName.toLowerCase();
      if ((runbook.linkedObjects || []).some(o => o.toLowerCase() === normalized)) {
        totalScore += 0.05;
      }
    }

    // tags overlap (weight: 0.05)
    if (criteria.tags && criteria.tags.length > 0) {
      totalWeight += 0.05;
      const normalizedCriteriaTags = criteria.tags.map(t => t.toLowerCase());
      const runbookTags = (runbook.tags || []).map(t => t.toLowerCase());
      const overlap = normalizedCriteriaTags.filter(t => runbookTags.includes(t)).length;
      const overlapRatio = overlap / normalizedCriteriaTags.length;
      totalScore += 0.05 * overlapRatio;
    }

    const score = totalWeight > 0 ? totalScore / totalWeight : 0;
    if (score >= 0.1) {
      results.push({ runbook, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let org = null;
  let action = 'list';
  let scopeType = null;
  let scopeKey = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org': org = args[++i]; break;
      case '--action': action = args[++i]; break;
      case '--scope-type': scopeType = args[++i]; break;
      case '--scope-key': scopeKey = args[++i]; break;
      case '--help':
        console.log('Usage: runbook-registry.js --org <alias> [--action list|lookup|stats] [--scope-type <type>] [--scope-key <key>]');
        process.exit(0);
    }
  }

  if (!org) {
    console.error('❌ --org is required');
    process.exit(1);
  }

  const registry = loadRegistry(org);

  switch (action) {
    case 'list':
      console.log(JSON.stringify(registry, null, 2));
      break;
    case 'lookup':
      if (!scopeType || !scopeKey) {
        console.error('❌ --scope-type and --scope-key required for lookup');
        process.exit(1);
      }
      const result = lookupByScope(org, scopeType, scopeKey);
      console.log(JSON.stringify(result, null, 2));
      break;
    case 'stats':
      console.log(JSON.stringify({
        org: registry.org,
        totalRunbooks: registry.runbooks.length,
        byStatus: registry.runbooks.reduce((acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        }, {}),
        byScopeType: registry.runbooks.reduce((acc, r) => {
          acc[r.scopeType] = (acc[r.scopeType] || 0) + 1;
          return acc;
        }, {}),
        updatedAt: registry.updatedAt
      }, null, 2));
      break;
    default:
      console.error(`❌ Unknown action: ${action}`);
      process.exit(1);
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Slug utilities
  generateSlug,
  normalizeAlias,
  parseRunbookId,

  // Registry I/O
  loadRegistry,
  saveRegistry,
  registerRunbook,

  // Lookups
  lookupByScope,
  lookupByAgent,
  lookupByWorkflow,
  lookupByObject,
  lookupByTags,
  lookupByAlias,
  findBestMatch,

  // Constants (for external validation)
  VALID_SCOPE_TYPES,
  VALID_STATUSES,
  REGISTRY_VERSION
};
