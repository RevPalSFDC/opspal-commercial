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

// ── Reflection Adapter ─────────────────────────────────────────────────────

/**
 * Adapt a raw SESSION_REFLECTION JSON to the bridge output format
 * expected by processReflection / extractCandidatesFromReflection.
 */
function _adaptReflectionToBridgeFormat(rawReflection) {
  const org = rawReflection.session_metadata?.org
    || rawReflection.org
    || rawReflection.org_alias
    || 'unknown';

  const issues = Array.isArray(rawReflection.issues)
    ? rawReflection.issues
    : Array.isArray(rawReflection.issues_identified)
      ? rawReflection.issues_identified
      : [];

  const userFeedback = Array.isArray(rawReflection.user_feedback)
    ? rawReflection.user_feedback
    : [];

  // Build known_exceptions from issues with frequency >= 2
  const taxonomyCounts = {};
  for (const issue of issues) {
    const tax = issue.taxonomy || 'unknown';
    taxonomyCounts[tax] = (taxonomyCounts[tax] || 0) + 1;
  }

  const known_exceptions = [];
  const common_errors = [];

  for (const [taxonomy, count] of Object.entries(taxonomyCounts)) {
    const examples = issues
      .filter(i => (i.taxonomy || 'unknown') === taxonomy)
      .map(i => ({ id: i.id, description: i.root_cause || i.description || '', priority: i.priority || 'P3' }));

    common_errors.push({ taxonomy, count, examples });

    if (count >= 2) {
      const firstExample = examples[0];
      known_exceptions.push({
        name: taxonomy.replace(/[/-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        context: firstExample?.description || '',
        frequency: count,
        recommendation: issues.find(i => (i.taxonomy || 'unknown') === taxonomy)?.agnostic_fix || ''
      });
    }
  }

  // Build manual workarounds from playbook
  const manual_workarounds = [];
  if (rawReflection.playbook && rawReflection.playbook.steps) {
    manual_workarounds.push({
      playbook: rawReflection.playbook.name || 'session-workaround',
      steps: rawReflection.playbook.steps,
      trigger: rawReflection.playbook.trigger || ''
    });
  }

  // Build user interventions from feedback
  const user_interventions = userFeedback
    .filter(f => f.classification === 'suggestion' || f.classification === 'dissatisfaction')
    .map(f => ({
      comment: f.raw_comment || '',
      classification: f.classification,
      proposed_action: f.proposed_action || '',
      linked_issue: f.linked_issue_id || null
    }));

  // Build recommendations from agnostic_fix fields
  const recommendations = issues
    .filter(i => i.agnostic_fix && i.agnostic_fix.length > 10)
    .map(i => i.agnostic_fix)
    .slice(0, 5);

  return {
    org,
    reflections_analyzed: 1,
    timeframe: {
      start: rawReflection.session_metadata?.session_start || null,
      end: rawReflection.session_metadata?.session_end || null
    },
    patterns: { common_errors, manual_workarounds, user_interventions },
    known_exceptions,
    recommendations
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  let org = null;
  let obsFile = null;
  let reflectionFile = null;
  let pluginRoot = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org': org = args[++i]; break;
      case '--obs-file': obsFile = args[++i]; break;
      case '--reflection-file': reflectionFile = args[++i]; break;
      case '--plugin-root': pluginRoot = args[++i]; break;
      case '--help':
        console.log('Usage:');
        console.log('  runbook-incremental-updater.js --org <alias> --obs-file <path> [--plugin-root <path>]');
        console.log('  runbook-incremental-updater.js --org <alias> --reflection-file <path> [--plugin-root <path>]');
        process.exit(0);
    }
  }

  if (!org) {
    console.error('❌ --org is required');
    process.exit(1);
  }

  try {
    let result;
    let source;

    if (obsFile) {
      if (!fs.existsSync(obsFile)) {
        console.error(`❌ Observation file not found: ${obsFile}`);
        process.exit(0); // Graceful exit — don't break hooks
      }
      const obs = JSON.parse(fs.readFileSync(obsFile, 'utf-8'));
      result = processObservation(org, obs, pluginRoot);
      source = 'observation';
    } else if (reflectionFile) {
      if (!fs.existsSync(reflectionFile)) {
        console.error(`❌ Reflection file not found: ${reflectionFile}`);
        process.exit(0);
      }
      const raw = JSON.parse(fs.readFileSync(reflectionFile, 'utf-8'));
      const adapted = _adaptReflectionToBridgeFormat(raw);
      result = processReflection(org, adapted, pluginRoot);
      source = 'reflection';
    } else {
      console.error('❌ Either --obs-file or --reflection-file is required');
      process.exit(1);
    }

    // Record automation status
    try {
      const { recordObservationProcessed, recordReflectionProcessed } = require('./runbook-automation-status');
      if (source === 'observation') {
        recordObservationProcessed(org, obsFile, result, pluginRoot);
      } else {
        recordReflectionProcessed(org, reflectionFile, result, pluginRoot);
      }
    } catch (err) {
      // Status tracking module may not exist yet — non-fatal
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    // Record error if status module available
    try {
      const { recordError } = require('./runbook-automation-status');
      recordError(org, obsFile ? 'observation' : 'reflection', err.message, pluginRoot);
    } catch (_) { /* ignore */ }

    console.error(`⚠️  Runbook auto-update failed: ${err.message}`);
    process.exit(0); // Graceful — don't break hooks
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  applyCandidate,
  applyBatch,
  processObservation,
  processReflection,
  // Exposed for testing
  _applyToStore,
  _adaptReflectionToBridgeFormat
};
