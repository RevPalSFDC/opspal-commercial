#!/usr/bin/env node

/**
 * Project Connect Local Registry
 *
 * Stores customer-level project-connect sync state in git-tracked JSON files.
 * Local-first checks can read this registry without requiring remote calls.
 *
 * Schema versioning: Registry files are auto-migrated when the code version
 * is newer than the on-disk version. All JSON output uses deterministic
 * key ordering + trailing newline to minimize merge conflicts.
 */

const fs = require('fs');
const path = require('path');

const INDEX_VERSION = '1.1.0';
const RECORD_VERSION = '1.1.0';
const DEFAULT_STALE_HOURS = 24;
const MAX_HISTORY_ENTRIES = 100;
const SCHEMA_VERSION_FILE = '.schema-version';

class ProjectConnectRegistry {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.repoRoot = options.repoRoot || path.resolve(__dirname, '../../../../');
    this.registryRoot = options.registryRoot || path.join(this.repoRoot, 'project-connect');
    this.customersRoot = path.join(this.registryRoot, 'customers');
    this.indexPath = path.join(this.registryRoot, 'registry-index.json');
    this.schemaVersionPath = path.join(this.registryRoot, SCHEMA_VERSION_FILE);
    this.defaultStaleHours = this._toPositiveNumber(options.staleAfterHours, DEFAULT_STALE_HOURS);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load registry index from disk. Auto-migrates schema if needed.
   *
   * @returns {Object}
   */
  loadIndex() {
    this._ensureDirectoryStructure();
    this._validateAndMigrateSchema();

    if (!fs.existsSync(this.indexPath)) {
      const index = this._createEmptyIndex();
      this.saveIndex(index);
      return index;
    }

    const index = this._readJson(this.indexPath);
    return this._normalizeIndex(index);
  }

  /**
   * Persist registry index with deterministic JSON formatting.
   *
   * @param {Object} index
   * @returns {Object}
   */
  saveIndex(index) {
    this._ensureDirectoryStructure();

    const normalized = this._normalizeIndex(index);
    normalized.updatedAt = this._now();
    fs.writeFileSync(this.indexPath, this._deterministicStringify(normalized));
    return normalized;
  }

  /**
   * Load customer record.
   *
   * @param {string} customerId
   * @returns {Object|null}
   */
  loadCustomerRecord(customerId) {
    const normalizedCustomerId = this._normalizeCustomerId(customerId);
    const recordPath = this.getCustomerRecordPath(normalizedCustomerId);

    if (!fs.existsSync(recordPath)) {
      return null;
    }

    return this._normalizeCustomerRecord(this._readJson(recordPath), normalizedCustomerId);
  }

  /**
   * Save customer record with deterministic JSON formatting.
   *
   * @param {string} customerId
   * @param {Object} record
   * @returns {{record: Object, recordPath: string}}
   */
  saveCustomerRecord(customerId, record) {
    const normalizedCustomerId = this._normalizeCustomerId(customerId);
    this._ensureDirectoryStructure();
    const recordPath = this.getCustomerRecordPath(normalizedCustomerId);
    const normalizedRecord = this._normalizeCustomerRecord(record, normalizedCustomerId);
    normalizedRecord.lastUpdatedAt = this._now();

    fs.writeFileSync(recordPath, this._deterministicStringify(normalizedRecord));

    return {
      record: normalizedRecord,
      recordPath
    };
  }

  /**
   * Upsert local registry from project-connect execution result.
   *
   * @param {Object} payload
   * @returns {Object}
   */
  upsertFromProjectConnectExecution(payload) {
    const now = this._now();
    const customerId = this._normalizeCustomerId(payload.customerId);
    const githubData = payload.github || {};
    const driveData = payload.drive || {};
    const asanaData = payload.asana || {};
    const aliases = this._normalizeAliases(payload.aliases || []);
    const existing = this.loadCustomerRecord(customerId);

    const customerRecord = existing || this._createEmptyCustomerRecord({
      customerId,
      customer: payload.customer || null,
      aliases
    });

    customerRecord.customer = payload.customer || customerRecord.customer || null;
    customerRecord.aliases = aliases.length > 0 ? aliases : customerRecord.aliases;
    customerRecord.orgSlug = this._deriveOrgSlug(
      customerRecord.customer,
      customerRecord.aliases
    );

    const githubStatus = this._resolveGitHubStatus(githubData);
    const githubSynced = githubStatus === 'created' || githubStatus === 'connected';
    const repoName = githubData.name || githubData.repoName || customerRecord.systems.github.repoName || null;
    const repoUrl = githubData.url || githubData.repoUrl || customerRecord.systems.github.repoUrl || null;

    customerRecord.systems.github = {
      synced: githubSynced,
      status: githubStatus,
      repoName,
      repoUrl,
      verifiedBy: payload.source || 'project-connect',
      lastVerifiedAt: now
    };

    customerRecord.systems.drive = {
      status: this._resolveDriveStatus(driveData)
    };

    customerRecord.systems.asana = {
      status: this._resolveAsanaStatus(asanaData)
    };

    const githubEvent = githubStatus === 'created' ? 'github.create' : 'github.connect';
    this._appendHistory(customerRecord, {
      timestamp: now,
      event: payload.event || githubEvent,
      result: 'success',
      actor: payload.actor || payload.source || 'project-connect'
    });

    const saved = this.saveCustomerRecord(customerId, customerRecord);
    const index = this.loadIndex();
    const relativePath = this.getCustomerRecordRelativePath(customerId);

    index.customers[customerId] = {
      customer: saved.record.customer,
      aliases: saved.record.aliases,
      orgSlug: saved.record.orgSlug,
      recordPath: relativePath,
      repoSynced: saved.record.systems.github.synced,
      lastVerifiedAt: saved.record.systems.github.lastVerifiedAt,
      lastSource: payload.source || 'project-connect',
      repoName: saved.record.systems.github.repoName,
      repoUrl: saved.record.systems.github.repoUrl
    };

    this.saveIndex(index);

    return {
      customerId,
      synced: saved.record.systems.github.synced,
      lastVerifiedAt: saved.record.systems.github.lastVerifiedAt,
      indexPath: this.indexPath,
      recordPath: saved.recordPath,
      relativeRecordPath: relativePath
    };
  }

  /**
   * Record a check result (local or remote) and persist.
   *
   * @param {Object} payload
   * @returns {Object}
   */
  recordCheckResult(payload) {
    const now = this._now();
    const customerId = this._normalizeCustomerId(payload.customerId);
    const aliases = this._normalizeAliases(payload.aliases || []);
    const existing = this.loadCustomerRecord(customerId);

    const customerRecord = existing || this._createEmptyCustomerRecord({
      customerId,
      customer: payload.customer || null,
      aliases
    });

    customerRecord.customer = payload.customer || customerRecord.customer || null;
    customerRecord.aliases = aliases.length > 0 ? aliases : customerRecord.aliases;
    customerRecord.orgSlug = this._deriveOrgSlug(
      customerRecord.customer,
      customerRecord.aliases
    );

    const repoName = payload.repoName || customerRecord.systems.github.repoName || null;
    const repoUrl = payload.repoUrl || customerRecord.systems.github.repoUrl || null;
    const synced = Boolean(payload.synced);
    const status = payload.status || (synced ? 'connected' : 'not_synced');
    const source = payload.source || 'local';

    customerRecord.systems.github = {
      synced,
      status,
      repoName: synced ? repoName : customerRecord.systems.github.repoName,
      repoUrl: synced ? repoUrl : customerRecord.systems.github.repoUrl,
      verifiedBy: source,
      lastVerifiedAt: now
    };

    this._appendHistory(customerRecord, {
      timestamp: now,
      event: payload.event || (source === 'remote' ? 'check.remote' : 'check.local'),
      result: synced ? 'success' : 'failure',
      actor: payload.actor || 'project-connect-check',
      reason: payload.reason || null
    });

    const saved = this.saveCustomerRecord(customerId, customerRecord);
    const index = this.loadIndex();
    const relativePath = this.getCustomerRecordRelativePath(customerId);

    index.customers[customerId] = {
      customer: saved.record.customer,
      aliases: saved.record.aliases,
      orgSlug: saved.record.orgSlug,
      recordPath: relativePath,
      repoSynced: saved.record.systems.github.synced,
      lastVerifiedAt: saved.record.systems.github.lastVerifiedAt,
      lastSource: source,
      repoName: saved.record.systems.github.repoName || null,
      repoUrl: saved.record.systems.github.repoUrl || null
    };

    this.saveIndex(index);

    return {
      customerId,
      synced: saved.record.systems.github.synced,
      lastVerifiedAt: saved.record.systems.github.lastVerifiedAt,
      indexPath: this.indexPath,
      recordPath: saved.recordPath,
      relativeRecordPath: relativePath
    };
  }

  /**
   * Get local repo sync status.
   *
   * @param {Object} options
   * @returns {Object}
   */
  getRepoSyncStatus(options) {
    const customerId = this._normalizeCustomerId(options.customerId);
    const staleAfterHours = this._toPositiveNumber(options.staleAfterHours, this.defaultStaleHours);
    const index = this.loadIndex();
    const indexEntry = index.customers[customerId] || null;
    const record = this.loadCustomerRecord(customerId);

    const repoName = record?.systems?.github?.repoName || indexEntry?.repoName || null;
    const repoUrl = record?.systems?.github?.repoUrl || indexEntry?.repoUrl || null;
    const synced = this._resolveSynced(record, indexEntry);
    const lastVerifiedAt = record?.systems?.github?.lastVerifiedAt || indexEntry?.lastVerifiedAt || null;
    const stale = this.isStale(lastVerifiedAt, staleAfterHours);
    const found = Boolean(indexEntry || record);

    const reason = this._buildLocalReason({
      found,
      stale,
      synced
    });

    return {
      customerId,
      found,
      synced,
      stale,
      source: found ? 'local' : 'none',
      reason,
      lastVerifiedAt,
      repo: repoName || repoUrl ? { name: repoName, url: repoUrl } : null,
      localRegistry: {
        indexPath: this.indexPath,
        recordPath: this.getCustomerRecordPath(customerId)
      }
    };
  }

  /**
   * Find a customer entry by orgSlug.
   * Searches index entries by matching orgSlug, slugified customer name, or slugified aliases.
   *
   * @param {string} slug
   * @returns {{customerId: string, entry: Object}|null}
   */
  findByOrgSlug(slug) {
    if (!slug) return null;

    const target = this._slugify(slug);
    if (!target) return null;

    const index = this.loadIndex();
    const customers = index.customers || {};

    for (const [customerId, entry] of Object.entries(customers)) {
      // Direct orgSlug match
      if (entry.orgSlug && this._slugify(entry.orgSlug) === target) {
        return { customerId, entry };
      }

      // Slugified customer name match
      if (entry.customer && this._slugify(entry.customer) === target) {
        return { customerId, entry };
      }

      // Slugified alias match
      if (Array.isArray(entry.aliases)) {
        for (const alias of entry.aliases) {
          if (this._slugify(alias) === target) {
            return { customerId, entry };
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a customer's repo is cloned locally.
   * Verifies both the registry record and filesystem existence.
   *
   * @param {string} customerId
   * @returns {{cloned: boolean, localClonePath: string|null}}
   */
  getLocalCloneStatus(customerId) {
    const normalizedId = this._normalizeCustomerId(customerId);
    const record = this.loadCustomerRecord(normalizedId);

    if (!record || !record.localClonePath) {
      return { cloned: false, localClonePath: null };
    }

    const absolutePath = path.isAbsolute(record.localClonePath)
      ? record.localClonePath
      : path.resolve(this.repoRoot, record.localClonePath);

    const exists = fs.existsSync(absolutePath);
    return {
      cloned: exists,
      localClonePath: exists ? record.localClonePath : null
    };
  }

  /**
   * Determine whether a timestamp is stale for the specified threshold.
   *
   * @param {string|null} isoTimestamp
   * @param {number} staleAfterHours
   * @returns {boolean}
   */
  isStale(isoTimestamp, staleAfterHours = this.defaultStaleHours) {
    if (!isoTimestamp) {
      return true;
    }

    const ts = new Date(isoTimestamp).getTime();
    if (Number.isNaN(ts)) {
      return true;
    }

    const ageMs = Date.now() - ts;
    const thresholdMs = this._toPositiveNumber(staleAfterHours, this.defaultStaleHours) * 60 * 60 * 1000;
    return ageMs > thresholdMs;
  }

  /**
   * Get absolute customer record path.
   *
   * @param {string} customerId
   * @returns {string}
   */
  getCustomerRecordPath(customerId) {
    const normalizedCustomerId = this._normalizeCustomerId(customerId);
    return path.join(this.customersRoot, `${normalizedCustomerId}.json`);
  }

  /**
   * Get customer record path relative to repo root.
   *
   * @param {string} customerId
   * @returns {string}
   */
  getCustomerRecordRelativePath(customerId) {
    const normalizedCustomerId = this._normalizeCustomerId(customerId);
    return path.posix.join('project-connect', 'customers', `${normalizedCustomerId}.json`);
  }

  // ---------------------------------------------------------------------------
  // Schema versioning
  // ---------------------------------------------------------------------------

  /**
   * Read the on-disk schema version.
   *
   * @returns {string|null}
   */
  _readSchemaVersionFile() {
    if (!fs.existsSync(this.schemaVersionPath)) {
      return null;
    }
    return fs.readFileSync(this.schemaVersionPath, 'utf-8').trim();
  }

  /**
   * Write the schema version marker file.
   *
   * @param {string} version
   */
  _writeSchemaVersionFile(version) {
    this._ensureDirectoryStructure();
    fs.writeFileSync(this.schemaVersionPath, version + '\n');
  }

  /**
   * Validate the on-disk schema version against the code version.
   * Runs migration when the disk version is older.
   */
  _validateAndMigrateSchema() {
    const diskVersion = this._readSchemaVersionFile();

    // First run or missing marker — set version and run migration from 1.0.0
    if (!diskVersion) {
      this._migrateSchema('1.0.0', INDEX_VERSION);
      this._writeSchemaVersionFile(INDEX_VERSION);
      return;
    }

    if (diskVersion === INDEX_VERSION) {
      return; // up to date
    }

    // Disk is older than code
    if (this._compareVersions(diskVersion, INDEX_VERSION) < 0) {
      this._migrateSchema(diskVersion, INDEX_VERSION);
      this._writeSchemaVersionFile(INDEX_VERSION);
    }
  }

  /**
   * Run all applicable migration steps between two versions.
   *
   * @param {string} fromVersion
   * @param {string} toVersion
   */
  _migrateSchema(fromVersion, toVersion) {
    this._log(`Migrating schema from ${fromVersion} to ${toVersion}`);

    // 1.0.0 -> 1.1.0: add orgSlug to index entries and customer records,
    // add localClonePath to customer records, re-save with deterministic JSON
    if (this._compareVersions(fromVersion, '1.1.0') < 0 && this._compareVersions(toVersion, '1.1.0') >= 0) {
      this._migrate_1_0_0_to_1_1_0();
    }
  }

  /**
   * Migration: 1.0.0 -> 1.1.0
   * - Add orgSlug to every index entry and customer record
   * - Add localClonePath to every customer record
   * - Bump version fields
   * - Re-save everything with deterministic formatting
   */
  _migrate_1_0_0_to_1_1_0() {
    this._log('Running migration 1.0.0 -> 1.1.0');

    // Migrate index
    if (fs.existsSync(this.indexPath)) {
      const index = this._readJson(this.indexPath);
      index.version = INDEX_VERSION;

      for (const [, entry] of Object.entries(index.customers || {})) {
        if (!entry.orgSlug) {
          entry.orgSlug = this._deriveOrgSlug(entry.customer, entry.aliases);
        }
      }

      index.updatedAt = this._now();
      fs.writeFileSync(this.indexPath, this._deterministicStringify(index));
    }

    // Migrate customer records
    if (fs.existsSync(this.customersRoot)) {
      const files = fs.readdirSync(this.customersRoot).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(this.customersRoot, file);
        const record = this._readJson(filePath);
        record.version = RECORD_VERSION;

        if (!record.orgSlug) {
          record.orgSlug = this._deriveOrgSlug(record.customer, record.aliases);
        }
        if (record.localClonePath === undefined) {
          record.localClonePath = null;
        }

        fs.writeFileSync(filePath, this._deterministicStringify(record));
      }
    }

    this._log('Migration 1.0.0 -> 1.1.0 complete');
  }

  // ---------------------------------------------------------------------------
  // Deterministic JSON
  // ---------------------------------------------------------------------------

  /**
   * Serialize an object with recursively sorted keys and a trailing newline.
   * Produces byte-identical output for identical data regardless of insertion order.
   *
   * @param {*} obj
   * @returns {string}
   */
  _deterministicStringify(obj) {
    return JSON.stringify(this._sortKeys(obj), null, 2) + '\n';
  }

  /**
   * Recursively sort object keys. Arrays are left in order but their
   * object elements are sorted.
   *
   * @param {*} value
   * @returns {*}
   */
  _sortKeys(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._sortKeys(item));
    }

    if (value !== null && typeof value === 'object') {
      const sorted = {};
      for (const key of Object.keys(value).sort()) {
        sorted[key] = this._sortKeys(value[key]);
      }
      return sorted;
    }

    return value;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Derive an org slug from customer name (falling back to first alias).
   *
   * @param {string|null} customer
   * @param {string[]} aliases
   * @returns {string|null}
   */
  _deriveOrgSlug(customer, aliases) {
    const source = customer || (Array.isArray(aliases) && aliases[0]) || null;
    if (!source) return null;
    return this._slugify(source);
  }

  /**
   * Slugify a string for use as an orgSlug.
   *
   * @param {string} str
   * @returns {string}
   */
  _slugify(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /**
   * Compare two semver strings. Returns -1, 0, or 1.
   *
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  _compareVersions(a, b) {
    const pa = (a || '0.0.0').split('.').map(Number);
    const pb = (b || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    }
    return 0;
  }

  _resolveSynced(record, indexEntry) {
    if (typeof record?.systems?.github?.synced === 'boolean') {
      return record.systems.github.synced;
    }

    if (typeof indexEntry?.repoSynced === 'boolean') {
      return indexEntry.repoSynced;
    }

    return false;
  }

  _buildLocalReason({ found, stale, synced }) {
    if (!found) {
      return 'local_registry_missing';
    }

    if (stale) {
      return synced ? 'local_registry_stale_synced' : 'local_registry_stale_unsynced';
    }

    return synced ? 'local_registry_fresh_synced' : 'local_registry_fresh_unsynced';
  }

  _resolveGitHubStatus(githubData) {
    if (githubData.created) return 'created';
    if (githubData.exists || githubData.connected || githubData.name || githubData.repoName) {
      return 'connected';
    }
    return 'unknown';
  }

  _resolveDriveStatus(driveData) {
    if (driveData.created) return 'created';
    if (driveData.exists || driveData.connected || driveData.folderId) return 'connected';
    if (driveData.manualRequired) return 'manual_required';
    if (driveData.skipped) return 'skipped';
    return 'unknown';
  }

  _resolveAsanaStatus(asanaData) {
    if (asanaData.created) return 'created';
    if (asanaData.exists || asanaData.connected || asanaData.projectId) return 'connected';
    if (asanaData.manualRequired) return 'manual_required';
    if (asanaData.skipped) return 'skipped';
    if (asanaData.error) return 'error';
    return 'unknown';
  }

  _appendHistory(record, event) {
    if (!Array.isArray(record.history)) {
      record.history = [];
    }

    record.history.push(event);
    if (record.history.length > MAX_HISTORY_ENTRIES) {
      record.history = record.history.slice(-MAX_HISTORY_ENTRIES);
    }
  }

  _createEmptyIndex() {
    const now = this._now();
    return {
      version: INDEX_VERSION,
      createdAt: now,
      updatedAt: now,
      customers: {}
    };
  }

  _createEmptyCustomerRecord({ customerId, customer, aliases }) {
    const now = this._now();
    return {
      version: RECORD_VERSION,
      customerId,
      customer: customer || null,
      orgSlug: this._deriveOrgSlug(customer, aliases),
      aliases: aliases || [],
      localClonePath: null,
      systems: {
        github: {
          synced: false,
          status: 'unknown',
          repoName: null,
          repoUrl: null,
          verifiedBy: null,
          lastVerifiedAt: null
        },
        drive: {
          status: 'unknown'
        },
        asana: {
          status: 'unknown'
        }
      },
      history: [],
      lastUpdatedAt: now
    };
  }

  _normalizeIndex(index) {
    const normalized = index && typeof index === 'object' ? { ...index } : this._createEmptyIndex();
    if (!normalized.version) normalized.version = INDEX_VERSION;
    if (!normalized.createdAt) normalized.createdAt = this._now();
    if (!normalized.updatedAt) normalized.updatedAt = this._now();
    if (!normalized.customers || typeof normalized.customers !== 'object') {
      normalized.customers = {};
    }
    return normalized;
  }

  _normalizeCustomerRecord(record, customerId) {
    const normalized = record && typeof record === 'object' ? { ...record } : {};
    normalized.version = normalized.version || RECORD_VERSION;
    normalized.customerId = customerId;
    normalized.customer = normalized.customer || null;
    normalized.orgSlug = normalized.orgSlug || this._deriveOrgSlug(normalized.customer, normalized.aliases);
    normalized.aliases = this._normalizeAliases(normalized.aliases || []);
    normalized.localClonePath = normalized.localClonePath || null;
    normalized.history = Array.isArray(normalized.history) ? normalized.history : [];
    normalized.lastUpdatedAt = normalized.lastUpdatedAt || this._now();

    if (!normalized.systems || typeof normalized.systems !== 'object') {
      normalized.systems = {};
    }

    normalized.systems.github = {
      synced: Boolean(normalized.systems.github?.synced),
      status: normalized.systems.github?.status || 'unknown',
      repoName: normalized.systems.github?.repoName || null,
      repoUrl: normalized.systems.github?.repoUrl || null,
      verifiedBy: normalized.systems.github?.verifiedBy || null,
      lastVerifiedAt: normalized.systems.github?.lastVerifiedAt || null
    };

    normalized.systems.drive = {
      status: normalized.systems.drive?.status || 'unknown'
    };

    normalized.systems.asana = {
      status: normalized.systems.asana?.status || 'unknown'
    };

    return normalized;
  }

  _normalizeAliases(aliases) {
    if (!Array.isArray(aliases)) return [];

    const seen = new Set();
    const normalized = [];

    for (const alias of aliases) {
      const value = String(alias || '').trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(value);
    }

    return normalized;
  }

  _normalizeCustomerId(customerId) {
    const raw = String(customerId || '').trim();
    if (!raw) {
      throw new Error('customerId is required');
    }

    const normalized = raw.replace(/[^A-Za-z0-9_-]/g, '');
    if (!normalized) {
      throw new Error('customerId is invalid');
    }

    return normalized;
  }

  _ensureDirectoryStructure() {
    if (!fs.existsSync(this.registryRoot)) {
      fs.mkdirSync(this.registryRoot, { recursive: true });
    }

    if (!fs.existsSync(this.customersRoot)) {
      fs.mkdirSync(this.customersRoot, { recursive: true });
    }
  }

  _readJson(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      throw new Error(`Failed to parse JSON at ${filePath}: ${error.message}`);
    }
  }

  _toPositiveNumber(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return fallback;
    }
    return numeric;
  }

  _now() {
    return new Date().toISOString();
  }

  _log(message) {
    if (this.verbose) {
      console.log(`[ProjectConnectRegistry] ${message}`);
    }
  }
}

module.exports = ProjectConnectRegistry;
