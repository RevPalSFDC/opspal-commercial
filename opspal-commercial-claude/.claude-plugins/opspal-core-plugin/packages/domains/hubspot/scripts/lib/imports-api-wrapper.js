#!/usr/bin/env node
/**
 * HubSpot Imports API Wrapper
 *
 * Purpose: Handle large dataset imports (>10k records) via HubSpot Imports API
 * Async operations with up to 80M rows/day capacity
 *
 * WHEN TO USE:
 * - >10,000 records (batch API becomes impractical)
 * - Initial data migrations
 * - Bulk backfills
 * - Large-scale data updates
 *
 * BEFORE: Batch API (slow for >10k, rate limits)
 * AFTER: Imports API (async, 80M rows/day capacity)
 *
 * Expected Performance: Only viable method for >10k records
 *
 * @version 1.0.0
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
 * Imports API Wrapper for large datasets
 *
 * Usage:
 * const importer = new ImportsAPIWrapper(accessToken);
 * await importer.importRecords({
 *   objectType: 'contacts',
 *   records: largeDataset,
 *   mode: 'UPSERT',
 *   onProgress: (status) => console.log(status.percentComplete)
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
   * Import records via HubSpot Imports API
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
   * Create import via Imports API
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
   * Upload data to import
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
   * Start import execution
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

// CLI usage
if (require.main === module) {
  console.log('ImportsAPIWrapper - HubSpot Imports API for Large Datasets');
  console.log('For >10,000 records - Up to 80M rows/day capacity');
  console.log('');
  console.log('Usage: const importer = new ImportsAPIWrapper(accessToken);');
  console.log('       await importer.importRecords({ objectType, records, mode });');
  console.log('');
  console.log('Import Modes:');
  console.log('  - UPSERT: Create or update based on unique identifier');
  console.log('  - CREATE: Create new records only');
  console.log('  - UPDATE: Update existing records only');
  console.log('');
  console.log('Progress Tracking:');
  console.log('  onProgress: (status) => {');
  console.log('    console.log(`${status.percentComplete}% complete`);');
  console.log('    console.log(`Processed: ${status.processed}`);');
  console.log('  }');
}
