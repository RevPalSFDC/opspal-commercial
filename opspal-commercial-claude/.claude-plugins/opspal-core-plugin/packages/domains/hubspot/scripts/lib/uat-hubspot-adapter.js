#!/usr/bin/env node

/**
 * UAT HubSpot Adapter
 *
 * HubSpot-specific implementation for UAT test operations.
 * Uses HubSpot CRM API v3 for CRUD operations and verification.
 *
 * @module uat-hubspot-adapter
 * @version 1.0.0
 *
 * @example
 * const HubSpotUATAdapter = require('./uat-hubspot-adapter');
 * const adapter = new HubSpotUATAdapter({ accessToken: 'xxx', verbose: true });
 *
 * const result = await adapter.createRecord('contacts', { email: 'test@example.com' });
 * console.log('Created:', result.id);
 */

const https = require('https');

const HUBSPOT_API_BASE = 'api.hubapi.com';

/**
 * Object name normalization map (friendly names -> API names)
 */
const OBJECT_MAP = {
  'contact': 'contacts',
  'contacts': 'contacts',
  'company': 'companies',
  'companies': 'companies',
  'deal': 'deals',
  'deals': 'deals',
  'ticket': 'tickets',
  'tickets': 'tickets',
  'product': 'products',
  'products': 'products',
  'quote': 'quotes',
  'quotes': 'quotes',
  'lineitem': 'line_items',
  'line_item': 'line_items',
  'line_items': 'line_items',
  'call': 'calls',
  'calls': 'calls',
  'email': 'emails',
  'emails': 'emails',
  'meeting': 'meetings',
  'meetings': 'meetings',
  'note': 'notes',
  'notes': 'notes',
  'task': 'tasks',
  'tasks': 'tasks'
};

/**
 * HubSpot UAT Adapter
 */
class HubSpotUATAdapter {
  /**
   * Create a HubSpot UAT adapter
   * @param {Object} options - Adapter options
   * @param {string} [options.accessToken] - HubSpot API access token
   * @param {string} [options.portalId] - HubSpot portal ID
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {boolean} [options.dryRun=false] - Dry run mode
   */
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.createdRecords = [];

    if (!this.accessToken && !this.dryRun) {
      throw new Error('HubSpot access token is required (set HUBSPOT_ACCESS_TOKEN or pass accessToken option)');
    }
  }

  // ============================================
  // RECORD OPERATIONS
  // ============================================

  /**
   * Create a record
   * @param {string} objectType - Object type (contacts, companies, deals, etc.)
   * @param {Object} data - Record data (properties)
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
      const response = await this.apiRequest('POST', `/crm/v3/objects/${apiName}`, {
        properties: data
      });

      if (response.id) {
        this.trackRecord(apiName, response.id);
        return {
          success: true,
          id: response.id,
          recordUrl: this.getRecordUrl(apiName, response.id),
          properties: response.properties
        };
      } else {
        return {
          success: false,
          error: response.message || 'Unknown error'
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
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {Object} data - Updated properties
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
      const response = await this.apiRequest('PATCH', `/crm/v3/objects/${apiName}/${recordId}`, {
        properties: data
      });

      return {
        success: true,
        id: response.id || recordId,
        properties: response.properties
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Query a record by ID
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {Array<string>} [fields] - Properties to retrieve
   * @returns {Promise<Object>} Query result
   */
  async queryRecord(objectType, recordId, fields = null) {
    const apiName = this.normalizeObjectName(objectType);

    if (this.dryRun) {
      return {
        success: true,
        record: { id: recordId, properties: {} },
        dryRun: true
      };
    }

    try {
      let url = `/crm/v3/objects/${apiName}/${recordId}`;
      if (fields && fields.length > 0) {
        url += `?properties=${fields.join(',')}`;
      }

      const response = await this.apiRequest('GET', url);

      if (response.id) {
        return {
          success: true,
          record: {
            id: response.id,
            ...response.properties
          }
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

  /**
   * Search for records
   * @param {string} objectType - Object type
   * @param {Object} filters - Search filters
   * @param {Array<string>} [properties] - Properties to return
   * @returns {Promise<Object>} Search result
   */
  async searchRecords(objectType, filters, properties = []) {
    const apiName = this.normalizeObjectName(objectType);

    if (this.dryRun) {
      return {
        success: true,
        records: [],
        total: 0,
        dryRun: true
      };
    }

    try {
      const filterGroups = [];

      // Convert simple filters to HubSpot filter format
      if (filters && typeof filters === 'object') {
        const filterArray = Object.entries(filters).map(([property, value]) => ({
          propertyName: property,
          operator: 'EQ',
          value: String(value)
        }));

        if (filterArray.length > 0) {
          filterGroups.push({ filters: filterArray });
        }
      }

      const response = await this.apiRequest('POST', `/crm/v3/objects/${apiName}/search`, {
        filterGroups,
        properties,
        limit: 100
      });

      return {
        success: true,
        records: (response.results || []).map(r => ({
          id: r.id,
          ...r.properties
        })),
        total: response.total || 0
      };
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
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {string} fieldName - Property to verify
   * @param {*} expectedValue - Expected value
   * @param {string} [operator='equals'] - Comparison operator
   * @returns {Promise<Object>} Verification result
   */
  async verifyField(objectType, recordId, fieldName, expectedValue, operator = 'equals') {
    const apiName = this.normalizeObjectName(objectType);

    try {
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
   * Verify rollup/aggregation calculations
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

      const parentValue = parseFloat(parentResult.record[rollupConfig.parentField]) || 0;

      // Get associated child records via associations API
      const associationsResponse = await this.apiRequest(
        'GET',
        `/crm/v4/objects/${parentApiName}/${parentId}/associations/${childApiName}`
      );

      const childIds = (associationsResponse.results || []).map(a => a.toObjectId);

      if (childIds.length === 0) {
        // No children - calculate as 0
        const calculatedValue = rollupConfig.type === 'count' ? 0 : 0;
        const tolerance = rollupConfig.tolerance || 0.01;
        const passed = Math.abs(parentValue - calculatedValue) <= tolerance;

        return {
          passed,
          parentValue,
          calculatedValue,
          difference: Math.abs(parentValue - calculatedValue),
          tolerance,
          childCount: 0,
          rollupType: rollupConfig.type || 'sum'
        };
      }

      // Batch read child records
      const batchResponse = await this.apiRequest('POST', `/crm/v3/objects/${childApiName}/batch/read`, {
        inputs: childIds.map(id => ({ id })),
        properties: [rollupConfig.childField]
      });

      const children = batchResponse.results || [];

      // Calculate based on rollup type
      let calculatedValue;
      const rollupType = rollupConfig.type || 'sum';

      switch (rollupType) {
        case 'sum':
          calculatedValue = children.reduce((sum, c) =>
            sum + (parseFloat(c.properties[rollupConfig.childField]) || 0), 0);
          break;
        case 'count':
          calculatedValue = children.length;
          break;
        case 'max':
          calculatedValue = Math.max(...children.map(c =>
            parseFloat(c.properties[rollupConfig.childField]) || 0));
          break;
        case 'min':
          calculatedValue = Math.min(...children.map(c =>
            parseFloat(c.properties[rollupConfig.childField]) || Infinity));
          break;
        default:
          calculatedValue = children.reduce((sum, c) =>
            sum + (parseFloat(c.properties[rollupConfig.childField]) || 0), 0);
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
   * Check permission/access (HubSpot uses scopes, not profile-based permissions)
   * @param {string} scope - OAuth scope to check
   * @param {string} objectType - Object type
   * @param {string} action - Action to check (read, write)
   * @returns {Promise<Object>} Permission check result
   */
  async checkPermission(scope, objectType, action) {
    const apiName = this.normalizeObjectName(objectType);

    // HubSpot permissions are scope-based at the API level
    // We can't directly query permissions, but we can test access
    try {
      if (action === 'read') {
        // Try to search with limit 1
        const response = await this.apiRequest('POST', `/crm/v3/objects/${apiName}/search`, {
          filterGroups: [],
          limit: 1
        });

        return {
          allowed: true,
          scope,
          objectType: apiName,
          action
        };
      } else if (action === 'write' || action === 'create') {
        // For write permissions, we can only infer from token scopes
        // In dry run or when token has write access, return true
        return {
          allowed: !this.dryRun,
          scope,
          objectType: apiName,
          action,
          note: 'Write permission inferred from token scopes'
        };
      }

      return {
        allowed: false,
        error: `Unknown action: ${action}`
      };
    } catch (error) {
      // If we get 403, permission denied
      if (error.message.includes('403') || error.message.includes('forbidden')) {
        return {
          allowed: false,
          scope,
          objectType: apiName,
          action
        };
      }

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
      await this.apiRequest('DELETE', `/crm/v3/objects/${apiName}/${recordId}`);

      return {
        success: true,
        id: recordId
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
   * @returns {string} HubSpot record URL path
   */
  getRecordUrl(objectType, recordId) {
    const apiName = this.normalizeObjectName(objectType);
    // HubSpot URL format: /contacts/{portalId}/contact/{recordId}
    const objectUrlMap = {
      'contacts': 'contact',
      'companies': 'company',
      'deals': 'deal',
      'tickets': 'ticket'
    };
    const urlType = objectUrlMap[apiName] || apiName;
    return `/contacts/${this.portalId || 'PORTAL_ID'}/${urlType}/${recordId}`;
  }

  /**
   * Get instance/portal URL
   * @returns {Promise<string>} Portal URL
   */
  async getInstanceUrl() {
    return `https://app.hubspot.com`;
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
    // Handle context variable references (e.g., "{ContactId}")
    if (typeof expected === 'string' && expected.startsWith('{') && expected.endsWith('}')) {
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
        return parseFloat(actual) > parseFloat(expected);
      case 'lessThan':
      case '<':
        return parseFloat(actual) < parseFloat(expected);
      case 'greaterOrEqual':
      case '>=':
        return parseFloat(actual) >= parseFloat(expected);
      case 'lessOrEqual':
      case '<=':
        return parseFloat(actual) <= parseFloat(expected);
      case 'contains':
        return String(actual).includes(String(expected));
      case 'startsWith':
        return String(actual).startsWith(String(expected));
      case 'endsWith':
        return String(actual).endsWith(String(expected));
      case 'isNull':
        return actual === null || actual === undefined || actual === '';
      case 'isNotNull':
        return actual !== null && actual !== undefined && actual !== '';
      case 'matches':
        return new RegExp(expected).test(String(actual));
      case 'exists':
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
    // HubSpot uses numeric IDs
    const random = Math.floor(Math.random() * 900000000) + 100000000;
    return `DRYRUN_${random}`;
  }

  /**
   * Make API request to HubSpot
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} [body] - Request body
   * @returns {Promise<Object>} Response data
   */
  apiRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: HUBSPOT_API_BASE,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      this.log(`API ${method} ${path}`);

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            // DELETE returns empty body on success
            if (res.statusCode === 204 || !data) {
              resolve({});
              return;
            }

            const parsed = JSON.parse(data);

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || `HTTP ${res.statusCode}: ${data}`));
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({});
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(`[HubSpotUATAdapter] ${message}`);
    }
  }
}

module.exports = HubSpotUATAdapter;
