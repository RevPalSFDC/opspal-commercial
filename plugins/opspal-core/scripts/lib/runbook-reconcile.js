#!/usr/bin/env node

/**
 * Runbook Reconciliation Engine
 *
 * Master orchestrator for maintaining runbook health. Combines compaction,
 * backfill, lifecycle management, conflict detection, promotion, and
 * projection rendering into an idempotent reconciliation pipeline.
 *
 * Usage (CLI):
 *   node scripts/lib/runbook-reconcile.js --org acme-prod --compact --backfill \
 *     --mark-stale --detect-conflicts --promote --rebuild-projections
 *
 * Usage (programmatic):
 *   const { reconcile } = require('./runbook-reconcile');
 *   const result = reconcile('acme-prod', { compact: true, rebuildProjections: true });
 *
 * @module runbook-reconcile
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { loadRegistry } = require('./runbook-registry');
const { loadEntries, saveEntries, findSimilar, updateEntry, removeEntry } = require('./runbook-entry-store');
const { markStale, deprecateStale } = require('./runbook-lifecycle-manager');
const { evaluateAndPromoteBatch } = require('./runbook-promotion-manager');
const { detectConflicts } = require('./runbook-conflict-manager');
const { renderAllProjections, renderOrgProjection } = require('./runbook-render-projection');

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

// ── Step 1: Compact ────────────────────────────────────────────────────────

/**
 * Compact entry stores by merging near-duplicate entries within each store.
 * Uses a stricter threshold (0.8) than normal merge (0.55).
 */
function _compact(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  let entriesRemoved = 0;
  let entriesMerged = 0;

  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;

    const store = loadEntries(org, runbook.id, pluginRoot);
    if (store.entries.length < 2) continue;

    const toRemove = new Set();

    for (let i = 0; i < store.entries.length; i++) {
      if (toRemove.has(i)) continue;

      for (let j = i + 1; j < store.entries.length; j++) {
        if (toRemove.has(j)) continue;

        const similar = findSimilar(
          { entries: [store.entries[j]] },
          store.entries[i].summary,
          0.8
        );

        if (similar.length > 0) {
          // Merge j into i (keep i as the survivor)
          const survivor = store.entries[i];
          const duplicate = store.entries[j];

          survivor.recurrenceCount = (survivor.recurrenceCount || 1) + (duplicate.recurrenceCount || 1);
          survivor.confidence = Math.max(survivor.confidence, duplicate.confidence);

          // Union evidence
          const evidenceKeys = new Set(
            survivor.evidence.map(e => `${e.source}|${e.timestamp}`)
          );
          for (const ev of (duplicate.evidence || [])) {
            if (!evidenceKeys.has(`${ev.source}|${ev.timestamp}`)) {
              survivor.evidence.push(ev);
            }
          }

          // Union sourceAgents and relatedObjects
          const agentSet = new Set(survivor.sourceAgents.map(a => a.toLowerCase()));
          for (const a of (duplicate.sourceAgents || [])) {
            if (!agentSet.has(a.toLowerCase())) {
              survivor.sourceAgents.push(a);
              agentSet.add(a.toLowerCase());
            }
          }

          const objSet = new Set(survivor.relatedObjects.map(o => o.toLowerCase()));
          for (const o of (duplicate.relatedObjects || [])) {
            if (!objSet.has(o.toLowerCase())) {
              survivor.relatedObjects.push(o);
              objSet.add(o.toLowerCase());
            }
          }

          // Use the earliest firstSeenAt and latest lastSeenAt
          if (duplicate.firstSeenAt < survivor.firstSeenAt) {
            survivor.firstSeenAt = duplicate.firstSeenAt;
          }
          if (duplicate.lastSeenAt > survivor.lastSeenAt) {
            survivor.lastSeenAt = duplicate.lastSeenAt;
          }

          toRemove.add(j);
          entriesMerged++;
        }
      }
    }

    if (toRemove.size > 0) {
      store.entries = store.entries.filter((_, idx) => !toRemove.has(idx));
      entriesRemoved += toRemove.size;
      saveEntries(org, runbook.id, store, pluginRoot);
    }
  }

  return { entriesRemoved, entriesMerged };
}

// ── Step 2: Backfill ───────────────────────────────────────────────────────

/**
 * Process unrepresented observations that haven't been captured in entry stores.
 */
function _backfill(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  const obsDir = path.join(base, 'instances', org, 'observations');

  if (!fs.existsSync(obsDir)) {
    return { observationsProcessed: 0, candidatesCreated: 0, entriesAdded: 0 };
  }

  const files = fs.readdirSync(obsDir).filter(f => f.endsWith('.json'));
  let observationsProcessed = 0;
  let entriesAdded = 0;

  // Lazy require to avoid circular deps at module load time
  const { processObservation } = require('./runbook-incremental-updater');

  for (const file of files) {
    try {
      const obs = JSON.parse(fs.readFileSync(path.join(obsDir, file), 'utf-8'));
      obs._filePath = path.join('observations', file);
      const result = processObservation(org, obs, pluginRoot);
      observationsProcessed++;
      entriesAdded += result.applied;
    } catch (err) {
      // Skip corrupt files
    }
  }

  return { observationsProcessed, candidatesCreated: observationsProcessed, entriesAdded };
}

// ── Master Reconcile ───────────────────────────────────────────────────────

/**
 * Run the full reconciliation pipeline.
 *
 * @param {string} org
 * @param {Object} [options]
 * @param {boolean} [options.compact]
 * @param {boolean} [options.backfill]
 * @param {boolean} [options.markStale]
 * @param {boolean} [options.detectConflicts]
 * @param {boolean} [options.promoteEntries]
 * @param {boolean} [options.rebuildProjections]
 * @param {string} [pluginRoot]
 * @returns {Object} Combined result
 */
function reconcile(org, options = {}, pluginRoot) {
  const result = {
    compacted: { entriesRemoved: 0, entriesMerged: 0 },
    backfilled: { observationsProcessed: 0, candidatesCreated: 0, entriesAdded: 0 },
    lifecycle: { markedStale: 0, deprecated: 0 },
    conflicts: { detected: 0, total: 0 },
    promotions: { promoted: 0, evaluated: 0 },
    projections: { rendered: 0, failed: 0 }
  };

  // Step 1: Compact
  if (options.compact) {
    result.compacted = _compact(org, pluginRoot);
  }

  // Step 2: Backfill
  if (options.backfill) {
    result.backfilled = _backfill(org, pluginRoot);
  }

  // Step 3: Lifecycle
  if (options.markStale) {
    const staleResult = markStale(org, pluginRoot);
    const deprecateResult = deprecateStale(org, pluginRoot);
    result.lifecycle = {
      markedStale: staleResult.markedStale,
      deprecated: deprecateResult.deprecated
    };
  }

  // Step 4: Conflicts
  if (options.detectConflicts) {
    result.conflicts = detectConflicts(org, pluginRoot);
  }

  // Step 5: Promotions
  if (options.promoteEntries) {
    result.promotions = evaluateAndPromoteBatch(org, pluginRoot);
  }

  // Step 6: Projections
  if (options.rebuildProjections) {
    const projResults = renderAllProjections(org, pluginRoot);
    result.projections.rendered = projResults.filter(r => r.success).length;
    result.projections.failed = projResults.filter(r => !r.success).length;

    try {
      renderOrgProjection(org, pluginRoot);
      result.projections.rendered++;
    } catch (err) {
      result.projections.failed++;
    }
  }

  return result;
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let org = null;
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--org': org = args[++i]; break;
      case '--compact': options.compact = true; break;
      case '--backfill': options.backfill = true; break;
      case '--mark-stale': options.markStale = true; break;
      case '--detect-conflicts': options.detectConflicts = true; break;
      case '--promote': options.promoteEntries = true; break;
      case '--rebuild-projections': options.rebuildProjections = true; break;
      case '--all':
        options.compact = true;
        options.backfill = true;
        options.markStale = true;
        options.detectConflicts = true;
        options.promoteEntries = true;
        options.rebuildProjections = true;
        break;
      case '--help':
        console.log('Usage: runbook-reconcile.js --org <alias> [--compact] [--backfill] [--mark-stale] [--detect-conflicts] [--promote] [--rebuild-projections] [--all]');
        process.exit(0);
    }
  }

  if (!org) {
    console.error('❌ --org is required');
    process.exit(1);
  }

  const result = reconcile(org, options);
  console.log(JSON.stringify(result, null, 2));
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  reconcile,
  // Exposed for testing
  _compact,
  _backfill
};
