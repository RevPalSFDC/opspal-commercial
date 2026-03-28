#!/usr/bin/env node

/**
 * Runbook Conflict Manager
 *
 * Detects and tracks contradictory guidance across runbook entries.
 * Conflicts are detected during reconciliation scans, not on every write.
 *
 * Conflict types:
 * - contradictory-guidance: similar entries with divergent details
 * - stale-override: large confidence gap between similar entries
 * - diverging-workaround: same category but different workflow targets
 * - scope-mismatch: same section content at different scope levels
 *
 * @module runbook-conflict-manager
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadEntries, saveEntries, updateEntry } = require('./runbook-entry-store');
const { loadRegistry } = require('./runbook-registry');
const { tokenSimilarity, compositeSimilarity, normalizeForComparison } = require('./string-similarity');

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getConflictsPath(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'conflicts.json');
}

// ── Conflicts I/O ──────────────────────────────────────────────────────────

function loadConflicts(org, pluginRoot) {
  const filePath = _getConflictsPath(org, pluginRoot);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data && Array.isArray(data.conflicts)) return data;
    }
  } catch (err) {
    console.warn(`⚠️  Could not load conflicts for ${org}: ${err.message}`);
  }
  return { org, conflicts: [], updatedAt: new Date().toISOString() };
}

function saveConflicts(org, store, pluginRoot) {
  const filePath = _getConflictsPath(org, pluginRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function _generateConflictId() {
  return `conflict-${crypto.randomBytes(5).toString('hex')}`;
}

// ── Similarity helpers ─────────────────────────────────────────────────────

/**
 * Compute blended similarity between two summaries.
 * Same approach as findSimilar in entry-store.
 */
function _blendedSimilarity(text1, text2) {
  const a = normalizeForComparison(text1 || '');
  const b = normalizeForComparison(text2 || '');
  const token = tokenSimilarity(a, b);
  const composite = (compositeSimilarity(a, b) || {}).composite || 0;
  return Math.max(token, composite);
}

// ── Conflict Type Detection ────────────────────────────────────────────────

/**
 * Determine the conflict type between two similar entries.
 */
function _classifyConflict(entryA, runbookA, entryB, runbookB) {
  // Stale override: large confidence gap
  if (Math.abs(entryA.confidence - entryB.confidence) > 0.3) {
    return {
      conflictType: 'stale-override',
      severity: 'medium',
      reason: `Confidence gap: ${(entryA.confidence * 100).toFixed(0)}% vs ${(entryB.confidence * 100).toFixed(0)}%`
    };
  }

  // Scope mismatch: same section, different scope type
  if (runbookA.scopeType !== runbookB.scopeType) {
    return {
      conflictType: 'scope-mismatch',
      severity: 'low',
      reason: `Same guidance at ${runbookA.scopeType} and ${runbookB.scopeType} scope levels`
    };
  }

  // Diverging workaround: same category, different workflow
  if (entryA.category === entryB.category &&
      entryA.relatedWorkflow && entryB.relatedWorkflow &&
      entryA.relatedWorkflow !== entryB.relatedWorkflow) {
    return {
      conflictType: 'diverging-workaround',
      severity: 'medium',
      reason: `Same ${entryA.category} for different workflows: ${entryA.relatedWorkflow} vs ${entryB.relatedWorkflow}`
    };
  }

  // Contradictory guidance: similar summaries but divergent evidence
  const evidenceSim = _blendedSimilarity(
    (entryA.evidence || []).map(e => e.text).join(' '),
    (entryB.evidence || []).map(e => e.text).join(' ')
  );
  if (evidenceSim < 0.3) {
    return {
      conflictType: 'contradictory-guidance',
      severity: 'high',
      reason: 'Similar topic but divergent evidence and guidance'
    };
  }

  // Default: low-severity scope mismatch
  return {
    conflictType: 'scope-mismatch',
    severity: 'low',
    reason: 'Similar entries across different runbooks'
  };
}

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * Detect conflicts across all entry stores.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {{ detected: number, total: number }}
 */
function detectConflicts(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const conflictsStore = loadConflicts(org, pluginRoot);

  // Build existing conflict pair index for dedup
  const existingPairs = new Set();
  for (const c of conflictsStore.conflicts) {
    existingPairs.add(`${c.entryIdA}|${c.entryIdB}`);
    existingPairs.add(`${c.entryIdB}|${c.entryIdA}`);
  }

  // Load all active/proposed entries with runbook metadata
  const allEntries = [];
  const storeCache = new Map();

  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;
    const store = loadEntries(org, runbook.id, pluginRoot);
    storeCache.set(runbook.id, store);

    for (const entry of store.entries) {
      if (!['active', 'proposed'].includes(entry.validationStatus)) continue;
      allEntries.push({ entry, runbook });
    }
  }

  // Group by section|category for efficient comparison
  const groups = new Map();
  for (const item of allEntries) {
    const key = `${item.entry.section}|${item.entry.category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let detected = 0;
  const modifiedStores = new Set();

  for (const [, items] of groups) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        // Skip same entry in same runbook
        if (a.runbook.id === b.runbook.id && a.entry.entryId === b.entry.entryId) continue;

        // Skip already detected
        const pairKey = `${a.entry.entryId}|${b.entry.entryId}`;
        if (existingPairs.has(pairKey)) continue;

        // Check summary similarity
        const sim = _blendedSimilarity(a.entry.summary, b.entry.summary);
        if (sim < 0.55) continue;

        // Classify the conflict
        const classification = _classifyConflict(a.entry, a.runbook, b.entry, b.runbook);

        const conflictRecord = {
          conflictId: _generateConflictId(),
          entryIdA: a.entry.entryId,
          runbookIdA: a.runbook.id,
          entryIdB: b.entry.entryId,
          runbookIdB: b.runbook.id,
          ...classification,
          status: 'detected',
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
          resolution: null
        };

        conflictsStore.conflicts.push(conflictRecord);
        existingPairs.add(pairKey);
        existingPairs.add(`${b.entry.entryId}|${a.entry.entryId}`);

        // Mark entries with conflictsWith
        const storeA = storeCache.get(a.runbook.id);
        const storeB = storeCache.get(b.runbook.id);

        const entryA = storeA.entries.find(e => e.entryId === a.entry.entryId);
        const entryB = storeB.entries.find(e => e.entryId === b.entry.entryId);

        if (entryA && !entryA.conflictsWith.includes(b.entry.entryId)) {
          entryA.conflictsWith.push(b.entry.entryId);
          modifiedStores.add(a.runbook.id);
        }
        if (entryB && !entryB.conflictsWith.includes(a.entry.entryId)) {
          entryB.conflictsWith.push(a.entry.entryId);
          modifiedStores.add(b.runbook.id);
        }

        detected++;
      }
    }
  }

  // Save modified stores
  for (const runbookId of modifiedStores) {
    const store = storeCache.get(runbookId);
    if (store) saveEntries(org, runbookId, store, pluginRoot);
  }

  saveConflicts(org, conflictsStore, pluginRoot);

  return { detected, total: conflictsStore.conflicts.length };
}

// ── Resolution ─────────────────────────────────────────────────────────────

/**
 * Resolve a conflict.
 *
 * @param {string} org
 * @param {string} conflictId
 * @param {string} resolution - 'keep-a'|'keep-b'|'merge'|'dismiss'
 * @param {string} [pluginRoot]
 * @returns {boolean}
 */
function resolveConflict(org, conflictId, resolution, pluginRoot) {
  const conflictsStore = loadConflicts(org, pluginRoot);
  const conflict = conflictsStore.conflicts.find(c => c.conflictId === conflictId);
  if (!conflict) return false;

  const now = new Date().toISOString();

  if (resolution === 'keep-a' || resolution === 'keep-b') {
    // Deprecate the losing entry
    const deprecateRunbookId = resolution === 'keep-a' ? conflict.runbookIdB : conflict.runbookIdA;
    const deprecateEntryId = resolution === 'keep-a' ? conflict.entryIdB : conflict.entryIdA;
    const keepEntryId = resolution === 'keep-a' ? conflict.entryIdA : conflict.entryIdB;

    const store = loadEntries(org, deprecateRunbookId, pluginRoot);
    const { transitionEntry } = require('./runbook-lifecycle-manager');
    transitionEntry(store, deprecateEntryId, 'deprecated', `Conflict ${conflictId} resolved: ${resolution}`);

    // Clear conflictsWith on both entries
    for (const entry of store.entries) {
      if (entry.entryId === deprecateEntryId) {
        entry.conflictsWith = entry.conflictsWith.filter(id => id !== keepEntryId);
      }
    }
    saveEntries(org, deprecateRunbookId, store, pluginRoot);

    // Clear conflictsWith on the kept entry
    const keepRunbookId = resolution === 'keep-a' ? conflict.runbookIdA : conflict.runbookIdB;
    if (keepRunbookId !== deprecateRunbookId) {
      const keepStore = loadEntries(org, keepRunbookId, pluginRoot);
      for (const entry of keepStore.entries) {
        if (entry.entryId === keepEntryId) {
          entry.conflictsWith = entry.conflictsWith.filter(id => id !== deprecateEntryId);
        }
      }
      saveEntries(org, keepRunbookId, keepStore, pluginRoot);
    }
  } else if (resolution === 'dismiss' || resolution === 'merge') {
    // Clear conflictsWith on both entries
    for (const [runbookId, entryId, otherId] of [
      [conflict.runbookIdA, conflict.entryIdA, conflict.entryIdB],
      [conflict.runbookIdB, conflict.entryIdB, conflict.entryIdA]
    ]) {
      const store = loadEntries(org, runbookId, pluginRoot);
      for (const entry of store.entries) {
        if (entry.entryId === entryId) {
          entry.conflictsWith = entry.conflictsWith.filter(id => id !== otherId);
        }
      }
      saveEntries(org, runbookId, store, pluginRoot);
    }
  }

  conflict.status = 'resolved';
  conflict.resolvedAt = now;
  conflict.resolution = resolution;
  saveConflicts(org, conflictsStore, pluginRoot);

  return true;
}

/**
 * Get unresolved conflicts.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {Object[]} ConflictRecord[]
 */
function getUnresolvedConflicts(org, pluginRoot) {
  const store = loadConflicts(org, pluginRoot);
  return store.conflicts.filter(c => c.status === 'detected' || c.status === 'reviewing');
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  loadConflicts,
  saveConflicts,
  detectConflicts,
  resolveConflict,
  getUnresolvedConflicts
};
