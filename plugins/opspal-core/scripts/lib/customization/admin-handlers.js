#!/usr/bin/env node

/**
 * Admin Handlers
 *
 * Public API surface for the /customize command and agent integrations.
 * Every mutation writes to the audit log.
 *
 * @version 1.0.0
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class AdminHandlers {
  /**
   * @param {Object} deps
   * @param {import('./resource-resolver').ResourceResolver} deps.resolver
   * @param {import('./custom-resource-store').CustomResourceStore} deps.store
   * @param {import('./resource-registry').ResourceRegistry} deps.registry
   * @param {import('./source-lineage-tracker').SourceLineageTracker} deps.lineage
   * @param {import('./upstream-diff-service').UpstreamDiffService} deps.diff
   * @param {import('./export-import-service').ExportImportService} deps.exportImport
   * @param {import('./backup-restore').BackupRestore} deps.backup
   * @param {import('./migration-runner').MigrationRunner} deps.migration
   * @param {import('./customization-audit-log').CustomizationAuditLog} deps.auditLog
   */
  constructor(deps = {}) {
    this.resolver = deps.resolver;
    this.store = deps.store;
    this.registry = deps.registry;
    this.lineage = deps.lineage;
    this.diff = deps.diff;
    this.exportImport = deps.exportImport;
    this.backup = deps.backup;
    this.migration = deps.migration;
    this.auditLog = deps.auditLog;
  }

  // ── Query ──────────────────────────────────────────────────────────

  /**
   * List resources with optional filtering
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant|global|all (default: all)
   * @param {string} [options.resource_type] - brand_asset|template
   * @param {string} [options.status] - draft|published|archived
   * @returns {Promise<Array<Object>>}
   */
  async list(options = {}) {
    const results = [];
    const scopes = options.scope === 'all' || !options.scope
      ? ['global', 'site', 'tenant']
      : [options.scope];

    for (const scope of scopes) {
      if (scope === 'global') {
        let defaults = await this.registry.list(options.resource_type);
        if (options.status) {
          defaults = defaults.filter(r => r.status === options.status);
        }
        results.push(...defaults.map(r => ({ ...r, _scope: 'global' })));
      } else {
        const filter = {};
        if (options.resource_type) filter.resource_type = options.resource_type;
        if (options.status) filter.status = options.status;
        const records = await this.store.listRecords(scope, filter);
        results.push(...records.map(r => ({ ...r, _scope: scope })));
      }
    }

    return results;
  }

  /**
   * Get the effective resolved resource with lineage info
   * @param {string} resourceId
   * @returns {Promise<Object|null>}
   */
  async get(resourceId) {
    const resolved = await this.resolver.resolve(resourceId, { raw: true });
    if (!resolved) return null;

    const record = resolved.record;
    let drift = null;

    if (record.source_resource_id) {
      drift = await this.lineage.checkDrift(record);
    }

    return { record, drift };
  }

  /**
   * Compare a custom resource to its upstream default
   * @param {string} resourceId
   * @returns {Promise<Object>}
   */
  async compare(resourceId) {
    // Find the custom record (site or tenant)
    let customRecord = await this.store.getRecord(resourceId, 'tenant');
    if (!customRecord) {
      customRecord = await this.store.getRecord(resourceId, 'site');
    }

    if (!customRecord) {
      return { error: `No custom resource found for ${resourceId}` };
    }

    return this.diff.diff(customRecord);
  }

  // ── Mutations ──────────────────────────────────────────────────────

  /**
   * Clone a packaged default into a custom resource
   * @param {string} resourceId - The packaged default to clone
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant (default: site)
   * @param {string} [options.title] - Title for the custom resource
   * @param {string} [options.newId] - Custom resource ID (defaults to same as source)
   * @returns {Promise<Object>} The new custom record
   */
  async clone(resourceId, options = {}) {
    const scope = options.scope || 'site';
    const sourceRecord = await this.registry.get(resourceId);
    if (!sourceRecord) {
      throw new Error(`Packaged default not found: ${resourceId}`);
    }

    // Check if already cloned
    const existing = await this.store.getRecord(options.newId || resourceId, scope);
    if (existing) {
      throw new Error(`Custom resource already exists: ${options.newId || resourceId} (scope: ${scope})`);
    }

    // Load content from source
    let content = sourceRecord.content;
    let storageUri = null;

    if (!content && sourceRecord._filePath) {
      try {
        const ext = path.extname(sourceRecord._filePath).toLowerCase();
        const textExtensions = ['.md', '.css', '.json', '.html', '.txt'];
        if (textExtensions.includes(ext)) {
          content = await fs.readFile(sourceRecord._filePath, 'utf8');
          if (ext === '.json') {
            try { content = JSON.parse(content); } catch { /* keep as string */ }
          }
        } else {
          // Binary asset — copy to persistent storage
          const buffer = await fs.readFile(sourceRecord._filePath);
          storageUri = await this.store.saveAsset(
            buffer,
            path.basename(sourceRecord._filePath),
            scope
          );
        }
      } catch (err) {
        throw new Error(`Cannot read source file: ${err.message}`);
      }
    }

    const customRecord = {
      resource_id: options.newId || resourceId,
      resource_type: sourceRecord.resource_type,
      scope,
      source_type: 'custom',
      schema_version: '1',
      status: 'draft',
      title: options.title || `Custom: ${sourceRecord.title}`,
      content,
      storage_uri: storageUri,
      metadata: { ...sourceRecord.metadata },
      checksum: sourceRecord.checksum,
      created_by: process.env.CLAUDE_AGENT_NAME || 'claude-code',
      updated_by: process.env.CLAUDE_AGENT_NAME || 'claude-code'
    };

    // Record lineage
    await this.lineage.recordClone(customRecord, sourceRecord);

    // Save
    const saved = await this.store.saveRecord(customRecord, scope);
    this.resolver.invalidateCache(saved.resource_id);

    this.auditLog.log('clone', saved.resource_id, {
      scope,
      reason: `Cloned from ${resourceId}`,
      after: saved
    });

    return saved;
  }

  /**
   * Create a net-new custom resource (not cloned from a default)
   * @param {Object} partial - Partial resource record
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant (default: site)
   * @returns {Promise<Object>} The new record
   */
  async create(partial, options = {}) {
    const scope = options.scope || 'site';

    const record = {
      resource_id: partial.resource_id || `custom:${crypto.randomUUID()}`,
      resource_type: partial.resource_type || 'template',
      scope,
      source_type: 'custom',
      source_resource_id: null,
      source_version: null,
      source_checksum: null,
      schema_version: '1',
      status: partial.status || 'draft',
      title: partial.title || 'Untitled',
      content: partial.content || null,
      storage_uri: partial.storage_uri || null,
      metadata: partial.metadata || {},
      checksum: null,
      created_by: process.env.CLAUDE_AGENT_NAME || 'claude-code',
      updated_by: process.env.CLAUDE_AGENT_NAME || 'claude-code'
    };

    // Compute checksum
    if (record.content) {
      const str = typeof record.content === 'string' ? record.content : JSON.stringify(record.content);
      record.checksum = 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
    }

    const saved = await this.store.saveRecord(record, scope);
    this.resolver.invalidateCache(saved.resource_id);

    this.auditLog.log('create', saved.resource_id, { scope, after: saved });

    return saved;
  }

  /**
   * Edit an existing custom resource
   * @param {string} resourceId
   * @param {Object} patch - Fields to update
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant (default: site)
   * @returns {Promise<Object>} The updated record
   */
  async edit(resourceId, patch, options = {}) {
    const scope = options.scope || 'site';
    const existing = await this.store.getRecord(resourceId, scope);
    if (!existing) {
      throw new Error(`Custom resource not found: ${resourceId} (scope: ${scope})`);
    }

    const before = { ...existing };

    // Apply patch (only allowed fields)
    const allowedFields = ['title', 'content', 'storage_uri', 'metadata', 'status'];
    for (const key of allowedFields) {
      if (patch[key] !== undefined) {
        existing[key] = patch[key];
      }
    }

    existing.updated_by = process.env.CLAUDE_AGENT_NAME || 'claude-code';

    // Recompute checksum
    if (existing.content) {
      const str = typeof existing.content === 'string' ? existing.content : JSON.stringify(existing.content);
      existing.checksum = 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
    }

    const saved = await this.store.saveRecord(existing, scope);
    this.resolver.invalidateCache(resourceId);

    this.auditLog.log('update', resourceId, { scope, before, after: saved });

    return saved;
  }

  /**
   * Publish a draft resource
   * @param {string} resourceId
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant (default: site)
   * @returns {Promise<Object>}
   */
  async publish(resourceId, options = {}) {
    return this.edit(resourceId, { status: 'published' }, options);
  }

  /**
   * Archive a resource
   * @param {string} resourceId
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant (default: site)
   * @returns {Promise<Object>}
   */
  async archive(resourceId, options = {}) {
    return this.edit(resourceId, { status: 'archived' }, options);
  }

  /**
   * Revert to the packaged default (deletes the custom resource)
   * @param {string} resourceId
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant (default: site)
   * @returns {Promise<{reverted: boolean, deletedRecord: Object|null}>}
   */
  async revert(resourceId, options = {}) {
    const scope = options.scope || 'site';
    const existing = await this.store.getRecord(resourceId, scope);

    if (!existing) {
      return { reverted: false, deletedRecord: null };
    }

    // Delete associated asset if it exists
    if (existing.storage_uri) {
      await this.store.deleteAsset(existing.storage_uri);
    }

    await this.store.deleteRecord(resourceId, scope);
    this.resolver.invalidateCache(resourceId);

    this.auditLog.log('revert', resourceId, {
      scope,
      reason: 'Reverted to packaged default',
      before: existing
    });

    return { reverted: true, deletedRecord: existing };
  }

  // ── Bulk operations ────────────────────────────────────────────────

  /**
   * Export customizations as a bundle
   */
  async exportBundle(options = {}) {
    return this.exportImport.exportBundle(options);
  }

  /**
   * Import customizations from a bundle
   */
  async importBundle(bundle, options = {}) {
    const result = await this.exportImport.importBundle(bundle, options);
    this.resolver.invalidateCache();
    return result;
  }

  /**
   * Run pending migrations
   */
  async runMigrations(options = {}) {
    return this.migration.runAll(options);
  }

  /**
   * List resources where upstream defaults have changed
   */
  async listDriftedResources(scope) {
    return this.lineage.listDriftedResources(scope);
  }

  /**
   * Create a backup
   */
  async createBackup(options = {}) {
    return this.backup.backup(options);
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath, options = {}) {
    const result = await this.backup.restore(backupPath, options);
    this.resolver.invalidateCache();
    return result;
  }

  /**
   * List available backups
   */
  async listBackups() {
    return this.backup.listBackups();
  }
}

module.exports = { AdminHandlers };
