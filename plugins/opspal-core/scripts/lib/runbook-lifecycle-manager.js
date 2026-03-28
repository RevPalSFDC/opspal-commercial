#!/usr/bin/env node

/**
 * Runbook Lifecycle Manager
 *
 * State machine enforcement, staleness scanning, deprecation, and archival
 * for runbook entries. Wraps the entry store without modifying it.
 *
 * Lifecycle states (validationStatus):
 *   proposed → active, deprecated
 *   active   → stale, superseded, deprecated
 *   stale    → active, deprecated
 *   deprecated → proposed  (re-entry only)
 *   superseded → (terminal)
 *
 * @module runbook-lifecycle-manager
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadEntries, saveEntries, getEntry, updateEntry, addEntry
} = require('./runbook-entry-store');
const { loadRegistry } = require('./runbook-registry');

// ── Constants ──────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ALLOWED_TRANSITIONS = {
  'proposed':   ['active', 'deprecated'],
  'active':     ['stale', 'superseded', 'deprecated'],
  'stale':      ['active', 'deprecated'],
  'deprecated': ['proposed'],
  'superseded': []
};

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getArchiveStorePath(org, runbookId, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'entries', 'archive', `${runbookId}.json`);
}

// ── State Machine ──────────────────────────────────────────────────────────

/**
 * Transition an entry's validationStatus with guard enforcement.
 *
 * @param {Object} entryStore - In-memory entry store
 * @param {string} entryId
 * @param {string} targetStatus
 * @param {string} [reason]
 * @returns {boolean} True if transition succeeded
 */
function transitionEntry(entryStore, entryId, targetStatus, reason) {
  const entry = getEntry(entryStore, entryId);
  if (!entry) return false;

  const currentStatus = entry.validationStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return false;
  }

  return updateEntry(entryStore, entryId, {
    validationStatus: targetStatus
  });
}

/**
 * Derive the validation state from entry fields. Pure function, no I/O.
 *
 * @param {Object} entry
 * @returns {string} 'inferred'|'observed'|'repeated'|'user-confirmed'|'outcome-validated'
 */
function refreshValidationState(entry) {
  if (entry.validationState === 'outcome-validated') return 'outcome-validated';
  if (entry.validationState === 'user-confirmed') return 'user-confirmed';
  if ((entry.recurrenceCount || 0) >= 2 && (entry.evidence || []).length >= 2) return 'repeated';
  if ((entry.recurrenceCount || 0) >= 1 && (entry.evidence || []).length >= 1) return 'observed';
  return 'inferred';
}

// ── Staleness Scanning ─────────────────────────────────────────────────────

/**
 * Mark active entries as stale if not seen within maxAgeDays.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @param {{ maxAgeDays?: number }} [options]
 * @returns {{ markedStale: number }}
 */
function markStale(org, pluginRoot, options = {}) {
  const { maxAgeDays = 90 } = options;
  const now = Date.now();
  const registry = loadRegistry(org, pluginRoot);
  let totalMarked = 0;

  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;

    const store = loadEntries(org, runbook.id, pluginRoot);
    let modified = false;

    for (const entry of store.entries) {
      if (entry.validationStatus !== 'active') continue;
      const lastSeen = new Date(entry.lastSeenAt).getTime();
      if (isNaN(lastSeen)) continue;
      const ageDays = (now - lastSeen) / MS_PER_DAY;

      if (ageDays > maxAgeDays) {
        const ok = transitionEntry(store, entry.entryId, 'stale', `Not seen in ${Math.floor(ageDays)} days`);
        if (ok) {
          totalMarked++;
          modified = true;
        }
      }
    }

    if (modified) {
      saveEntries(org, runbook.id, store, pluginRoot);
    }
  }

  return { markedStale: totalMarked };
}

/**
 * Deprecate stale entries past the deprecation threshold.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @param {{ maxStaleDays?: number }} [options]
 * @returns {{ deprecated: number }}
 */
function deprecateStale(org, pluginRoot, options = {}) {
  const { maxStaleDays = 30 } = options;
  const now = Date.now();
  const registry = loadRegistry(org, pluginRoot);
  let totalDeprecated = 0;

  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;

    const store = loadEntries(org, runbook.id, pluginRoot);
    let modified = false;

    for (const entry of store.entries) {
      if (entry.validationStatus !== 'stale') continue;
      const lastSeen = new Date(entry.lastSeenAt).getTime();
      if (isNaN(lastSeen)) continue;
      const staleDays = (now - lastSeen) / MS_PER_DAY;

      if (staleDays > maxStaleDays) {
        const ok = transitionEntry(store, entry.entryId, 'deprecated', `Stale for ${Math.floor(staleDays)} days`);
        if (ok) {
          totalDeprecated++;
          modified = true;
        }
      }
    }

    if (modified) {
      saveEntries(org, runbook.id, store, pluginRoot);
    }
  }

  return { deprecated: totalDeprecated };
}

// ── Archival ───────────────────────────────────────────────────────────────

/**
 * Move deprecated entries to archive stores.
 *
 * @param {string} org
 * @param {string} [pluginRoot]
 * @returns {{ archived: number }}
 */
function archiveDeprecated(org, pluginRoot) {
  const registry = loadRegistry(org, pluginRoot);
  let totalArchived = 0;

  for (const runbook of registry.runbooks) {
    if (runbook.status === 'archived') continue;

    const store = loadEntries(org, runbook.id, pluginRoot);
    const toArchive = store.entries.filter(e => e.validationStatus === 'deprecated');
    if (toArchive.length === 0) continue;

    // Load or create archive store
    const archivePath = _getArchiveStorePath(org, runbook.id, pluginRoot);
    let archiveStore;
    try {
      if (fs.existsSync(archivePath)) {
        archiveStore = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
      }
    } catch (err) {
      // ignore
    }
    if (!archiveStore || !Array.isArray(archiveStore.entries)) {
      archiveStore = { runbookId: runbook.id, version: '1.0.0', entries: [], updatedAt: '' };
    }

    const now = new Date().toISOString();
    for (const entry of toArchive) {
      // Skip if already in archive
      if (archiveStore.entries.some(a => a.entryId === entry.entryId)) continue;
      archiveStore.entries.push({ ...entry, archivedAt: now });
      totalArchived++;
    }

    // Save archive
    const archiveDir = path.dirname(archivePath);
    fs.mkdirSync(archiveDir, { recursive: true });
    archiveStore.updatedAt = now;
    const tmp = archivePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(archiveStore, null, 2), 'utf-8');
    fs.renameSync(tmp, archivePath);

    // Remove from live store
    store.entries = store.entries.filter(e => e.validationStatus !== 'deprecated');
    saveEntries(org, runbook.id, store, pluginRoot);
  }

  return { archived: totalArchived };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  transitionEntry,
  refreshValidationState,
  markStale,
  deprecateStale,
  archiveDeprecated,
  ALLOWED_TRANSITIONS
};
