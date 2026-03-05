#!/usr/bin/env node

/**
 * Bulk Operations Diff Tracker
 *
 * Before/after value capture for rollback and diff reporting.
 * Captures current state before DML, stores for comparison and rollback.
 *
 * Storage: orgs/{org-slug}/platforms/salesforce/{instance}/audit/bulkops/diffs/
 *
 * @module bulkops-diff-tracker
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');

class DiffTracker {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || 'default';
    this.instance = options.instance || process.env.SF_TARGET_ORG || 'default';
  }

  getDiffDir() {
    return path.join(
      this.baseDir, 'orgs', this.orgSlug,
      'platforms', 'salesforce', this.instance,
      'audit', 'bulkops', 'diffs'
    );
  }

  /**
   * Create diff file for an operation
   */
  initDiff(operationId, metadata = {}) {
    const dir = this.getDiffDir();
    fs.mkdirSync(dir, { recursive: true });

    const diffData = {
      operationId,
      createdAt: new Date().toISOString(),
      metadata,
      records: {},
    };

    const filePath = path.join(dir, `${operationId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(diffData, null, 2));
    return diffData;
  }

  /**
   * Store before-state for a batch of records
   * @param {string} operationId
   * @param {Object[]} records - Array of { Id, ...fieldValues }
   */
  storeBefore(operationId, records) {
    const filePath = path.join(this.getDiffDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return;

    const diffData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const record of records) {
      if (!record.Id) continue;
      diffData.records[record.Id] = {
        before: { ...record },
        after: null,
        changed: false,
      };
    }

    fs.writeFileSync(filePath, JSON.stringify(diffData, null, 2));
  }

  /**
   * Store after-state for a batch of records
   * @param {string} operationId
   * @param {Object[]} records - Array of { Id, ...fieldValues }
   */
  storeAfter(operationId, records) {
    const filePath = path.join(this.getDiffDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return;

    const diffData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const record of records) {
      if (!record.Id || !diffData.records[record.Id]) continue;
      diffData.records[record.Id].after = { ...record };
      diffData.records[record.Id].changed = true;
    }

    fs.writeFileSync(filePath, JSON.stringify(diffData, null, 2));
  }

  /**
   * Get diff summary for an operation
   */
  getDiffSummary(operationId) {
    const filePath = path.join(this.getDiffDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const diffData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const changedFields = {};
    let changedCount = 0;

    for (const [id, diff] of Object.entries(diffData.records)) {
      if (!diff.before || !diff.after) continue;
      changedCount++;

      for (const [field, beforeVal] of Object.entries(diff.before)) {
        if (field === 'Id' || field === 'attributes') continue;
        const afterVal = diff.after[field];
        if (beforeVal !== afterVal) {
          if (!changedFields[field]) {
            changedFields[field] = { count: 0, samples: [] };
          }
          changedFields[field].count++;
          if (changedFields[field].samples.length < 3) {
            changedFields[field].samples.push({
              recordId: id,
              before: beforeVal,
              after: afterVal,
            });
          }
        }
      }
    }

    return {
      operationId,
      totalRecords: Object.keys(diffData.records).length,
      changedRecords: changedCount,
      changedFields,
    };
  }

  /**
   * Generate rollback data (CSV-ready before-state values)
   */
  generateRollbackData(operationId) {
    const filePath = path.join(this.getDiffDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return null;

    const diffData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const records = [];

    for (const [id, diff] of Object.entries(diffData.records)) {
      if (!diff.before || !diff.changed) continue;
      records.push(diff.before);
    }

    return records;
  }

  /**
   * Load full diff data for an operation
   */
  loadDiff(operationId) {
    const filePath = path.join(this.getDiffDir(), `${operationId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
}

module.exports = { DiffTracker };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const operationId = args[1];
  const tracker = new DiffTracker();

  if (cmd === 'summary' && operationId) {
    const summary = tracker.getDiffSummary(operationId);
    console.log(summary ? JSON.stringify(summary, null, 2) : 'Not found');
  } else if (cmd === 'rollback-data' && operationId) {
    const data = tracker.generateRollbackData(operationId);
    console.log(data ? JSON.stringify(data, null, 2) : 'Not found');
  } else {
    console.log('Usage: bulkops-diff-tracker.js <summary|rollback-data> <operationId>');
  }
}
