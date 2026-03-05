#!/usr/bin/env node
/**
 * HubSpot Imports API Wrapper (V3 Enhanced)
 *
 * Purpose: Handle large dataset imports (>10k records) via HubSpot Imports V3 API
 * Async operations with up to 80M rows/day capacity
 *
 * WHEN TO USE:
 * - >10,000 records (batch API becomes impractical)
 * - Initial data migrations
 * - Bulk backfills
 * - Large-scale data updates
 * - Multi-object imports with associations
 *
 * V3 API FEATURES:
 * - Multi-file imports with cross-object associations
 * - Marketing contact designation (marketableContactImport)
 * - Auto-create static lists from imports (createContactListFromImport)
 * - Full column mapping configuration
 * - Date format and timezone handling
 * - Import error retrieval
 *
 * @version 2.0.0
 * @phase Bulk Operations Integration (Phase 2)
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const POLL_INTERVAL = 5000;  // Check import status every 5 seconds
const MAX_POLL_ATTEMPTS = 720;  // Max 1 hour polling (720 * 5s)
const DEFAULT_IMPORT_NAME = 'Bulk Import';

/**
 * Import modes supported by HubSpot
 */
const IMPORT_MODES = {
  UPSERT: 'UPSERT',  // Create or update based on unique identifier
  CREATE: 'CREATE',  // Create new records only
  UPDATE: 'UPDATE'   // Update existing records only
};

/**
 * Date formats supported by HubSpot
 */
const DATE_FORMATS = {
  MONTH_DAY_YEAR: 'MONTH_DAY_YEAR',     // MM/DD/YYYY
  DAY_MONTH_YEAR: 'DAY_MONTH_YEAR',     // DD/MM/YYYY
  YEAR_MONTH_DAY: 'YEAR_MONTH_DAY'      // YYYY/MM/DD
};

/**
 * Object type IDs for HubSpot standard objects
 */
const OBJECT_TYPE_IDS = {
  contacts: '0-1',
  companies: '0-2',
  deals: '0-3',
  tickets: '0-5',
  products: '0-7',
  quotes: '0-14',
  line_items: '0-8',
  marketing_events: '0-54'
};

/**
 * Column types for mapping configuration
 */
const COLUMN_TYPES = {
  HUBSPOT_OBJECT_ID: 'HUBSPOT_OBJECT_ID',
  HUBSPOT_ALTERNATE_ID: 'HUBSPOT_ALTERNATE_ID',
  FLEXIBLE_ASSOCIATION_LABEL: 'FLEXIBLE_ASSOCIATION_LABEL'
};

/**
 * Import states
 */
const IMPORT_STATES = {
  STARTED: 'STARTED',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  DEFERRED: 'DEFERRED'
};

/**
 * Enhanced Imports API Wrapper for HubSpot V3 API
 *
 * Usage:
 * const importer = new ImportsAPIWrapper(accessToken);
 *
 * // Simple import
 * await importer.importRecords({
 *   objectType: 'contacts',
 *   records: largeDataset,
 *   mode: 'UPSERT',
 *   onProgress: (status) => console.log(status.percentComplete)
 * });
 *
 * // Advanced import with V3 features
 * await importer.importRecordsAdvanced({
 *   objectType: 'contacts',
 *   records: contacts,
 *   mode: 'UPSERT',
 *   marketableContactImport: true,
 *   createContactListFromImport: true,
 *   dateFormat: 'MONTH_DAY_YEAR',
 *   timeZone: 'America/New_York',
 *   columnMappings: [...],
 *   onProgress: (status) => console.log(status)
 * });
 *
 * // Multi-file import with associations
 * await importer.importMultiFile({
 *   files: [
 *     { objectType: 'contacts', records: contacts, isAssociationSource: true },
 *     { objectType: 'companies', records: companies, associateWith: 'contacts' }
 *   ],
 *   onProgress: (status) => console.log(status)
 * });
 */
class ImportsAPIWrapper {
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('ImportsAPIWrapper requires accessToken');
    }

    this.accessToken = accessToken;
    this.pollInterval = options.pollInterval || POLL_INTERVAL;
    this.maxPollAttempts = options.maxPollAttempts || MAX_POLL_ATTEMPTS;
    this.verbose = options.verbose || false;

    this.stats = {
      totalRecords: 0,
      processedRecords: 0,
      successRecords: 0,
      errorRecords: 0,
      importId: null,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Simple import records via HubSpot Imports API (backward compatible)
   * @param {Object} config - Import configuration
   * @param {string} config.objectType - HubSpot object type (contacts, companies, deals, etc.)
   * @param {Array} config.records - Array of records to import
   * @param {string} config.mode - Import mode (UPSERT, CREATE, UPDATE)
   * @param {string} config.importName - Optional import name
   * @param {Function} config.onProgress - Optional progress callback
   * @returns {Promise<Object>} Import results
   */
  async importRecords(config) {
    this.stats.startTime = Date.now();
    const { objectType, records, mode = 'UPSERT', importName, onProgress } = config;

    if (!objectType || !records || records.length === 0) {
      throw new Error('importRecords requires objectType and records array');
    }

    if (!IMPORT_MODES[mode]) {
      throw new Error(`Invalid import mode: ${mode}. Must be one of: ${Object.keys(IMPORT_MODES).join(', ')}`);
    }

    this.stats.totalRecords = records.length;

    if (this.verbose) {
      console.log(`Imports API: Starting import of ${records.length} ${objectType} records`);
      console.log(`  Mode: ${mode}`);
      console.log(`  Name: ${importName || DEFAULT_IMPORT_NAME}`);
    }

    // Step 1: Create import
    const importId = await this.createImport({
      objectType,
      importName: importName || DEFAULT_IMPORT_NAME,
      mode
    });

    this.stats.importId = importId;

    if (this.verbose) {
      console.log(`✓ Import created: ${importId}`);
    }

    // Step 2: Upload data
    await this.uploadData(importId, records, objectType);

    if (this.verbose) {
      console.log(`✓ Data uploaded: ${records.length} records`);
    }

    // Step 3: Start import
    await this.startImport(importId);

    if (this.verbose) {
      console.log(`✓ Import started: ${importId}`);
      console.log(`Polling for completion (checking every ${this.pollInterval/1000}s)...`);
    }

    // Step 4: Poll for completion
    const result = await this.pollImportStatus(importId, onProgress);

    this.stats.endTime = Date.now();
    this.stats.processedRecords = result.numRowsProcessed || 0;
    this.stats.successRecords = result.numRowsSucceeded || 0;
    this.stats.errorRecords = result.numRowsFailed || 0;

    if (this.verbose) {
      console.log(`✓ Import complete: ${importId}`);
      console.log(`  Processed: ${this.stats.processedRecords}`);
      console.log(`  Success: ${this.stats.successRecords}`);
      console.log(`  Errors: ${this.stats.errorRecords}`);
    }

    return {
      importId,
      ...result,
      stats: this.getStats()
    };
  }

  /**
   * Advanced import with full V3 API features
   * @param {Object} config - Advanced import configuration
   * @param {string} config.objectType - HubSpot object type
   * @param {Array} config.records - Array of records to import
   * @param {string} config.mode - Import mode (UPSERT, CREATE, UPDATE)
   * @param {string} config.importName - Optional import name
   * @param {boolean} config.marketableContactImport - Mark contacts as marketing (true) or non-marketing (false)
   * @param {boolean} config.createContactListFromImport - Create static list from imported contacts
   * @param {string} config.dateFormat - Date format (MONTH_DAY_YEAR, DAY_MONTH_YEAR, YEAR_MONTH_DAY)
   * @param {string} config.timeZone - Timezone for timestamps (e.g., 'America/New_York')
   * @param {Array} config.columnMappings - Custom column mapping configuration
   * @param {Function} config.onProgress - Optional progress callback
   * @returns {Promise<Object>} Import results with errors
   */
  async importRecordsAdvanced(config) {
    this.stats.startTime = Date.now();
    const {
      objectType,
      records,
      mode = 'UPSERT',
      importName,
      marketableContactImport,
      createContactListFromImport,
      dateFormat = DATE_FORMATS.MONTH_DAY_YEAR,
      timeZone,
      columnMappings,
      onProgress
    } = config;

    if (!objectType || !records || records.length === 0) {
      throw new Error('importRecordsAdvanced requires objectType and records array');
    }

    this.stats.totalRecords = records.length;
    const objectTypeId = OBJECT_TYPE_IDS[objectType] || objectType;

    if (this.verbose) {
      console.log(`Imports V3 API: Starting advanced import`);
      console.log(`  Object: ${objectType} (${objectTypeId})`);
      console.log(`  Records: ${records.length}`);
      console.log(`  Mode: ${mode}`);
      console.log(`  Marketing: ${marketableContactImport ?? 'default'}`);
      console.log(`  Create List: ${createContactListFromImport ?? false}`);
    }

    // Build import request payload
    const importRequest = this.buildImportRequest({
      importName: importName || DEFAULT_IMPORT_NAME,
      objectType,
      objectTypeId,
      mode,
      records,
      marketableContactImport,
      createContactListFromImport,
      dateFormat,
      timeZone,
      columnMappings
    });

    // Execute import via multipart form
    const importId = await this.executeMultipartImport(importRequest, records, objectType);
    this.stats.importId = importId;

    if (this.verbose) {
      console.log(`✓ Import created and started: ${importId}`);
    }

    // Poll for completion
    const result = await this.pollImportStatus(importId, onProgress);

    this.stats.endTime = Date.now();
    this.stats.processedRecords = result.numRowsProcessed || 0;
    this.stats.successRecords = result.numRowsSucceeded || 0;
    this.stats.errorRecords = result.numRowsFailed || 0;

    // Fetch errors if any
    let errors = [];
    if (this.stats.errorRecords > 0) {
      errors = await this.getImportErrors(importId);
    }

    return {
      importId,
      ...result,
      errors,
      stats: this.getStats()
    };
  }

  /**
   * Multi-file import with cross-object associations
   * @param {Object} config - Multi-file import configuration
   * @param {Array} config.files - Array of file configurations
   * @param {string} config.files[].objectType - Object type for this file
   * @param {Array} config.files[].records - Records for this file
   * @param {string} config.files[].mode - Import mode for this object
   * @param {boolean} config.files[].isAssociationSource - Is this the source for associations
   * @param {string} config.files[].associateWith - Object type to associate with
   * @param {string} config.files[].commonColumn - Column used for association matching
   * @param {string} config.importName - Optional import name
   * @param {string} config.dateFormat - Date format
   * @param {string} config.timeZone - Timezone
   * @param {Function} config.onProgress - Progress callback
   * @returns {Promise<Object>} Import results
   */
  async importMultiFile(config) {
    this.stats.startTime = Date.now();
    const {
      files,
      importName,
      dateFormat = DATE_FORMATS.MONTH_DAY_YEAR,
      timeZone,
      onProgress
    } = config;

    if (!files || files.length === 0) {
      throw new Error('importMultiFile requires files array');
    }

    // Calculate total records
    this.stats.totalRecords = files.reduce((sum, f) => sum + (f.records?.length || 0), 0);

    if (this.verbose) {
      console.log(`Imports V3 API: Starting multi-file import`);
      console.log(`  Files: ${files.length}`);
      console.log(`  Total Records: ${this.stats.totalRecords}`);
    }

    // Build multi-file import request
    const importRequest = this.buildMultiFileImportRequest({
      importName: importName || DEFAULT_IMPORT_NAME,
      files,
      dateFormat,
      timeZone
    });

    // Execute multi-file import
    const importId = await this.executeMultiFileImport(importRequest, files);
    this.stats.importId = importId;

    // Poll for completion
    const result = await this.pollImportStatus(importId, onProgress);

    this.stats.endTime = Date.now();
    this.stats.processedRecords = result.numRowsProcessed || 0;
    this.stats.successRecords = result.numRowsSucceeded || 0;
    this.stats.errorRecords = result.numRowsFailed || 0;

    // Fetch errors if any
    let errors = [];
    if (this.stats.errorRecords > 0) {
      errors = await this.getImportErrors(importId);
    }

    return {
      importId,
      ...result,
      errors,
      stats: this.getStats()
    };
  }

  /**
   * Build import request payload for V3 API
   */
  buildImportRequest(config) {
    const {
      importName,
      objectType,
      objectTypeId,
      mode,
      records,
      marketableContactImport,
      createContactListFromImport,
      dateFormat,
      timeZone,
      columnMappings
    } = config;

    // Get column headers from records
    const properties = new Set();
    records.forEach(record => {
      Object.keys(record.properties || record).forEach(key => properties.add(key));
    });
    const headers = Array.from(properties);

    // Build column mappings if not provided
    const mappings = columnMappings || headers.map(header => ({
      columnObjectTypeId: objectTypeId,
      columnName: header,
      propertyName: header
    }));

    const request = {
      name: importName,
      importOperations: {
        [objectTypeId]: mode
      },
      dateFormat,
      files: [{
        fileName: `${objectType}_import.csv`,
        fileImportPage: {
          hasHeader: true,
          columnMappings: mappings
        }
      }]
    };

    // Add optional fields
    if (timeZone) {
      request.timeZone = timeZone;
    }

    if (marketableContactImport !== undefined && objectType === 'contacts') {
      request.marketableContactImport = marketableContactImport;
    }

    if (createContactListFromImport && objectType === 'contacts') {
      request.createContactListFromImport = true;
    }

    return request;
  }

  /**
   * Build multi-file import request
   */
  buildMultiFileImportRequest(config) {
    const { importName, files, dateFormat, timeZone } = config;

    const importOperations = {};
    const fileConfigs = [];

    files.forEach((file, index) => {
      const objectTypeId = OBJECT_TYPE_IDS[file.objectType] || file.objectType;
      importOperations[objectTypeId] = file.mode || 'UPSERT';

      // Get headers
      const properties = new Set();
      file.records.forEach(record => {
        Object.keys(record.properties || record).forEach(key => properties.add(key));
      });
      const headers = Array.from(properties);

      // Build column mappings
      const columnMappings = headers.map(header => {
        const mapping = {
          columnObjectTypeId: objectTypeId,
          columnName: header,
          propertyName: header
        };

        // Handle association columns
        if (file.commonColumn === header && file.isAssociationSource) {
          mapping.associationIdentifierColumn = true;
        }

        if (file.associateWith && file.commonColumn === header) {
          const targetObjectTypeId = OBJECT_TYPE_IDS[file.associateWith] || file.associateWith;
          mapping.foreignKeyType = {
            associationTypeId: this.getAssociationTypeId(objectTypeId, targetObjectTypeId),
            associationCategory: 'HUBSPOT_DEFINED'
          };
          mapping.toColumnObjectTypeId = targetObjectTypeId;
        }

        return mapping;
      });

      fileConfigs.push({
        fileName: `${file.objectType}_${index}.csv`,
        fileImportPage: {
          hasHeader: true,
          columnMappings
        }
      });
    });

    const request = {
      name: importName,
      dateFormat,
      importOperations,
      files: fileConfigs
    };

    if (timeZone) {
      request.timeZone = timeZone;
    }

    return request;
  }

  /**
   * Execute import via multipart form data (V3 API)
   */
  async executeMultipartImport(importRequest, records, objectType) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports`;

    // Convert records to CSV
    const csv = this.convertToCSV(records);

    // Create form data
    const formData = new FormData();
    formData.append('importRequest', JSON.stringify(importRequest));

    const csvBlob = new Blob([csv], { type: 'text/csv' });
    formData.append('files', csvBlob, `${objectType}_import.csv`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Import creation failed: HTTP ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    return result.id;
  }

  /**
   * Execute multi-file import
   */
  async executeMultiFileImport(importRequest, files) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports`;

    const formData = new FormData();
    formData.append('importRequest', JSON.stringify(importRequest));

    // Add each file
    files.forEach((file, index) => {
      const csv = this.convertToCSV(file.records);
      const csvBlob = new Blob([csv], { type: 'text/csv' });
      formData.append('files', csvBlob, `${file.objectType}_${index}.csv`);
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Multi-file import failed: HTTP ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    return result.id;
  }

  /**
   * Get import errors
   * @param {string} importId - Import ID
   * @returns {Promise<Array>} Array of error objects
   */
  async getImportErrors(importId) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/${importId}/errors`;

    try {
      const response = await this.makeRequest(url, null, 'GET');
      return response.results || [];
    } catch (error) {
      if (this.verbose) {
        console.error('Failed to fetch import errors:', error.message);
      }
      return [];
    }
  }

  /**
   * Cancel an active import
   * @param {string} importId - Import ID to cancel
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelImport(importId) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/${importId}/cancel`;

    return await this.makeRequest(url, {}, 'POST');
  }

  /**
   * Get all active imports
   * @returns {Promise<Array>} List of active imports
   */
  async listImports() {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/`;

    const response = await this.makeRequest(url, null, 'GET');
    return response.results || [];
  }

  /**
   * Get import status
   * @param {string} importId - Import ID
   * @returns {Promise<Object>} Import status
   */
  async getImportStatus(importId) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/${importId}`;

    return await this.makeRequest(url, null, 'GET');
  }

  /**
   * Get association type ID for two object types
   */
  getAssociationTypeId(fromObjectTypeId, toObjectTypeId) {
    // Common association type IDs
    const associations = {
      '0-1_0-2': 1,  // Contact to Company
      '0-2_0-1': 2,  // Company to Contact
      '0-1_0-3': 3,  // Contact to Deal
      '0-3_0-1': 4,  // Deal to Contact
      '0-2_0-3': 5,  // Company to Deal
      '0-3_0-2': 6,  // Deal to Company
    };

    const key = `${fromObjectTypeId}_${toObjectTypeId}`;
    return associations[key] || 0;
  }

  /**
   * Create import via Imports API (legacy method for backward compatibility)
   */
  async createImport(config) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports`;

    const payload = {
      name: config.importName,
      importOperations: {
        [config.objectType]: config.mode
      }
    };

    const response = await this.makeRequest(url, payload, 'POST');
    return response.id;
  }

  /**
   * Upload data to import (legacy method)
   */
  async uploadData(importId, records, objectType) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/${importId}/files`;

    // Convert records to CSV format
    const csv = this.convertToCSV(records);

    // Create form data
    const formData = new FormData();
    const blob = new Blob([csv], { type: 'text/csv' });
    formData.append('file', blob, `${objectType}_import.csv`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Upload failed: HTTP ${response.status}: ${errorBody}`);
    }

    return await response.json();
  }

  /**
   * Start import execution (legacy method)
   */
  async startImport(importId) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/${importId}/start`;

    return await this.makeRequest(url, {}, 'POST');
  }

  /**
   * Poll import status until complete
   */
  async pollImportStatus(importId, onProgress) {
    const url = `${HUBSPOT_API_BASE}/crm/v3/imports/${importId}`;

    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      const status = await this.makeRequest(url, null, 'GET');

      // Call progress callback if provided
      if (onProgress && typeof onProgress === 'function') {
        const progress = {
          state: status.state,
          percentComplete: this.calculatePercentComplete(status),
          processed: status.numRowsProcessed || 0,
          succeeded: status.numRowsSucceeded || 0,
          failed: status.numRowsFailed || 0
        };
        onProgress(progress);
      }

      // Check if complete
      if (status.state === 'COMPLETE' || status.state === 'DONE') {
        return status;
      }

      // Check if failed
      if (status.state === 'FAILED' || status.state === 'CANCELED') {
        throw new Error(`Import ${status.state.toLowerCase()}: ${status.metadata?.errorMessage || 'Unknown error'}`);
      }

      // Still processing, wait and retry
      await this.delay(this.pollInterval);
    }

    throw new Error(`Import polling timeout after ${this.maxPollAttempts * this.pollInterval / 1000}s`);
  }

  /**
   * Convert records array to CSV format
   */
  convertToCSV(records) {
    if (records.length === 0) {
      throw new Error('Cannot convert empty array to CSV');
    }

    // Get all unique property names
    const properties = new Set();
    records.forEach(record => {
      Object.keys(record.properties || record).forEach(key => properties.add(key));
    });

    const headers = Array.from(properties);

    // Build CSV
    const rows = [headers.join(',')];

    records.forEach(record => {
      const props = record.properties || record;
      const values = headers.map(header => {
        const value = props[header];
        // Escape commas and quotes
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      rows.push(values.join(','));
    });

    return rows.join('\n');
  }

  /**
   * Calculate percent complete from status
   */
  calculatePercentComplete(status) {
    const total = status.numRowsTotal || this.stats.totalRecords;
    const processed = status.numRowsProcessed || 0;
    if (total === 0) return 0;
    return Math.round((processed / total) * 100);
  }

  /**
   * Make HTTP request
   */
  async makeRequest(url, payload, method) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (payload && method !== 'GET') {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    return await response.json();
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const duration = this.stats.endTime - this.stats.startTime;
    const recordsPerSecond = duration > 0 ? (this.stats.processedRecords / (duration / 1000)).toFixed(2) : 0;
    const successRate = this.stats.processedRecords > 0
      ? ((this.stats.successRecords / this.stats.processedRecords) * 100).toFixed(2) + '%'
      : '0%';

    return {
      ...this.stats,
      duration: `${duration}ms`,
      durationMinutes: `${(duration / 60000).toFixed(2)}min`,
      recordsPerSecond,
      successRate
    };
  }

  /**
   * Utility: Delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ImportsAPIWrapper;
module.exports.IMPORT_MODES = IMPORT_MODES;
module.exports.DATE_FORMATS = DATE_FORMATS;
module.exports.OBJECT_TYPE_IDS = OBJECT_TYPE_IDS;
module.exports.COLUMN_TYPES = COLUMN_TYPES;
module.exports.IMPORT_STATES = IMPORT_STATES;

// CLI usage
if (require.main === module) {
  console.log('ImportsAPIWrapper V2 - HubSpot Imports V3 API Enhanced');
  console.log('For >10,000 records - Up to 80M rows/day capacity');
  console.log('');
  console.log('NEW IN V2:');
  console.log('  - Multi-file imports with associations');
  console.log('  - marketableContactImport flag');
  console.log('  - createContactListFromImport flag');
  console.log('  - Full column mapping configuration');
  console.log('  - Date format and timezone handling');
  console.log('  - Import error retrieval');
  console.log('');
  console.log('Usage Examples:');
  console.log('');
  console.log('// Simple import (backward compatible)');
  console.log('const importer = new ImportsAPIWrapper(accessToken);');
  console.log('await importer.importRecords({ objectType, records, mode });');
  console.log('');
  console.log('// Advanced import with V3 features');
  console.log('await importer.importRecordsAdvanced({');
  console.log('  objectType: "contacts",');
  console.log('  records: data,');
  console.log('  marketableContactImport: true,');
  console.log('  createContactListFromImport: true,');
  console.log('  dateFormat: "MONTH_DAY_YEAR",');
  console.log('  timeZone: "America/New_York"');
  console.log('});');
  console.log('');
  console.log('// Multi-file import with associations');
  console.log('await importer.importMultiFile({');
  console.log('  files: [');
  console.log('    { objectType: "contacts", records: contacts, isAssociationSource: true, commonColumn: "email" },');
  console.log('    { objectType: "companies", records: companies, associateWith: "contacts", commonColumn: "email" }');
  console.log('  ]');
  console.log('});');
}
