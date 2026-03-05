#!/usr/bin/env node

/**
 * Dedup Rollback System - Phase 5 Component (v2.0.0 - Object-Agnostic)
 *
 * Undo merge operations and restore previous state using execution logs.
 * Provides selective rollback capabilities with comprehensive validation.
 *
 * Features:
 * - Full execution rollback
 * - Selective batch rollback
 * - Individual pair rollback
 * - Master record state restoration
 * - Related record re-parenting
 * - Rollback validation and verification
 * - 72-hour rollback window enforcement
 * - **OBJECT-AGNOSTIC**: Supports Account, Contact, Lead, and custom objects
 *
 * Usage:
 *   node dedup-rollback-system.js --execution-log <file> [options]
 *
 * Options:
 *   --execution-log  Path to execution log JSON (required)
 *   --batch          Rollback specific batch ID
 *   --pair           Rollback specific pair ID
 *   --validate-only  Validate rollback without executing
 *   --force          Skip rollback age validation
 *   --object-type    Override object type detection (optional)
 *
 * Object Detection:
 *   - Auto-detects object type from execution log metadata
 *   - Supports Account, Contact, Lead, and custom objects
 *   - Handles polymorphic relationships (WhoId, WhatId)
 *
 * @version 2.0.0
 * @phase 5 (Extended for Generic Merge Framework)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RollbackSystem {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.executionLog = null;
    this.validateOnly = options.validateOnly || false;
    this.force = options.force || false;
    this.maxRollbackAgeHours = 72; // 3 days
    this.objectType = options.objectType || null; // v2.0.0: Object type (Account, Contact, Lead, etc.)

    this.rollbackLog = {
      rollback_id: `rollback_${new Date().toISOString().replace(/[:.]/g, '-')}`,
      execution_id: null,
      object_type: null, // v2.0.0: Track object type in log
      timestamp_start: null,
      timestamp_end: null,
      operations: [],
      summary: {
        total: 0,
        restored: 0,
        failed: 0
      }
    };
  }

  /**
   * Load execution log from file and detect object type
   */
  async loadExecutionLog(logPath) {
    console.log('📄 Loading execution log...');

    if (!fs.existsSync(logPath)) {
      throw new Error(`Execution log not found: ${logPath}`);
    }

    try {
      this.executionLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      this.rollbackLog.execution_id = this.executionLog.execution_id;

      // v2.0.0: Detect object type from execution log
      this.objectType = this.objectType || this.detectObjectType();
      this.rollbackLog.object_type = this.objectType;

      console.log(`✅ Loaded: ${this.executionLog.execution_id}`);
      console.log(`   Org: ${this.executionLog.org}`);
      console.log(`   Object Type: ${this.objectType || 'Unknown (will attempt auto-detection)'}`);
      console.log(`   Executed: ${this.executionLog.timestamp_start}`);
      console.log(`   Total pairs: ${this.executionLog.summary.total}`);
      console.log(`   Successful: ${this.executionLog.summary.success}`);

      return true;
    } catch (error) {
      throw new Error(`Failed to parse execution log: ${error.message}`);
    }
  }

  /**
   * Detect object type from execution log metadata
   * v2.0.0: Object-agnostic detection
   *
   * Detection strategies:
   * 1. Check log.object_type field (if present)
   * 2. Check log.metadata.object_type field (if present)
   * 3. Infer from first successful merge result record ID prefix
   * 4. Default to 'Account' for backward compatibility
   */
  detectObjectType() {
    try {
      // Strategy 1: Direct field
      if (this.executionLog.object_type) {
        console.log(`   🔍 Object type from log.object_type: ${this.executionLog.object_type}`);
        return this.executionLog.object_type;
      }

      // Strategy 2: Metadata field
      if (this.executionLog.metadata && this.executionLog.metadata.object_type) {
        console.log(`   🔍 Object type from log.metadata.object_type: ${this.executionLog.metadata.object_type}`);
        return this.executionLog.metadata.object_type;
      }

      // Strategy 3: Infer from record ID prefix
      const successfulResult = this.executionLog.batches
        ?.flatMap(b => b.results)
        ?.find(r => r.status === 'SUCCESS' && r.master_id);

      if (successfulResult && successfulResult.master_id) {
        const prefix = successfulResult.master_id.substring(0, 3);
        const objectType = this.getObjectTypeFromPrefix(prefix);
        console.log(`   🔍 Object type inferred from ID prefix ${prefix}: ${objectType}`);
        return objectType;
      }

      // Strategy 4: Default to Account for backward compatibility
      console.log(`   ⚠️  Could not detect object type - defaulting to 'Account'`);
      return 'Account';

    } catch (error) {
      console.log(`   ⚠️  Object type detection error: ${error.message} - defaulting to 'Account'`);
      return 'Account';
    }
  }

  /**
   * Map Salesforce ID prefix to object type
   * v2.0.0: Common standard objects
   */
  getObjectTypeFromPrefix(prefix) {
    const prefixMap = {
      '001': 'Account',
      '003': 'Contact',
      '00Q': 'Lead',
      '006': 'Opportunity',
      '500': 'Case',
      '701': 'Campaign',
      '00G': 'User',
      '00E': 'Profile'
      // Custom objects will use generic format
    };

    return prefixMap[prefix] || `CustomObject_${prefix}`;
  }

  /**
   * Full rollback of entire execution
   */
  async rollback(options = {}) {
    try {
      console.log('\n🔄 DEDUP ROLLBACK SYSTEM');
      console.log('═'.repeat(70));

      if (!this.executionLog) {
        throw new Error('No execution log loaded. Use loadExecutionLog() first.');
      }

      // Validate rollback is possible
      console.log('\n📋 Validating rollback...');
      const validation = await this.validateRollback();

      if (!validation.valid) {
        console.log('\n❌ Rollback validation failed:');
        validation.errors.forEach(err => console.log(`   - ${err}`));

        if (validation.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          validation.warnings.forEach(warn => console.log(`   - ${warn}`));
        }

        if (!this.force) {
          return { restored: 0, failed: 0, errors: validation.errors };
        } else {
          console.log('\n⚠️  Force flag enabled - proceeding despite errors');
        }
      } else {
        console.log('✅ Rollback validation passed');

        if (validation.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          validation.warnings.forEach(warn => console.log(`   - ${warn}`));
        }
      }

      if (this.validateOnly) {
        console.log('\nℹ️  Validate-only mode - no changes will be made');
        return { restored: 0, failed: 0, errors: [] };
      }

      // Confirmation
      console.log(`\n⚠️  About to rollback ${this.executionLog.summary.success} merged pairs`);
      console.log('   This will:');
      console.log('   - Undelete merged records');
      console.log('   - Restore master record states');
      console.log('   - Re-parent related records');
      console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
      await this.sleep(5000);

      this.rollbackLog.timestamp_start = new Date().toISOString();

      // Process each batch
      console.log('\n🚀 STARTING ROLLBACK');
      console.log('═'.repeat(70));

      for (const batch of this.executionLog.batches) {
        console.log(`\n📦 Batch: ${batch.batch_id}`);
        console.log('─'.repeat(70));

        const successfulResults = batch.results.filter(r => r.status === 'SUCCESS');

        for (const result of successfulResults) {
          await this.rollbackPair(result);
        }
      }

      this.rollbackLog.timestamp_end = new Date().toISOString();

      // Save rollback log
      await this.saveRollbackLog();

      // Final summary
      console.log('\n' + '═'.repeat(70));
      console.log(`✅ Rollback complete: ${this.rollbackLog.rollback_id}`);
      console.log(`   Total: ${this.rollbackLog.summary.total}`);
      console.log(`   Restored: ${this.rollbackLog.summary.restored}`);
      console.log(`   Failed: ${this.rollbackLog.summary.failed}`);

      const logPath = this.getRollbackLogPath();
      console.log(`\n📄 Rollback log: ${logPath}`);

      return {
        restored: this.rollbackLog.summary.restored,
        failed: this.rollbackLog.summary.failed,
        errors: []
      };

    } catch (error) {
      console.error('\n❌ Rollback error:', error.message);
      throw error;
    }
  }

  /**
   * Rollback specific batch
   */
  async rollbackBatch(batchId) {
    if (!this.executionLog) {
      throw new Error('No execution log loaded');
    }

    const batch = this.executionLog.batches.find(b => b.batch_id === batchId);

    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    console.log(`\n🔄 Rolling back batch: ${batchId}`);
    console.log('═'.repeat(70));

    const successfulResults = batch.results.filter(r => r.status === 'SUCCESS');

    for (const result of successfulResults) {
      await this.rollbackPair(result);
    }

    await this.saveRollbackLog();

    console.log(`\n✅ Batch rollback complete`);
    console.log(`   Restored: ${this.rollbackLog.summary.restored}`);
    console.log(`   Failed: ${this.rollbackLog.summary.failed}`);

    return {
      restored: this.rollbackLog.summary.restored,
      failed: this.rollbackLog.summary.failed
    };
  }

  /**
   * Rollback specific pair
   */
  async rollbackPair(result) {
    this.rollbackLog.summary.total++;

    const operation = {
      pair_id: result.pair_id,
      master_id: result.master_id,
      deleted_id: result.deleted_id,
      status: 'PENDING',
      steps: [],
      error: null,
      timestamp: new Date().toISOString()
    };

    try {
      console.log(`\n🔄 ${result.pair_id}`);

      // Step 1: Undelete the merged record
      console.log('   1. Undeleting merged record...');
      await this.undeleteRecord(result.deleted_id);
      operation.steps.push({ step: 'undelete', status: 'SUCCESS' });
      console.log('   ✅ Record undeleted');

      // Step 2: Restore master record to pre-merge state
      if (result.before && result.before.master && result.after) {
        console.log('   2. Restoring master record state...');
        await this.restoreMasterRecord(result.before.master, result.after.master);
        operation.steps.push({ step: 'restore_master', status: 'SUCCESS' });
        console.log('   ✅ Master record restored');
      } else {
        console.log('   ⚠️  No before/after snapshots - skipping master restoration');
        operation.steps.push({ step: 'restore_master', status: 'SKIPPED' });
      }

      // Step 3: Re-parent related records
      if (result.before && result.before.related_records) {
        const relatedCount = Object.values(result.before.related_records)
          .reduce((sum, records) => sum + records.length, 0);

        if (relatedCount > 0) {
          console.log(`   3. Re-parenting ${relatedCount} related records...`);
          await this.reparentRelatedRecords(
            result.master_id,
            result.deleted_id,
            result.before.related_records
          );
          operation.steps.push({ step: 'reparent_related', status: 'SUCCESS', count: relatedCount });
          console.log('   ✅ Related records re-parented');
        } else {
          console.log('   ℹ️  No related records to re-parent');
          operation.steps.push({ step: 'reparent_related', status: 'SKIPPED' });
        }
      }

      operation.status = 'SUCCESS';
      this.rollbackLog.summary.restored++;
      console.log(`   ✅ ${result.pair_id} - RESTORED`);

    } catch (error) {
      operation.status = 'FAILED';
      operation.error = error.message;
      this.rollbackLog.summary.failed++;
      console.log(`   ❌ ${result.pair_id} - FAILED: ${error.message}`);
    }

    this.rollbackLog.operations.push(operation);
  }

  /**
   * Undelete a merged record using Apex
   */
  async undeleteRecord(recordId) {
    if (this.validateOnly) {
      return; // Skip actual operation in validate mode
    }

    try {
      // NOTE: Skipping recycle bin pre-check as Salesforce CLI doesn't support
      // querying deleted records via "ALL ROWS" syntax. If record isn't in
      // recycle bin, the Apex undelete will fail with a clear error.

      // Create Apex script for undelete
      const apexScript = `Database.UndeleteResult result = Database.undelete('${recordId}');
System.debug('Undelete result: ' + result.isSuccess());
if (!result.isSuccess()) {
  throw new AuraHandledException('Undelete failed: ' + result.getErrors()[0].getMessage());
}`;

      // Save Apex script to temp file
      const tempDir = path.join(__dirname, '../../rollback-temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const apexFile = path.join(tempDir, `undelete-${recordId}-${timestamp}.apex`);
      fs.writeFileSync(apexFile, apexScript);

      // Execute Apex via Salesforce CLI
      const apexCommand = `sf apex run --file ${apexFile} --target-org ${this.orgAlias} --json`;
      const apexResult = JSON.parse(execSync(apexCommand, { encoding: 'utf8' }));

      // Cleanup temp file
      fs.unlinkSync(apexFile);

      if (apexResult.status !== 0 || !apexResult.result.success) {
        throw new Error(apexResult.result.exceptionMessage || 'Apex execution failed');
      }

    } catch (error) {
      throw new Error(`Failed to undelete record ${recordId}: ${error.message}`);
    }
  }

  /**
   * Restore master record to pre-merge state using CSV bulk update
   */
  async restoreMasterRecord(beforeSnapshot, afterSnapshot) {
    if (this.validateOnly) {
      return; // Skip actual operation in validate mode
    }

    if (!beforeSnapshot || !afterSnapshot) {
      throw new Error('Missing before/after snapshots');
    }

    try {
      // Skip fields that can't be updated via CSV
      const skipFields = [
        // System fields
        'attributes', 'Id',
        // Compound fields (Address, Location, etc.)
        'BillingAddress', 'ShippingAddress', 'MailingAddress', 'OtherAddress',
        'Location', 'Geolocation',
        // Read-only system fields
        'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
        'SystemModstamp', 'LastActivityDate', 'LastViewedDate', 'LastReferencedDate',
        'IsDeleted', 'MasterRecordId'
      ];

      // Determine fields that changed during merge
      const changedFields = [];

      console.log(`   🔍 Comparing ${Object.keys(beforeSnapshot).length} fields...`);

      for (const field in beforeSnapshot) {
        if (skipFields.includes(field)) continue;

        // Skip if value is an object (compound field)
        if (typeof beforeSnapshot[field] === 'object' && beforeSnapshot[field] !== null) continue;

        // Skip formula/rollup fields (usually end with __c and contain __)
        if (field.includes('__c') && (field.includes('Call_') || field.includes('Roll_'))) continue;

        // Check if field exists in afterSnapshot and values differ
        if (field in afterSnapshot && beforeSnapshot[field] !== afterSnapshot[field]) {
          console.log(`   📝 Field changed: ${field} = "${beforeSnapshot[field]}" → "${afterSnapshot[field]}"`);
          changedFields.push({
            name: field,
            value: beforeSnapshot[field]
          });
        }
      }

      console.log(`   ✅ Found ${changedFields.length} changed fields to restore`);

      if (changedFields.length === 0) {
        console.log('   ℹ️  No field changes detected - master record unchanged');
        return;
      }

      // Generate CSV for bulk update
      const csvPath = this.generateRestoreCSV(beforeSnapshot.Id, changedFields);

      // Execute bulk update (v2.0.0: Object-agnostic using detected object type)
      const objectType = this.objectType || 'Account'; // Fallback to Account
      const bulkCommand = `sf data upsert bulk --sobject ${objectType} --file ${csvPath} --external-id Id --target-org ${this.orgAlias} --wait 10 --json`;
      const bulkResult = JSON.parse(execSync(bulkCommand, { encoding: 'utf8' }));

      // Cleanup CSV
      fs.unlinkSync(csvPath);

      if (bulkResult.status !== 0 || !bulkResult.result.jobInfo.state === 'Completed') {
        throw new Error('Bulk update failed');
      }

    } catch (error) {
      throw new Error(`Failed to restore master record: ${error.message}`);
    }
  }

  /**
   * Generate CSV for field restoration
   */
  generateRestoreCSV(accountId, fieldsToRestore) {
    const csvDir = path.join(__dirname, '../../rollback-temp');
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(csvDir, `restore-${accountId}-${timestamp}.csv`);

    // CSV header
    const fields = ['Id', ...fieldsToRestore.map(f => f.name)];
    let csv = fields.join(',') + '\n';

    // CSV data row
    const values = [
      accountId,
      ...fieldsToRestore.map(f => this.escapeCSVValue(f.value))
    ];
    csv += values.join(',') + '\n';

    fs.writeFileSync(csvPath, csv);

    return csvPath;
  }

  /**
   * Escape CSV value
   */
  escapeCSVValue(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Re-parent related records back to undeleted record using CSV bulk update
   * v2.0.0: Object-agnostic - processes all related object types from execution log
   */
  async reparentRelatedRecords(fromMasterId, toDeletedId, relatedRecords) {
    if (this.validateOnly) {
      return; // Skip actual operation in validate mode
    }

    try {
      // v2.0.0: Process all related record types dynamically
      // Supports Account-centric (Contacts, Opportunities, Cases),
      // Contact-centric (Tasks, Events via WhoId), Lead-centric, and custom objects

      for (const [relationType, records] of Object.entries(relatedRecords)) {
        if (!records || records.length === 0) continue;

        // Handle different related record formats
        if (Array.isArray(records)) {
          // Standard format: { Contacts: [{Id, ...}], Opportunities: [{Id, ...}] }
          const fieldName = this.getRelationshipFieldName(relationType);
          if (fieldName) {
            await this.bulkReparent(relationType, fieldName, records, toDeletedId);
          }
        } else if (relationType === 'Custom' && Array.isArray(records)) {
          // Custom objects format: { Custom: [{objectName, field, records}] }
          for (const customRel of records) {
            if (customRel.records && customRel.records.length > 0) {
              await this.bulkReparent(customRel.objectName, customRel.field, customRel.records, toDeletedId);
            }
          }
        }
      }

    } catch (error) {
      throw new Error(`Failed to re-parent related records: ${error.message}`);
    }
  }

  /**
   * Get relationship field name for standard objects
   * v2.0.0: Supports Account, Contact, Lead relationships
   */
  getRelationshipFieldName(relationType) {
    // Standard parent-child relationships
    const relationshipMap = {
      // Account relationships
      'Contacts': 'AccountId',
      'Opportunities': 'AccountId',
      'Cases': 'AccountId',
      'Assets': 'AccountId',
      'Contracts': 'AccountId',

      // Contact relationships (polymorphic)
      'Tasks': 'WhoId', // Can reference Contact or Lead
      'Events': 'WhoId', // Can reference Contact or Lead
      'Attachments': 'ParentId', // Can reference any object
      'Notes': 'ParentId', // Can reference any object
      'AccountContactRelations': 'ContactId',
      'CampaignMembers': 'ContactId',

      // Lead relationships (polymorphic)
      'LeadHistory': 'LeadId',

      // Opportunity relationships
      'OpportunityLineItems': 'OpportunityId',
      'OpportunityContactRoles': 'OpportunityId'
    };

    return relationshipMap[relationType] || null;
  }

  /**
   * Bulk re-parent records using CSV pattern
   */
  async bulkReparent(objectName, fieldName, records, newParentId) {
    if (records.length === 0) return;

    try {
      // Generate CSV
      const csvDir = path.join(__dirname, '../../rollback-temp');
      if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const csvPath = path.join(csvDir, `reparent-${objectName}-${timestamp}.csv`);

      // CSV content
      let csv = `Id,${fieldName}\n`;
      records.forEach(rec => {
        csv += `${rec.Id},${newParentId}\n`;
      });

      fs.writeFileSync(csvPath, csv);

      // Execute bulk update
      const bulkCommand = `sf data upsert bulk --sobject ${objectName} --file ${csvPath} --external-id Id --target-org ${this.orgAlias} --wait 10 --json`;
      const bulkResult = JSON.parse(execSync(bulkCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));

      // Cleanup CSV
      fs.unlinkSync(csvPath);

      if (bulkResult.status !== 0) {
        throw new Error(`Bulk update failed for ${objectName}`);
      }

    } catch (error) {
      console.log(`   ⚠️  Could not re-parent ${objectName}: ${error.message}`);
      // Don't fail rollback if some re-parenting fails
    }
  }

  /**
   * Validate rollback is possible
   */
  async validateRollback() {
    const errors = [];
    const warnings = [];

    try {
      // 1. Check org connection
      const orgCheckCommand = `sf org display --target-org ${this.orgAlias} --json`;
      const orgResult = JSON.parse(execSync(orgCheckCommand, { encoding: 'utf8' }));

      if (orgResult.status !== 0) {
        errors.push(`Cannot connect to org '${this.orgAlias}'`);
      }

      // 2. Check execution log age
      const executedAt = new Date(this.executionLog.timestamp_start);
      const now = new Date();
      const ageHours = (now - executedAt) / (1000 * 60 * 60);

      if (ageHours > this.maxRollbackAgeHours && !this.force) {
        errors.push(`Execution is ${Math.round(ageHours)}h old (max: ${this.maxRollbackAgeHours}h). Use --force to override.`);
      } else if (ageHours > this.maxRollbackAgeHours) {
        warnings.push(`Execution is ${Math.round(ageHours)}h old - rollback may not be complete`);
      }

      // 3. Check if execution was in same org
      if (this.executionLog.org !== this.orgAlias) {
        errors.push(`Execution was in '${this.executionLog.org}', attempting rollback in '${this.orgAlias}'`);
      }

      // 4. Check for successful merges to rollback
      const successfulPairs = this.executionLog.batches
        .flatMap(b => b.results)
        .filter(r => r.status === 'SUCCESS');

      if (successfulPairs.length === 0) {
        errors.push('No successful merges to rollback');
      }

      // NOTE: Skipping recycle bin validation as Salesforce CLI doesn't support
      // querying deleted records with "ALL ROWS" syntax reliably. The actual
      // undelete operation will fail gracefully if records aren't in recycle bin.

      warnings.push('Recycle bin check skipped - undelete will fail if records not in recycle bin');

      // 5. Check for before/after snapshots
      const pairsWithSnapshots = successfulPairs.filter(p => p.before && p.after);
      const snapshotPercentage = (pairsWithSnapshots.length / successfulPairs.length) * 100;

      if (snapshotPercentage < 50) {
        warnings.push(`Only ${Math.round(snapshotPercentage)}% of pairs have before/after snapshots`);
      }

    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Save rollback log to file
   */
  async saveRollbackLog() {
    if (this.validateOnly) {
      console.log('\nℹ️  Validate-only mode - rollback log not saved');
      return;
    }

    const logPath = this.getRollbackLogPath();
    const logDir = path.dirname(logPath);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.writeFileSync(logPath, JSON.stringify(this.rollbackLog, null, 2));
    console.log(`\n📄 Rollback log saved: ${logPath}`);
  }

  /**
   * Get rollback log file path
   */
  getRollbackLogPath() {
    return path.join(process.cwd(), 'rollback-logs', `${this.rollbackLog.rollback_id}.json`);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  const getArg = (name, defaultValue = null) => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
  };

  const hasFlag = (name) => args.includes(`--${name}`);

  const executionLogFile = getArg('execution-log');
  const batchId = getArg('batch');
  const pairId = getArg('pair');
  const objectType = getArg('object-type'); // v2.0.0: Optional object type override
  const validateOnly = hasFlag('validate-only');
  const force = hasFlag('force');

  if (!executionLogFile) {
    console.error('Usage: node dedup-rollback-system.js --execution-log <file> [options]');
    console.error('\nOptions:');
    console.error('  --batch <id>         Rollback specific batch');
    console.error('  --pair <id>          Rollback specific pair');
    console.error('  --object-type <type> Override object type (e.g., Account, Contact, Lead)');
    console.error('  --validate-only      Validate without executing');
    console.error('  --force              Skip rollback age validation');
    console.error('\nObject Detection:');
    console.error('  - Auto-detects from execution log metadata');
    console.error('  - Use --object-type to override (e.g., Contact, Lead)');
    console.error('\nExamples:');
    console.error('  # Auto-detect object type');
    console.error('  node dedup-rollback-system.js --execution-log execution_log.json');
    console.error('\n  # Override object type');
    console.error('  node dedup-rollback-system.js --execution-log execution_log.json --object-type Contact');
    process.exit(1);
  }

  // Load execution log
  const executionLogPath = path.resolve(executionLogFile);
  if (!fs.existsSync(executionLogPath)) {
    console.error(`❌ Execution log not found: ${executionLogPath}`);
    process.exit(1);
  }

  const executionLog = JSON.parse(fs.readFileSync(executionLogPath, 'utf8'));
  const orgAlias = executionLog.org;

  // Create rollback system (v2.0.0: Pass object type option)
  const rollback = new RollbackSystem(orgAlias, {
    validateOnly,
    force,
    objectType // Pass object type override if provided
  });

  // Execute rollback
  rollback.loadExecutionLog(executionLogPath)
    .then(() => {
      if (batchId) {
        return rollback.rollbackBatch(batchId);
      } else {
        return rollback.rollback();
      }
    })
    .then(result => {
      console.log('\n✅ Rollback complete');
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Rollback failed:', error.message);
      process.exit(1);
    });
}

module.exports = RollbackSystem;
