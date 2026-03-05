#!/usr/bin/env node

/**
 * Bulk Operations Audit Logger
 *
 * JSONL per-record audit trail with error categorization.
 * Logs every record operation with before/after state for compliance.
 *
 * Storage: orgs/{org-slug}/platforms/salesforce/{instance}/audit/bulkops/logs/
 *
 * @module bulkops-audit-logger
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');

// Error categories for structured classification
const ERROR_CATEGORIES = {
  VALIDATION_RULE: 'validation_rule',
  FLS: 'field_level_security',
  REQUIRED_FIELD: 'required_field_missing',
  GOVERNOR_LIMIT: 'governor_limit',
  DUPLICATE_RULE: 'duplicate_rule',
  TRIGGER_ERROR: 'trigger_error',
  LOOKUP_FILTER: 'lookup_filter',
  DATA_TYPE: 'data_type_mismatch',
  RECORD_LOCKED: 'record_locked',
  SHARING_RULE: 'sharing_rule',
  UNKNOWN: 'unknown',
};

function categorizeError(errorMessage) {
  if (!errorMessage) return ERROR_CATEGORIES.UNKNOWN;
  const msg = errorMessage.toLowerCase();

  if (msg.includes('validation') || msg.includes('formula')) return ERROR_CATEGORIES.VALIDATION_RULE;
  if (msg.includes('field-level security') || msg.includes('fls') || msg.includes('insufficient access'))
    return ERROR_CATEGORIES.FLS;
  if (msg.includes('required field') || msg.includes('missing required')) return ERROR_CATEGORIES.REQUIRED_FIELD;
  if (msg.includes('governor') || msg.includes('too many')) return ERROR_CATEGORIES.GOVERNOR_LIMIT;
  if (msg.includes('duplicate')) return ERROR_CATEGORIES.DUPLICATE_RULE;
  if (msg.includes('trigger') || msg.includes('apex')) return ERROR_CATEGORIES.TRIGGER_ERROR;
  if (msg.includes('lookup filter')) return ERROR_CATEGORIES.LOOKUP_FILTER;
  if (msg.includes('invalid') && (msg.includes('type') || msg.includes('format')))
    return ERROR_CATEGORIES.DATA_TYPE;
  if (msg.includes('locked') || msg.includes('in use')) return ERROR_CATEGORIES.RECORD_LOCKED;
  if (msg.includes('sharing') || msg.includes('access')) return ERROR_CATEGORIES.SHARING_RULE;

  return ERROR_CATEGORIES.UNKNOWN;
}

class AuditLogger {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || 'default';
    this.instance = options.instance || process.env.SF_TARGET_ORG || 'default';
    this._stream = null;
    this._operationId = null;
  }

  getLogDir() {
    return path.join(
      this.baseDir, 'orgs', this.orgSlug,
      'platforms', 'salesforce', this.instance,
      'audit', 'bulkops', 'logs'
    );
  }

  /**
   * Start logging for an operation
   */
  start(operationId) {
    this._operationId = operationId;
    const dir = this.getLogDir();
    fs.mkdirSync(dir, { recursive: true });

    const logPath = path.join(dir, `${operationId}.jsonl`);
    this._stream = fs.createWriteStream(logPath, { flags: 'a' });

    this._write({
      type: 'operation_start',
      operationId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log a successful record operation
   */
  logSuccess(recordId, data = {}) {
    this._write({
      type: 'record_success',
      operationId: this._operationId,
      recordId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Log a failed record operation with error categorization
   */
  logFailure(recordId, error, data = {}) {
    this._write({
      type: 'record_failure',
      operationId: this._operationId,
      recordId,
      error: typeof error === 'string' ? error : error.message,
      errorCategory: categorizeError(typeof error === 'string' ? error : error.message),
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Log batch completion
   */
  logBatchComplete(batchIndex, stats) {
    this._write({
      type: 'batch_complete',
      operationId: this._operationId,
      batchIndex,
      timestamp: new Date().toISOString(),
      ...stats,
    });
  }

  /**
   * Log validation result
   */
  logValidation(batchIndex, validation) {
    this._write({
      type: 'validation_result',
      operationId: this._operationId,
      batchIndex,
      timestamp: new Date().toISOString(),
      ...validation,
    });
  }

  /**
   * End logging for an operation
   */
  end(summary = {}) {
    this._write({
      type: 'operation_end',
      operationId: this._operationId,
      timestamp: new Date().toISOString(),
      ...summary,
    });

    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }

  /**
   * Read audit log for an operation
   */
  readLog(operationId) {
    const logPath = path.join(this.getLogDir(), `${operationId}.jsonl`);
    if (!fs.existsSync(logPath)) return [];

    return fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
  }

  /**
   * Generate error summary from audit log
   */
  getErrorSummary(operationId) {
    const entries = this.readLog(operationId);
    const failures = entries.filter(e => e.type === 'record_failure');

    const byCategory = {};
    for (const f of failures) {
      const cat = f.errorCategory || 'unknown';
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, samples: [] };
      }
      byCategory[cat].count++;
      if (byCategory[cat].samples.length < 3) {
        byCategory[cat].samples.push({
          recordId: f.recordId,
          error: f.error,
        });
      }
    }

    return {
      totalFailures: failures.length,
      categories: byCategory,
    };
  }

  _write(entry) {
    const line = JSON.stringify(entry) + '\n';
    if (this._stream) {
      this._stream.write(line);
    }
  }
}

module.exports = { AuditLogger, categorizeError, ERROR_CATEGORIES };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const operationId = args[1];

  if (cmd === 'summary' && operationId) {
    const logger = new AuditLogger();
    const summary = logger.getErrorSummary(operationId);
    console.log(JSON.stringify(summary, null, 2));
  } else if (cmd === 'read' && operationId) {
    const logger = new AuditLogger();
    const entries = logger.readLog(operationId);
    for (const entry of entries) {
      console.log(JSON.stringify(entry));
    }
  } else {
    console.log('Usage: bulkops-audit-logger.js <summary|read> <operationId>');
  }
}
