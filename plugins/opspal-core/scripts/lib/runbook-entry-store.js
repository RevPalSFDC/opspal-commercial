#!/usr/bin/env node

/**
 * Runbook Entry Store
 *
 * Structured entry storage per scoped runbook. Each runbook's entries are
 * stored as a JSON file at instances/{org}/runbooks/entries/{runbookId}.json.
 *
 * Entries are the source of truth for scoped runbook knowledge. Markdown
 * projections are rendered from these entries by runbook-render-projection.js.
 *
 * Usage (programmatic):
 *   const { loadEntries, addEntry, findSimilar, SECTION_MAP } = require('./runbook-entry-store');
 *   const store = loadEntries('acme-prod', 'workflow-lead-routing');
 *   const similar = findSimilar(store, 'queue missing in sandbox');
 *
 * Storage: instances/{org}/runbooks/entries/{runbookId}.json
 *
 * @module runbook-entry-store
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { tokenSimilarity, compositeSimilarity, normalizeForComparison } = require('./string-similarity');

// ── Constants ──────────────────────────────────────────────────────────────

const ENTRY_STORE_VERSION = '1.0.0';

/**
 * Deterministic mapping from candidate category to runbook section.
 */
const SECTION_MAP = {
  'known-exception':         'Known Exceptions',
  'environment-quirk':       'Environment & Configuration',
  'workflow-nuance':         'Workflow Nuances',
  'business-rule':           'Business Rules',
  'troubleshooting-pattern': 'Troubleshooting Patterns',
  'remediation-recipe':      'Recommended Procedures',
  'checklist-lesson':        'Preflight Checks',
  'integration-note':        'Dependencies & Integrations'
};

/**
 * Canonical section rendering order.
 */
const SECTION_ORDER = [
  'Known Exceptions',
  'Business Rules',
  'Workflow Nuances',
  'Environment & Configuration',
  'Dependencies & Integrations',
  'Troubleshooting Patterns',
  'Recommended Procedures',
  'Preflight Checks',
  'Agent-Specific Notes'
];

const VALID_VALIDATION_STATUSES = ['proposed', 'active', 'deprecated', 'superseded'];
const VALID_LIFECYCLE_STATUSES = ['new', 'confirmed', 'stale'];

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getEntryStorePath(org, runbookId, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', 'entries', `${runbookId}.json`);
}

// ── ID generation ──────────────────────────────────────────────────────────

function _normalizeSection(section) {
  return (section || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a deterministic entry ID from section, title, and summary.
 *
 * @param {string} section
 * @param {string} title
 * @param {string} summary
 * @returns {string} Entry ID
 */
function generateEntryId(section, title, summary) {
  const prefix = _normalizeSection(section);
  const hash = crypto
    .createHash('sha256')
    .update((title || '').toLowerCase().trim() + '|' + (summary || '').toLowerCase().trim())
    .digest('hex')
    .slice(0, 10);
  return `${prefix}-${hash}`;
}

// ── Entry Store I/O ────────────────────────────────────────────────────────

/**
 * Load the entry store for a runbook. Returns empty store if file missing.
 *
 * @param {string} org
 * @param {string} runbookId
 * @param {string} [pluginRoot]
 * @returns {Object} RunbookEntryStore
 */
function loadEntries(org, runbookId, pluginRoot) {
  const storePath = _getEntryStorePath(org, runbookId, pluginRoot);

  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf-8');
      const store = JSON.parse(raw);
      if (store && Array.isArray(store.entries)) {
        return store;
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not load entry store for ${runbookId}: ${err.message}`);
  }

  return {
    runbookId,
    version: ENTRY_STORE_VERSION,
    entries: [],
    updatedAt: new Date().toISOString()
  };
}

/**
 * Atomically save the entry store.
 *
 * @param {string} org
 * @param {string} runbookId
 * @param {Object} entryStore
 * @param {string} [pluginRoot]
 */
function saveEntries(org, runbookId, entryStore, pluginRoot) {
  const storePath = _getEntryStorePath(org, runbookId, pluginRoot);
  const dir = path.dirname(storePath);

  fs.mkdirSync(dir, { recursive: true });

  entryStore.updatedAt = new Date().toISOString();

  const tmp = storePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entryStore, null, 2), 'utf-8');
  fs.renameSync(tmp, storePath);
}

// ── CRUD operations ────────────────────────────────────────────────────────

/**
 * Get an entry by ID.
 *
 * @param {Object} entryStore
 * @param {string} entryId
 * @returns {Object|null}
 */
function getEntry(entryStore, entryId) {
  return entryStore.entries.find(e => e.entryId === entryId) || null;
}

/**
 * Add an entry to the store.
 *
 * @param {Object} entryStore
 * @param {Object} entry
 * @returns {string} The entry ID
 */
function addEntry(entryStore, entry) {
  if (!entry.entryId || !entry.section || !entry.title || !entry.summary) {
    throw new Error('Entry requires entryId, section, title, and summary');
  }
  entryStore.entries.push(entry);
  return entry.entryId;
}

/**
 * Update an existing entry by merging updates.
 *
 * @param {Object} entryStore
 * @param {string} entryId
 * @param {Object} updates
 * @returns {boolean} True if found and updated
 */
function updateEntry(entryStore, entryId, updates) {
  const idx = entryStore.entries.findIndex(e => e.entryId === entryId);
  if (idx === -1) return false;
  entryStore.entries[idx] = { ...entryStore.entries[idx], ...updates };
  return true;
}

/**
 * Remove an entry from the store.
 *
 * @param {Object} entryStore
 * @param {string} entryId
 * @returns {boolean} True if found and removed
 */
function removeEntry(entryStore, entryId) {
  const before = entryStore.entries.length;
  entryStore.entries = entryStore.entries.filter(e => e.entryId !== entryId);
  return entryStore.entries.length < before;
}

// ── Query operations ───────────────────────────────────────────────────────

/**
 * List entries in a specific section.
 *
 * @param {Object} entryStore
 * @param {string} section
 * @returns {Object[]}
 */
function listBySection(entryStore, section) {
  return entryStore.entries.filter(e => e.section === section);
}

/**
 * List entries by category.
 *
 * @param {Object} entryStore
 * @param {string} category
 * @returns {Object[]}
 */
function listByCategory(entryStore, category) {
  return entryStore.entries.filter(e => e.category === category);
}

/**
 * Find entries with summaries semantically similar to the given text.
 * Uses a blended approach: max of tokenSimilarity (Jaccard on words) and
 * compositeSimilarity (Jaro-Winkler + Levenshtein + Dice + phonetic).
 * This handles both short phrases (where token overlap works) and longer
 * sentences (where character-level algorithms work better).
 *
 * @param {Object} entryStore
 * @param {string} summary
 * @param {number} [threshold=0.55]
 * @returns {{ entry: Object, similarity: number }[]} Sorted descending
 */
function findSimilar(entryStore, summary, threshold = 0.55) {
  if (!summary || !entryStore.entries.length) return [];

  const normalizedInput = normalizeForComparison(summary);
  const results = [];

  for (const entry of entryStore.entries) {
    const normalizedEntry = normalizeForComparison(entry.summary);
    const tokenSim = tokenSimilarity(normalizedInput, normalizedEntry);
    const compositeSim = compositeSimilarity(normalizedInput, normalizedEntry).composite || 0;
    const sim = Math.max(tokenSim, compositeSim);
    if (sim >= threshold) {
      results.push({ entry, similarity: sim });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  loadEntries,
  saveEntries,
  getEntry,
  addEntry,
  updateEntry,
  removeEntry,
  listBySection,
  listByCategory,
  findSimilar,
  generateEntryId,
  SECTION_MAP,
  SECTION_ORDER,
  ENTRY_STORE_VERSION,
  VALID_VALIDATION_STATUSES,
  VALID_LIFECYCLE_STATUSES
};
