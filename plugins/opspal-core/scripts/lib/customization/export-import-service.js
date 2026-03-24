#!/usr/bin/env node

/**
 * Export/Import Service
 *
 * Portable bundle format for moving customizations between machines
 * or sharing between org instances. Bundles are plain JSON files with
 * base64-encoded binary assets.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const BUNDLE_FORMAT_VERSION = '1';

class ExportImportService {
  /**
   * @param {Object} options
   * @param {import('./custom-resource-store').CustomResourceStore} options.store
   * @param {import('./resource-registry').ResourceRegistry} options.registry
   * @param {import('./customization-audit-log').CustomizationAuditLog} [options.auditLog]
   */
  constructor(options = {}) {
    this.store = options.store;
    this.registry = options.registry;
    this.auditLog = options.auditLog;
  }

  /**
   * Export customizations as a portable JSON bundle
   * @param {Object} [options]
   * @param {string} [options.scope] - site|tenant|all (default: all)
   * @param {string} [options.resourceType] - Filter by type
   * @returns {Promise<Object>} Bundle object
   */
  async exportBundle(options = {}) {
    const scopes = options.scope === 'all' || !options.scope
      ? ['site', 'tenant']
      : [options.scope];

    const resources = [];
    const assets = {};

    for (const scope of scopes) {
      const filter = {};
      if (options.resourceType) filter.resource_type = options.resourceType;

      const records = await this.store.listRecords(scope, filter);
      for (const record of records) {
        const exportRecord = { ...record, _exportScope: scope };

        // If the record has a storage_uri, include the binary asset
        if (record.storage_uri && fs.existsSync(record.storage_uri)) {
          try {
            const buffer = await fsPromises.readFile(record.storage_uri);
            const assetKey = `${record.resource_id}:${path.basename(record.storage_uri)}`;
            assets[assetKey] = {
              encoding: 'base64',
              data: buffer.toString('base64'),
              filename: path.basename(record.storage_uri),
              size: buffer.length
            };
            exportRecord._assetKey = assetKey;
          } catch {
            // Asset not readable — export record without it
          }
        }

        // Remove internal fields
        delete exportRecord._filePath;
        resources.push(exportRecord);
      }
    }

    const bundle = {
      format_version: BUNDLE_FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      exported_by: process.env.CLAUDE_AGENT_NAME || 'Claude Code',
      plugin_version: this.registry?.getPluginVersion() || 'unknown',
      resource_count: resources.length,
      asset_count: Object.keys(assets).length,
      resources,
      assets
    };

    if (this.auditLog) {
      this.auditLog.log('export', '*', {
        reason: 'bundle_export',
        metadata: { resource_count: resources.length, asset_count: Object.keys(assets).length }
      });
    }

    return bundle;
  }

  /**
   * Import customizations from a portable bundle
   * @param {Object} bundle - Bundle object
   * @param {Object} [options]
   * @param {boolean} [options.dryRun] - Preview without writing
   * @param {string} [options.onConflict] - skip|overwrite (default: skip)
   * @param {string} [options.targetScope] - Override scope for all imported resources
   * @returns {Promise<{imported: number, skipped: number, errors: number, details: Array}>}
   */
  async importBundle(bundle, options = {}) {
    if (bundle.format_version !== BUNDLE_FORMAT_VERSION) {
      throw new Error(`Unsupported bundle format version: ${bundle.format_version}`);
    }

    const onConflict = options.onConflict || 'skip';
    const results = { imported: 0, skipped: 0, errors: 0, details: [] };

    for (const record of bundle.resources || []) {
      const scope = options.targetScope || record._exportScope || record.scope || 'site';
      // Map scope names: global -> skip (can't import to global), site/tenant -> keep
      if (scope === 'global') {
        results.skipped++;
        results.details.push({ resourceId: record.resource_id, status: 'skipped', reason: 'cannot_import_to_global' });
        continue;
      }

      try {
        // Check for existing
        const existing = await this.store.getRecord(record.resource_id, scope);
        if (existing && onConflict === 'skip') {
          results.skipped++;
          results.details.push({ resourceId: record.resource_id, status: 'skipped', reason: 'already_exists' });
          continue;
        }

        if (options.dryRun) {
          results.imported++;
          results.details.push({ resourceId: record.resource_id, status: 'would_import', scope });
          continue;
        }

        // Import binary asset if present
        if (record._assetKey && bundle.assets?.[record._assetKey]) {
          const asset = bundle.assets[record._assetKey];
          const buffer = Buffer.from(asset.data, 'base64');
          const storageUri = await this.store.saveAsset(buffer, asset.filename, scope);
          record.storage_uri = storageUri;
        }

        // Clean up export-only fields
        const cleanRecord = { ...record };
        delete cleanRecord._exportScope;
        delete cleanRecord._assetKey;
        delete cleanRecord._filePath;
        cleanRecord.scope = scope;
        cleanRecord.updated_at = new Date().toISOString();
        cleanRecord.updated_by = 'import-service';

        await this.store.saveRecord(cleanRecord, scope);

        if (this.auditLog) {
          this.auditLog.log('import', record.resource_id, {
            scope,
            reason: 'bundle_import',
            after: cleanRecord
          });
        }

        results.imported++;
        results.details.push({ resourceId: record.resource_id, status: 'imported', scope });
      } catch (err) {
        results.errors++;
        results.details.push({ resourceId: record.resource_id, status: 'error', error: err.message });
      }
    }

    return results;
  }

  /**
   * Export bundle to a file
   * @param {string} outputPath
   * @param {Object} [options] - Same as exportBundle options
   * @returns {Promise<string>} Output path
   */
  async exportToFile(outputPath, options = {}) {
    const bundle = await this.exportBundle(options);
    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    await fsPromises.writeFile(outputPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
    return outputPath;
  }

  /**
   * Import bundle from a file
   * @param {string} inputPath
   * @param {Object} [options] - Same as importBundle options
   * @returns {Promise<Object>} Import results
   */
  async importFromFile(inputPath, options = {}) {
    const content = await fsPromises.readFile(inputPath, 'utf8');
    const bundle = JSON.parse(content);
    return this.importBundle(bundle, options);
  }
}

module.exports = { ExportImportService };
