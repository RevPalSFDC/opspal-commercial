#!/usr/bin/env node

/**
 * Migration Runner
 *
 * Idempotent migrations that move legacy editable resources from
 * plugin-internal (update-prone) locations into persistent storage.
 * Each migration writes a receipt file to prevent re-execution.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const crypto = require('crypto');

class MigrationRunner {
  /**
   * @param {Object} options
   * @param {import('./resource-registry').ResourceRegistry} options.registry
   * @param {import('./custom-resource-store').CustomResourceStore} options.store
   * @param {import('./backup-restore').BackupRestore} options.backup
   * @param {import('./customization-audit-log').CustomizationAuditLog} options.auditLog
   * @param {string} [options.pluginRoot] - Root of opspal-core
   * @param {string} [options.receiptsDir] - Where to write migration receipts
   */
  constructor(options = {}) {
    this.registry = options.registry;
    this.store = options.store;
    this.backup = options.backup;
    this.auditLog = options.auditLog;
    this.pluginRoot = options.pluginRoot || path.resolve(__dirname, '../../..');
    this.receiptsDir = options.receiptsDir || path.join(
      process.env.HOME || '/tmp', '.claude', 'opspal', 'migrations'
    );
  }

  /**
   * Run all pending migrations
   * @param {Object} [options]
   * @param {boolean} [options.dryRun] - Preview without writing
   * @returns {Promise<Array<{id: string, status: string, details: Object}>>}
   */
  async runAll(options = {}) {
    const migrations = [
      { id: '001_flow_custom_templates', fn: () => this._migrate001FlowCustomTemplates(options) }
    ];

    const results = [];

    for (const migration of migrations) {
      if (await this._hasMigrated(migration.id)) {
        results.push({ id: migration.id, status: 'skipped', details: { reason: 'already_migrated' } });
        continue;
      }

      try {
        // Auto-backup before migration
        if (!options.dryRun && this.backup) {
          await this.backup.autoBackupBeforeMigration(migration.id);
        }

        const details = await migration.fn();

        if (!options.dryRun) {
          await this._writeReceipt(migration.id);
        }

        results.push({ id: migration.id, status: options.dryRun ? 'dry_run' : 'completed', details });
      } catch (err) {
        results.push({ id: migration.id, status: 'failed', details: { error: err.message } });
      }
    }

    return results;
  }

  // ── Migration: 001 — Flow custom templates ─────────────────────────

  /**
   * Migrate custom Flow templates from opspal-salesforce/templates/custom/
   * into site-scoped custom resources.
   */
  async _migrate001FlowCustomTemplates(options = {}) {
    // Look for opspal-salesforce in sibling plugin locations
    const sfPluginPaths = [
      path.resolve(this.pluginRoot, '..', 'opspal-salesforce'),
      path.resolve(this.pluginRoot, '..', '..', 'opspal-salesforce')
    ];

    let customDir = null;
    for (const sfRoot of sfPluginPaths) {
      const candidate = path.join(sfRoot, 'templates', 'custom');
      if (fs.existsSync(candidate)) {
        customDir = candidate;
        break;
      }
    }

    if (!customDir) {
      return { migrated: 0, reason: 'no_custom_templates_dir_found' };
    }

    let files;
    try {
      files = (await fsPromises.readdir(customDir)).filter(f => f.endsWith('.json'));
    } catch {
      return { migrated: 0, reason: 'cannot_read_directory' };
    }

    if (files.length === 0) {
      return { migrated: 0, reason: 'no_custom_templates' };
    }

    let migrated = 0;
    const details = [];

    for (const file of files) {
      const filePath = path.join(customDir, file);
      const templateName = file.replace('.json', '');
      const resourceId = `template:flow:${templateName}`;

      // Skip if already exists in store
      const existing = await this.store.getRecord(resourceId, 'site');
      if (existing) {
        details.push({ file, status: 'skipped', reason: 'already_exists' });
        continue;
      }

      if (options.dryRun) {
        details.push({ file, status: 'would_migrate' });
        migrated++;
        continue;
      }

      try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(content);
        const checksum = 'sha256:' + crypto.createHash('sha256').update(content, 'utf8').digest('hex');

        const record = {
          resource_id: resourceId,
          resource_type: 'template',
          scope: 'site',
          source_type: 'custom',
          source_resource_id: null,
          source_version: null,
          source_checksum: null,
          schema_version: '1',
          status: 'published',
          title: parsed.name || templateName,
          content: parsed,
          storage_uri: null,
          metadata: {
            subType: 'flow',
            fileType: 'json',
            category: parsed.category || 'custom',
            migratedFrom: filePath
          },
          checksum,
          created_by: 'migration-runner',
          updated_by: 'migration-runner'
        };

        await this.store.saveRecord(record, 'site');

        if (this.auditLog) {
          this.auditLog.log('migrate', resourceId, {
            scope: 'site',
            reason: 'migrate_001_flow_custom_templates',
            after: record
          });
        }

        details.push({ file, status: 'migrated', resourceId });
        migrated++;
      } catch (err) {
        details.push({ file, status: 'error', error: err.message });
      }
    }

    return { migrated, total: files.length, details };
  }

  // ── Receipt management ─────────────────────────────────────────────

  async _hasMigrated(migrationId) {
    const receiptPath = path.join(this.receiptsDir, `${migrationId}.done`);
    return fs.existsSync(receiptPath);
  }

  async _writeReceipt(migrationId) {
    await fsPromises.mkdir(this.receiptsDir, { recursive: true });
    const receiptPath = path.join(this.receiptsDir, `${migrationId}.done`);
    const receipt = {
      migration_id: migrationId,
      completed_at: new Date().toISOString(),
      plugin_version: this.registry?.getPluginVersion() || 'unknown'
    };
    await fsPromises.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  }
}

module.exports = { MigrationRunner };
