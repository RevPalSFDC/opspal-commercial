#!/usr/bin/env node

/**
 * Custom Resource Store
 *
 * Persists customer-defined resource records and binary assets outside
 * the plugin update path. Uses atomic index writes with advisory locking.
 *
 * Storage locations:
 *   site:   ~/.claude/opspal/customizations/
 *   tenant: orgs/<org>/customizations/
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const crypto = require('crypto');

const LOCK_TIMEOUT_MS = 2000;
const LOCK_POLL_MS = 50;

class CustomResourceStore {
  /**
   * @param {Object} options
   * @param {string} [options.globalDir] - Path to site-scoped storage
   * @param {string} [options.orgDir] - Path to tenant-scoped storage (org-specific)
   */
  constructor(options = {}) {
    this.globalDir = options.globalDir || path.join(
      process.env.HOME || '/tmp', '.claude', 'opspal', 'customizations'
    );
    this.orgDir = options.orgDir || null;
  }

  /**
   * Set the org directory (for tenant scope)
   * @param {string} orgSlug
   * @param {string} [projectRoot] - Project working directory
   */
  setOrg(orgSlug, projectRoot) {
    if (!orgSlug) {
      this.orgDir = null;
      return;
    }
    const root = projectRoot || process.cwd();
    this.orgDir = path.join(root, 'orgs', orgSlug, 'customizations');
  }

  /**
   * Ensure storage directories exist
   * @param {string} [scope] - site|tenant|both (default: both)
   */
  async ensureDirectories(scope) {
    const dirs = this._getDirsForScope(scope || 'both');
    for (const dir of dirs) {
      await fsPromises.mkdir(path.join(dir, 'assets'), { recursive: true });
    }
  }

  // ── Record CRUD ────────────────────────────────────────────────────

  /**
   * Get a single record by ID
   * @param {string} resourceId
   * @param {string} scope - site|tenant
   * @returns {Promise<Object|null>}
   */
  async getRecord(resourceId, scope) {
    const dir = this._dirForScope(scope);
    if (!dir) return null;

    const records = await this._readIndex(dir);
    return records.find(r => r.resource_id === resourceId) || null;
  }

  /**
   * List records with optional filtering
   * @param {string} scope - site|tenant
   * @param {Object} [filter]
   * @param {string} [filter.resource_type]
   * @param {string} [filter.status]
   * @param {string} [filter.source_resource_id]
   * @returns {Promise<Array<Object>>}
   */
  async listRecords(scope, filter = {}) {
    const dir = this._dirForScope(scope);
    if (!dir) return [];

    let records = await this._readIndex(dir);

    if (filter.resource_type) {
      records = records.filter(r => r.resource_type === filter.resource_type);
    }
    if (filter.status) {
      records = records.filter(r => r.status === filter.status);
    }
    if (filter.source_resource_id) {
      records = records.filter(r => r.source_resource_id === filter.source_resource_id);
    }

    return records;
  }

  /**
   * Save (create or update) a record
   * @param {Object} record - Full resource record
   * @param {string} scope - site|tenant
   * @returns {Promise<Object>} The saved record
   */
  async saveRecord(record, scope) {
    const dir = this._dirForScope(scope);
    if (!dir) throw new Error(`No directory configured for scope: ${scope}`);

    await this.ensureDirectories(scope);

    const now = new Date().toISOString();
    const records = await this._readIndex(dir);
    const existingIdx = records.findIndex(r => r.resource_id === record.resource_id);

    if (existingIdx >= 0) {
      // Update
      record.updated_at = now;
      records[existingIdx] = { ...records[existingIdx], ...record };
    } else {
      // Create
      record.created_at = record.created_at || now;
      record.updated_at = now;
      records.push(record);
    }

    await this._writeIndex(records, dir);
    return existingIdx >= 0 ? records[existingIdx] : record;
  }

  /**
   * Delete a record by ID
   * @param {string} resourceId
   * @param {string} scope - site|tenant
   * @returns {Promise<boolean>} true if deleted
   */
  async deleteRecord(resourceId, scope) {
    const dir = this._dirForScope(scope);
    if (!dir) return false;

    const records = await this._readIndex(dir);
    const filtered = records.filter(r => r.resource_id !== resourceId);

    if (filtered.length === records.length) return false;

    await this._writeIndex(filtered, dir);
    return true;
  }

  // ── Asset I/O ──────────────────────────────────────────────────────

  /**
   * Save a binary asset
   * @param {Buffer} buffer
   * @param {string} filename - Desired filename (will be prefixed with UUID)
   * @param {string} scope - site|tenant
   * @returns {Promise<string>} Absolute storage_uri
   */
  async saveAsset(buffer, filename, scope) {
    const dir = this._dirForScope(scope);
    if (!dir) throw new Error(`No directory configured for scope: ${scope}`);

    await this.ensureDirectories(scope);

    const uuid = crypto.randomUUID().slice(0, 8);
    const safeName = `${uuid}-${filename}`;
    const assetPath = path.join(dir, 'assets', safeName);

    await fsPromises.writeFile(assetPath, buffer);
    return assetPath;
  }

  /**
   * Read a binary asset
   * @param {string} storageUri - Absolute path
   * @returns {Promise<Buffer>}
   */
  async readAsset(storageUri) {
    return fsPromises.readFile(storageUri);
  }

  /**
   * Delete a binary asset
   * @param {string} storageUri - Absolute path
   * @returns {Promise<boolean>}
   */
  async deleteAsset(storageUri) {
    try {
      await fsPromises.unlink(storageUri);
      return true;
    } catch {
      return false;
    }
  }

  // ── Index I/O with advisory locking ────────────────────────────────

  /**
   * Read index.json from a scope directory
   * @param {string} dir
   * @returns {Promise<Array<Object>>}
   */
  async _readIndex(dir) {
    const indexPath = path.join(dir, 'index.json');
    try {
      const content = await fsPromises.readFile(indexPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Write index.json atomically with advisory lock
   * @param {Array<Object>} records
   * @param {string} dir
   */
  async _writeIndex(records, dir) {
    const indexPath = path.join(dir, 'index.json');
    const lockPath = indexPath + '.lock';
    const tmpPath = indexPath + '.tmp';

    await this._acquireLock(lockPath);
    try {
      const content = JSON.stringify(records, null, 2) + '\n';
      await fsPromises.writeFile(tmpPath, content, 'utf8');
      await fsPromises.rename(tmpPath, indexPath);
    } finally {
      await this._releaseLock(lockPath);
    }
  }

  async _acquireLock(lockPath) {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        await fsPromises.writeFile(lockPath, String(process.pid), { flag: 'wx' });
        return; // Lock acquired
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Check for stale lock
          try {
            const stat = await fsPromises.stat(lockPath);
            if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) {
              await fsPromises.unlink(lockPath);
              continue;
            }
          } catch {
            // Lock was released between check and unlink — retry
          }
          await new Promise(r => setTimeout(r, LOCK_POLL_MS));
          continue;
        }
        throw err;
      }
    }
    // Timeout — force-break stale lock
    try { await fsPromises.unlink(lockPath); } catch { /* ignore */ }
  }

  async _releaseLock(lockPath) {
    try { await fsPromises.unlink(lockPath); } catch { /* ignore */ }
  }

  // ── Scope resolution ───────────────────────────────────────────────

  _dirForScope(scope) {
    if (scope === 'tenant') return this.orgDir;
    if (scope === 'site') return this.globalDir;
    return null;
  }

  _getDirsForScope(scope) {
    const dirs = [];
    if (scope === 'site' || scope === 'both') dirs.push(this.globalDir);
    if ((scope === 'tenant' || scope === 'both') && this.orgDir) dirs.push(this.orgDir);
    return dirs;
  }
}

module.exports = { CustomResourceStore };
