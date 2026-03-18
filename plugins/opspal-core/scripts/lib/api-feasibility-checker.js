#!/usr/bin/env node

/**
 * API Feasibility Checker
 *
 * Pre-validates operations against known API limitations to prevent
 * mid-operation failures and provide clear guidance on workarounds.
 *
 * Addresses Reflection Cohort: external-api
 * Root Causes:
 * 1. Metadata cache delay (2-5 min) after field creation
 * 2. System-managed fields cannot be set via API
 *
 * Features:
 * - Pre-check operations against known limitations
 * - Detect system-managed fields before data imports
 * - Suggest workarounds and manual steps
 * - Track recent field creations to warn about cache delays
 *
 * Target ROI: $48,000 annually (zero surprises from API limitations)
 *
 * Usage:
 *   const checker = new APIFeasibilityChecker();
 *
 *   // Check if field can be set via API
 *   const result = checker.checkFieldWriteability('CampaignMember', 'FirstRespondedDate');
 *
 *   // Check if operation is feasible
 *   const feasibility = await checker.checkOperationFeasibility({
 *     operation: 'data_import',
 *     object: 'CampaignMember',
 *     fields: ['FirstRespondedDate', 'ContactId', 'Status']
 *   });
 *
 *   // Check for metadata cache issues
 *   const cacheResult = checker.checkMetadataCacheRisk('Account', 'Custom_Field__c');
 *
 * @module api-feasibility-checker
 * @version 1.0.0
 * @created 2026-01-10
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class APIFeasibilityChecker {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.orgAlias = options.orgAlias || process.env.SFDX_ALIAS || 'defaultOrg';

    // Load limitation matrix
    this.limitationMatrixPath = path.join(
      __dirname,
      '../../config/api-limitation-matrix.json'
    );
    this.limitationMatrix = this.loadLimitationMatrix();

    // Track recent field creations (in-memory for session)
    this.recentFieldCreations = new Map();

    // Cache for field metadata
    this.fieldMetadataCache = new Map();
    this.cacheTimeout = 60000; // 1 minute
  }

  /**
   * Load the API limitation matrix
   */
  loadLimitationMatrix() {
    try {
      if (fs.existsSync(this.limitationMatrixPath)) {
        const content = fs.readFileSync(this.limitationMatrixPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.log(`Warning: Could not load limitation matrix: ${error.message}`);
    }

    // Return minimal default matrix
    return {
      salesforce: {
        system_managed_fields: { known_fields: {} },
        metadata_cache: {}
      }
    };
  }

  /**
   * Log message if verbose
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[APIFeasibilityChecker] ${message}`, data || '');
    }
  }

  // =============================================================================
  // FIELD WRITEABILITY CHECKS
  // =============================================================================

  /**
   * Check if a specific field can be written via API
   *
   * @param {string} objectType - Object API name
   * @param {string} fieldName - Field API name
   * @returns {Object} Writeability result
   */
  checkFieldWriteability(objectType, fieldName) {
    const result = {
      writeable: true,
      createable: true,
      updateable: true,
      reason: null,
      workaround: null,
      source: 'assumed'
    };

    // Check known system-managed fields (ANY_OBJECT applies to all)
    const knownFields = this.limitationMatrix.salesforce?.system_managed_fields?.known_fields || {};

    // Check object-specific fields
    const objectFields = knownFields[objectType] || {};
    if (objectFields[fieldName]) {
      const fieldInfo = objectFields[fieldName];
      result.writeable = fieldInfo.createable !== false || fieldInfo.updateable !== false;
      result.createable = fieldInfo.createable !== false;
      result.updateable = fieldInfo.updateable !== false;
      result.reason = fieldInfo.reason;
      result.workaround = fieldInfo.workaround;
      result.source = 'limitation_matrix';
      return result;
    }

    // Check ANY_OBJECT fields (applies to all objects)
    const anyObjectFields = knownFields['ANY_OBJECT'] || {};
    if (anyObjectFields[fieldName]) {
      const fieldInfo = anyObjectFields[fieldName];
      result.writeable = fieldInfo.createable !== false || fieldInfo.updateable !== false;
      result.createable = fieldInfo.createable !== false;
      result.updateable = fieldInfo.updateable !== false;
      result.reason = fieldInfo.reason;
      result.workaround = fieldInfo.workaround;
      result.source = 'limitation_matrix';
      return result;
    }

    return result;
  }

  /**
   * Check multiple fields for writeability
   *
   * @param {string} objectType - Object API name
   * @param {Array<string>} fields - Array of field API names
   * @returns {Object} Batch writeability result
   */
  checkFieldsWriteability(objectType, fields) {
    const result = {
      allWriteable: true,
      fields: {},
      nonWriteableFields: [],
      warnings: [],
      workarounds: []
    };

    for (const field of fields) {
      const fieldResult = this.checkFieldWriteability(objectType, field);
      result.fields[field] = fieldResult;

      if (!fieldResult.writeable) {
        result.allWriteable = false;
        result.nonWriteableFields.push({
          field,
          reason: fieldResult.reason,
          workaround: fieldResult.workaround
        });

        if (fieldResult.workaround) {
          result.workarounds.push({
            field,
            workaround: fieldResult.workaround
          });
        }
      }
    }

    if (result.nonWriteableFields.length > 0) {
      result.warnings.push(
        `${result.nonWriteableFields.length} field(s) are system-managed and cannot be set via API`
      );
    }

    return result;
  }

  // =============================================================================
  // METADATA CACHE CHECKS
  // =============================================================================

  /**
   * Record that a field was recently created (for cache delay tracking)
   *
   * @param {string} objectType - Object API name
   * @param {string} fieldName - Field API name
   */
  recordFieldCreation(objectType, fieldName) {
    const key = `${objectType}.${fieldName}`;
    this.recentFieldCreations.set(key, Date.now());
    this.log(`Recorded field creation: ${key}`);
  }

  /**
   * Check if a field operation might be affected by metadata cache delay
   *
   * @param {string} objectType - Object API name
   * @param {string} fieldName - Field API name
   * @returns {Object} Cache risk assessment
   */
  checkMetadataCacheRisk(objectType, fieldName) {
    const key = `${objectType}.${fieldName}`;
    const creationTime = this.recentFieldCreations.get(key);

    const result = {
      riskLevel: 'none',
      reason: null,
      recommendation: null,
      waitTime: 0
    };

    if (creationTime) {
      const elapsedMs = Date.now() - creationTime;
      const elapsedMinutes = elapsedMs / 60000;
      const cacheDelayMinutes = 5; // Known cache delay

      if (elapsedMinutes < cacheDelayMinutes) {
        result.riskLevel = 'high';
        result.waitTime = Math.ceil((cacheDelayMinutes - elapsedMinutes) * 60);
        result.reason =
          `Field ${fieldName} was created ${elapsedMinutes.toFixed(1)} minutes ago. ` +
          `Salesforce metadata cache may not yet reflect this field.`;
        result.recommendation =
          `Wait approximately ${result.waitTime} seconds before querying, or use Tooling API`;
      }
    }

    return result;
  }

  /**
   * Get workarounds for metadata cache issues
   */
  getMetadataCacheWorkarounds() {
    const cacheInfo = this.limitationMatrix.salesforce?.metadata_cache || {};
    return cacheInfo.workarounds || [
      {
        method: 'wait',
        description: 'Wait 2-5 minutes after field creation before querying',
        reliability: 'high'
      },
      {
        method: 'tooling_api',
        description: 'Use Tooling API which has lower cache TTL',
        reliability: 'medium',
        command: 'sf data query --use-tooling-api'
      }
    ];
  }

  // =============================================================================
  // OPERATION FEASIBILITY CHECKS
  // =============================================================================

  /**
   * Check if an operation is feasible given known API limitations
   *
   * @param {Object} config - Operation configuration
   * @returns {Promise<Object>} Feasibility result
   */
  async checkOperationFeasibility(config) {
    const {
      operation,
      object,
      fields = [],
      recordCount = 1,
      platform = 'salesforce'
    } = config;

    this.log(`Checking feasibility: ${operation} on ${object}`);

    const result = {
      feasible: true,
      operation,
      object,
      blockers: [],
      warnings: [],
      recommendations: [],
      manualSteps: []
    };

    // Check field writeability for data operations
    if (['data_import', 'data_create', 'data_update', 'data_upsert'].includes(operation)) {
      if (fields.length > 0) {
        const fieldResult = this.checkFieldsWriteability(object, fields);

        if (!fieldResult.allWriteable) {
          result.feasible = false;
          result.blockers.push({
            type: 'system_managed_fields',
            message: `Cannot set ${fieldResult.nonWriteableFields.length} system-managed field(s)`,
            fields: fieldResult.nonWriteableFields
          });

          // Add workarounds as manual steps
          for (const w of fieldResult.workarounds) {
            if (w.workaround && w.workaround !== 'None - system calculated') {
              result.manualSteps.push({
                field: w.field,
                step: w.workaround
              });
            }
          }
        }

        // Check for metadata cache risks
        for (const field of fields) {
          const cacheRisk = this.checkMetadataCacheRisk(object, field);
          if (cacheRisk.riskLevel === 'high') {
            result.warnings.push({
              type: 'metadata_cache_delay',
              message: cacheRisk.reason,
              recommendation: cacheRisk.recommendation
            });
          }
        }
      }
    }

    // Check bulk limits
    if (recordCount > 10000 && platform === 'salesforce') {
      const bulkInfo = this.limitationMatrix.salesforce?.bulk_api_limits || {};
      result.warnings.push({
        type: 'bulk_limit',
        message: `Large record count (${recordCount}). Consider using Bulk API with chunking.`,
        recommendation: 'Split into batches of 10,000 records'
      });
    }

    // Check quick action deployment
    if (operation === 'metadata_deploy' && object === 'QuickAction') {
      const qaInfo = this.limitationMatrix.salesforce?.quick_action_deployment || {};
      result.warnings.push({
        type: 'quick_action_limitation',
        message: 'Quick Actions deploy but require manual layout assignment',
        recommendation: 'After deployment, add Quick Action to page layouts in Setup'
      });
      result.manualSteps.push({
        step: 'Add Quick Action to page layouts',
        location: 'Setup > Object Manager > [Object] > Page Layouts > [Layout] > Mobile & Lightning Actions'
      });
    }

    // Check flow activation
    if (operation === 'metadata_deploy' && object === 'Flow') {
      const flowInfo = this.limitationMatrix.salesforce?.flow_activation || {};
      result.recommendations.push({
        type: 'flow_activation',
        message: 'Include FlowDefinition metadata with activeVersionNumber to auto-activate',
        alternative: 'Use `sf flow activate` command after deployment'
      });
    }

    // Generate summary
    result.summary = this.generateFeasibilitySummary(result);

    return result;
  }

  /**
   * Generate feasibility summary
   */
  generateFeasibilitySummary(result) {
    if (result.feasible && result.warnings.length === 0) {
      return {
        status: 'GO',
        message: 'Operation is fully feasible via API',
        proceed: true
      };
    }

    if (result.feasible && result.warnings.length > 0) {
      return {
        status: 'GO_WITH_CAUTION',
        message: `Operation feasible with ${result.warnings.length} warning(s)`,
        proceed: true
      };
    }

    return {
      status: 'BLOCKED',
      message: `Operation blocked by ${result.blockers.length} limitation(s)`,
      proceed: false,
      primaryBlocker: result.blockers[0]?.message || 'Unknown limitation'
    };
  }

  // =============================================================================
  // LIVE FIELD METADATA CHECK
  // =============================================================================

  /**
   * Query Salesforce to get actual field metadata
   *
   * @param {string} objectType - Object API name
   * @param {Array<string>} fields - Field names to check
   * @returns {Promise<Object>} Live field metadata
   */
  async getLiveFieldMetadata(objectType, fields) {
    const cacheKey = `${this.orgAlias}:${objectType}`;

    // Check cache
    if (this.fieldMetadataCache.has(cacheKey)) {
      const cached = this.fieldMetadataCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return this.filterFieldMetadata(cached.metadata, fields);
      }
    }

    try {
      const cmd = `sf sobject describe --sobject ${objectType} --target-org ${this.orgAlias} --json`;
      const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(output);

      if (data.status === 0 && data.result) {
        const metadata = {};
        for (const field of data.result.fields || []) {
          metadata[field.name] = {
            createable: field.createable,
            updateable: field.updateable,
            type: field.type,
            calculated: field.calculated,
            autoNumber: field.autoNumber
          };
        }

        // Cache result
        this.fieldMetadataCache.set(cacheKey, {
          metadata,
          timestamp: Date.now()
        });

        return this.filterFieldMetadata(metadata, fields);
      }
    } catch (error) {
      this.log(`Warning: Could not get live field metadata: ${error.message}`);
    }

    return null;
  }

  /**
   * Filter metadata to requested fields
   */
  filterFieldMetadata(metadata, fields) {
    if (!fields || fields.length === 0) {
      return metadata;
    }

    const filtered = {};
    for (const field of fields) {
      if (metadata[field]) {
        filtered[field] = metadata[field];
      }
    }
    return filtered;
  }

  /**
   * Get known limitations for an object
   *
   * @param {string} objectType - Object API name
   * @param {string} platform - Platform (salesforce, hubspot)
   * @returns {Object} Known limitations
   */
  getKnownLimitations(objectType, platform = 'salesforce') {
    const platformLimits = this.limitationMatrix[platform] || {};
    const result = {
      systemManagedFields: [],
      apiLimitations: [],
      recommendations: []
    };

    // Get system-managed fields for this object
    const knownFields = platformLimits.system_managed_fields?.known_fields || {};
    const objectFields = knownFields[objectType] || {};
    const anyObjectFields = knownFields['ANY_OBJECT'] || {};

    for (const [fieldName, info] of Object.entries(objectFields)) {
      result.systemManagedFields.push({
        field: fieldName,
        reason: info.reason,
        workaround: info.workaround
      });
    }

    // Add ANY_OBJECT fields that apply
    for (const [fieldName, info] of Object.entries(anyObjectFields)) {
      result.systemManagedFields.push({
        field: fieldName,
        reason: info.reason,
        workaround: info.workaround,
        appliesTo: 'ALL_OBJECTS'
      });
    }

    return result;
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const checker = new APIFeasibilityChecker({ verbose: true });

  (async () => {
    try {
      switch (command) {
        case 'check-field':
          // node api-feasibility-checker.js check-field CampaignMember FirstRespondedDate
          const object = args[1];
          const field = args[2];

          if (!object || !field) {
            console.error('Usage: node api-feasibility-checker.js check-field <object> <field>');
            process.exit(1);
          }

          const fieldResult = checker.checkFieldWriteability(object, field);
          console.log('\nField Writeability Check:\n');
          console.log(`  Object: ${object}`);
          console.log(`  Field: ${field}`);
          console.log(`  Writeable: ${fieldResult.writeable ? 'YES' : 'NO'}`);
          console.log(`  Createable: ${fieldResult.createable ? 'YES' : 'NO'}`);
          console.log(`  Updateable: ${fieldResult.updateable ? 'YES' : 'NO'}`);

          if (fieldResult.reason) {
            console.log(`  Reason: ${fieldResult.reason}`);
          }
          if (fieldResult.workaround) {
            console.log(`  Workaround: ${fieldResult.workaround}`);
          }
          console.log('');
          process.exit(fieldResult.writeable ? 0 : 1);
          break;

        case 'check-fields':
          // node api-feasibility-checker.js check-fields CampaignMember FirstRespondedDate,ContactId,Status
          const obj2 = args[1];
          const fieldsStr = args[2];

          if (!obj2 || !fieldsStr) {
            console.error('Usage: node api-feasibility-checker.js check-fields <object> <field1,field2,...>');
            process.exit(1);
          }

          const fields = fieldsStr.split(',');
          const fieldsResult = checker.checkFieldsWriteability(obj2, fields);

          console.log('\nBatch Field Writeability Check:\n');
          console.log(`  Object: ${obj2}`);
          console.log(`  Fields Checked: ${fields.length}`);
          console.log(`  All Writeable: ${fieldsResult.allWriteable ? 'YES' : 'NO'}`);

          if (fieldsResult.nonWriteableFields.length > 0) {
            console.log('\n  Non-Writeable Fields:');
            fieldsResult.nonWriteableFields.forEach(f => {
              console.log(`    - ${f.field}: ${f.reason}`);
              if (f.workaround) {
                console.log(`      Workaround: ${f.workaround}`);
              }
            });
          }
          console.log('');
          process.exit(fieldsResult.allWriteable ? 0 : 1);
          break;

        case 'check-operation':
          // node api-feasibility-checker.js check-operation data_import CampaignMember FirstRespondedDate,ContactId
          const operation = args[1];
          const targetObject = args[2];
          const targetFields = args[3] ? args[3].split(',') : [];

          if (!operation || !targetObject) {
            console.error('Usage: node api-feasibility-checker.js check-operation <operation> <object> [fields]');
            console.error('Operations: data_import, data_create, data_update, metadata_deploy');
            process.exit(1);
          }

          const opResult = await checker.checkOperationFeasibility({
            operation,
            object: targetObject,
            fields: targetFields
          });

          console.log('\nOperation Feasibility Check:\n');
          console.log(`  Operation: ${operation}`);
          console.log(`  Object: ${targetObject}`);
          console.log(`  Status: ${opResult.summary.status}`);
          console.log(`  Feasible: ${opResult.feasible ? 'YES' : 'NO'}`);

          if (opResult.blockers.length > 0) {
            console.log('\n  Blockers:');
            opResult.blockers.forEach(b => {
              console.log(`    - [${b.type}] ${b.message}`);
            });
          }

          if (opResult.warnings.length > 0) {
            console.log('\n  Warnings:');
            opResult.warnings.forEach(w => {
              console.log(`    - [${w.type}] ${w.message}`);
            });
          }

          if (opResult.manualSteps.length > 0) {
            console.log('\n  Manual Steps Required:');
            opResult.manualSteps.forEach((s, i) => {
              console.log(`    ${i + 1}. ${s.step || s.field + ': ' + s.workaround}`);
            });
          }

          console.log('');
          process.exit(opResult.feasible ? 0 : 1);
          break;

        case 'limitations':
          // node api-feasibility-checker.js limitations CampaignMember
          const limObject = args[1];

          if (!limObject) {
            console.error('Usage: node api-feasibility-checker.js limitations <object>');
            process.exit(1);
          }

          const limitations = checker.getKnownLimitations(limObject);

          console.log(`\nKnown Limitations for ${limObject}:\n`);

          if (limitations.systemManagedFields.length > 0) {
            console.log('  System-Managed Fields:');
            limitations.systemManagedFields.forEach(f => {
              const scope = f.appliesTo ? ` (${f.appliesTo})` : '';
              console.log(`    - ${f.field}${scope}: ${f.reason}`);
              if (f.workaround && f.workaround !== 'None - system calculated') {
                console.log(`      Workaround: ${f.workaround}`);
              }
            });
          } else {
            console.log('  No known system-managed field limitations.');
          }

          console.log('');
          break;

        case 'help':
        default:
          console.log(`
API Feasibility Checker

Pre-validates operations against known Salesforce API limitations.

Usage: node api-feasibility-checker.js <command> [args]

Commands:
  check-field <object> <field>
    Check if a single field can be written via API

  check-fields <object> <field1,field2,...>
    Check multiple fields for writeability

  check-operation <operation> <object> [fields]
    Check if an operation is feasible
    Operations: data_import, data_create, data_update, metadata_deploy

  limitations <object>
    Show known limitations for an object

Examples:
  node api-feasibility-checker.js check-field CampaignMember FirstRespondedDate
  node api-feasibility-checker.js check-fields Lead CreatedDate,Email,Status
  node api-feasibility-checker.js check-operation data_import CampaignMember FirstRespondedDate,ContactId
  node api-feasibility-checker.js limitations CampaignMember
          `);
          process.exit(0);
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = APIFeasibilityChecker;
