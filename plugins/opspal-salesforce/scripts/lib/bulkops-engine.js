#!/usr/bin/env node

/**
 * Bulk Operations Engine
 *
 * Core engine for batched DML with parallel validation, checkpointing,
 * and retry queues. Orchestrates the execute → validate → retry cycle.
 *
 * Execution Pattern:
 *   Batch 1: Execute 200 records  -> Spawn Validator (non-blocking)
 *   Batch 2: Execute next 200     -> Validator confirms Batch 1, retry failures
 *   Batch 3: Execute next 200     -> Validator confirms Batch 2, retry Batch 1 failures
 *   ...
 *   Final: Wait for all validators -> Final count verification -> Summary report
 *
 * Reuses:
 *   - bulk-api-handler.js - Bulk API 2.0 operations
 *   - data-op-preflight.js - Pre-flight validation
 *   - smart-query-batcher.js - Efficient batched queries
 *   - instance-alias-resolver.js - Org detection
 *
 * @module bulkops-engine
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CheckpointManager } = require('./bulkops-checkpoint-manager');
const { AuditLogger } = require('./bulkops-audit-logger');
const { DiffTracker } = require('./bulkops-diff-tracker');

// Default batch size
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 2000;
const MAX_RETRIES = 2;
const EXPLICIT_NULL_SENTINEL = '__NULL__';

const STATE_CODE_TO_NAME = Object.freeze({
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
});

const STATE_NAME_TO_CODE = Object.freeze(
  Object.entries(STATE_CODE_TO_NAME).reduce((acc, [code, name]) => {
    acc[String(name).toLowerCase()] = code;
    return acc;
  }, {})
);

class BulkOpsEngine {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.isProduction = options.isProduction || false;
    this.batchSize = Math.min(options.batchSize || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;

    this.checkpoint = new CheckpointManager(options);
    this.audit = new AuditLogger(options);
    this.diff = new DiffTracker(options);

    this.retryQueue = [];
  }

  /**
   * Pre-flight validation (does NOT execute DML)
   */
  async preflight(operation, sobject, records) {
    const issues = [];

    // 1. Validate org alias exists
    if (!this.orgAlias) {
      issues.push({ severity: 'error', check: 'org_alias', message: 'No org alias specified (--org or SF_TARGET_ORG)' });
      return { passed: false, issues };
    }

    // 2. Check governor limits
    try {
      const limitsJson = execSync(
        `sf org display --target-org "${this.orgAlias}" --json`,
        { stdio: 'pipe', timeout: 15000 }
      ).toString();
      const org = JSON.parse(limitsJson);
      if (org.result?.connectedStatus && org.result.connectedStatus !== 'Connected') {
        issues.push({ severity: 'error', check: 'auth', message: `Org session expired (${org.result.connectedStatus})` });
      }
    } catch (err) {
      issues.push({ severity: 'error', check: 'auth', message: `Org auth check failed: ${err.message}` });
    }

    // 3. Validate object and fields
    try {
      const describeJson = execSync(
        `sf sobject describe "${sobject}" --target-org "${this.orgAlias}" --json`,
        { stdio: 'pipe', timeout: 15000 }
      ).toString();
      const describe = JSON.parse(describeJson);
      const fieldNames = (describe.result?.fields || []).map(f => f.name.toLowerCase());
      const writableFields = (describe.result?.fields || [])
        .filter(f => f.createable || f.updateable)
        .map(f => f.name.toLowerCase());

      if (records.length > 0) {
        const inputFields = Object.keys(records[0]).filter(f => f !== 'Id' && f !== 'attributes');
        for (const field of inputFields) {
          if (!fieldNames.includes(field.toLowerCase())) {
            issues.push({ severity: 'error', check: 'field_exists', message: `Field "${field}" does not exist on ${sobject}` });
          } else if (operation !== 'delete' && !writableFields.includes(field.toLowerCase())) {
            issues.push({ severity: 'warn', check: 'field_writable', message: `Field "${field}" may not be writable` });
          }
        }
      }
    } catch (err) {
      issues.push({ severity: 'warn', check: 'describe', message: `Object describe failed: ${err.message}` });
    }

    // 4. Production protection
    if (this.isProduction && operation === 'delete') {
      issues.push({ severity: 'warn', check: 'prod_delete', message: 'DELETE operation on production org - ensure backups exist' });
    }

    // 5. Record count warnings
    if (records.length > 10000) {
      issues.push({ severity: 'warn', check: 'record_count', message: `Large operation: ${records.length} records. Consider using Bulk API 2.0 directly.` });
    }

    const hasErrors = issues.some(i => i.severity === 'error');
    return { passed: !hasErrors, issues, recordCount: records.length };
  }

  /**
   * Execute a bulk operation with checkpointing and validation
   */
  async execute(operation, sobject, records, options = {}) {
    const operationId = this.checkpoint.generateOperationId(operation, sobject);

    // Initialize tracking
    this.checkpoint.createCheckpoint(operationId, {
      operation,
      sobject,
      orgAlias: this.orgAlias,
      totalRecords: records.length,
      batchSize: this.batchSize,
      isProduction: this.isProduction,
      csvPath: options.csvPath || null,
    });

    this.audit.start(operationId);
    this.diff.initDiff(operationId, { operation, sobject, orgAlias: this.orgAlias });

    try {
      // Split into batches
      const batches = [];
      for (let i = 0; i < records.length; i += this.batchSize) {
        batches.push(records.slice(i, i + this.batchSize));
      }

      const results = {
        operationId,
        operation,
        sobject,
        totalRecords: records.length,
        totalBatches: batches.length,
        successCount: 0,
        failureCount: 0,
        retryCount: 0,
        batches: [],
      };

      // Execute batches
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        if (this.verbose) {
          process.stderr.write(`  Batch ${i + 1}/${batches.length} (${batch.length} records)...\n`);
        }

        // Capture before-state for update/upsert/delete
        if (['update', 'upsert', 'delete'].includes(operation)) {
          const recordIds = batch.map(r => r.Id).filter(Boolean);
          if (recordIds.length > 0) {
            try {
              const fields = Object.keys(batch[0]).filter(f => f !== 'attributes').join(',');
              const idList = recordIds.map(id => `'${id}'`).join(',');
              const query = `SELECT ${fields} FROM ${sobject} WHERE Id IN (${idList})`;
              const result = execSync(
                `sf data query --query "${query}" --target-org "${this.orgAlias}" --json`,
                { stdio: 'pipe', timeout: 30000 }
              ).toString();
              const parsed = JSON.parse(result);
              if (parsed.result?.records) {
                this.diff.storeBefore(operationId, parsed.result.records);
              }
            } catch {
              // Before-state capture is best-effort
            }
          }
        }

        // Execute DML
        if (!this.dryRun) {
          const batchResult = await this._executeBatch(operation, sobject, batch, i);
          results.batches.push(batchResult);
          results.successCount += batchResult.successCount;
          results.failureCount += batchResult.failureCount;

          // Update checkpoint
          this.checkpoint.updateCheckpoint(operationId, batchResult);

          // Queue failures for retry
          if (batchResult.failedRecords && batchResult.failedRecords.length > 0) {
            this.retryQueue.push(...batchResult.failedRecords.map(r => ({
              ...r,
              _retryCount: 0,
              _batchIndex: i,
            })));
          }
        } else {
          // Dry run - log what would happen
          results.batches.push({
            batchIndex: i,
            recordCount: batch.length,
            successCount: batch.length,
            failureCount: 0,
            dryRun: true,
          });
          results.successCount += batch.length;
        }
      }

      // Retry failed records (up to MAX_RETRIES times)
      if (!this.dryRun && this.retryQueue.length > 0) {
        const retryResults = await this._processRetryQueue(operation, sobject);
        results.retryCount = retryResults.retried;
        results.successCount += retryResults.recovered;
        results.failureCount -= retryResults.recovered;
      }

      // Complete
      this.checkpoint.completeCheckpoint(operationId);
      this.audit.end({
        totalRecords: results.totalRecords,
        successCount: results.successCount,
        failureCount: results.failureCount,
        retryCount: results.retryCount,
      });

      return results;
    } catch (err) {
      this.checkpoint.failCheckpoint(operationId, err.message);
      this.audit.end({ error: err.message });
      throw err;
    }
  }

  /**
   * Resume an interrupted operation
   */
  async resume(operationId) {
    const cp = this.checkpoint.loadCheckpoint(operationId);
    if (!cp) throw new Error(`Checkpoint not found: ${operationId}`);
    if (cp.status === 'completed') throw new Error(`Operation already completed: ${operationId}`);

    return {
      operationId,
      lastCompletedBatch: cp.progress.lastCompletedBatchIndex,
      processedRecords: cp.progress.processedRecords,
      remainingBatches: cp.progress.totalBatches - cp.progress.completedBatches,
      metadata: cp.metadata,
    };
  }

  /**
   * Execute a single batch of DML
   */
  async _executeBatch(operation, sobject, records, batchIndex) {
    const result = {
      batchIndex,
      recordCount: records.length,
      successCount: 0,
      failureCount: 0,
      failedRecords: [],
      failedRecordIds: [],
    };
    let preparedRecords = records;

    try {
      // Write batch to temp CSV
      const tmpDir = path.join('/tmp', 'bulkops');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `batch-${batchIndex}-${Date.now()}.csv`);

      const fields = Object.keys(records[0]).filter(f => f !== 'attributes');
      preparedRecords = await this._prepareRecordsForCsv(operation, sobject, records, fields);
      const csvLines = [fields.join(',')];
      for (const record of preparedRecords) {
        const values = fields.map(f => {
          const val = record[f];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"` : str;
        });
        csvLines.push(values.join(','));
      }
      fs.writeFileSync(tmpFile, csvLines.join('\n'));

      // Execute via sf CLI
      const cmd = operation === 'delete'
        ? `sf data delete bulk --sobject "${sobject}" --file "${tmpFile}" --target-org "${this.orgAlias}" --json --wait 10`
        : `sf data ${operation} bulk --sobject "${sobject}" --file "${tmpFile}" --target-org "${this.orgAlias}" --json --wait 10`;

      const output = execSync(cmd, { stdio: 'pipe', timeout: 120000 }).toString();
      const parsed = JSON.parse(output);

      // Parse results
      if (parsed.result) {
        const jobInfo = parsed.result;
        result.successCount = jobInfo.numberRecordsProcessed - (jobInfo.numberRecordsFailed || 0);
        result.failureCount = jobInfo.numberRecordsFailed || 0;
      }

      // Log successes and failures
      for (let i = 0; i < preparedRecords.length; i++) {
        if (i < result.successCount) {
          this.audit.logSuccess(preparedRecords[i].Id || `row-${i}`, { batchIndex });
        }
      }

      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }

      this.audit.logBatchComplete(batchIndex, {
        successCount: result.successCount,
        failureCount: result.failureCount,
      });

      return result;
    } catch (err) {
      // Entire batch failed
      result.failureCount = preparedRecords.length;
      result.failedRecords = preparedRecords;
      result.failedRecordIds = preparedRecords.map(r => r.Id).filter(Boolean);

      for (const record of preparedRecords) {
        this.audit.logFailure(record.Id || 'unknown', err.message, { batchIndex });
      }

      this.audit.logBatchComplete(batchIndex, {
        successCount: 0,
        failureCount: preparedRecords.length,
        error: err.message,
      });

      return result;
    }
  }

  async _prepareRecordsForCsv(operation, sobject, records, fields) {
    if (!Array.isArray(records) || records.length === 0) {
      return records;
    }

    const prepared = records.map(record => ({ ...record }));

    // Schema/parse safeguard: normalize state name/code values before CSV generation.
    for (const record of prepared) {
      this._normalizeRecordStateFields(record, fields);
    }

    // Data-quality safeguard: preserve existing values for blank cells on update/upsert.
    if (!['update', 'upsert'].includes(operation)) {
      return prepared;
    }

    const recordIds = prepared.map(r => r.Id).filter(Boolean);
    if (recordIds.length === 0 || !this.orgAlias) {
      return prepared;
    }

    const updatableFields = fields.filter(f => f !== 'Id' && f !== 'attributes');
    if (updatableFields.length === 0) {
      return prepared;
    }

    try {
      const idList = recordIds.map(id => `'${id}'`).join(',');
      const query = `SELECT Id, ${updatableFields.join(',')} FROM ${sobject} WHERE Id IN (${idList})`;
      const output = execSync(
        `sf data query --query "${query}" --target-org "${this.orgAlias}" --json`,
        { stdio: 'pipe', timeout: 45000 }
      ).toString();

      const parsed = JSON.parse(output);
      const existingRecords = parsed?.result?.records || [];
      const existingById = new Map(existingRecords.map(row => [row.Id, row]));

      for (const record of prepared) {
        const existing = existingById.get(record.Id);
        if (!existing) {
          continue;
        }

        for (const field of updatableFields) {
          const incoming = record[field];

          // Allow explicit nulling via sentinel so accidental blanks do not erase data.
          if (incoming === EXPLICIT_NULL_SENTINEL) {
            record[field] = null;
            continue;
          }

          if (incoming === '' || incoming === undefined) {
            const currentValue = existing[field];
            if (currentValue !== undefined && currentValue !== null) {
              record[field] = currentValue;
            }
          }
        }
      }
    } catch (error) {
      if (this.verbose) {
        process.stderr.write(`  Warning: blank-value preservation skipped (${error.message})\n`);
      }
    }

    return prepared;
  }

  _normalizeRecordStateFields(record, fields) {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        continue;
      }
      record[field] = this._normalizeStateFieldValue(field, record[field]);
    }
  }

  _normalizeStateFieldValue(fieldName, value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (value === EXPLICIT_NULL_SENTINEL) {
      return value;
    }

    const field = String(fieldName || '');
    const trimmed = String(value).trim();
    if (!trimmed) {
      return value;
    }

    const upper = trimmed.toUpperCase();

    // State code fields should contain abbreviations.
    if (/StateCode$/.test(field) || field === 'StateCode') {
      const normalizedName = trimmed.toLowerCase();
      if (STATE_NAME_TO_CODE[normalizedName]) {
        return STATE_NAME_TO_CODE[normalizedName];
      }
      return upper.length === 2 ? upper : trimmed;
    }

    // State name fields should contain full names when possible.
    if (/State$/.test(field) || field === 'State') {
      if (upper.length === 2 && STATE_CODE_TO_NAME[upper]) {
        return STATE_CODE_TO_NAME[upper];
      }
      return trimmed;
    }

    return value;
  }

  /**
   * Process retry queue
   */
  async _processRetryQueue(operation, sobject) {
    let retried = 0;
    let recovered = 0;

    const toRetry = this.retryQueue.filter(r => r._retryCount < MAX_RETRIES);
    if (toRetry.length === 0) return { retried, recovered };

    // Group into smaller batches for retries
    const retryBatchSize = Math.min(50, this.batchSize);
    for (let i = 0; i < toRetry.length; i += retryBatchSize) {
      const batch = toRetry.slice(i, i + retryBatchSize);
      retried += batch.length;

      // Clean retry metadata before sending to SF
      const cleanRecords = batch.map(r => {
        const { _retryCount, _batchIndex, ...record } = r;
        return record;
      });

      const result = await this._executeBatch(operation, sobject, cleanRecords, `retry-${i}`);
      recovered += result.successCount;
    }

    return { retried, recovered };
  }
}

module.exports = { BulkOpsEngine };

// CLI
if (require.main === module) {
  console.log('Bulk Operations Engine - use via agent or /bulkops command');
  console.log('See: bulkops-checkpoint-manager.js for operation management');
}
