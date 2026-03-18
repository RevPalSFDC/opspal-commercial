/**
 * AuditTrail - Track all decisions for compliance and analysis
 *
 * Provides comprehensive audit logging for entity matching decisions:
 * - Decision recording with full context
 * - Change tracking for record modifications
 * - Export capabilities for compliance reporting
 * - Analytics for decision patterns
 * - Integrity verification
 *
 * @module workflow/audit-trail
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Audit event types
 */
const AUDIT_EVENTS = {
  DECISION_MADE: 'DECISION_MADE',
  RECORD_MERGED: 'RECORD_MERGED',
  RECORD_SKIPPED: 'RECORD_SKIPPED',
  RECORD_FLAGGED: 'RECORD_FLAGGED',
  RECORD_DEFERRED: 'RECORD_DEFERRED',
  THRESHOLD_CHANGED: 'THRESHOLD_CHANGED',
  RULE_UPDATED: 'RULE_UPDATED',
  BATCH_PROCESSED: 'BATCH_PROCESSED',
  EXPORT_GENERATED: 'EXPORT_GENERATED',
  ERROR_OCCURRED: 'ERROR_OCCURRED'
};

/**
 * Decision actions
 */
const DECISION_ACTIONS = {
  MERGE: 'MERGE',
  SKIP: 'SKIP',
  FLAG: 'FLAG',
  DEFER: 'DEFER',
  ESCALATE: 'ESCALATE',
  MODIFY: 'MODIFY',
  AUTO_MERGE: 'AUTO_MERGE',
  AUTO_SKIP: 'AUTO_SKIP'
};

/**
 * Default retention policy (days)
 */
const DEFAULT_RETENTION_DAYS = 365;

class AuditTrail {
  /**
   * Create an AuditTrail
   *
   * @param {Object} options - Configuration options
   * @param {string} options.storagePath - Path for audit log files
   * @param {number} options.retentionDays - Days to retain logs
   * @param {boolean} options.enableIntegrityCheck - Enable hash verification
   * @param {Function} options.onAuditEvent - Callback for audit events
   */
  constructor(options = {}) {
    this.storagePath = options.storagePath || null;
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.enableIntegrityCheck = options.enableIntegrityCheck ?? true;
    this.onAuditEvent = options.onAuditEvent;

    // In-memory log storage
    this.logs = [];
    this.logIndex = new Map();  // id -> log entry

    // Statistics
    this.stats = {
      totalEvents: 0,
      byEventType: {},
      byAction: {},
      byMarket: {},
      byUser: {}
    };

    // Chain hash for integrity (each entry references previous)
    this._lastHash = this._generateHash('GENESIS');
  }

  /**
   * Log a decision event
   *
   * @param {Object} matchResult - Match result that was decided
   * @param {string} action - Decision action taken
   * @param {Object} options - Additional options
   * @returns {Object} Audit log entry
   */
  logDecision(matchResult, action, options = {}) {
    const {
      user = 'system',
      rationale = null,
      automated = false,
      reviewItemId = null,
      metadata = {}
    } = options;

    const entry = this._createEntry(AUDIT_EVENTS.DECISION_MADE, {
      matchResult: this._sanitizeMatchResult(matchResult),
      action,
      user,
      rationale,
      automated,
      reviewItemId,
      previousDecisions: this._findRelatedDecisions(matchResult),
      metadata
    });

    this._addEntry(entry);
    this._updateStats(entry);

    return entry;
  }

  /**
   * Log a record merge event
   *
   * @param {Object} mergeDetails - Merge operation details
   * @param {Object} options - Additional options
   * @returns {Object} Audit log entry
   */
  logMerge(mergeDetails, options = {}) {
    const {
      user = 'system',
      automated = false,
      metadata = {}
    } = options;

    const {
      masterId,
      survivorIds,
      mergedFields,
      originalRecords
    } = mergeDetails;

    const entry = this._createEntry(AUDIT_EVENTS.RECORD_MERGED, {
      masterId,
      survivorIds,
      mergedFields,
      originalRecords: originalRecords?.map(r => this._sanitizeRecord(r)),
      user,
      automated,
      metadata
    });

    this._addEntry(entry);
    this._updateStats(entry);

    return entry;
  }

  /**
   * Log a configuration change
   *
   * @param {string} changeType - Type of change
   * @param {Object} changeDetails - Change details
   * @param {Object} options - Additional options
   * @returns {Object} Audit log entry
   */
  logConfigChange(changeType, changeDetails, options = {}) {
    const {
      user = 'system',
      rationale = null,
      metadata = {}
    } = options;

    const eventType = changeType === 'threshold'
      ? AUDIT_EVENTS.THRESHOLD_CHANGED
      : AUDIT_EVENTS.RULE_UPDATED;

    const entry = this._createEntry(eventType, {
      changeType,
      previousValue: changeDetails.previous,
      newValue: changeDetails.current,
      affectedMarkets: changeDetails.markets || [],
      user,
      rationale,
      metadata
    });

    this._addEntry(entry);
    this._updateStats(entry);

    return entry;
  }

  /**
   * Log a batch processing event
   *
   * @param {Object} batchResults - Batch processing results
   * @param {Object} options - Additional options
   * @returns {Object} Audit log entry
   */
  logBatchProcess(batchResults, options = {}) {
    const {
      user = 'system',
      metadata = {}
    } = options;

    const entry = this._createEntry(AUDIT_EVENTS.BATCH_PROCESSED, {
      totalRecords: batchResults.totalRecords,
      matches: batchResults.matches,
      autoMerged: batchResults.autoMerged || 0,
      sentToReview: batchResults.sentToReview || 0,
      skipped: batchResults.skipped || 0,
      errors: batchResults.errors || 0,
      processingTime: batchResults.processingTime,
      user,
      metadata
    });

    this._addEntry(entry);
    this._updateStats(entry);

    return entry;
  }

  /**
   * Log an error event
   *
   * @param {Error} error - Error that occurred
   * @param {Object} context - Context where error occurred
   * @returns {Object} Audit log entry
   */
  logError(error, context = {}) {
    const entry = this._createEntry(AUDIT_EVENTS.ERROR_OCCURRED, {
      errorMessage: error.message,
      errorStack: error.stack,
      context,
      severity: context.severity || 'ERROR'
    });

    this._addEntry(entry);
    this._updateStats(entry);

    return entry;
  }

  /**
   * Get audit entry by ID
   *
   * @param {string} id - Entry ID
   * @returns {Object|null} Audit entry or null
   */
  getEntry(id) {
    return this.logIndex.get(id) || null;
  }

  /**
   * Query audit log
   *
   * @param {Object} criteria - Query criteria
   * @returns {Array} Matching entries
   */
  query(criteria = {}) {
    const {
      eventType,
      action,
      user,
      market,
      startDate,
      endDate,
      automated,
      recordId,
      limit = 100,
      offset = 0
    } = criteria;

    let results = [...this.logs];

    if (eventType) {
      results = results.filter(e => e.eventType === eventType);
    }

    if (action) {
      results = results.filter(e => e.data?.action === action);
    }

    if (user) {
      results = results.filter(e => e.data?.user === user);
    }

    if (market) {
      results = results.filter(e =>
        e.data?.matchResult?.market === market ||
        e.data?.affectedMarkets?.includes(market)
      );
    }

    if (startDate) {
      const start = new Date(startDate);
      results = results.filter(e => new Date(e.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      results = results.filter(e => new Date(e.timestamp) <= end);
    }

    if (automated !== undefined) {
      results = results.filter(e => e.data?.automated === automated);
    }

    if (recordId) {
      results = results.filter(e => {
        const mr = e.data?.matchResult;
        if (!mr) return false;
        const idA = mr.recordA?.Id || mr.recordA?.id;
        const idB = mr.recordB?.Id || mr.recordB?.id;
        return idA === recordId || idB === recordId;
      });
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return results.slice(offset, offset + limit);
  }

  /**
   * Export audit log for compliance reporting
   *
   * @param {Object} options - Export options
   * @returns {Object} Export data
   */
  exportLog(options = {}) {
    const {
      startDate,
      endDate,
      format = 'json',
      includeDetails = true
    } = options;

    const entries = this.query({ startDate, endDate, limit: Infinity });

    const exportEntry = this._createEntry(AUDIT_EVENTS.EXPORT_GENERATED, {
      entriesExported: entries.length,
      dateRange: { startDate, endDate },
      format,
      generatedBy: options.user || 'system'
    });
    this._addEntry(exportEntry);

    const exportData = {
      exportId: exportEntry.id,
      generatedAt: exportEntry.timestamp,
      dateRange: { startDate, endDate },
      totalEntries: entries.length,
      entries: includeDetails ? entries : entries.map(e => ({
        id: e.id,
        eventType: e.eventType,
        timestamp: e.timestamp,
        action: e.data?.action,
        user: e.data?.user
      })),
      statistics: this._calculateExportStats(entries),
      integrityHash: this._calculateIntegrityHash(entries)
    };

    if (format === 'csv') {
      return this._convertToCSV(exportData);
    }

    return exportData;
  }

  /**
   * Verify integrity of audit trail
   *
   * @returns {Object} Integrity verification result
   */
  verifyIntegrity() {
    if (!this.enableIntegrityCheck) {
      return { verified: false, reason: 'Integrity checking disabled' };
    }

    let expectedPrevHash = this._generateHash('GENESIS');
    const issues = [];

    for (let i = 0; i < this.logs.length; i++) {
      const entry = this.logs[i];

      // Verify chain hash
      if (entry.prevHash !== expectedPrevHash) {
        issues.push({
          index: i,
          entryId: entry.id,
          issue: 'Chain hash mismatch',
          expected: expectedPrevHash,
          actual: entry.prevHash
        });
      }

      // Verify entry hash
      const calculatedHash = this._calculateEntryHash(entry);
      if (entry.hash !== calculatedHash) {
        issues.push({
          index: i,
          entryId: entry.id,
          issue: 'Entry hash mismatch',
          expected: calculatedHash,
          actual: entry.hash
        });
      }

      expectedPrevHash = entry.hash;
    }

    return {
      verified: issues.length === 0,
      totalEntries: this.logs.length,
      issues,
      lastVerified: new Date().toISOString()
    };
  }

  /**
   * Get audit statistics
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalEntries: this.logs.length,
      oldestEntry: this.logs[0]?.timestamp || null,
      newestEntry: this.logs[this.logs.length - 1]?.timestamp || null,
      integrityStatus: this.enableIntegrityCheck ? 'ENABLED' : 'DISABLED'
    };
  }

  /**
   * Get decision history for a record
   *
   * @param {string} recordId - Record ID
   * @returns {Array} Decision history
   */
  getRecordHistory(recordId) {
    return this.query({ recordId, limit: Infinity });
  }

  /**
   * Get user activity summary
   *
   * @param {string} user - User identifier
   * @param {Object} options - Query options
   * @returns {Object} Activity summary
   */
  getUserActivity(user, options = {}) {
    const { startDate, endDate } = options;
    const entries = this.query({ user, startDate, endDate, limit: Infinity });

    const summary = {
      user,
      totalActions: entries.length,
      byEventType: {},
      byAction: {},
      byMarket: {},
      timeRange: { startDate, endDate }
    };

    for (const entry of entries) {
      // By event type
      summary.byEventType[entry.eventType] = (summary.byEventType[entry.eventType] || 0) + 1;

      // By action
      if (entry.data?.action) {
        summary.byAction[entry.data.action] = (summary.byAction[entry.data.action] || 0) + 1;
      }

      // By market
      const market = entry.data?.matchResult?.market || 'unknown';
      summary.byMarket[market] = (summary.byMarket[market] || 0) + 1;
    }

    return summary;
  }

  /**
   * Save audit trail to storage
   *
   * @param {string} [filepath] - Optional custom filepath
   * @returns {string} Path where saved
   */
  save(filepath = null) {
    const savePath = filepath || this._getStorageFilePath();
    if (!savePath) {
      throw new Error('No storage path configured');
    }

    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      stats: this.stats,
      logs: this.logs,
      lastHash: this._lastHash
    };

    fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
    return savePath;
  }

  /**
   * Load audit trail from storage
   *
   * @param {string} [filepath] - Optional custom filepath
   */
  load(filepath = null) {
    const loadPath = filepath || this._getStorageFilePath();
    if (!loadPath || !fs.existsSync(loadPath)) {
      return;
    }

    const data = JSON.parse(fs.readFileSync(loadPath, 'utf8'));

    this.logs = data.logs || [];
    this.stats = data.stats || this.stats;
    this._lastHash = data.lastHash || this._generateHash('GENESIS');

    // Rebuild index
    this.logIndex.clear();
    for (const entry of this.logs) {
      this.logIndex.set(entry.id, entry);
    }
  }

  /**
   * Clean up old entries based on retention policy
   *
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    const originalCount = this.logs.length;

    this.logs = this.logs.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      return entryTime >= cutoff;
    });

    // Rebuild index
    this.logIndex.clear();
    for (const entry of this.logs) {
      this.logIndex.set(entry.id, entry);
    }

    return originalCount - this.logs.length;
  }

  // ========== Private Methods ==========

  _createEntry(eventType, data) {
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const entry = {
      id,
      eventType,
      timestamp,
      data,
      prevHash: this._lastHash,
      hash: null  // Will be set after creation
    };

    if (this.enableIntegrityCheck) {
      entry.hash = this._calculateEntryHash(entry);
    }

    return entry;
  }

  _addEntry(entry) {
    this.logs.push(entry);
    this.logIndex.set(entry.id, entry);
    this._lastHash = entry.hash || this._generateHash(JSON.stringify(entry));

    if (this.onAuditEvent) {
      this.onAuditEvent(entry);
    }
  }

  _updateStats(entry) {
    this.stats.totalEvents++;

    // By event type
    this.stats.byEventType[entry.eventType] =
      (this.stats.byEventType[entry.eventType] || 0) + 1;

    // By action
    if (entry.data?.action) {
      this.stats.byAction[entry.data.action] =
        (this.stats.byAction[entry.data.action] || 0) + 1;
    }

    // By market
    const market = entry.data?.matchResult?.market;
    if (market) {
      this.stats.byMarket[market] = (this.stats.byMarket[market] || 0) + 1;
    }

    // By user
    if (entry.data?.user) {
      this.stats.byUser[entry.data.user] =
        (this.stats.byUser[entry.data.user] || 0) + 1;
    }
  }

  _sanitizeMatchResult(matchResult) {
    if (!matchResult) return null;

    return {
      confidence: matchResult.confidence,
      decision: matchResult.decision,
      market: matchResult.market,
      signals: matchResult.signals?.map(s => {
        if (typeof s === 'string') return s;
        return { type: s.type, weight: s.weight };
      }),
      recordA: this._sanitizeRecord(matchResult.recordA),
      recordB: this._sanitizeRecord(matchResult.recordB)
    };
  }

  _sanitizeRecord(record) {
    if (!record) return null;

    // Only keep non-sensitive fields
    const safeFields = ['Id', 'id', 'Name', 'name', 'State', 'state',
                        'City', 'city', 'Industry', 'industry'];
    const sanitized = {};

    for (const field of safeFields) {
      if (record[field] !== undefined) {
        sanitized[field] = record[field];
      }
    }

    return sanitized;
  }

  _findRelatedDecisions(matchResult) {
    if (!matchResult) return [];

    const idA = matchResult.recordA?.Id || matchResult.recordA?.id;
    const idB = matchResult.recordB?.Id || matchResult.recordB?.id;

    if (!idA && !idB) return [];

    return this.logs
      .filter(entry => {
        if (entry.eventType !== AUDIT_EVENTS.DECISION_MADE) return false;
        const mr = entry.data?.matchResult;
        if (!mr) return false;
        const entryIdA = mr.recordA?.Id || mr.recordA?.id;
        const entryIdB = mr.recordB?.Id || mr.recordB?.id;
        return entryIdA === idA || entryIdA === idB ||
               entryIdB === idA || entryIdB === idB;
      })
      .slice(-5)  // Last 5 related decisions
      .map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        action: e.data?.action,
        confidence: e.data?.matchResult?.confidence
      }));
  }

  _calculateEntryHash(entry) {
    const content = JSON.stringify({
      id: entry.id,
      eventType: entry.eventType,
      timestamp: entry.timestamp,
      data: entry.data,
      prevHash: entry.prevHash
    });
    return this._generateHash(content);
  }

  _generateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  _calculateIntegrityHash(entries) {
    const content = entries.map(e => e.hash || e.id).join('|');
    return this._generateHash(content);
  }

  _calculateExportStats(entries) {
    const stats = {
      byEventType: {},
      byAction: {},
      byMarket: {},
      byUser: {},
      automated: 0,
      manual: 0
    };

    for (const entry of entries) {
      stats.byEventType[entry.eventType] =
        (stats.byEventType[entry.eventType] || 0) + 1;

      if (entry.data?.action) {
        stats.byAction[entry.data.action] =
          (stats.byAction[entry.data.action] || 0) + 1;
      }

      const market = entry.data?.matchResult?.market || 'unknown';
      stats.byMarket[market] = (stats.byMarket[market] || 0) + 1;

      if (entry.data?.user) {
        stats.byUser[entry.data.user] =
          (stats.byUser[entry.data.user] || 0) + 1;
      }

      if (entry.data?.automated) {
        stats.automated++;
      } else {
        stats.manual++;
      }
    }

    return stats;
  }

  _getStorageFilePath() {
    if (!this.storagePath) return null;

    const date = new Date().toISOString().slice(0, 7);  // YYYY-MM
    return path.join(this.storagePath, `audit-${date}.json`);
  }

  _convertToCSV(exportData) {
    const headers = [
      'ID', 'Timestamp', 'Event Type', 'Action', 'User',
      'Confidence', 'Market', 'Automated', 'Rationale'
    ];

    const rows = exportData.entries.map(entry => [
      entry.id,
      entry.timestamp,
      entry.eventType,
      entry.data?.action || '',
      entry.data?.user || '',
      entry.data?.matchResult?.confidence || '',
      entry.data?.matchResult?.market || '',
      entry.data?.automated ? 'Yes' : 'No',
      (entry.data?.rationale || '').replace(/"/g, '""')
    ]);

    let csv = headers.join(',') + '\n';
    for (const row of rows) {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    }

    return {
      format: 'csv',
      content: csv,
      exportId: exportData.exportId,
      generatedAt: exportData.generatedAt
    };
  }
}

module.exports = {
  AuditTrail,
  AUDIT_EVENTS,
  DECISION_ACTIONS,
  DEFAULT_RETENTION_DAYS
};
