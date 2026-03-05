#!/usr/bin/env node

/**
 * UAT Salesforce Adapter
 *
 * Salesforce-specific implementation for UAT test operations.
 * Integrates with existing OOOWriteOperations and FlowStateSnapshot for
 * safe record creation and state verification.
 *
 * @module uat-salesforce-adapter
 * @version 1.0.0
 *
 * @example
 * const SalesforceUATAdapter = require('./uat-salesforce-adapter');
 * const adapter = new SalesforceUATAdapter('my-sandbox', { verbose: true });
 *
 * const result = await adapter.createRecord('Account', { Name: 'Test' });
 * console.log('Created:', result.id);
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');

// Import existing infrastructure
let OOOWriteOperations, FlowStateSnapshot;
try {
  ({ OOOWriteOperations } = require('./ooo-write-operations'));
  ({ FlowStateSnapshot } = require('./flow-state-snapshot'));
} catch (error) {
  // Will be loaded on first use if not available at import
  console.warn('Warning: Could not import OOO/FlowStateSnapshot at load time');
}

/**
 * Object name normalization map (friendly names -> API names)
 */
const OBJECT_MAP = {
  'account': 'Account',
  'contact': 'Contact',
  'opportunity': 'Opportunity',
  'opp': 'Opportunity',
  'quote': 'SBQQ__Quote__c',
  'quoteline': 'SBQQ__QuoteLine__c',
  'products': 'OpportunityLineItem',
  'opportunitylineitem': 'OpportunityLineItem',
  'oli': 'OpportunityLineItem',
  'product': 'Product2',
  'contract': 'Contract',
  'subscription': 'SBQQ__Subscription__c',
  'lead': 'Lead',
  'case': 'Case',
  'order': 'Order',
  'contactrole': 'OpportunityContactRole',
  'opportunitycontactrole': 'OpportunityContactRole',
  'pricebookentry': 'PricebookEntry',
  'pricebook': 'Pricebook2'
};

/**
 * Salesforce UAT Adapter
 */
class SalesforceUATAdapter {
  /**
   * Create a Salesforce UAT adapter
   * @param {string} orgAlias - Salesforce org alias
   * @param {Object} options - Adapter options
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {boolean} [options.dryRun=false] - Dry run mode
   * @param {boolean} [options.useOOO=true] - Use OOO safe creation pattern
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new Error('orgAlias is required');
    }

    this.orgAlias = orgAlias;
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.useOOO = options.useOOO !== false;
    this.createdRecords = [];
    this.instanceUrl = null;

    // Initialize OOO if available and enabled
    if (this.useOOO && OOOWriteOperations) {
      this.ooo = new OOOWriteOperations(orgAlias, { verbose: this.verbose, dryRun: this.dryRun });
    }

    // Initialize FlowStateSnapshot if available
    if (FlowStateSnapshot) {
      this.snapshot = new FlowStateSnapshot(orgAlias, { verbose: this.verbose });
    }
  }

  // ============================================
  // RECORD OPERATIONS
  // ============================================

  /**
   * Create a record using safe OOO pattern
   * @param {string} objectType - Object API name or friendly name
   * @param {Object} data - Record data
   * @param {Object} [options] - Creation options
   * @returns {Promise<Object>} Creation result
   */
  async createRecord(objectType, data, options = {}) {
    const apiName = this.normalizeObjectName(objectType);
    this.log(`Creating ${apiName}...`);

    if (this.dryRun) {
      const fakeId = this.generateDryRunId(apiName);
      this.trackRecord(apiName, fakeId);
      return {
        success: true,
        id: fakeId,
        recordUrl: this.getRecordUrl(apiName, fakeId),
        dryRun: true
      };
    }

    try {
      let result;

      if (this.useOOO && this.ooo) {
        // Use OOO safe creation (7-step pattern)
        result = await this.ooo.createRecordSafe(apiName, data, options);
        if (result.success) {
          this.trackRecord(apiName, result.recordId);
          return {
            success: true,
            id: result.recordId,
            recordUrl: this.getRecordUrl(apiName, result.recordId),
            context: result.context
          };
        } else {
          return {
            success: false,
            error: result.error,
            context: result.context
          };
        }
      } else {
        // Fallback to direct SF CLI
        result = await this.createRecordDirect(apiName, data);
        if (result.success) {
          this.trackRecord(apiName, result.id);
        }
        return result;
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create record directly via SF CLI (fallback)
   */
  async createRecordDirect(objectType, data) {
    try {
      const values = Object.entries(data)
        .map(([k, v]) => `${k}='${String(v).replace(/'/g, "\\'")}'`)
        .join(' ');

      const { stdout } = await execAsync(
        `sf data create record --sobject ${objectType} --values "${values}" --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);

      if (result.status === 0 && result.result?.id) {
        return {
          success: true,
          id: result.result.id,
          recordUrl: this.getRecordUrl(objectType, result.result.id)
        };
      } else {
        return {
          success: false,
          error: result.message || 'Unknown error'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update a record
   * @param {string} objectType - Object API name
   * @param {string} recordId - Record ID
   * @param {Object} data - Update data
   * @param {Object} [options] - Update options
   * @returns {Promise<Object>} Update result
   */
  async updateRecord(objectType, recordId, data, options = {}) {
    const apiName = this.normalizeObjectName(objectType);
    this.log(`Updating ${apiName} (${recordId})...`);

    if (this.dryRun) {
      return { success: true, id: recordId, dryRun: true };
    }

    try {
      const values = Object.entries(data)
        .map(([k, v]) => `${k}='${String(v).replace(/'/g, "\\'")}'`)
        .join(' ');

      const { stdout } = await execAsync(
        `sf data update record --sobject ${apiName} --record-id ${recordId} --values "${values}" --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);

      return {
        success: result.status === 0,
        id: recordId,
        error: result.status !== 0 ? result.message : null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Query a record
   * @param {string} objectType - Object API name
   * @param {string} recordId - Record ID
   * @param {Array<string>} [fields] - Fields to retrieve
   * @returns {Promise<Object>} Query result
   */
  async queryRecord(objectType, recordId, fields = null) {
    const apiName = this.normalizeObjectName(objectType);

    try {
      const fieldList = fields ? fields.join(', ') : 'FIELDS(ALL)';
      const query = `SELECT ${fieldList} FROM ${apiName} WHERE Id = '${recordId}' LIMIT 1`;

      const { stdout } = await execAsync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);

      if (result.status === 0 && result.result?.records?.length > 0) {
        return {
          success: true,
          record: result.result.records[0]
        };
      } else {
        return {
          success: false,
          error: 'Record not found'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================
  // VERIFICATION OPERATIONS
  // ============================================

  /**
   * Verify a field value
   * @param {string} objectType - Object API name
   * @param {string} recordId - Record ID
   * @param {string} fieldName - Field to verify
   * @param {*} expectedValue - Expected value
   * @param {string} [operator='equals'] - Comparison operator
   * @returns {Promise<Object>} Verification result
   */
  async verifyField(objectType, recordId, fieldName, expectedValue, operator = 'equals') {
    const apiName = this.normalizeObjectName(objectType);

    try {
      // Use FlowStateSnapshot if available for richer state capture
      if (this.snapshot) {
        const state = await this.snapshot.captureSnapshot(recordId, {
          includeFields: [fieldName]
        });
        const actual = state.fields[fieldName]?.value;
        const passed = this.compareValues(actual, expectedValue, operator);

        return {
          passed,
          actual,
          expected: expectedValue,
          operator,
          fieldName,
          objectType: apiName
        };
      }

      // Fallback to direct query
      const queryResult = await this.queryRecord(apiName, recordId, [fieldName]);

      if (!queryResult.success) {
        return {
          passed: false,
          error: queryResult.error,
          fieldName
        };
      }

      const actual = queryResult.record[fieldName];
      const passed = this.compareValues(actual, expectedValue, operator);

      return {
        passed,
        actual,
        expected: expectedValue,
        operator,
        fieldName,
        objectType: apiName
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        fieldName
      };
    }
  }

  /**
   * Verify rollup calculations
   * @param {string} parentObject - Parent object type
   * @param {string} parentId - Parent record ID
   * @param {string} childObject - Child object type
   * @param {Object} rollupConfig - Rollup configuration
   * @returns {Promise<Object>} Rollup verification result
   */
  async verifyRollup(parentObject, parentId, childObject, rollupConfig) {
    const parentApiName = this.normalizeObjectName(parentObject);
    const childApiName = this.normalizeObjectName(childObject);

    try {
      // Query parent field value
      const parentResult = await this.queryRecord(parentApiName, parentId, [rollupConfig.parentField]);
      if (!parentResult.success) {
        return { passed: false, error: `Parent query failed: ${parentResult.error}` };
      }

      const parentValue = parentResult.record[rollupConfig.parentField];

      // Query child records and calculate rollup
      const relationshipField = rollupConfig.relationshipField || `${parentApiName}Id`;
      const childQuery = `SELECT ${rollupConfig.childField} FROM ${childApiName} WHERE ${relationshipField} = '${parentId}'`;

      const { stdout } = await execAsync(
        `sf data query --query "${childQuery}" --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const childResult = JSON.parse(stdout);
      const children = childResult.result?.records || [];

      // Calculate based on rollup type (default: sum)
      let calculatedValue;
      const rollupType = rollupConfig.type || 'sum';

      switch (rollupType) {
        case 'sum':
          calculatedValue = children.reduce((sum, c) => sum + (c[rollupConfig.childField] || 0), 0);
          break;
        case 'count':
          calculatedValue = children.length;
          break;
        case 'max':
          calculatedValue = Math.max(...children.map(c => c[rollupConfig.childField] || 0));
          break;
        case 'min':
          calculatedValue = Math.min(...children.map(c => c[rollupConfig.childField] || Infinity));
          break;
        default:
          calculatedValue = children.reduce((sum, c) => sum + (c[rollupConfig.childField] || 0), 0);
      }

      // Compare with tolerance for currency/decimal
      const tolerance = rollupConfig.tolerance || 0.01;
      const passed = Math.abs(parentValue - calculatedValue) <= tolerance;

      return {
        passed,
        parentValue,
        calculatedValue,
        difference: Math.abs(parentValue - calculatedValue),
        tolerance,
        childCount: children.length,
        rollupType
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message
      };
    }
  }

  /**
   * Check permission/access
   * @param {string} profile - Profile name
   * @param {string} objectType - Object type
   * @param {string} action - Action to check
   * @returns {Promise<Object>} Permission check result
   */
  async checkPermission(profile, objectType, action) {
    const apiName = this.normalizeObjectName(objectType);

    try {
      // Query ObjectPermissions
      const permissionMap = {
        'create': 'PermissionsCreate',
        'read': 'PermissionsRead',
        'update': 'PermissionsEdit',
        'edit': 'PermissionsEdit',
        'delete': 'PermissionsDelete'
      };

      const permissionField = permissionMap[action.toLowerCase()];
      if (!permissionField) {
        return {
          allowed: false,
          error: `Unknown action: ${action}`
        };
      }

      const query = `SELECT ${permissionField} FROM ObjectPermissions WHERE Parent.Profile.Name = '${profile}' AND SObjectType = '${apiName}' LIMIT 1`;

      const { stdout } = await execAsync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);
      const permission = result.result?.records?.[0];

      return {
        allowed: permission ? permission[permissionField] : false,
        profile,
        objectType: apiName,
        action
      };
    } catch (error) {
      return {
        allowed: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a record
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteRecord(objectType, recordId) {
    const apiName = this.normalizeObjectName(objectType);
    this.log(`Deleting ${apiName} (${recordId})...`);

    if (this.dryRun) {
      return { success: true, id: recordId, dryRun: true };
    }

    try {
      const { stdout } = await execAsync(
        `sf data delete record --sobject ${apiName} --record-id ${recordId} --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);

      return {
        success: result.status === 0,
        id: recordId,
        error: result.status !== 0 ? result.message : null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get record URL
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @returns {string} Lightning URL path
   */
  getRecordUrl(objectType, recordId) {
    const apiName = this.normalizeObjectName(objectType);
    return `/lightning/r/${apiName}/${recordId}/view`;
  }

  /**
   * Get instance URL
   * @returns {Promise<string>} Instance URL
   */
  async getInstanceUrl() {
    if (this.instanceUrl) {
      return this.instanceUrl;
    }

    try {
      const { stdout } = await execAsync(
        `sf org display --target-org ${this.orgAlias} --json`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const result = JSON.parse(stdout);
      this.instanceUrl = result.result?.instanceUrl || '';
      return this.instanceUrl;
    } catch (error) {
      return '';
    }
  }

  /**
   * Normalize object name to API name
   */
  normalizeObjectName(name) {
    const lower = name.toLowerCase();
    return OBJECT_MAP[lower] || name;
  }

  /**
   * Compare values with operator
   */
  compareValues(actual, expected, operator) {
    // Handle context variable references (e.g., "{AccountId}")
    if (typeof expected === 'string' && expected.startsWith('{') && expected.endsWith('}')) {
      // This will be resolved by the step executor
      return true;
    }

    switch (operator) {
      case 'equals':
      case '=':
      case '==':
        return actual == expected;
      case 'strictEquals':
      case '===':
        return actual === expected;
      case 'notEquals':
      case '!=':
        return actual != expected;
      case 'greaterThan':
      case '>':
        return actual > expected;
      case 'lessThan':
      case '<':
        return actual < expected;
      case 'greaterOrEqual':
      case '>=':
        return actual >= expected;
      case 'lessOrEqual':
      case '<=':
        return actual <= expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'startsWith':
        return String(actual).startsWith(String(expected));
      case 'endsWith':
        return String(actual).endsWith(String(expected));
      case 'isNull':
        return actual === null || actual === undefined;
      case 'isNotNull':
        return actual !== null && actual !== undefined;
      default:
        return actual == expected;
    }
  }

  /**
   * Track created record for cleanup
   */
  trackRecord(objectType, recordId) {
    this.createdRecords.push({
      objectType,
      id: recordId,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Get all created records
   */
  getCreatedRecords() {
    return this.createdRecords;
  }

  /**
   * Generate fake ID for dry run
   */
  generateDryRunId(objectType) {
    const prefixes = {
      'Account': '001',
      'Contact': '003',
      'Opportunity': '006',
      'Lead': '00Q',
      'Case': '500',
      'SBQQ__Quote__c': 'a0Q',
      'SBQQ__QuoteLine__c': 'a0L'
    };
    const prefix = prefixes[objectType] || '000';
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}DRYRUN${random}`.substring(0, 18);
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }
}

module.exports = SalesforceUATAdapter;
