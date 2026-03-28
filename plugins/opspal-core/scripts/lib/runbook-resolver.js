#!/usr/bin/env node

/**
 * Runbook Resolver
 *
 * Decides which runbook should own a given ObservationCandidate.
 * Implements scope hierarchy resolution with automatic runbook creation
 * for durable, high-confidence candidates.
 *
 * Resolution algorithm:
 *   1. Build scope candidates from proposed scopes + inferred scopes
 *   2. Sort by specificity (sub-agent > workflow > solution > project > platform > org)
 *   3. Walk scope hierarchy trying exact matches, then parent scope fallbacks
 *   4. Auto-create draft runbooks for high-confidence candidates with no match
 *   5. Fall back to org-level runbook as last resort
 *
 * Usage (programmatic):
 *   const { resolveCandidate, resolveBatch } = require('./runbook-resolver');
 *   const registry = loadRegistry('acme-prod');
 *   const resolution = resolveCandidate('acme-prod', candidate, registry);
 *
 * @module runbook-resolver
 */

'use strict';

const {
  loadRegistry,
  saveRegistry,
  registerRunbook,
  lookupByScope,
  generateSlug
} = require('./runbook-registry');

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Scope hierarchy — defines fallback chains for each scope type.
 * Most specific first within each chain.
 */
const SCOPE_HIERARCHY = {
  'sub-agent': ['sub-agent', 'platform', 'org'],
  'workflow':  ['workflow', 'platform', 'org'],
  'solution':  ['solution', 'project', 'org'],
  'project':   ['project', 'org'],
  'platform':  ['platform', 'org'],
  'org':       ['org']
};

/**
 * Specificity order — higher index = broader scope.
 * Used for sorting scope candidates (most specific first).
 */
const SPECIFICITY_ORDER = ['sub-agent', 'workflow', 'solution', 'project', 'platform', 'org'];

/**
 * Creation thresholds.
 */
const CREATE_CONFIDENCE_MIN = 0.6;
const CREATE_DURABILITY_MIN = 0.5;
const CREATE_SESSION_LIMIT = 5;

// Session-level creation counter (reset per process)
const _sessionCreationCount = new Map();

// ── Exported functions ─────────────────────────────────────────────────────

/**
 * Get the fallback hierarchy for a scope type.
 *
 * @param {string} scopeType
 * @returns {string[]} Array of scope types from most specific to broadest
 */
function buildScopeHierarchy(scopeType) {
  return SCOPE_HIERARCHY[scopeType] || ['org'];
}

/**
 * Infer possible scopes from candidate fields.
 *
 * @param {Object} candidate - ObservationCandidate
 * @returns {{ scopeType: string, scopeKey: string }[]}
 */
function inferScopes(candidate) {
  const scopes = [];

  if (candidate.relatedWorkflow) {
    scopes.push({ scopeType: 'workflow', scopeKey: candidate.relatedWorkflow });
  }

  if (candidate.sourceAgent && candidate.sourceAgent !== 'unknown') {
    scopes.push({ scopeType: 'sub-agent', scopeKey: candidate.sourceAgent });
  }

  if (candidate.relatedProject) {
    scopes.push({ scopeType: 'project', scopeKey: candidate.relatedProject });
  }

  if (candidate.platform) {
    scopes.push({ scopeType: 'platform', scopeKey: candidate.platform });
  }

  if (candidate.orgAlias) {
    scopes.push({ scopeType: 'org', scopeKey: candidate.orgAlias });
  }

  return scopes;
}

/**
 * Check whether a new runbook should be created for a candidate.
 *
 * @param {Object} candidate - ObservationCandidate
 * @param {string} org - Org alias
 * @returns {boolean}
 */
function shouldCreateRunbook(candidate, org) {
  if (candidate.confidence < CREATE_CONFIDENCE_MIN) return false;
  if (candidate.durabilityScore < CREATE_DURABILITY_MIN) return false;

  // Don't create org-scoped runbooks via auto-creation (they're created on fallback)
  const bestScope = (candidate.proposedScopes || [])[0];
  if (bestScope && bestScope.scopeType === 'org') return false;

  // Rate limit
  const count = _sessionCreationCount.get(org) || 0;
  if (count >= CREATE_SESSION_LIMIT) return false;

  return true;
}

/**
 * Derive a human-readable title for an auto-created runbook.
 */
function _deriveTitle(candidate, scope) {
  const parts = [];

  if (scope.scopeType === 'workflow') {
    parts.push(scope.scopeKey, 'Workflow');
  } else if (scope.scopeType === 'sub-agent') {
    parts.push(scope.scopeKey, 'Agent');
  } else if (scope.scopeType === 'project') {
    parts.push(scope.scopeKey, 'Project');
  } else if (scope.scopeType === 'solution') {
    parts.push(scope.scopeKey, 'Solution');
  } else if (scope.scopeType === 'platform') {
    parts.push(scope.scopeKey, 'Platform');
  } else {
    parts.push(scope.scopeKey);
  }

  // Title-case each word
  return parts
    .join(' ')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Get the parent scope key for a given scope when falling back.
 * For example, if we have a workflow scope and fall back to platform,
 * we need the platform key.
 */
function _getParentScopeKey(candidate, parentScopeType) {
  if (parentScopeType === 'platform') {
    return candidate.platform || 'salesforce';
  }
  if (parentScopeType === 'org') {
    return candidate.orgAlias || '';
  }
  if (parentScopeType === 'project') {
    return candidate.relatedProject || '';
  }
  return '';
}

/**
 * Sort scope candidates by specificity (most specific first).
 */
function _sortBySpecificity(scopes) {
  return [...scopes].sort((a, b) => {
    const idxA = SPECIFICITY_ORDER.indexOf(a.scopeType);
    const idxB = SPECIFICITY_ORDER.indexOf(b.scopeType);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
}

/**
 * Deduplicate scopes by scopeType:scopeKey.
 */
function _deduplicateScopes(scopes) {
  const seen = new Set();
  return scopes.filter(s => {
    const key = `${s.scopeType}:${s.scopeKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve a single candidate to its target runbook.
 *
 * @param {string} org - Org alias
 * @param {Object} candidate - ObservationCandidate
 * @param {Object} registry - RunbookRegistry (pass in so caller controls reload timing)
 * @param {string} [pluginRoot]
 * @returns {Object} ScopeResolution
 */
function resolveCandidate(org, candidate, registry, pluginRoot) {
  // Build scope candidates: proposed scopes first (extractor's best judgment),
  // then inferred scopes as fallbacks. Within each group, sort by specificity.
  const proposedScopes = _sortBySpecificity(candidate.proposedScopes || []);
  const inferredScopes = _sortBySpecificity(inferScopes(candidate));
  // Proposed first, then inferred, deduplicated
  const sortedScopes = _deduplicateScopes([...proposedScopes, ...inferredScopes]);

  // Try to find a matching runbook
  for (const scope of sortedScopes) {
    const hierarchy = buildScopeHierarchy(scope.scopeType);

    for (const hierarchyScopeType of hierarchy) {
      let scopeKey;
      if (hierarchyScopeType === scope.scopeType) {
        scopeKey = scope.scopeKey;
      } else {
        scopeKey = _getParentScopeKey(candidate, hierarchyScopeType);
      }

      if (!scopeKey) continue;

      const found = registry.runbooks.find(
        r => r.scopeType === hierarchyScopeType &&
             r.scopeKey.toLowerCase().replace(/[\s_-]+/g, '-') === scopeKey.toLowerCase().replace(/[\s_-]+/g, '-')
      );

      if (found) {
        return {
          candidateId: candidate.candidateId,
          resolvedRunbookId: found.id,
          resolvedScope: { scopeType: found.scopeType, scopeKey: found.scopeKey },
          matchType: hierarchyScopeType === scope.scopeType ? 'exact' : 'parent-scope',
          confidence: candidate.confidence,
          registryUpdated: false,
          createdRunbook: null
        };
      }
    }
  }

  // No match found — try creating a new runbook
  if (shouldCreateRunbook(candidate, org)) {
    // Pick the most specific non-org scope
    const bestScope = sortedScopes.find(s => s.scopeType !== 'org') || sortedScopes[0];

    if (bestScope && bestScope.scopeType !== 'org') {
      const newMetadata = {
        title: _deriveTitle(candidate, bestScope),
        scopeType: bestScope.scopeType,
        scopeKey: bestScope.scopeKey,
        status: 'draft',
        linkedAgents: candidate.sourceAgent ? [candidate.sourceAgent] : [],
        linkedWorkflows: candidate.relatedWorkflow ? [candidate.relatedWorkflow] : [],
        linkedObjects: candidate.relatedObjects || [],
        tags: [candidate.category].filter(Boolean),
        aliases: [],
        parentRunbook: null,
        candidateCount: 1
      };

      const id = generateSlug(bestScope.scopeType, bestScope.scopeKey);
      newMetadata.id = id;

      // Add to the in-memory registry
      const now = new Date().toISOString();
      const entry = {
        ...newMetadata,
        createdAt: now,
        updatedAt: now
      };
      registry.runbooks.push(entry);
      registry.updatedAt = now;

      // Increment session counter
      _sessionCreationCount.set(org, (_sessionCreationCount.get(org) || 0) + 1);

      return {
        candidateId: candidate.candidateId,
        resolvedRunbookId: id,
        resolvedScope: { scopeType: bestScope.scopeType, scopeKey: bestScope.scopeKey },
        matchType: 'created',
        confidence: candidate.confidence,
        registryUpdated: true,
        createdRunbook: entry
      };
    }
  }

  // Final fallback: org-level runbook
  let orgRunbook = registry.runbooks.find(
    r => r.scopeType === 'org' && r.scopeKey.toLowerCase() === org.toLowerCase()
  );

  if (!orgRunbook) {
    // Auto-create the org-level runbook
    const now = new Date().toISOString();
    orgRunbook = {
      id: generateSlug('org', org),
      title: `${org} Org Runbook`,
      scopeType: 'org',
      scopeKey: org,
      parentRunbook: null,
      tags: [],
      aliases: [],
      linkedAgents: [],
      linkedWorkflows: [],
      linkedObjects: [],
      createdAt: now,
      updatedAt: now,
      status: 'active',
      candidateCount: 0
    };
    registry.runbooks.push(orgRunbook);
    registry.updatedAt = now;
  }

  return {
    candidateId: candidate.candidateId,
    resolvedRunbookId: orgRunbook.id,
    resolvedScope: { scopeType: 'org', scopeKey: org },
    matchType: 'org-fallback',
    confidence: candidate.confidence,
    registryUpdated: !orgRunbook._existed,
    createdRunbook: null
  };
}

/**
 * Resolve a batch of candidates, saving the registry once at the end.
 *
 * @param {string} org
 * @param {Object[]} candidates
 * @param {Object} [registry] - Optional pre-loaded registry; loaded if omitted
 * @param {string} [pluginRoot]
 * @returns {Object[]} Array of ScopeResolution
 */
function resolveBatch(org, candidates, registry, pluginRoot) {
  if (!registry) {
    registry = loadRegistry(org, pluginRoot);
  }

  const resolutions = [];
  let registryModified = false;

  for (const candidate of candidates) {
    const resolution = resolveCandidate(org, candidate, registry, pluginRoot);
    resolutions.push(resolution);
    if (resolution.registryUpdated) {
      registryModified = true;
    }
  }

  // Save registry once if any modifications were made
  if (registryModified) {
    saveRegistry(org, registry, pluginRoot);
  }

  return resolutions;
}

/**
 * Reset the session creation counter (for testing).
 */
function _resetSessionCounter() {
  _sessionCreationCount.clear();
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: runbook-resolver.js --org <alias> --candidate <file>');
    console.log('       runbook-resolver.js --org <alias> --candidates-dir <dir>');
    process.exit(0);
  }

  let org = null;
  let candidateFile = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org': org = args[++i]; break;
      case '--candidate': candidateFile = args[++i]; break;
    }
  }

  if (!org) {
    console.error('❌ --org is required');
    process.exit(1);
  }

  const registry = loadRegistry(org);

  if (candidateFile) {
    const fs = require('fs');
    const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf-8'));
    const resolution = resolveCandidate(org, candidate, registry);
    if (resolution.registryUpdated) {
      saveRegistry(org, registry);
    }
    console.log(JSON.stringify(resolution, null, 2));
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  resolveCandidate,
  resolveBatch,
  inferScopes,
  buildScopeHierarchy,
  shouldCreateRunbook,

  // Constants
  SCOPE_HIERARCHY,
  SPECIFICITY_ORDER,
  CREATE_CONFIDENCE_MIN,
  CREATE_DURABILITY_MIN,
  CREATE_SESSION_LIMIT,

  // Testing helpers
  _resetSessionCounter,
  _deriveTitle,
  _sortBySpecificity
};
