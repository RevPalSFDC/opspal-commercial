#!/usr/bin/env node

/**
 * Report Archive Manager
 *
 * Archives report metadata before deletion for potential recovery.
 * Stores versioned definitions in the org's report directory.
 *
 * Usage:
 *   const { ReportArchiveManager } = require('./report-archive-manager');
 *   const archive = new ReportArchiveManager({ orgSlug: 'acme', instance: 'production' });
 *
 *   // Archive before delete
 *   const archived = await archive.archive(reportId, metadata);
 *
 *   // List archives
 *   const archives = archive.list();
 *
 *   // Restore
 *   const restored = archive.get(archiveId);
 *
 * @module report-archive-manager
 */

const fs = require('fs');
const path = require('path');

class ReportArchiveManager {
  constructor(options = {}) {
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || 'default';
    this.instance = options.instance || process.env.SF_INSTANCE || 'production';
    this.verbose = options.verbose || false;
    this._counter = 0; // Monotonic counter for filename uniqueness

    // Base path for archives
    this.basePath = options.basePath || path.join(
      process.cwd(),
      'orgs', this.orgSlug,
      'platforms', 'salesforce', this.instance,
      'reports'
    );

    this.archivePath = path.join(this.basePath, 'archive');
    this.definitionsPath = path.join(this.basePath, 'definitions');
  }

  /**
   * Archive report metadata before deletion
   *
   * @param {string} reportId - Salesforce report ID
   * @param {Object} metadata - Full report metadata to archive
   * @param {Object} context - Additional context (reason, user, etc.)
   * @returns {{ archiveId: string, path: string, timestamp: string }}
   */
  async archive(reportId, metadata, context = {}) {
    this._ensureDir(this.archivePath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const seq = String(this._counter++).padStart(4, '0');
    const archiveId = `${reportId}-${timestamp}-${seq}`;
    const filePath = path.join(this.archivePath, `${archiveId}.json`);

    const archiveEntry = {
      archiveId,
      reportId,
      timestamp: new Date().toISOString(),
      reason: context.reason || 'pre-deletion archive',
      archivedBy: context.user || process.env.USER || 'system',
      metadata
    };

    fs.writeFileSync(filePath, JSON.stringify(archiveEntry, null, 2));

    if (this.verbose) {
      console.log(`Archived report ${reportId} to ${filePath}`);
    }

    return { archiveId, path: filePath, timestamp: archiveEntry.timestamp };
  }

  /**
   * Store a versioned report definition (for CREATE/UPDATE tracking)
   *
   * @param {string} reportId - Salesforce report ID
   * @param {Object} plan - ReportPlan
   * @param {string} operation - 'create', 'update', 'clone'
   */
  storeDefinition(reportId, plan, operation = 'create') {
    this._ensureDir(this.definitionsPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const seq = String(this._counter++).padStart(4, '0');
    const filePath = path.join(this.definitionsPath, `${reportId}-${timestamp}-${seq}.json`);

    const entry = {
      reportId,
      operation,
      timestamp: new Date().toISOString(),
      plan
    };

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
    return filePath;
  }

  /**
   * List all archived reports
   */
  list() {
    if (!fs.existsSync(this.archivePath)) return [];

    return fs.readdirSync(this.archivePath)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.archivePath, f), 'utf8'));
          return {
            archiveId: data.archiveId,
            reportId: data.reportId,
            timestamp: data.timestamp,
            reason: data.reason
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get a specific archive entry
   */
  get(archiveId) {
    const filePath = path.join(this.archivePath, `${archiveId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  /**
   * Get version history for a specific report
   */
  getHistory(reportId) {
    if (!fs.existsSync(this.definitionsPath)) return [];

    return fs.readdirSync(this.definitionsPath)
      .filter(f => f.startsWith(reportId) && f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.definitionsPath, f), 'utf8'));
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Prune old archives (keep most recent N per report)
   */
  prune(keepPerReport = 5) {
    const archives = this.list();
    const byReport = {};

    for (const a of archives) {
      if (!byReport[a.reportId]) byReport[a.reportId] = [];
      byReport[a.reportId].push(a);
    }

    let pruned = 0;
    for (const [reportId, entries] of Object.entries(byReport)) {
      if (entries.length > keepPerReport) {
        const toRemove = entries.slice(keepPerReport);
        for (const entry of toRemove) {
          const filePath = path.join(this.archivePath, `${entry.archiveId}.json`);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            pruned++;
          }
        }
      }
    }

    return pruned;
  }

  _ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const orgFlag = args.indexOf('--org');
  const orgSlug = orgFlag >= 0 ? args[orgFlag + 1] : process.env.ORG_SLUG;
  const instanceFlag = args.indexOf('--instance');
  const instance = instanceFlag >= 0 ? args[instanceFlag + 1] : 'production';

  const archive = new ReportArchiveManager({ orgSlug, instance, verbose: true });

  if (command === 'list') {
    const archives = archive.list();
    console.log(`\n=== Report Archives (${archives.length}) ===`);
    archives.forEach(a => {
      console.log(`  ${a.archiveId} | ${a.timestamp} | ${a.reason}`);
    });
  } else if (command === 'get') {
    const archiveId = args[1];
    if (!archiveId) {
      console.error('Usage: node report-archive-manager.js get <archiveId>');
      process.exit(1);
    }
    const entry = archive.get(archiveId);
    if (entry) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.error(`Archive not found: ${archiveId}`);
      process.exit(1);
    }
  } else if (command === 'history') {
    const reportId = args[1];
    if (!reportId) {
      console.error('Usage: node report-archive-manager.js history <reportId>');
      process.exit(1);
    }
    const history = archive.getHistory(reportId);
    console.log(`\n=== Version History for ${reportId} (${history.length} versions) ===`);
    history.forEach(h => {
      console.log(`  ${h.timestamp} | ${h.operation}`);
    });
  } else if (command === 'prune') {
    const keep = parseInt(args[1]) || 5;
    const pruned = archive.prune(keep);
    console.log(`Pruned ${pruned} old archive(s). Keeping ${keep} per report.`);
  } else {
    console.log('Report Archive Manager');
    console.log('Usage:');
    console.log('  node report-archive-manager.js list --org <slug>');
    console.log('  node report-archive-manager.js get <archiveId>');
    console.log('  node report-archive-manager.js history <reportId>');
    console.log('  node report-archive-manager.js prune [keep=5]');
  }
}

module.exports = { ReportArchiveManager };
