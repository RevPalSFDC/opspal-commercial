#!/usr/bin/env node

/**
 * Runbook Promotion Manager
 *
 * Promotes durable, validated knowledge upward through the scope hierarchy.
 * A promoted entry is copied to the parent scope's entry store, and the
 * source entry is marked as superseded with bidirectional links.
 *
 * Promotion rules:
 * - High recurrence (≥5x, confidence ≥0.7, active) → parent scope
 * - Sibling convergence (3+ sibling runbooks) → parent scope
 * - Preflight guard (remediation-recipe ≥3x) → org runbook
 *
 * @module runbook-promotion-manager
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadEntries, saveEntries, getEntry, updateEntry, addEntry, generateEntryId } = require('./runbook-entry-store');
const { loadRegistry, saveRegistry } = require('./runbook-registry');
const { transitionEntry } = require('./runbook-lifecycle-manager');
const { SCOPE_HIERARCHY } = require('./runbook-resolver');

// ── Constants ──────────────────────────────────────────────────────────────

const PROMOTION_THRESHOLDS = {
  highRecurrence: { minRecurrence: 5, minConfidence: 0.7 },
  siblingConvergence: { minSiblings: 3 },
  preflightGuard: { minRecurrence: 3 }
};

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getPromotionsPath(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'promotions.json');
}

// ── Promotions I/O ─────────────────────────────────────────────────────────

function loadPromotions(org, pluginRoot) {
  const filePath = _getPromotionsPath(org, pluginRoot);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data && Array.isArray(data.promotions)) return data;
    }
  } catch (err) {
    console.warn(`⚠️  Could not load promotions for ${org}: ${err.message}`);
  }
  return { org, promotions: [], updatedAt: new Date().toISOString() };
}

function savePromotions(org, store, pluginRoot) {
  const filePath = _getPromotionsPath(org, pluginRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// ── Promotion ID ───────────────────────────────────────────────────────────

function _generatePromotionId() {
  return `promo-${crypto.randomBytes(5).toString('hex')}`;
}

// ── Parent Scope Resolution ────────────────────────────────────────────────

/**
 * Find the parent runbook ID for a given runbook based on scope hierarchy.
 */
function _findParentRunbookId(runbookMeta, registry) {
  const hierarchy = SCOPE_HIERARCHY[runbookMeta.scopeType];
  if (!hierarchy || hierarchy.length <= 1) return null;

  // Walk up the hierarchy starting from the parent (index 1)
  for (let i = 1; i < hierarchy.length; i++) {
    const parentScopeType = hierarchy[i];
    const parentRunbook = registry.runbooks.find(r =>
      r.scopeType === parentScopeType && r.status !== 'archived'
    );
    if (parentRunbook) return parentRunbook.id;
  }
  return null;
}

/**
 * Find the org-level runbook ID.
 */
function _findOrgRunbookId(registry) {
  const orgRunbook = registry.runbooks.find(r =>
    r.scopeType === 'org' && r.status !== 'archived'
  );
  return orgRunbook ? orgRunbook.id : null;
}

// ── Evaluation ─────────────────────────────────────────────────────────────

/**
 * Evaluate whether a single entry qualifies for promotion.
 *
 * @param {Object} entry - RunbookEntry
 * @param {Object} runbookMeta - RunbookMetadata from registry
 * @param {Object} registry - Full registry
 * @returns {{ qualifies: boolean, promotionType: string, reason: string, targetRunbookId: string }|null}
 */
function evaluateForPromotion(entry, runbookMeta, registry) {
  if (entry.validationStatus !== 'active') return null;
  if (entry.supersededBy && entry.supersededBy.length > 0) return null;

  // Rule 1: High recurrence → parent scope
  if (entry.recurrenceCount >= PROMOTION_THRESHOLDS.highRecurrence.minRecurrence &&
      entry.confidence >= PROMOTION_THRESHOLDS.highRecurrence.minConfidence) {
    const targetId = _findParentRunbookId(runbookMeta, registry);
    if (targetId) {
      return {
        qualifies: true,
        promotionType: 'cross-scope',
        reason: `Repeated ${entry.recurrenceCount}x with confidence ${(entry.confidence * 100).toFixed(0)}%`,
        targetRunbookId: targetId
      };
    }
  }

  // Rule 3: Preflight guard for remediation recipes
  if (entry.category === 'remediation-recipe' &&
      entry.recurrenceCount >= PROMOTION_THRESHOLDS.preflightGuard.minRecurrence) {
    const orgId = _findOrgRunbookId(registry);
    if (orgId && orgId !== runbookMeta.id) {
      return {
        qualifies: true,
        promotionType: 'preflight-guard',
        reason: `Remediation recipe repeated ${entry.recurrenceCount}x, promoting to preflight check`,
        targetRunbookId: orgId
      };
    }
  }

  return null;
}

// ── Promotion Execution ────────────────────────────────────────────────────

/**
 * Promote an entry from one runbook to another.
 *
 * @param {string} org
 * @param {string} sourceRunbookId
 * @param {string} entryId
 * @param {string} targetRunbookId
 * @param {string} [pluginRoot]
 * @returns {{ promotionRecord: Object }}
 */
function promoteEntry(org, sourceRunbookId, entryId, targetRunbookId, pluginRoot) {
  const sourceStore = loadEntries(org, sourceRunbookId, pluginRoot);
  const sourceEntry = getEntry(sourceStore, entryId);
  if (!sourceEntry) throw new Error(`Entry ${entryId} not found in ${sourceRunbookId}`);

  const targetStore = loadEntries(org, targetRunbookId, pluginRoot);

  // Generate new ID for the promoted copy
  const promotedTitle = sourceEntry.title + ' (promoted)';
  const newEntryId = generateEntryId(sourceEntry.section, promotedTitle, sourceEntry.summary);

  // Check if already promoted (idempotency)
  if (getEntry(targetStore, newEntryId)) {
    return { promotionRecord: null, alreadyExists: true };
  }

  const now = new Date().toISOString();

  // Create promoted entry in target
  const promotedEntry = {
    ...sourceEntry,
    entryId: newEntryId,
    title: promotedTitle,
    supersedes: [entryId],
    supersededBy: [],
    conflictsWith: [],
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycleStatus: 'new'
  };

  addEntry(targetStore, promotedEntry);
  saveEntries(org, targetRunbookId, targetStore, pluginRoot);

  // Mark source as superseded
  transitionEntry(sourceStore, entryId, 'superseded', `Promoted to ${targetRunbookId}`);
  updateEntry(sourceStore, entryId, {
    supersededBy: [...(sourceEntry.supersededBy || []), newEntryId]
  });
  saveEntries(org, sourceRunbookId, sourceStore, pluginRoot);

  // Record promotion
  const promotionRecord = {
    promotionId: _generatePromotionId(),
    sourceEntryId: entryId,
    sourceRunbookId,
    targetRunbookId,
    targetEntryId: newEntryId,
    promotionType: 'cross-scope',
    reason: `Promoted from ${sourceRunbookId}`,
    confidence: sourceEntry.confidence,
    promotedAt: now,
    promotedBy: 'auto'
  };

  const promotions = loadPromotions(org, pluginRoot);
  promotions.promotions.push(promotionRecord);
  savePromotions(org, promotions, pluginRoot);

  return { promotionRecord };
}

// ── Batch Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate and promote all qualifying entries across all runbooks.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {{ promoted: number, evaluated: number }}
 */
function evaluateAndPromoteBatch(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  let promoted = 0;
  let evaluated = 0;

  // Phase 1: Single-entry rule evaluation
  const candidates = [];

  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;

    const store = loadEntries(org, runbook.id, pluginRoot);
    for (const entry of store.entries) {
      evaluated++;
      const result = evaluateForPromotion(entry, runbook, registry);
      if (result && result.qualifies) {
        candidates.push({
          entry,
          runbookId: runbook.id,
          ...result
        });
      }
    }
  }

  // Phase 2: Sibling convergence detection
  // Group entries by scopeType + section + category
  const siblingIndex = new Map();
  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;
    const store = loadEntries(org, runbook.id, pluginRoot);
    for (const entry of store.entries) {
      if (entry.validationStatus !== 'active') continue;
      if (entry.supersededBy && entry.supersededBy.length > 0) continue;
      const key = `${runbook.scopeType}|${entry.section}|${entry.category}`;
      if (!siblingIndex.has(key)) siblingIndex.set(key, []);
      siblingIndex.get(key).push({ entry, runbook });
    }
  }

  for (const [key, items] of siblingIndex) {
    const uniqueRunbooks = new Set(items.map(i => i.runbook.id));
    if (uniqueRunbooks.size >= PROMOTION_THRESHOLDS.siblingConvergence.minSiblings) {
      // Pick the highest-confidence entry as representative
      items.sort((a, b) => b.entry.confidence - a.entry.confidence);
      const best = items[0];
      const parentId = _findParentRunbookId(best.runbook, registry);
      if (parentId) {
        // Check if already in candidates
        const alreadyCandidate = candidates.some(
          c => c.entry.entryId === best.entry.entryId
        );
        if (!alreadyCandidate) {
          candidates.push({
            entry: best.entry,
            runbookId: best.runbook.id,
            qualifies: true,
            promotionType: 'standard-adoption',
            reason: `Appears in ${uniqueRunbooks.size} sibling ${best.runbook.scopeType} runbooks`,
            targetRunbookId: parentId
          });
        }
      }
    }
  }

  // Phase 3: Execute promotions
  for (const candidate of candidates) {
    try {
      const result = promoteEntry(
        org, candidate.runbookId, candidate.entry.entryId,
        candidate.targetRunbookId, pluginRoot
      );
      if (result.promotionRecord) {
        // Update the promotion type in the record
        const promotions = loadPromotions(org, pluginRoot);
        const last = promotions.promotions[promotions.promotions.length - 1];
        if (last && last.sourceEntryId === candidate.entry.entryId) {
          last.promotionType = candidate.promotionType;
          last.reason = candidate.reason;
          savePromotions(org, promotions, pluginRoot);
        }
        promoted++;
      }
    } catch (err) {
      console.warn(`⚠️  Could not promote ${candidate.entry.entryId}: ${err.message}`);
    }
  }

  return { promoted, evaluated };
}

/**
 * Get promotion history for an org.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {Object[]} PromotionRecord[]
 */
function getPromotionHistory(org, pluginRoot) {
  const store = loadPromotions(org, pluginRoot);
  return store.promotions;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  loadPromotions,
  savePromotions,
  evaluateForPromotion,
  promoteEntry,
  evaluateAndPromoteBatch,
  getPromotionHistory,
  PROMOTION_THRESHOLDS
};
