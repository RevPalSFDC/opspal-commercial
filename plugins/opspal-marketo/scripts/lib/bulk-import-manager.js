/**
 * Bulk Import Manager for Marketo API
 *
 * Manages the lifecycle of bulk import jobs for leads.
 * Handles file upload, job monitoring, and error retrieval.
 *
 * API Constraints:
 * - Concurrent imports: 10 running
 * - Recommended batch size: 10K-50K rows per file
 * - Supported formats: CSV, TSV
 *
 * @module bulk-import-manager
 * @version 1.0.0
 */

const rateLimitManager = require('./rate-limit-manager');

/**
 * Default import configuration
 */
const DEFAULT_CONFIG = {
  pollIntervalMs: 10000,      // 10 seconds between polls
  maxPollAttempts: 180,       // 30 minutes max wait
  format: 'csv',              // Default format
  lookupField: 'email',       // Default dedupe field
  onStatusChange: null,       // Status change callback
  onProgress: null,           // Progress callback
  validateData: true,         // Validate data before import
};

/**
 * Import job status constants
 */
const ImportStatus = {
  QUEUED: 'Queued',
  IMPORTING: 'Importing',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
  WARNING: 'Warning',
};

/**
 * Validate import data structure
 *
 * @param {Array<Object>} data - Data to validate
 * @param {string} lookupField - Dedupe field
 * @throws {Error} If validation fails
 */
function validateImportData(data, lookupField) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Import data must be a non-empty array');
  }

  // Check first record has lookup field
  if (!data[0][lookupField]) {
    throw new Error(`Lookup field '${lookupField}' not found in data`);
  }

  // Check for required fields
  const missingLookup = data.filter((row, index) => {
    if (!row[lookupField]) {
      return true;
    }
    return false;
  });

  if (missingLookup.length > 0) {
    throw new Error(
      `${missingLookup.length} rows missing lookup field '${lookupField}'`
    );
  }

  // Warn about large batches
  if (data.length > 50000) {
    console.warn(
      `Large import detected (${data.length} rows). ` +
      `Consider splitting into multiple batches for better performance.`
    );
  }

  return {
    valid: true,
    rowCount: data.length,
    fields: Object.keys(data[0]),
  };
}

/**
 * Convert data array to CSV string
 *
 * @param {Array<Object>} data - Data to convert
 * @returns {string} CSV content
 */
function arrayToCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const lines = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(h => {
      const value = row[h];
      if (value === null || value === undefined) return '';
      // Quote strings containing commas or quotes
      const strValue = String(value);
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Import leads in bulk
 *
 * @param {Object} params - Import parameters
 * @param {Array<Object>|string} params.data - Data array or CSV string
 * @param {string} [params.format='csv'] - Data format
 * @param {string} [params.lookupField='email'] - Dedupe field
 * @param {number} [params.listId] - Static list ID to add leads to
 * @param {string} [params.partitionName] - Lead partition name
 * @param {Object} [options] - Execution options
 * @returns {Promise<ImportResult>} Import result
 *
 * @example
 * const result = await importLeads({
 *   data: [
 *     { email: 'john@example.com', firstName: 'John' },
 *     { email: 'jane@example.com', firstName: 'Jane' }
 *   ],
 *   lookupField: 'email',
 *   listId: 1234
 * });
 */
async function importLeads(params, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const {
    data,
    format = config.format,
    lookupField = config.lookupField,
    listId,
    partitionName,
  } = params;

  const result = {
    batchId: null,
    status: null,
    numOfLeadsProcessed: 0,
    numOfRowsFailed: 0,
    numOfRowsWithWarning: 0,
    failures: null,
    warnings: null,
    startTime: new Date().toISOString(),
    endTime: null,
    error: null,
  };

  try {
    // Prepare data
    let csvContent;
    if (typeof data === 'string') {
      csvContent = data;
    } else if (Array.isArray(data)) {
      // Validate data structure
      if (config.validateData) {
        validateImportData(data, lookupField);
      }
      csvContent = arrayToCSV(data);
    } else {
      throw new Error('Data must be an array of objects or CSV string');
    }

    // Step 1: Create import job
    await rateLimitManager.waitIfNeeded();
    const createResponse = await globalThis.mcp__marketo__bulk_lead_import_create({
      file: csvContent,
      format,
      lookupField,
      listId,
      partitionName,
    });

    if (!createResponse.success) {
      throw new Error(`Import create failed: ${createResponse.errors?.[0]?.message}`);
    }

    result.batchId = createResponse.result[0].batchId;
    result.status = ImportStatus.QUEUED;

    if (config.onStatusChange) {
      config.onStatusChange(result.batchId, result.status);
    }

    // Step 2: Poll for completion
    let pollCount = 0;

    while (
      result.status !== ImportStatus.COMPLETE &&
      result.status !== ImportStatus.FAILED &&
      pollCount < config.maxPollAttempts
    ) {
      await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs));
      pollCount++;

      await rateLimitManager.waitIfNeeded();
      const statusResponse = await globalThis.mcp__marketo__bulk_import_status({
        batchId: result.batchId,
      });

      if (!statusResponse.success) {
        throw new Error(`Status check failed: ${statusResponse.errors?.[0]?.message}`);
      }

      const jobStatus = statusResponse.result[0];
      result.status = jobStatus.status;
      result.numOfLeadsProcessed = jobStatus.numOfLeadsProcessed || 0;
      result.numOfRowsFailed = jobStatus.numOfRowsFailed || 0;
      result.numOfRowsWithWarning = jobStatus.numOfRowsWithWarning || 0;

      if (config.onProgress) {
        config.onProgress(result.batchId, result.status, result.numOfLeadsProcessed);
      }

      if (config.onStatusChange) {
        config.onStatusChange(result.batchId, result.status);
      }
    }

    if (pollCount >= config.maxPollAttempts && result.status !== ImportStatus.COMPLETE) {
      throw new Error(`Import timed out after ${pollCount} polls. Status: ${result.status}`);
    }

    // Step 3: Get failures if any
    if (result.numOfRowsFailed > 0) {
      await rateLimitManager.waitIfNeeded();
      result.failures = await globalThis.mcp__marketo__bulk_import_failures({
        batchId: result.batchId,
      });
    }

    // Step 4: Get warnings if any
    if (result.numOfRowsWithWarning > 0) {
      await rateLimitManager.waitIfNeeded();
      result.warnings = await globalThis.mcp__marketo__bulk_import_warnings({
        batchId: result.batchId,
      });
    }

    result.endTime = new Date().toISOString();
    return result;

  } catch (error) {
    result.error = error.message;
    result.status = ImportStatus.FAILED;
    result.endTime = new Date().toISOString();
    throw error;
  }
}

/**
 * Check import job status
 *
 * @param {string} batchId - Import batch ID
 * @returns {Promise<Object>} Status information
 */
async function checkImportStatus(batchId) {
  await rateLimitManager.waitIfNeeded();
  const response = await globalThis.mcp__marketo__bulk_import_status({ batchId });

  if (!response.success) {
    throw new Error(`Status check failed: ${response.errors?.[0]?.message}`);
  }

  return response.result[0];
}

/**
 * Get import failures for a batch
 *
 * @param {string} batchId - Import batch ID
 * @returns {Promise<string>} CSV of failed rows
 */
async function getImportFailures(batchId) {
  await rateLimitManager.waitIfNeeded();
  return await globalThis.mcp__marketo__bulk_import_failures({ batchId });
}

/**
 * Get import warnings for a batch
 *
 * @param {string} batchId - Import batch ID
 * @returns {Promise<string>} CSV of rows with warnings
 */
async function getImportWarnings(batchId) {
  await rateLimitManager.waitIfNeeded();
  return await globalThis.mcp__marketo__bulk_import_warnings({ batchId });
}

/**
 * Batch import with automatic chunking
 *
 * @param {Array<Object>} data - Full dataset to import
 * @param {Object} params - Import parameters
 * @param {number} [chunkSize=25000] - Records per chunk
 * @param {Object} [options] - Execution options
 * @returns {Promise<Array<ImportResult>>} Results for each chunk
 */
async function batchImport(data, params, chunkSize = 25000, options = {}) {
  const results = [];
  const chunks = [];

  // Split data into chunks
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  console.log(`Importing ${data.length} records in ${chunks.length} chunks`);

  // Process chunks sequentially to respect concurrent limits
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} records)`);

    try {
      const result = await importLeads(
        { ...params, data: chunks[i] },
        options
      );
      results.push({ chunk: i + 1, ...result });
    } catch (error) {
      results.push({
        chunk: i + 1,
        status: ImportStatus.FAILED,
        error: error.message,
      });

      // Continue with next chunk unless abortOnError
      if (options.abortOnError) {
        throw error;
      }
    }

    // Brief pause between chunks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Generate import summary report
 *
 * @param {Array<ImportResult>} results - Import results
 * @returns {Object} Summary statistics
 */
function generateImportSummary(results) {
  const summary = {
    totalChunks: results.length,
    successfulChunks: 0,
    failedChunks: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalWarnings: 0,
    duration: 0,
  };

  for (const result of results) {
    if (result.status === ImportStatus.COMPLETE) {
      summary.successfulChunks++;
    } else if (result.status === ImportStatus.FAILED) {
      summary.failedChunks++;
    }

    summary.totalProcessed += result.numOfLeadsProcessed || 0;
    summary.totalFailed += result.numOfRowsFailed || 0;
    summary.totalWarnings += result.numOfRowsWithWarning || 0;

    if (result.startTime && result.endTime) {
      const start = new Date(result.startTime);
      const end = new Date(result.endTime);
      summary.duration += (end - start) / 1000;
    }
  }

  summary.successRate = (
    (summary.totalProcessed / (summary.totalProcessed + summary.totalFailed)) * 100
  ).toFixed(2) + '%';

  return summary;
}

// Export module functions
module.exports = {
  importLeads,
  batchImport,
  checkImportStatus,
  getImportFailures,
  getImportWarnings,
  validateImportData,
  arrayToCSV,
  generateImportSummary,
  ImportStatus,
};
