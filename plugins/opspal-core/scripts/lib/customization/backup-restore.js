#!/usr/bin/env node

/**
 * Backup & Restore
 *
 * Creates timestamped snapshots of customization data and restores
 * from them. Auto-backup is triggered before migrations.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

class BackupRestore {
  /**
   * @param {Object} options
   * @param {import('./custom-resource-store').CustomResourceStore} options.store
   * @param {string} [options.backupDir] - Base directory for backups
   */
  constructor(options = {}) {
    this.store = options.store;
    this.backupDir = options.backupDir || path.join(
      process.env.HOME || '/tmp', '.claude', 'opspal', 'backups'
    );
  }

  /**
   * Create a backup of the global customizations directory
   * @param {Object} [options]
   * @param {string} [options.label] - Human-readable label
   * @returns {Promise<string>} Path to the backup directory
   */
  async backup(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const label = options.label ? `-${options.label.replace(/[^a-zA-Z0-9-_]/g, '_')}` : '';
    const backupName = `${timestamp}${label}`;
    const backupPath = path.join(this.backupDir, backupName);

    await fsPromises.mkdir(backupPath, { recursive: true });

    const sourceDir = this.store.globalDir;

    if (fs.existsSync(sourceDir)) {
      await this._copyDir(sourceDir, path.join(backupPath, 'site'));
    }

    if (this.store.orgDir && fs.existsSync(this.store.orgDir)) {
      await this._copyDir(this.store.orgDir, path.join(backupPath, 'tenant'));
    }

    // Write backup manifest
    const manifest = {
      created_at: new Date().toISOString(),
      label: options.label || null,
      source_global: sourceDir,
      source_org: this.store.orgDir || null,
      has_site: fs.existsSync(sourceDir),
      has_tenant: !!(this.store.orgDir && fs.existsSync(this.store.orgDir))
    };
    await fsPromises.writeFile(
      path.join(backupPath, 'backup-manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );

    return backupPath;
  }

  /**
   * Restore from a backup
   * @param {string} backupPath - Path to the backup directory
   * @param {Object} [options]
   * @param {boolean} [options.dryRun] - Preview without writing
   * @returns {Promise<{restored: boolean, details: Object}>}
   */
  async restore(backupPath, options = {}) {
    const manifestPath = path.join(backupPath, 'backup-manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
    } catch {
      throw new Error(`Invalid backup: no manifest found at ${manifestPath}`);
    }

    const details = { site: false, tenant: false };

    if (manifest.has_site) {
      const siteBackup = path.join(backupPath, 'site');
      if (fs.existsSync(siteBackup)) {
        if (!options.dryRun) {
          await this._copyDir(siteBackup, this.store.globalDir);
        }
        details.site = true;
      }
    }

    if (manifest.has_tenant && this.store.orgDir) {
      const tenantBackup = path.join(backupPath, 'tenant');
      if (fs.existsSync(tenantBackup)) {
        if (!options.dryRun) {
          await this._copyDir(tenantBackup, this.store.orgDir);
        }
        details.tenant = true;
      }
    }

    return { restored: !options.dryRun, details };
  }

  /**
   * List available backups
   * @returns {Promise<Array<{path: string, label: string|null, created_at: string}>>}
   */
  async listBackups() {
    try {
      const entries = await fsPromises.readdir(this.backupDir, { withFileTypes: true });
      const backups = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const bPath = path.join(this.backupDir, entry.name);
        const manifestPath = path.join(bPath, 'backup-manifest.json');
        try {
          const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
          backups.push({
            path: bPath,
            name: entry.name,
            label: manifest.label,
            created_at: manifest.created_at,
            has_site: manifest.has_site,
            has_tenant: manifest.has_tenant
          });
        } catch {
          // Skip entries without valid manifests
        }
      }

      // Most recent first
      backups.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return backups;
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Auto-backup before a migration runs
   * @param {string} migrationId
   * @returns {Promise<string>} Backup path
   */
  async autoBackupBeforeMigration(migrationId) {
    return this.backup({ label: `pre-migration-${migrationId}` });
  }

  // ── Private ────────────────────────────────────────────────────────

  /**
   * Recursively copy a directory
   */
  async _copyDir(src, dest) {
    await fsPromises.mkdir(dest, { recursive: true });
    const entries = await fsPromises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.name.endsWith('.lock')) continue; // Skip lock files

      if (entry.isDirectory()) {
        await this._copyDir(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
  }
}

module.exports = { BackupRestore };
