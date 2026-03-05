#!/usr/bin/env node

/**
 * UAT Platform Adapter
 *
 * Abstract interface for platform-specific UAT test operations.
 * Provides a unified API for creating records, verifying fields, and checking permissions
 * across different platforms (Salesforce, HubSpot, etc.).
 *
 * @module uat-platform-adapter
 * @version 1.0.0
 *
 * @example
 * const { UATPlatformAdapter } = require('./uat-platform-adapter');
 *
 * const adapter = new UATPlatformAdapter('salesforce', { orgAlias: 'my-sandbox' });
 * const result = await adapter.createRecord('Account', { Name: 'Test Account' });
 * console.log('Created:', result.id);
 */

const fs = require('fs');
const path = require('path');

const ADAPTER_FILES = {
  salesforce: 'uat-salesforce-adapter',
  hubspot: 'uat-hubspot-adapter'
};

function resolveAdapterModule(platform, relativePath) {
  const candidates = [
    path.resolve(__dirname, '../../../../..', 'domains', platform, relativePath),
    path.resolve(__dirname, '../../../../../..', `${platform}-plugin`, relativePath),
    path.resolve(process.cwd(), '.claude-plugins', 'opspal-core-plugin', 'packages', 'domains', platform, relativePath),
    path.resolve(process.cwd(), '.claude-plugins', `${platform}-plugin`, relativePath)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) || fs.existsSync(`${candidate}.js`)) {
      return candidate;
    }
  }

  return candidates[0];
}

/**
 * Supported platforms
 */
const SUPPORTED_PLATFORMS = ['salesforce', 'hubspot'];

/**
 * Platform adapter factory and unified interface
 */
class UATPlatformAdapter {
  /**
   * Create a platform adapter
   * @param {string} platform - Platform name ('salesforce', 'hubspot')
   * @param {Object} config - Platform-specific configuration
   * @param {string} [config.orgAlias] - Salesforce org alias
   * @param {string} [config.portalId] - HubSpot portal ID
   * @param {boolean} [config.verbose=false] - Enable verbose logging
   * @param {boolean} [config.dryRun=false] - Dry run mode (no actual operations)
   */
  constructor(platform, config = {}) {
    if (!SUPPORTED_PLATFORMS.includes(platform.toLowerCase())) {
      throw new Error(`Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(', ')}`);
    }

    this.platform = platform.toLowerCase();
    this.config = config;
    this.verbose = config.verbose || false;
    this.dryRun = config.dryRun || false;
    this.adapter = null;

    this.loadAdapter();
  }

  /**
   * Load platform-specific adapter
   */
  loadAdapter() {
    try {
      switch (this.platform) {
        case 'salesforce':
          // Load from salesforce-plugin
          const sfAdapterPath = resolveAdapterModule('salesforce', `scripts/lib/${ADAPTER_FILES.salesforce}`);
          const SalesforceAdapter = require(sfAdapterPath);
          this.adapter = new SalesforceAdapter(this.config.orgAlias, {
            verbose: this.verbose,
            dryRun: this.dryRun
          });
          break;

        case 'hubspot':
          // Load from hubspot-plugin
          const hsAdapterPath = resolveAdapterModule('hubspot', `scripts/lib/${ADAPTER_FILES.hubspot}`);
          const HubSpotAdapter = require(hsAdapterPath);
          this.adapter = new HubSpotAdapter({
            accessToken: this.config.accessToken,
            portalId: this.config.portalId,
            verbose: this.verbose,
            dryRun: this.dryRun
          });
          break;

        default:
          throw new Error(`No adapter available for platform: ${this.platform}`);
      }

      this.log(`✓ Loaded ${this.platform} adapter`);
    } catch (error) {
      // Try alternative path (for development vs installed plugin scenarios)
      if (error.code === 'MODULE_NOT_FOUND') {
        this.tryAlternativePath();
      } else {
        throw error;
      }
    }
  }

  /**
   * Try alternative adapter path for different installation scenarios
   */
  tryAlternativePath() {
    try {
      const adapterFile = ADAPTER_FILES[this.platform];
      if (this.platform === 'salesforce' && adapterFile) {
        const altPath = resolveAdapterModule('salesforce', `scripts/lib/${adapterFile}`);
        const SalesforceAdapter = require(altPath);
        this.adapter = new SalesforceAdapter(this.config.orgAlias, {
          verbose: this.verbose,
          dryRun: this.dryRun
        });
        this.log(`✓ Loaded ${this.platform} adapter (alternative path)`);
      } else if (this.platform === 'hubspot' && adapterFile) {
        const altPath = resolveAdapterModule('hubspot', `scripts/lib/${adapterFile}`);
        const HubSpotAdapter = require(altPath);
        this.adapter = new HubSpotAdapter({
          accessToken: this.config.accessToken,
          portalId: this.config.portalId,
          verbose: this.verbose,
          dryRun: this.dryRun
        });
        this.log(`✓ Loaded ${this.platform} adapter (alternative path)`);
      }
    } catch (error) {
      throw new Error(`Failed to load ${this.platform} adapter: ${error.message}`);
    }
  }

  // ============================================
  // UNIFIED API METHODS
  // ============================================

  /**
   * Create a record
   * @param {string} objectType - Object type (e.g., 'Account', 'Contact')
   * @param {Object} data - Record data
   * @param {Object} [options] - Creation options
   * @returns {Promise<Object>} Creation result with id and recordUrl
   */
  async createRecord(objectType, data, options = {}) {
    this.validateAdapter();
    this.log(`Creating ${objectType}...`);

    const result = await this.adapter.createRecord(objectType, data, options);

    if (result.success) {
      this.log(`  ✓ Created ${objectType}: ${result.id}`);
    } else {
      this.log(`  ✗ Failed to create ${objectType}: ${result.error}`);
    }

    return result;
  }

  /**
   * Update a record
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {Object} data - Update data
   * @param {Object} [options] - Update options
   * @returns {Promise<Object>} Update result
   */
  async updateRecord(objectType, recordId, data, options = {}) {
    this.validateAdapter();
    this.log(`Updating ${objectType} (${recordId})...`);

    const result = await this.adapter.updateRecord(objectType, recordId, data, options);

    if (result.success) {
      this.log(`  ✓ Updated ${objectType}: ${recordId}`);
    } else {
      this.log(`  ✗ Failed to update ${objectType}: ${result.error}`);
    }

    return result;
  }

  /**
   * Query a record
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {Array<string>} [fields] - Fields to retrieve (null = all)
   * @returns {Promise<Object>} Query result with record data
   */
  async queryRecord(objectType, recordId, fields = null) {
    this.validateAdapter();
    this.log(`Querying ${objectType} (${recordId})...`);

    return await this.adapter.queryRecord(objectType, recordId, fields);
  }

  /**
   * Verify a field value
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @param {string} fieldName - Field to verify
   * @param {*} expectedValue - Expected value
   * @param {string} [operator='equals'] - Comparison operator
   * @returns {Promise<Object>} Verification result
   */
  async verifyField(objectType, recordId, fieldName, expectedValue, operator = 'equals') {
    this.validateAdapter();
    this.log(`Verifying ${objectType}.${fieldName}...`);

    const result = await this.adapter.verifyField(objectType, recordId, fieldName, expectedValue, operator);

    if (result.passed) {
      this.log(`  ✓ ${fieldName} verified: ${result.actual}`);
    } else {
      this.log(`  ✗ ${fieldName} mismatch: expected ${expectedValue}, got ${result.actual}`);
    }

    return result;
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
    this.validateAdapter();
    this.log(`Verifying rollup ${parentObject}.${rollupConfig.parentField}...`);

    const result = await this.adapter.verifyRollup(parentObject, parentId, childObject, rollupConfig);

    if (result.passed) {
      this.log(`  ✓ Rollup verified: ${result.parentValue} = ${result.calculatedValue}`);
    } else {
      this.log(`  ✗ Rollup mismatch: ${result.parentValue} ≠ ${result.calculatedValue}`);
    }

    return result;
  }

  /**
   * Check permission/access
   * @param {string} profile - Profile or permission set name
   * @param {string} objectType - Object type
   * @param {string} action - Action to check (create, read, update, delete)
   * @returns {Promise<Object>} Permission check result
   */
  async checkPermission(profile, objectType, action) {
    this.validateAdapter();
    this.log(`Checking ${profile} permission for ${action} on ${objectType}...`);

    const result = await this.adapter.checkPermission(profile, objectType, action);

    if (result.allowed) {
      this.log(`  ✓ ${action} allowed`);
    } else {
      this.log(`  ✗ ${action} denied`);
    }

    return result;
  }

  /**
   * Delete a record
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteRecord(objectType, recordId) {
    this.validateAdapter();
    this.log(`Deleting ${objectType} (${recordId})...`);

    return await this.adapter.deleteRecord(objectType, recordId);
  }

  /**
   * Cleanup created records (in reverse order)
   * @param {Array<Object>} records - Array of {objectType, id} to delete
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanup(records) {
    this.validateAdapter();
    this.log(`Cleaning up ${records.length} record(s)...`);

    const results = [];
    // Delete in reverse order to handle dependencies
    for (const record of [...records].reverse()) {
      try {
        const result = await this.deleteRecord(record.objectType || record.object, record.id);
        results.push({ ...record, success: result.success });
      } catch (error) {
        results.push({ ...record, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.log(`  Cleanup complete: ${successCount}/${records.length} deleted`);

    return {
      success: successCount === records.length,
      results
    };
  }

  /**
   * Get record URL for the platform
   * @param {string} objectType - Object type
   * @param {string} recordId - Record ID
   * @returns {string} URL to the record
   */
  getRecordUrl(objectType, recordId) {
    this.validateAdapter();
    return this.adapter.getRecordUrl(objectType, recordId);
  }

  /**
   * Get platform-specific instance URL
   * @returns {Promise<string>} Instance URL
   */
  async getInstanceUrl() {
    this.validateAdapter();
    return await this.adapter.getInstanceUrl();
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Validate that adapter is loaded
   */
  validateAdapter() {
    if (!this.adapter) {
      throw new Error(`${this.platform} adapter not loaded`);
    }
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Get platform name
   */
  getPlatform() {
    return this.platform;
  }

  /**
   * Check if adapter is ready
   */
  isReady() {
    return this.adapter !== null;
  }
}

/**
 * Base adapter class for platform implementations
 * Platform-specific adapters should extend this class
 */
class BasePlatformAdapter {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.createdRecords = [];
  }

  // Abstract methods - must be implemented by subclasses
  async createRecord(objectType, data, options) { throw new Error('Not implemented'); }
  async updateRecord(objectType, recordId, data, options) { throw new Error('Not implemented'); }
  async queryRecord(objectType, recordId, fields) { throw new Error('Not implemented'); }
  async verifyField(objectType, recordId, fieldName, expectedValue, operator) { throw new Error('Not implemented'); }
  async verifyRollup(parentObject, parentId, childObject, rollupConfig) { throw new Error('Not implemented'); }
  async checkPermission(profile, objectType, action) { throw new Error('Not implemented'); }
  async deleteRecord(objectType, recordId) { throw new Error('Not implemented'); }
  getRecordUrl(objectType, recordId) { throw new Error('Not implemented'); }
  async getInstanceUrl() { throw new Error('Not implemented'); }

  /**
   * Track created record for cleanup
   */
  trackRecord(objectType, recordId) {
    this.createdRecords.push({ objectType, id: recordId, createdAt: new Date().toISOString() });
  }

  /**
   * Get all created records
   */
  getCreatedRecords() {
    return this.createdRecords;
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

module.exports = {
  UATPlatformAdapter,
  BasePlatformAdapter,
  SUPPORTED_PLATFORMS
};
