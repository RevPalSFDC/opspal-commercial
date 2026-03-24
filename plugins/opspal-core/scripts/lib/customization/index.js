#!/usr/bin/env node

/**
 * Customization Framework — Public API
 *
 * Re-exports all framework components and provides a factory function
 * that wires everything together.
 *
 * Usage:
 *   const { createCustomizationLayer } = require('./customization');
 *   const layer = await createCustomizationLayer({ orgSlug: 'acme' });
 *   const palette = await layer.resolver.resolveColorPalette();
 *
 * @version 1.0.0
 */

'use strict';

const path = require('path');

const { CustomizationAuditLog } = require('./customization-audit-log');
const { ResourceRegistry } = require('./resource-registry');
const { CustomResourceStore } = require('./custom-resource-store');
const { ResourceResolver } = require('./resource-resolver');
const { SourceLineageTracker } = require('./source-lineage-tracker');
const { BackupRestore } = require('./backup-restore');
const { MigrationRunner } = require('./migration-runner');
const { UpstreamDiffService } = require('./upstream-diff-service');
const { ExportImportService } = require('./export-import-service');
const { AdminHandlers } = require('./admin-handlers');

/**
 * Factory function that creates and wires the entire customization layer.
 *
 * @param {Object} [options]
 * @param {string} [options.pluginRoot] - Root of opspal-core plugin
 * @param {string} [options.orgSlug] - Current org slug for tenant scope
 * @param {string} [options.projectRoot] - Project working directory
 * @param {string} [options.globalDir] - Override for site-scoped storage
 * @returns {Promise<{
 *   registry: ResourceRegistry,
 *   store: CustomResourceStore,
 *   resolver: ResourceResolver,
 *   lineage: SourceLineageTracker,
 *   backup: BackupRestore,
 *   migration: MigrationRunner,
 *   diff: UpstreamDiffService,
 *   exportImport: ExportImportService,
 *   admin: AdminHandlers,
 *   auditLog: CustomizationAuditLog
 * }>}
 */
async function createCustomizationLayer(options = {}) {
  const pluginRoot = options.pluginRoot || path.resolve(__dirname, '../../..');
  const orgSlug = options.orgSlug || process.env.ORG_SLUG || null;

  // Audit log
  const auditLog = new CustomizationAuditLog();

  // Registry (packaged defaults)
  const registry = new ResourceRegistry({ pluginRoot });
  await registry.load();

  // Store (persistent custom resources)
  const store = new CustomResourceStore({
    globalDir: options.globalDir
  });
  if (orgSlug) {
    store.setOrg(orgSlug, options.projectRoot);
  }
  await store.ensureDirectories();

  // Resolver
  const resolver = new ResourceResolver({ registry, store, orgSlug });

  // Lineage tracker
  const lineage = new SourceLineageTracker({ registry, store });

  // Backup/Restore
  const backup = new BackupRestore({ store });

  // Migration runner
  const migration = new MigrationRunner({
    registry, store, backup, auditLog, pluginRoot
  });

  // Diff service
  const diff = new UpstreamDiffService({ registry });

  // Export/Import
  const exportImport = new ExportImportService({ store, registry, auditLog });

  // Admin handlers (public API)
  const admin = new AdminHandlers({
    resolver, store, registry, lineage, diff, exportImport, backup, migration, auditLog
  });

  return {
    registry,
    store,
    resolver,
    lineage,
    backup,
    migration,
    diff,
    exportImport,
    admin,
    auditLog
  };
}

module.exports = {
  createCustomizationLayer,
  CustomizationAuditLog,
  ResourceRegistry,
  CustomResourceStore,
  ResourceResolver,
  SourceLineageTracker,
  BackupRestore,
  MigrationRunner,
  UpstreamDiffService,
  ExportImportService,
  AdminHandlers
};
