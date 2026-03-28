#!/usr/bin/env node

/**
 * Runbook Status Reporter
 *
 * Aggregated reporting across all runbook stores, promotions, and conflicts.
 * Pure reporting module — no writes.
 *
 * Usage (CLI):
 *   node scripts/lib/runbook-status-reporter.js --org acme-prod
 *
 * @module runbook-status-reporter
 */

'use strict';

const { loadRegistry } = require('./runbook-registry');
const { loadEntries } = require('./runbook-entry-store');
const { loadPromotions } = require('./runbook-promotion-manager');
const { loadConflicts, getUnresolvedConflicts } = require('./runbook-conflict-manager');
const { getAutomationStatus } = require('./runbook-automation-status');

/**
 * Get comprehensive runbook status for an org.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {Object} Status report
 */
function getRunbookStatus(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  const nonArchived = registry.runbooks.filter(r => r.status !== 'archived');

  // Aggregate entries across all stores
  let totalEntries = 0;
  const byStatus = {};
  const staleEntries = [];
  const lowConfidenceActive = [];
  const runbookStats = [];

  for (const runbook of nonArchived) {
    const store = loadEntries(org, runbook.id, pluginRoot);
    const entryCount = store.entries.length;
    totalEntries += entryCount;

    runbookStats.push({
      runbookId: runbook.id,
      title: runbook.title,
      scopeType: runbook.scopeType,
      entryCount,
      lastUpdated: store.updatedAt
    });

    for (const entry of store.entries) {
      byStatus[entry.validationStatus] = (byStatus[entry.validationStatus] || 0) + 1;

      if (entry.validationStatus === 'stale') {
        staleEntries.push({
          entryId: entry.entryId,
          title: entry.title,
          lastSeenAt: entry.lastSeenAt,
          runbookId: runbook.id
        });
      }

      if (entry.validationStatus === 'active' && entry.confidence < 0.5) {
        lowConfidenceActive.push({
          entryId: entry.entryId,
          title: entry.title,
          confidence: entry.confidence,
          runbookId: runbook.id
        });
      }
    }
  }

  // Sort runbook stats by entry count descending
  runbookStats.sort((a, b) => b.entryCount - a.entryCount);

  // Recently updated (top 5 by updatedAt)
  const recentlyUpdated = [...runbookStats]
    .sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''))
    .slice(0, 5);

  // Promotions
  const promotionsStore = loadPromotions(org, pluginRoot);
  const recentPromotions = [...promotionsStore.promotions]
    .sort((a, b) => (b.promotedAt || '').localeCompare(a.promotedAt || ''))
    .slice(0, 10);

  // Conflicts
  const unresolvedConflicts = getUnresolvedConflicts(org, pluginRoot);

  // Automation status
  const autoStatus = getAutomationStatus(org, pluginRoot);
  const automation = {
    lastObservationProcessed: autoStatus.lastObservationProcessed?.timestamp || null,
    lastReflectionProcessed: autoStatus.lastReflectionProcessed?.timestamp || null,
    lastReconciliation: autoStatus.lastReconciliation?.timestamp || null,
    totalObservationsProcessed: autoStatus.totalObservationsProcessed || 0,
    totalReflectionsProcessed: autoStatus.totalReflectionsProcessed || 0,
    totalReconciliations: autoStatus.totalReconciliations || 0,
    recentErrors: (autoStatus.errors || []).slice(-5)
  };

  return {
    org,
    registeredRunbooks: registry.runbooks.length,
    activeRunbooks: nonArchived.length,
    totalEntries,
    byStatus,
    recentlyUpdated,
    recentPromotions,
    unresolvedConflicts,
    staleEntries,
    lowConfidenceActive,
    topRunbooks: runbookStats.slice(0, 5),
    automation
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let org = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org') org = args[++i];
    if (args[i] === '--help') {
      console.log('Usage: runbook-status-reporter.js --org <alias>');
      process.exit(0);
    }
  }

  if (!org) {
    console.error('❌ --org is required');
    process.exit(1);
  }

  const status = getRunbookStatus(org);
  console.log(JSON.stringify(status, null, 2));
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { getRunbookStatus };
