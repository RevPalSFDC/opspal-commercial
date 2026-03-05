/**
 * Salesforce Pagination Library
 *
 * Provides three pagination strategies to avoid SOQL OFFSET limitations (2,000 row max):
 * 1. Keyset Pagination - Best for most queries, uses WHERE Id > lastId
 * 2. QueryMore API - Efficient for datasets <50K records
 * 3. Bulk API 2.0 - For very large datasets >50K records
 *
 * Automatically selects strategy based on estimated record count.
 *
 * @module salesforce-pagination
 * @version 1.0.0
 * @created 2025-10-14
 * @fixes Reflection Cohort fp-001-data-quality-validation
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function getOrgAuth(targetUsername) {
  const cmd = `sf org display --target-org ${targetUsername} --json`;
  const { stdout } = await execAsync(cmd);
  const result = JSON.parse(stdout);
  if (result.status !== 0) {
    throw new Error(result.message || 'Failed to load org auth');
  }
  const accessToken = result.result?.accessToken;
  const instanceUrl = result.result?.instanceUrl;
  if (!accessToken || !instanceUrl) {
    throw new Error('Org auth missing access token or instance URL');
  }
  return { accessToken, instanceUrl };
}

async function fetchQueryMoreBatch(instanceUrl, accessToken, nextRecordsUrl) {
  const url = nextRecordsUrl.startsWith('http')
    ? nextRecordsUrl
    : `${instanceUrl}${nextRecordsUrl}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`QueryMore failed (${response.status}): ${body}`);
  }
  return response.json();
}

// =============================================================================
// Strategy Selection
// =============================================================================

const STRATEGY = {
  KEYSET: 'keyset',
  QUERYMORE: 'querymore',
  BULK: 'bulk'
};

const THRESHOLDS = {
  QUERYMORE_MAX: 50000,  // Use QueryMore for <50K records
  BULK_MIN: 50000        // Use Bulk API for ≥50K records
};

/**
 * Automatically select pagination strategy based on estimated record count
 *
 * @param {number} estimatedCount - Estimated total records (approximate is fine)
 * @returns {string} Selected strategy (STRATEGY.KEYSET, STRATEGY.QUERYMORE, or STRATEGY.BULK)
 */
function selectStrategy(estimatedCount) {
  if (estimatedCount >= THRESHOLDS.BULK_MIN) {
    return STRATEGY.BULK;
  } else if (estimatedCount >= 2000 && estimatedCount < THRESHOLDS.QUERYMORE_MAX) {
    return STRATEGY.QUERYMORE;
  } else {
    return STRATEGY.KEYSET;
  }
}

// =============================================================================
// Strategy 1: Keyset Pagination (Recommended for Most Use Cases)
// =============================================================================

/**
 * Keyset Pagination - Uses WHERE Id > lastId pattern
 *
 * Best for:
 * - Queries with consistent Id ordering
 * - Datasets of any size
 * - Real-time data that may be changing
 *
 * Limitations:
 * - Requires Id field in SELECT
 * - Cannot skip pages (sequential only)
 * - Complex WHERE clauses may be tricky
 *
 * @param {Object} options
 * @param {string} options.query - Base SOQL query (will be modified with WHERE Id > lastId)
 * @param {number} options.batchSize - Records per page (default: 2000)
 * @param {string} options.targetUsername - Salesforce org username/alias
 * @param {Function} options.onBatch - Callback(records, batchNumber) for each batch
 * @returns {Promise<{totalRecords: number, batches: number}>}
 */
async function paginateWithKeyset(options) {
  const {
    query,
    batchSize = 2000,
    targetUsername,
    onBatch
  } = options;

  // Validate query includes Id field
  if (!query.toLowerCase().includes('select id') && !query.toLowerCase().includes('select *')) {
    throw new Error('Keyset pagination requires Id field in SELECT clause');
  }

  let lastId = null;
  let batchNumber = 0;
  let totalRecords = 0;
  let hasMore = true;

  while (hasMore) {
    // Build paginated query
    let paginatedQuery = query;

    // Add WHERE Id > lastId if we have a lastId
    if (lastId) {
      const whereClause = `Id > '${lastId}'`;

      if (query.toLowerCase().includes(' where ')) {
        // Append to existing WHERE
        paginatedQuery = query.replace(/ where /i, ` WHERE ${whereClause} AND `);
      } else {
        // Add new WHERE before ORDER BY or at end
        if (query.toLowerCase().includes(' order by ')) {
          paginatedQuery = query.replace(/ order by /i, ` WHERE ${whereClause} ORDER BY `);
        } else {
          paginatedQuery = `${query} WHERE ${whereClause}`;
        }
      }
    }

    // Ensure ORDER BY Id for keyset pagination
    if (!paginatedQuery.toLowerCase().includes('order by id')) {
      paginatedQuery += ' ORDER BY Id ASC';
    }

    // Add LIMIT
    paginatedQuery += ` LIMIT ${batchSize}`;

    // Execute query
    const cmd = `sf data query --query "${paginatedQuery.replace(/"/g, '\\"')}" --target-org ${targetUsername} --json`;
    const { stdout } = await execAsync(cmd);
    const result = JSON.parse(stdout);

    if (!result.result || result.result.records.length === 0) {
      hasMore = false;
      break;
    }

    const records = result.result.records;
    batchNumber++;
    totalRecords += records.length;

    // Call batch handler
    if (onBatch) {
      await onBatch(records, batchNumber);
    }

    // Check if more records exist
    if (records.length < batchSize) {
      hasMore = false;
    } else {
      // Update lastId for next iteration
      lastId = records[records.length - 1].Id;
    }
  }

  return { totalRecords, batches: batchNumber };
}

// =============================================================================
// Strategy 2: QueryMore API (Efficient for <50K Records)
// =============================================================================

/**
 * QueryMore API Pagination - Uses Salesforce queryMore() API
 *
 * Best for:
 * - Datasets 2K - 50K records
 * - Queries where keyset is complex
 * - Need to preserve exact query results
 *
 * Limitations:
 * - Query locator expires after 15 minutes
 * - Not suitable for very large datasets (>50K)
 *
 * @param {Object} options
 * @param {string} options.query - SOQL query
 * @param {number} options.batchSize - Records per queryMore call (default: 2000)
 * @param {string} options.targetUsername - Salesforce org username/alias
 * @param {Function} options.onBatch - Callback(records, batchNumber) for each batch
 * @returns {Promise<{totalRecords: number, batches: number}>}
 */
async function paginateWithQueryMore(options) {
  const {
    query,
    batchSize = 2000,
    targetUsername,
    onBatch
  } = options;

  // Initial query
  const initialCmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${targetUsername} --json`;
  const { stdout: initialStdout } = await execAsync(initialCmd);
  const initialResult = JSON.parse(initialStdout);

  if (!initialResult.result || !initialResult.result.records) {
    return { totalRecords: 0, batches: 0 };
  }

  let totalRecords = initialResult.result.records.length;
  let batchNumber = 1;

  // Process first batch
  if (onBatch) {
    await onBatch(initialResult.result.records, batchNumber);
  }

  // Check if more records via queryMore
  let done = initialResult.result.done;
  let nextRecordsUrl = initialResult.result.nextRecordsUrl;

  while (!done && nextRecordsUrl) {
    const { accessToken, instanceUrl } = await getOrgAuth(targetUsername);
    const result = await fetchQueryMoreBatch(instanceUrl, accessToken, nextRecordsUrl);

    if (!result.records || result.records.length === 0) {
      break;
    }

    batchNumber++;
    totalRecords += result.records.length;

    if (onBatch) {
      await onBatch(result.records, batchNumber);
    }

    done = result.done;
    nextRecordsUrl = result.nextRecordsUrl;
  }

  return { totalRecords, batches: batchNumber };
}

// =============================================================================
// Strategy 3: Bulk API 2.0 (For Very Large Datasets >50K)
// =============================================================================

/**
 * Bulk API 2.0 Pagination - Uses Salesforce Bulk API for massive datasets
 *
 * Best for:
 * - Datasets >50K records
 * - Export/import operations
 * - Data migrations
 *
 * Limitations:
 * - Asynchronous (requires polling)
 * - Higher latency
 * - More complex error handling
 *
 * @param {Object} options
 * @param {string} options.query - SOQL query
 * @param {string} options.targetUsername - Salesforce org username/alias
 * @param {Function} options.onBatch - Callback(records, batchNumber) for each batch
 * @returns {Promise<{totalRecords: number, batches: number}>}
 */
async function paginateWithBulk(options) {
  const {
    query,
    targetUsername,
    onBatch
  } = options;

  // Create bulk query job
  const createJobCmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${targetUsername} --bulk --wait 10 --json`;

  try {
    const { stdout } = await execAsync(createJobCmd);
    const result = JSON.parse(stdout);

    if (!result.result || !result.result.records) {
      return { totalRecords: 0, batches: 0 };
    }

    const totalRecords = result.result.records.length;

    // Process all records as single batch (Bulk API returns all at once)
    if (onBatch) {
      await onBatch(result.result.records, 1);
    }

    return { totalRecords, batches: 1 };

  } catch (error) {
    throw new Error(`Bulk API pagination failed: ${error.message}`);
  }
}

// =============================================================================
// Unified Pagination Interface
// =============================================================================

/**
 * Paginate Salesforce Query - Automatically selects best strategy
 *
 * @param {Object} options
 * @param {string} options.query - SOQL query
 * @param {string} options.targetUsername - Salesforce org username/alias
 * @param {number} [options.estimatedCount] - Estimated total records (for strategy selection)
 * @param {number} [options.batchSize=2000] - Records per batch
 * @param {string} [options.strategy] - Force specific strategy (KEYSET, QUERYMORE, BULK)
 * @param {Function} options.onBatch - Callback(records, batchNumber) called for each batch
 * @returns {Promise<{totalRecords: number, batches: number, strategy: string}>}
 *
 * @example
 * // Automatic strategy selection
 * await paginateQuery({
 *   query: 'SELECT Id, Name FROM Account',
 *   targetUsername: 'myOrg',
 *   estimatedCount: 5000,
 *   onBatch: async (records, batchNum) => {
 *     console.log(`Batch ${batchNum}: ${records.length} records`);
 *     // Process records
 *   }
 * });
 *
 * @example
 * // Force keyset strategy
 * await paginateQuery({
 *   query: 'SELECT Id, Name FROM Account ORDER BY CreatedDate',
 *   targetUsername: 'myOrg',
 *   strategy: 'keyset',
 *   batchSize: 1000,
 *   onBatch: async (records) => {
 *     // Process records
 *   }
 * });
 */
async function paginateQuery(options) {
  const {
    query,
    targetUsername,
    estimatedCount = 2000,
    batchSize = 2000,
    strategy,
    onBatch
  } = options;

  // Validate required options
  if (!query) throw new Error('query is required');
  if (!targetUsername) throw new Error('targetUsername is required');
  if (!onBatch) throw new Error('onBatch callback is required');

  // Select strategy
  const selectedStrategy = strategy || selectStrategy(estimatedCount);

  console.log(`📊 Pagination Strategy: ${selectedStrategy} (estimated: ${estimatedCount} records)`);

  let result;

  switch (selectedStrategy) {
    case STRATEGY.KEYSET:
      result = await paginateWithKeyset({ query, batchSize, targetUsername, onBatch });
      break;

    case STRATEGY.QUERYMORE:
      result = await paginateWithQueryMore({ query, batchSize, targetUsername, onBatch });
      break;

    case STRATEGY.BULK:
      result = await paginateWithBulk({ query, targetUsername, onBatch });
      break;

    default:
      throw new Error(`Unknown strategy: ${selectedStrategy}`);
  }

  return {
    ...result,
    strategy: selectedStrategy
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Estimate record count for strategy selection
 * Runs a COUNT() query to get approximate size
 *
 * @param {string} query - SOQL query
 * @param {string} targetUsername - Salesforce org
 * @returns {Promise<number>} Estimated count
 */
async function estimateRecordCount(query, targetUsername) {
  try {
    // Extract FROM clause
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    if (!fromMatch) {
      return 2000; // Default assumption
    }

    const objectName = fromMatch[1];

    // Run COUNT query
    const countQuery = `SELECT COUNT() FROM ${objectName}`;
    const cmd = `sf data query --query "${countQuery}" --target-org ${targetUsername} --json`;
    const { stdout } = await execAsync(cmd);
    const result = JSON.parse(stdout);

    if (result.result && result.result.records && result.result.records[0]) {
      return result.result.records[0].expr0 || 2000;
    }

    return 2000;
  } catch (error) {
    console.warn(`⚠️  Could not estimate record count: ${error.message}`);
    return 2000; // Safe default
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  paginateQuery,
  paginateWithKeyset,
  paginateWithQueryMore,
  paginateWithBulk,
  selectStrategy,
  estimateRecordCount,
  STRATEGY,
  THRESHOLDS
};
