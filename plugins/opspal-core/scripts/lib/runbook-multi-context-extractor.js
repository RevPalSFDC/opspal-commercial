#!/usr/bin/env node

/**
 * Multi-Runbook Context Extractor
 *
 * Wraps the existing extractRunbookContext function and adds scoped runbook
 * retrieval. Returns the same base shape with additive scopedContext field.
 *
 * Usage (programmatic):
 *   const { extractMultiRunbookContext } = require('./runbook-multi-context-extractor');
 *   const context = extractMultiRunbookContext('acme-prod', {
 *     operationType: 'deployment',
 *     objects: ['Account'],
 *     workflowName: 'Lead Routing',
 *     agentName: 'sfdc-deployment-manager'
 *   });
 *
 * @module runbook-multi-context-extractor
 */

'use strict';

const { extractRunbookContext } = require('./runbook-context-extractor');
const { loadRegistry, findBestMatch } = require('./runbook-registry');
const { loadEntries } = require('./runbook-entry-store');
const { tokenSimilarity } = require('./string-similarity');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a concise merged summary from scoped runbook entries.
 * Entries are sorted by confidence and formatted as bullets.
 *
 * @param {Object[]} scopedRunbooks - Array of { entries, scopeType, ... }
 * @param {number} [maxLength=500]
 * @returns {string}
 */
function createMergedSummary(scopedRunbooks, maxLength = 500) {
  if (!scopedRunbooks || scopedRunbooks.length === 0) return '';

  const allEntries = [];
  for (const rb of scopedRunbooks) {
    for (const entry of (rb.entries || [])) {
      allEntries.push(entry);
    }
  }

  // Sort by confidence descending
  allEntries.sort((a, b) => b.confidence - a.confidence);

  const bullets = [];
  let length = 0;

  for (const entry of allEntries) {
    const bullet = `- [${entry.section}] ${entry.title}: ${entry.summary}`;
    if (length + bullet.length + 1 > maxLength) break;
    bullets.push(bullet);
    length += bullet.length + 1; // +1 for newline
  }

  return bullets.join('\n');
}

/**
 * Deduplicate entries across runbooks. When two entries have
 * tokenSimilarity >= 0.8, keep the one with higher confidence.
 *
 * @param {Object[]} entries - Flat array of entries
 * @returns {Object[]} Deduplicated entries
 */
function _deduplicateEntries(entries) {
  if (entries.length <= 1) return entries;

  const result = [];
  const skipped = new Set();

  for (let i = 0; i < entries.length; i++) {
    if (skipped.has(i)) continue;

    let best = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      if (skipped.has(j)) continue;
      if (tokenSimilarity(best.summary, entries[j].summary) >= 0.8) {
        if (entries[j].confidence > best.confidence) {
          skipped.add(i);
          best = entries[j];
        } else {
          skipped.add(j);
        }
      }
    }
    if (!skipped.has(i)) {
      result.push(best);
    }
  }

  return result;
}

// ── Main function ──────────────────────────────────────────────────────────

/**
 * Extract runbook context from both the primary RUNBOOK.md and scoped runbooks.
 * Backward-compatible: returns the same base shape as extractRunbookContext
 * with additive scopedContext and enhanced condensedSummary fields.
 *
 * @param {string} org
 * @param {Object} [options]
 * @param {string} [options.operationType]
 * @param {string[]} [options.objects]
 * @param {string} [options.workflowName]
 * @param {string} [options.projectSlug]
 * @param {string} [options.agentName]
 * @param {number} [options.maxRunbooks=3]
 * @param {string} [options.format]
 * @param {string} [options.pluginRoot]
 * @returns {Object} Extended runbook context
 */
function extractMultiRunbookContext(org, options = {}) {
  const {
    operationType,
    objects,
    workflowName,
    projectSlug,
    agentName,
    maxRunbooks = 3,
    format,
    pluginRoot
  } = options;

  // Step 1: base context from existing extractor (reads RUNBOOK.md)
  const baseContext = extractRunbookContext(org, { operationType, objects, format });

  // Step 2: load registry
  const registry = loadRegistry(org, pluginRoot);
  if (registry.runbooks.length === 0) {
    return {
      ...baseContext,
      scopedContext: { scopedRunbooks: [], mergedSummary: '', entryCount: 0 },
      condensedSummary: {
        ...(baseContext.condensedSummary || {}),
        scopedRunbookCount: 0,
        scopedEntryCount: 0,
        topScopedGuidance: []
      }
    };
  }

  // Step 3: build criteria from options
  const criteria = {};
  if (workflowName) {
    criteria.workflowName = workflowName;
    criteria.scopeType = 'workflow';
  }
  if (projectSlug) {
    criteria.scopeKey = projectSlug;
    criteria.scopeType = 'project';
  }
  if (agentName) {
    criteria.agentName = agentName;
  }
  if (objects && objects.length > 0) {
    criteria.objectName = objects[0];
  }
  if (operationType) {
    criteria.tags = [operationType];
  }

  // If no criteria could be built, include all runbooks
  const hasAnyCriteria = Object.keys(criteria).length > 0;

  // Step 4: find matching runbooks
  let topRunbooks;
  if (hasAnyCriteria) {
    const matches = findBestMatch(org, criteria, pluginRoot);
    topRunbooks = matches.slice(0, maxRunbooks);
  } else {
    // No criteria — take all non-archived, sorted by candidateCount
    topRunbooks = registry.runbooks
      .filter(r => r.status !== 'archived')
      .sort((a, b) => (b.candidateCount || 0) - (a.candidateCount || 0))
      .slice(0, maxRunbooks)
      .map(r => ({ runbook: r, score: 0.5 }));
  }

  // Step 5: load entry stores and filter entries
  const scopedRunbooks = [];
  const allFilteredEntries = [];

  for (const { runbook, score } of topRunbooks) {
    const store = loadEntries(org, runbook.id, pluginRoot);
    let entries = store.entries.filter(
      e => ['active', 'proposed'].includes(e.validationStatus) && e.confidence >= 0.4
    );

    // Optional filtering by operation/objects
    if (operationType || (objects && objects.length > 0)) {
      const opLower = (operationType || '').toLowerCase();
      const objsLower = (objects || []).map(o => o.toLowerCase());

      entries = entries.filter(e => {
        // Always include if the entry mentions the operation or objects
        if (opLower && e.relatedWorkflow && e.relatedWorkflow.toLowerCase().includes(opLower)) return true;
        if (objsLower.length > 0 && e.relatedObjects &&
            e.relatedObjects.some(o => objsLower.includes(o.toLowerCase()))) return true;
        // Include entries that don't specify objects/workflows (general knowledge)
        if (!e.relatedObjects?.length && !e.relatedWorkflow) return true;
        return false;
      });
    }

    allFilteredEntries.push(...entries);

    scopedRunbooks.push({
      runbookId: runbook.id,
      title: runbook.title,
      scopeType: runbook.scopeType,
      relevanceScore: score,
      entries // will be replaced with deduped entries below
    });
  }

  // Step 6: cross-runbook deduplication
  const dedupedEntries = _deduplicateEntries(allFilteredEntries);

  // Reassign deduped entries back to their runbooks
  const dedupedIds = new Set(dedupedEntries.map(e => e.entryId));
  for (const rb of scopedRunbooks) {
    rb.entries = rb.entries.filter(e => dedupedIds.has(e.entryId));
  }

  // Step 7: build merged summary and return
  const mergedSummary = createMergedSummary(scopedRunbooks);
  const entryCount = scopedRunbooks.reduce((acc, rb) => acc + rb.entries.length, 0);

  const topScopedGuidance = dedupedEntries
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(e => `[${e.section}] ${e.title}: ${e.summary}`);

  return {
    ...baseContext,
    scopedContext: { scopedRunbooks, mergedSummary, entryCount },
    condensedSummary: {
      ...(baseContext.condensedSummary || {}),
      scopedRunbookCount: scopedRunbooks.length,
      scopedEntryCount: entryCount,
      topScopedGuidance
    }
  };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  extractMultiRunbookContext,
  createMergedSummary,
  // Exposed for testing
  _deduplicateEntries
};
