/**
 * Bulk Export Manager for Marketo API
 *
 * Manages the lifecycle of bulk export jobs (leads and activities).
 * Handles job creation, queuing, polling, and file download.
 *
 * API Constraints:
 * - Concurrent exports: 2 running, 10 queued
 * - Daily limit: 500 MB
 * - Max date range: 31 days
 * - File retention: 7 days
 *
 * @module bulk-export-manager
 * @version 1.0.0
 */

const rateLimitManager = require('./rate-limit-manager');

/**
 * Default export configuration
 */
const DEFAULT_CONFIG = {
  pollIntervalMs: 30000,      // 30 seconds between polls
  maxPollAttempts: 120,       // 1 hour max wait
  pollBackoffMultiplier: 1.5, // Increase wait if processing
  maxPollIntervalMs: 60000,   // Max 1 minute between polls
  onStatusChange: null,       // Status change callback
  onProgress: null,           // Progress callback
  validateQuota: true,        // Check quota before export
  autoSplitDateRange: true,   // Auto-split activity exports > 31 days into batches
};

/**
 * Export job status constants
 */
const ExportStatus = {
  CREATED: 'Created',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

/**
 * Track daily export usage
 */
let dailyExportBytes = 0;
let dailyExportReset = null;
const DAILY_EXPORT_LIMIT = 500 * 1024 * 1024; // 500 MB
const MIN_QUOTA_REQUIRED_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Check and update daily export quota
 * @returns {Object} Quota status
 */
function getQuotaStatus() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);

  // Reset if new day
  if (!dailyExportReset || dailyExportReset < midnight) {
    dailyExportBytes = 0;
    dailyExportReset = midnight;
  }

  return {
    used: dailyExportBytes,
    limit: DAILY_EXPORT_LIMIT,
    remaining: DAILY_EXPORT_LIMIT - dailyExportBytes,
    percentUsed: ((dailyExportBytes / DAILY_EXPORT_LIMIT) * 100).toFixed(2),
    resetsAt: new Date(midnight.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Validate date range for export (max 31 days)
 * @param {string} startAt - Start date ISO string
 * @param {string} endAt - End date ISO string
 * @throws {Error} If date range exceeds 31 days
 */
function validateDateRange(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = end - start;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > 31) {
    throw new Error(
      `Date range of ${diffDays.toFixed(1)} days exceeds maximum of 31 days. ` +
      `Split into multiple exports.`
    );
  }

  if (diffDays < 0) {
    throw new Error('End date must be after start date.');
  }

  return { days: diffDays, valid: true };
}

function getDateRangeDays(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return (end - start) / (1000 * 60 * 60 * 24);
}

/**
 * Split a date range into windows that respect Marketo's 31-day max.
 * @param {string} startAt
 * @param {string} endAt
 * @param {number} maxDays
 * @returns {Array<{startAt: string, endAt: string}>}
 */
function splitDateRangeIntoWindows(startAt, endAt, maxDays = 31) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date range input. startAt/endAt must be valid ISO timestamps.');
  }
  if (end < start) {
    throw new Error('End date must be after start date.');
  }

  const windows = [];
  let cursor = new Date(start);

  while (cursor < end) {
    const windowStart = new Date(cursor);
    const windowEnd = new Date(cursor);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + maxDays);
    if (windowEnd > end) {
      windowEnd.setTime(end.getTime());
    }

    windows.push({
      startAt: windowStart.toISOString(),
      endAt: windowEnd.toISOString()
    });

    // Advance by 1 second to avoid overlap.
    cursor = new Date(windowEnd.getTime() + 1000);
  }

  return windows;
}

function mergeCsvChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }
  if (!chunks.every(chunk => typeof chunk === 'string')) {
    return null;
  }

  const mergedLines = [];
  let header = null;

  for (const chunk of chunks) {
    const lines = chunk.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    if (!header) {
      header = lines[0];
      mergedLines.push(header);
    }

    const payloadLines = lines[0] === header ? lines.slice(1) : lines;
    mergedLines.push(...payloadLines);
  }

  return mergedLines.length > 0 ? `${mergedLines.join('\n')}\n` : null;
}

/**
 * Create and execute a lead export job
 *
 * @param {Object} params - Export parameters
 * @param {Array<string>} params.fields - Fields to export
 * @param {Object} params.filter - Filter criteria (createdAt, updatedAt, staticListId, etc.)
 * @param {string} [params.format='CSV'] - Export format (CSV or TSV)
 * @param {Object} [options] - Execution options
 * @returns {Promise<ExportResult>} Export result with file content
 *
 * @example
 * const result = await exportLeads({
 *   fields: ['email', 'firstName', 'lastName', 'score'],
 *   filter: {
 *     createdAt: {
 *       startAt: '2026-01-01T00:00:00Z',
 *       endAt: '2026-01-31T23:59:59Z'
 *     }
 *   }
 * });
 */
async function exportLeads(params, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { fields, filter, format = 'CSV' } = params;

  // Validate date range
  if (filter.createdAt) {
    validateDateRange(filter.createdAt.startAt, filter.createdAt.endAt);
  }
  if (filter.updatedAt) {
    validateDateRange(filter.updatedAt.startAt, filter.updatedAt.endAt);
  }

  // Check quota
  if (config.validateQuota) {
    const quota = getQuotaStatus();
    if (quota.remaining < 10 * 1024 * 1024) { // Less than 10 MB remaining
      throw new Error(
        `Insufficient export quota. Only ${(quota.remaining / 1024 / 1024).toFixed(0)} MB remaining. ` +
        `Quota resets at ${quota.resetsAt}.`
      );
    }
  }

  const result = {
    type: 'lead',
    exportId: null,
    status: null,
    fileSize: 0,
    recordCount: 0,
    file: null,
    startTime: new Date().toISOString(),
    endTime: null,
    error: null,
  };

  try {
    // Step 1: Create export job
    await rateLimitManager.waitIfNeeded();
    const createResponse = await globalThis.mcp__marketo__bulk_lead_export_create({
      fields,
      filter,
      format,
    });

    if (!createResponse.success) {
      throw new Error(`Create failed: ${createResponse.errors?.[0]?.message}`);
    }

    result.exportId = createResponse.result[0].exportId;
    result.status = ExportStatus.CREATED;

    if (config.onStatusChange) {
      config.onStatusChange(result.exportId, result.status);
    }

    // Step 2: Enqueue export
    await rateLimitManager.waitIfNeeded();
    await globalThis.mcp__marketo__bulk_lead_export_enqueue({
      exportId: result.exportId,
    });

    result.status = ExportStatus.QUEUED;

    if (config.onStatusChange) {
      config.onStatusChange(result.exportId, result.status);
    }

    // Step 3: Poll for completion
    result.status = await pollExportStatus(
      result.exportId,
      'lead',
      config,
      (status, recordCount, fileSize) => {
        result.recordCount = recordCount || result.recordCount;
        result.fileSize = fileSize || result.fileSize;
        if (config.onProgress) {
          config.onProgress(result.exportId, status, result.recordCount);
        }
      }
    );

    // Step 4: Download file if completed
    if (result.status === ExportStatus.COMPLETED) {
      await rateLimitManager.waitIfNeeded();
      result.file = await globalThis.mcp__marketo__bulk_lead_export_file({
        exportId: result.exportId,
      });

      // Update quota tracking
      dailyExportBytes += result.fileSize;
    }

    result.endTime = new Date().toISOString();
    return result;

  } catch (error) {
    result.error = error.message;
    result.status = ExportStatus.FAILED;
    result.endTime = new Date().toISOString();
    throw error;
  }
}

/**
 * Create and execute an activity export job
 *
 * @param {Object} params - Export parameters
 * @param {Array<number>} params.activityTypeIds - Activity type IDs to export
 * @param {Object} params.filter - Filter criteria (createdAt required)
 * @param {string} [params.format='CSV'] - Export format
 * @param {Object} [options] - Execution options
 * @returns {Promise<ExportResult>} Export result with file content
 */
async function exportActivities(params, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { activityTypeIds, filter, format = 'CSV' } = params;

  // Activity exports require createdAt filter
  if (!filter.createdAt) {
    throw new Error('Activity exports require createdAt filter.');
  }

  const rangeDays = getDateRangeDays(filter.createdAt.startAt, filter.createdAt.endAt);
  if (rangeDays > 31) {
    if (config.autoSplitDateRange === false) {
      validateDateRange(filter.createdAt.startAt, filter.createdAt.endAt);
    } else {
      return exportActivitiesInBatches(params, options);
    }
  } else {
    validateDateRange(filter.createdAt.startAt, filter.createdAt.endAt);
  }

  // Check quota
  if (config.validateQuota) {
    const quota = getQuotaStatus();
    if (quota.remaining < MIN_QUOTA_REQUIRED_BYTES) {
      throw new Error(
        `Insufficient export quota. Only ${(quota.remaining / 1024 / 1024).toFixed(0)} MB remaining. ` +
        `Quota resets at ${quota.resetsAt}.`
      );
    }
  }

  const result = {
    type: 'activity',
    exportId: null,
    status: null,
    fileSize: 0,
    recordCount: 0,
    file: null,
    startTime: new Date().toISOString(),
    endTime: null,
    error: null,
  };

  try {
    // Step 1: Create export job
    await rateLimitManager.waitIfNeeded();
    const createResponse = await globalThis.mcp__marketo__bulk_activity_export_create({
      activityTypeIds,
      filter,
      format,
    });

    if (!createResponse.success) {
      throw new Error(`Create failed: ${createResponse.errors?.[0]?.message}`);
    }

    result.exportId = createResponse.result[0].exportId;
    result.status = ExportStatus.CREATED;

    // Step 2: Enqueue
    await rateLimitManager.waitIfNeeded();
    await globalThis.mcp__marketo__bulk_activity_export_enqueue({
      exportId: result.exportId,
    });

    result.status = ExportStatus.QUEUED;

    // Step 3: Poll for completion
    result.status = await pollExportStatus(
      result.exportId,
      'activity',
      config,
      (status, recordCount, fileSize) => {
        result.recordCount = recordCount || result.recordCount;
        result.fileSize = fileSize || result.fileSize;
      }
    );

    // Step 4: Download file
    if (result.status === ExportStatus.COMPLETED) {
      await rateLimitManager.waitIfNeeded();
      result.file = await globalThis.mcp__marketo__bulk_activity_export_file({
        exportId: result.exportId,
      });

      dailyExportBytes += result.fileSize;
    }

    result.endTime = new Date().toISOString();
    return result;

  } catch (error) {
    result.error = error.message;
    result.status = ExportStatus.FAILED;
    result.endTime = new Date().toISOString();
    throw error;
  }
}

/**
 * Export activity data across multiple Marketo-compliant date windows.
 * @param {Object} params
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function exportActivitiesInBatches(params, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { activityTypeIds, filter, format = 'CSV' } = params;
  const windows = splitDateRangeIntoWindows(filter.createdAt.startAt, filter.createdAt.endAt, 31);

  const batchResults = [];
  const files = [];
  const startTime = new Date().toISOString();
  let totalRecordCount = 0;
  let totalFileSize = 0;

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i];

    if (config.validateQuota) {
      const quota = getQuotaStatus();
      if (quota.remaining < MIN_QUOTA_REQUIRED_BYTES) {
        throw new Error(
          `Insufficient export quota before batch ${i + 1}/${windows.length}. ` +
          `Remaining ${(quota.remaining / 1024 / 1024).toFixed(0)} MB, resets at ${quota.resetsAt}.`
        );
      }
    }

    const batchFilter = {
      ...filter,
      createdAt: {
        startAt: window.startAt,
        endAt: window.endAt
      }
    };

    const batchResult = await exportActivities(
      { activityTypeIds, filter: batchFilter, format },
      { ...config, autoSplitDateRange: false }
    );

    batchResults.push({
      index: i + 1,
      startAt: window.startAt,
      endAt: window.endAt,
      exportId: batchResult.exportId,
      status: batchResult.status,
      recordCount: batchResult.recordCount || 0,
      fileSize: batchResult.fileSize || 0
    });

    totalRecordCount += batchResult.recordCount || 0;
    totalFileSize += batchResult.fileSize || 0;
    if (typeof batchResult.file === 'string') {
      files.push(batchResult.file);
    }
  }

  return {
    type: 'activity',
    batched: true,
    status: ExportStatus.COMPLETED,
    batches: batchResults,
    recordCount: totalRecordCount,
    fileSize: totalFileSize,
    file: mergeCsvChunks(files),
    startTime,
    endTime: new Date().toISOString(),
    error: null
  };
}

/**
 * Poll export job status until completion or failure
 *
 * @param {string} exportId - Export job ID
 * @param {string} type - Export type ('lead' or 'activity')
 * @param {Object} config - Poll configuration
 * @param {Function} onUpdate - Status update callback
 * @returns {Promise<string>} Final status
 */
async function pollExportStatus(exportId, type, config, onUpdate) {
  let pollCount = 0;
  let pollInterval = config.pollIntervalMs;
  let status = ExportStatus.QUEUED;

  const statusFn = type === 'lead'
    ? globalThis.mcp__marketo__bulk_lead_export_status
    : globalThis.mcp__marketo__bulk_activity_export_status;

  while (
    status !== ExportStatus.COMPLETED &&
    status !== ExportStatus.FAILED &&
    status !== ExportStatus.CANCELLED &&
    pollCount < config.maxPollAttempts
  ) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    pollCount++;

    await rateLimitManager.waitIfNeeded();
    const response = await statusFn({ exportId });

    if (!response.success) {
      throw new Error(`Status check failed: ${response.errors?.[0]?.message}`);
    }

    const jobStatus = response.result[0];
    status = jobStatus.status;

    if (onUpdate) {
      onUpdate(status, jobStatus.numberOfRecords, jobStatus.fileSize);
    }

    if (config.onStatusChange) {
      config.onStatusChange(exportId, status);
    }

    // Increase poll interval if still processing
    if (status === ExportStatus.PROCESSING) {
      pollInterval = Math.min(
        pollInterval * config.pollBackoffMultiplier,
        config.maxPollIntervalMs
      );
    }
  }

  if (pollCount >= config.maxPollAttempts && status !== ExportStatus.COMPLETED) {
    throw new Error(`Export timed out after ${pollCount} polls. Final status: ${status}`);
  }

  return status;
}

/**
 * Parse CSV string into array of objects
 *
 * @param {string} csvString - CSV content
 * @returns {Array<Object>} Parsed records
 */
function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i]?.replace(/"/g, '') || '';
    });
    return obj;
  });
}

/**
 * Get list of activity types
 *
 * @returns {Promise<Array>} Activity types with IDs
 */
async function getActivityTypes() {
  await rateLimitManager.waitIfNeeded();
  const response = await globalThis.mcp__marketo__activity_types_list();

  if (!response.success) {
    throw new Error('Failed to get activity types');
  }

  return response.result;
}

// Export module functions
module.exports = {
  exportLeads,
  exportActivities,
  exportActivitiesInBatches,
  pollExportStatus,
  getQuotaStatus,
  validateDateRange,
  splitDateRangeIntoWindows,
  getDateRangeDays,
  parseCSV,
  getActivityTypes,
  ExportStatus,
  DAILY_EXPORT_LIMIT,
};
