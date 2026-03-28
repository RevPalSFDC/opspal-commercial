#!/usr/bin/env node

/**
 * Runbook Incremental Updater
 *
 * Takes resolved candidates from the Phase 1 pipeline and writes or merges
 * structured entries into scoped runbook entry stores. Avoids naive append-only
 * behavior by using semantic similarity to merge related knowledge.
 *
 * Pipeline:
 *   observation → extractCandidates → filterDurable → resolveBatch → applyBatch → renderProjections
 *
 * Usage (programmatic):
 *   const { processObservation } = require('./runbook-incremental-updater');
 *   const result = processObservation('acme-prod', observation);
 *
 * @module runbook-incremental-updater
 */

'use strict';

const {
  loadEntries, saveEntries, findSimilar, addEntry, updateEntry,
  generateEntryId, SECTION_MAP
} = require('./runbook-entry-store');
const { loadRegistry, saveRegistry } = require('./runbook-registry');
const {
  extractCandidatesFromObservation,
  extractCandidatesFromReflection,
  filterDurable
} = require('./runbook-candidate-extractor');
const { resolveBatch } = require('./runbook-resolver');

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Check if evidence already exists (dedup by source+timestamp).
 */
function _evidenceExists(evidenceArray, source, timestamp) {
  return evidenceArray.some(
    e => e.source === source && e.timestamp === timestamp
  );
}

/**
 * Union an array of strings (case-insensitive dedup).
 */
function _unionStrings(existing, additions) {
  const normalized = new Set(existing.map(s => s.toLowerCase()));
  const result = [...existing];
  for (const item of additions) {
    if (item && !normalized.has(item.toLowerCase())) {
      result.push(item);
      normalized.add(item.toLowerCase());
    }
  }
  return result;
}

/**
 * Apply a single candidate to an in-memory entry store.
 * Returns { action: 'created'|'merged', entryId: string }.
 */
function _applyToStore(candidate, resolution, entryStore) {
  const section = SECTION_MAP[candidate.category] || 'Known Exceptions';
  const now = new Date().toISOString();

  // Try to find a similar existing entry
  const similar = findSimilar(entryStore, candidate.summary, 0.55);

  if (similar.length > 0) {
    // Merge into the most similar entry
    const { entry } = similar[0];
    const prevCount = entry.recurrenceCount || 1;
    const addedCount = candidate.recurrenceCount || 1;

    // Weighted-average confidence
    const newConfidence = (entry.confidence * prevCount + candidate.confidence * addedCount) / (prevCount + addedCount);

    // Build evidence record
    const evidenceRecord = {
      source: candidate.sourceRef || 'unknown',
      text: candidate.evidence || null,
      timestamp: candidate.extractedAt || now
    };

    // Union evidence (dedup by source+timestamp)
    const evidence = [...(entry.evidence || [])];
    if (!_evidenceExists(evidence, evidenceRecord.source, evidenceRecord.timestamp)) {
      evidence.push(evidenceRecord);
    }

    // Union sourceAgents and relatedObjects
    const sourceAgents = _unionStrings(
      entry.sourceAgents || [],
      candidate.sourceAgent ? [candidate.sourceAgent] : []
    );
    const relatedObjects = _unionStrings(
      entry.relatedObjects || [],
      candidate.relatedObjects || []
    );

    // Determine validation/lifecycle promotions
    let validationStatus = entry.validationStatus;
    if (validationStatus === 'proposed' && newConfidence >= 0.6) {
      validationStatus = 'active';
    }

    let lifecycleStatus = entry.lifecycleStatus;
    if (lifecycleStatus === 'stale') {
      lifecycleStatus = 'confirmed';
    }

    updateEntry(entryStore, entry.entryId, {
      recurrenceCount: prevCount + addedCount,
      confidence: Math.min(1, newConfidence),
      evidence,
      sourceAgents,
      relatedObjects,
      relatedWorkflow: entry.relatedWorkflow || candidate.relatedWorkflow || null,
      lastSeenAt: candidate.extractedAt || now,
      validationStatus,
      lifecycleStatus
    });

    return { action: 'merged', entryId: entry.entryId };
  }

  // No similar entry — create new
  const title = (candidate.summary || '').slice(0, 80);
  const summary = (candidate.summary || '').slice(0, 300);
  const entryId = generateEntryId(section, title, summary);

  const entry = {
    entryId,
    section,
    category: candidate.category,
    title,
    summary,
    details: null,
    evidence: [{
      source: candidate.sourceRef || 'unknown',
      text: candidate.evidence || null,
      timestamp: candidate.extractedAt || now
    }],
    confidence: candidate.confidence,
    recurrenceCount: candidate.recurrenceCount || 1,
    validationStatus: candidate.confidence >= 0.6 ? 'active' : 'proposed',
    lifecycleStatus: 'new',
    firstSeenAt: candidate.extractedAt || now,
    lastSeenAt: candidate.extractedAt || now,
    sourceAgents: candidate.sourceAgent ? [candidate.sourceAgent] : [],
    relatedObjects: candidate.relatedObjects || [],
    relatedWorkflow: candidate.relatedWorkflow || null,
    relatedProject: candidate.relatedProject || null,
    supersedes: [],
    supersededBy: [],
    conflictsWith: []
  };

  addEntry(entryStore, entry);
  return { action: 'created', entryId };
}

// ── Exported functions ─────────────────────────────────────────────────────

/**
 * Apply a single candidate to its resolved runbook's entry store.
 *
 * @param {string} org
 * @param {Object} candidate - ObservationCandidate
 * @param {Object} resolution - ScopeResolution
 * @param {string} [pluginRoot]
 * @returns {{ action: string, entryId: string }}
 */
function applyCandidate(org, candidate, resolution, pluginRoot) {
  const runbookId = resolution.resolvedRunbookId;
  const entryStore = loadEntries(org, runbookId, pluginRoot);
  const result = _applyToStore(candidate, resolution, entryStore);
  saveEntries(org, runbookId, entryStore, pluginRoot);
  return result;
}

/**
 * Apply a batch of candidates to their resolved runbooks.
 * Groups by runbook to minimize I/O: one load+save per runbook.
 *
 * @param {string} org
 * @param {Object[]} candidates
 * @param {Object[]} resolutions
 * @param {string} [pluginRoot]
 * @returns {{ applied: Object[], skipped: Object[] }}
 */
function applyBatch(org, candidates, resolutions, pluginRoot) {
  // Build resolution map: candidateId → resolution
  const resolutionMap = new Map(resolutions.map(r => [r.candidateId, r]));

  // Group candidates by resolved runbook ID
  const byRunbook = new Map();
  for (const candidate of candidates) {
    const res = resolutionMap.get(candidate.candidateId);
    if (!res) continue;
    const id = res.resolvedRunbookId;
    if (!byRunbook.has(id)) byRunbook.set(id, []);
    byRunbook.get(id).push({ candidate, resolution: res });
  }

  const applied = [];
  const skipped = [];

  // Load registry once for candidateCount updates
  const registry = loadRegistry(org, pluginRoot);
  let registryModified = false;

  for (const [runbookId, items] of byRunbook) {
    const entryStore = loadEntries(org, runbookId, pluginRoot);

    for (const { candidate, resolution } of items) {
      try {
        const result = _applyToStore(candidate, resolution, entryStore);
        applied.push({
          candidateId: candidate.candidateId,
          runbookId,
          entryId: result.entryId,
          action: result.action
        });
      } catch (err) {
        skipped.push({ candidateId: candidate.candidateId, reason: err.message });
      }
    }

    saveEntries(org, runbookId, entryStore, pluginRoot);

    // Update candidateCount in registry
    const runbookMeta = registry.runbooks.find(r => r.id === runbookId);
    if (runbookMeta) {
      const appliedForRunbook = items.length - skipped.filter(s =>
        items.some(i => i.candidate.candidateId === s.candidateId)
      ).length;
      runbookMeta.candidateCount = (runbookMeta.candidateCount || 0) + appliedForRunbook;
      runbookMeta.updatedAt = new Date().toISOString();
      registryModified = true;
    }
  }

  if (registryModified) {
    saveRegistry(org, registry, pluginRoot);
  }

  return { applied, skipped };
}

/**
 * Full pipeline: observation → extract → filter → resolve → apply → render projections.
 *
 * @param {string} org
 * @param {Object} observation
 * @param {string} [pluginRoot]
 * @returns {{ candidates: number, applied: number, runbooksUpdated: string[] }}
 */
function processObservation(org, observation, pluginRoot) {
  const candidates = extractCandidatesFromObservation(observation);
  const filtered = filterDurable(candidates, 0.4);

  if (filtered.length === 0) {
    return { candidates: 0, applied: 0, runbooksUpdated: [] };
  }

  const registry = loadRegistry(org, pluginRoot);
  const resolutions = resolveBatch(org, filtered, registry, pluginRoot);
  const result = applyBatch(org, filtered, resolutions, pluginRoot);

  const affectedRunbooks = [...new Set(result.applied.map(a => a.runbookId))];

  // Lazy-require projection renderer to avoid circular deps; non-fatal
  try {
    const { renderProjection } = require('./runbook-render-projection');
    for (const runbookId of affectedRunbooks) {
      try {
        renderProjection(org, runbookId, pluginRoot);
      } catch (err) {
        console.warn(`⚠️  Could not render projection for ${runbookId}: ${err.message}`);
      }
    }
  } catch (err) {
    // render-projection module not available — skip
  }

  return {
    candidates: filtered.length,
    applied: result.applied.length,
    runbooksUpdated: affectedRunbooks
  };
}

/**
 * Full pipeline for reflection data.
 *
 * @param {string} org
 * @param {Object} reflectionData
 * @param {string} [pluginRoot]
 * @returns {{ candidates: number, applied: number, runbooksUpdated: string[] }}
 */
function processReflection(org, reflectionData, pluginRoot) {
  const candidates = extractCandidatesFromReflection(reflectionData);
  const filtered = filterDurable(candidates, 0.4);

  if (filtered.length === 0) {
    return { candidates: 0, applied: 0, runbooksUpdated: [] };
  }

  const registry = loadRegistry(org, pluginRoot);
  const resolutions = resolveBatch(org, filtered, registry, pluginRoot);
  const result = applyBatch(org, filtered, resolutions, pluginRoot);

  const affectedRunbooks = [...new Set(result.applied.map(a => a.runbookId))];

  try {
    const { renderProjection } = require('./runbook-render-projection');
    for (const runbookId of affectedRunbooks) {
      try {
        renderProjection(org, runbookId, pluginRoot);
      } catch (err) {
        console.warn(`⚠️  Could not render projection for ${runbookId}: ${err.message}`);
      }
    }
  } catch (err) {
    // render-projection module not available — skip
  }

  return {
    candidates: filtered.length,
    applied: result.applied.length,
    runbooksUpdated: affectedRunbooks
  };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  applyCandidate,
  applyBatch,
  processObservation,
  processReflection,
  // Exposed for testing
  _applyToStore
};
