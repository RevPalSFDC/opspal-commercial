#!/usr/bin/env node

/**
 * FlowStateSnapshot - Capture state before/after Flow execution for diff analysis
 *
 * @module flow-state-snapshot
 * @version 3.43.0
 * @description Captures record state and related records before/after Flow execution,
 *              compares snapshots to identify changes. Part of Runbook 7.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md (Section 3)
 * @see docs/FLOW_DIAGNOSTIC_SCRIPT_INTERFACES.md (Section 4)
 *
 * @example
 * const { FlowStateSnapshot } = require('./flow-state-snapshot');
 *
 * const snapshot = new FlowStateSnapshot('gamma-corp');
 *
 * // Capture before state
 * const before = await snapshot.captureSnapshot('001xx000000XXXX');
 *
 * // ... Flow executes ...
 *
 * // Capture after state
 * const after = await snapshot.captureSnapshot('001xx000000XXXX');
 *
 * // Compare
 * const diff = await snapshot.compareSnapshots(before, after);
 * console.log('Fields changed:', diff.changedFields.length);
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Custom error class for snapshot failures
 */
class SnapshotError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SnapshotError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, SnapshotError);
  }
}

/**
 * FlowStateSnapshot - Capture and compare record state
 */
class FlowStateSnapshot {
  /**
   * Create a new FlowStateSnapshot instance
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {boolean} [options.includeRelatedRecords=true] - Include child records
   * @param {number} [options.maxDepth=2] - Max relationship depth
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new SnapshotError('orgAlias is required', 'INVALID_ARGUMENT');
    }

    this.orgAlias = orgAlias;
    this.options = {
      verbose: false,
      includeRelatedRecords: true,
      maxDepth: 2,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};
  }

  /**
   * Emit observability event
   * @private
   */
  _emitEvent(event) {
    const fullEvent = {
      ...event,
      orgAlias: this.orgAlias,
      timestamp: new Date().toISOString()
    };

    if (process.env.ENABLE_OBSERVABILITY === '1') {
      console.log(`[OBSERVABILITY] ${JSON.stringify(fullEvent)}`);
    }
  }

  /**
   * Execute SF CLI command
   * @private
   */
  _execSfCommand(command, timeout = 60000) {
    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output.trim();
    } catch (error) {
      throw new SnapshotError(
        `SF CLI command failed: ${error.message}`,
        'CLI_ERROR',
        { command }
      );
    }
  }

  /**
   * Capture snapshot of a record
   *
   * @param {string} recordId - Record ID
   * @param {object} [options] - Capture options
   * @param {Array<string>} [options.includeFields] - Specific fields to include (null = all)
   * @param {Array<string>} [options.includeRelated] - Related object relationships
   * @param {boolean} [options.includeHistory=false] - Include field history records
   * @param {string} [options.timestamp] - Custom timestamp (default: now)
   * @returns {Promise<Snapshot>} Snapshot data
   *
   * @example
   * const snapshot = await snapshot.captureSnapshot('001xx000000XXXX', {
   *   includeFields: ['Name', 'Type', 'Status__c'],
   *   includeRelated: ['Contacts', 'Opportunities']
   * });
   */
  async captureSnapshot(recordId, options = {}) {
    const startTime = Date.now();
    const snapshotId = `snap_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.log(`\n=== Capturing Snapshot: ${recordId} ===`);

    try {
      // Step 1: Determine object type
      const typeQuery = `SELECT Id, Type FROM EntityParticle WHERE Id = '${recordId}' LIMIT 1`;
      const typeCommand = `sf data query --query "${typeQuery}" --target-org ${this.orgAlias} --json --use-tooling-api`;

      let objectType;
      try {
        // Try to determine object type from ID prefix
        objectType = await this._determineObjectType(recordId);
      } catch (error) {
        this.log(`Warning: Could not determine object type: ${error.message}`);
        throw new SnapshotError(
          'Cannot determine object type for record',
          'RECORD_NOT_FOUND',
          { recordId }
        );
      }

      // Step 2: Query all fields (or specified fields)
      const fieldsToQuery = options.includeFields || ['FIELDS(ALL)'];
      const query = `SELECT ${fieldsToQuery.join(', ')} FROM ${objectType} WHERE Id = '${recordId}' LIMIT 1`;
      const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

      const output = this._execSfCommand(command);
      const data = JSON.parse(output);

      if (data.status !== 0 || !data.result?.records?.length) {
        throw new SnapshotError(
          'Record not found',
          'RECORD_NOT_FOUND',
          { recordId, objectType }
        );
      }

      const record = data.result.records[0];

      // Build snapshot
      const snapshot = {
        snapshotId,
        recordId,
        objectType,
        timestamp: options.timestamp || new Date().toISOString(),
        fields: {},
        relatedRecords: {},
        systemModstamp: record.SystemModstamp,
        lastModifiedDate: record.LastModifiedDate,
        lastModifiedBy: record.LastModifiedById
      };

      // Extract fields
      Object.entries(record).forEach(([fieldName, value]) => {
        if (fieldName === 'attributes') return;

        snapshot.fields[fieldName] = {
          value,
          dataType: typeof value,
          formula: false // Would need field describe to determine
        };
      });

      // Step 3: Capture related records (if requested)
      if (this.options.includeRelatedRecords && options.includeRelated) {
        for (const relationshipName of options.includeRelated) {
          try {
            const relatedQuery = `SELECT Id, Name FROM ${relationshipName} WHERE Id IN (SELECT ${relationshipName}Id FROM ${objectType} WHERE Id = '${recordId}') LIMIT 100`;
            const relatedCommand = `sf data query --query "${relatedQuery}" --target-org ${this.orgAlias} --json`;

            const relatedOutput = this._execSfCommand(relatedCommand);
            const relatedData = JSON.parse(relatedOutput);

            if (relatedData.status === 0 && relatedData.result?.records) {
              snapshot.relatedRecords[relationshipName] = relatedData.result.records.map(r => ({
                recordId: r.Id,
                fields: r
              }));
            }
          } catch (error) {
            this.log(`Warning: Could not capture related ${relationshipName}: ${error.message}`);
          }
        }
      }

      this._emitEvent({
        type: 'flow_state_snapshot',
        recordId,
        operation: 'capture',
        fieldsCapture: Object.keys(snapshot.fields).length,
        relatedRecords: Object.keys(snapshot.relatedRecords).length,
        duration: Date.now() - startTime
      });

      this.log(`✓ Snapshot captured: ${Object.keys(snapshot.fields).length} fields`);
      return snapshot;

    } catch (error) {
      this._emitEvent({
        type: 'flow_state_snapshot',
        recordId,
        operation: 'capture',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof SnapshotError) {
        throw error;
      }

      throw new SnapshotError(
        'Failed to capture snapshot',
        'SNAPSHOT_FAILED',
        { recordId, error: error.message }
      );
    }
  }

  /**
   * Determine object type from record ID
   * @private
   */
  async _determineObjectType(recordId) {
    // Common prefixes
    const prefixMap = {
      '001': 'Account',
      '003': 'Contact',
      '005': 'User',
      '006': 'Opportunity',
      '00Q': 'Lead',
      '500': 'Case'
    };

    const prefix = recordId.substring(0, 3);
    if (prefixMap[prefix]) {
      return prefixMap[prefix];
    }

    // Fallback: Query EntityParticle (may not work in all orgs)
    throw new SnapshotError(
      'Cannot determine object type from ID prefix',
      'UNKNOWN_OBJECT_TYPE',
      { recordId, prefix }
    );
  }

  /**
   * Compare two snapshots to identify changes
   *
   * @param {Snapshot} beforeSnapshot - "Before" snapshot
   * @param {Snapshot} afterSnapshot - "After" snapshot
   * @returns {Promise<SnapshotDiff>} Diff analysis
   *
   * @example
   * const diff = await snapshot.compareSnapshots(before, after);
   * console.log('Changed fields:', diff.changedFields);
   */
  async compareSnapshots(beforeSnapshot, afterSnapshot) {
    const startTime = Date.now();
    this.log(`\n=== Comparing Snapshots ===`);

    try {
      if (beforeSnapshot.recordId !== afterSnapshot.recordId) {
        throw new SnapshotError(
          'Cannot compare snapshots of different records',
          'SNAPSHOT_MISMATCH',
          { before: beforeSnapshot.recordId, after: afterSnapshot.recordId }
        );
      }

      const diff = {
        recordId: beforeSnapshot.recordId,
        objectType: beforeSnapshot.objectType,
        timespan: new Date(afterSnapshot.timestamp) - new Date(beforeSnapshot.timestamp),
        changedFields: [],
        relatedChanges: {},
        systemFieldsChanged: [],
        totalFieldsChanged: 0,
        totalRelatedRecordsAffected: 0
      };

      // Compare fields
      const allFields = new Set([
        ...Object.keys(beforeSnapshot.fields),
        ...Object.keys(afterSnapshot.fields)
      ]);

      for (const fieldName of allFields) {
        const before = beforeSnapshot.fields[fieldName]?.value;
        const after = afterSnapshot.fields[fieldName]?.value;

        if (JSON.stringify(before) !== JSON.stringify(after)) {
          const change = {
            fieldName,
            oldValue: before,
            newValue: after,
            dataType: afterSnapshot.fields[fieldName]?.dataType || 'unknown'
          };

          // Calculate change magnitude for numeric fields
          if (typeof before === 'number' && typeof after === 'number') {
            change.changeMagnitude = after - before;
          }

          diff.changedFields.push(change);
        }
      }

      // Compare related records
      const allRelationships = new Set([
        ...Object.keys(beforeSnapshot.relatedRecords || {}),
        ...Object.keys(afterSnapshot.relatedRecords || {})
      ]);

      for (const relationshipName of allRelationships) {
        const beforeIds = new Set(
          (beforeSnapshot.relatedRecords[relationshipName] || []).map(r => r.recordId)
        );
        const afterIds = new Set(
          (afterSnapshot.relatedRecords[relationshipName] || []).map(r => r.recordId)
        );

        diff.relatedChanges[relationshipName] = {
          created: [...afterIds].filter(id => !beforeIds.has(id)),
          updated: [], // Would need deeper comparison
          deleted: [...beforeIds].filter(id => !afterIds.has(id))
        };

        diff.totalRelatedRecordsAffected +=
          diff.relatedChanges[relationshipName].created.length +
          diff.relatedChanges[relationshipName].deleted.length;
      }

      // System fields
      const systemFields = ['SystemModstamp', 'LastModifiedDate', 'LastModifiedBy'];
      for (const field of systemFields) {
        if (beforeSnapshot[field] !== afterSnapshot[field]) {
          diff.systemFieldsChanged.push({
            fieldName: field,
            oldValue: beforeSnapshot[field],
            newValue: afterSnapshot[field]
          });
        }
      }

      diff.totalFieldsChanged = diff.changedFields.length;

      this._emitEvent({
        type: 'flow_state_snapshot',
        operation: 'compare',
        recordId: diff.recordId,
        fieldsChanged: diff.totalFieldsChanged,
        duration: Date.now() - startTime
      });

      this.log(`✓ Comparison complete: ${diff.totalFieldsChanged} fields changed`);
      return diff;

    } catch (error) {
      this._emitEvent({
        type: 'flow_state_snapshot',
        operation: 'compare',
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Generate human-readable diff report
   *
   * @param {SnapshotDiff} diff - Diff result
   * @param {object} [options] - Report options
   * @param {string} [options.format='markdown'] - Output format
   * @param {boolean} [options.includeUnchanged=false] - Show unchanged fields
   * @returns {string} Formatted report
   */
  generateDiffReport(diff, options = {}) {
    const format = options.format || 'markdown';

    if (format === 'markdown') {
      let report = `# State Change Report\n\n`;
      report += `**Record**: ${diff.objectType} (${diff.recordId})\n`;
      report += `**Timespan**: ${(diff.timespan / 1000).toFixed(1)} seconds\n`;
      report += `**Fields Changed**: ${diff.totalFieldsChanged}\n`;
      report += `**Related Records Affected**: ${diff.totalRelatedRecordsAffected}\n\n`;

      if (diff.changedFields.length > 0) {
        report += `## Changed Fields\n\n`;
        report += `| Field Name | Old Value | New Value | Type |\n`;
        report += `|------------|-----------|-----------|------|\n`;

        diff.changedFields.forEach(change => {
          report += `| ${change.fieldName} | ${change.oldValue} | ${change.newValue} | ${change.dataType} |\n`;
        });

        report += `\n`;
      }

      if (Object.keys(diff.relatedChanges).length > 0) {
        report += `## Related Records\n\n`;

        Object.entries(diff.relatedChanges).forEach(([relationshipName, changes]) => {
          if (changes.created.length > 0 || changes.deleted.length > 0) {
            report += `### ${relationshipName}\n`;

            if (changes.created.length > 0) {
              report += `- **Created**: ${changes.created.length} record(s)\n`;
            }
            if (changes.deleted.length > 0) {
              report += `- **Deleted**: ${changes.deleted.length} record(s)\n`;
            }

            report += `\n`;
          }
        });
      }

      return report;
    }

    // JSON format
    return JSON.stringify(diff, null, 2);
  }
}

// Export classes
module.exports = {
  FlowStateSnapshot,
  SnapshotError
};

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: flow-state-snapshot.js <org-alias> <operation> <record-id>');
    console.error('Operations: capture, compare');
    process.exit(1);
  }

  const orgAlias = args[0];
  const operation = args[1];
  const recordId = args[2];

  const snapshot = new FlowStateSnapshot(orgAlias, { verbose: true });

  if (operation === 'capture') {
    snapshot.captureSnapshot(recordId)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      })
      .catch(error => {
        console.error('Capture failed:', error.message);
        process.exit(1);
      });
  } else {
    console.error('Invalid operation:', operation);
    process.exit(1);
  }
}
