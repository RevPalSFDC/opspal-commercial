#!/usr/bin/env node

/**
 * Smart Query Batcher with Header Size Awareness
 *
 * Automatically batches large SOQL queries to stay under HTTP header size limit (8192 bytes).
 * Prevents "Request Header Fields Too Large" errors when querying with many IDs.
 *
 * Root Cause Addressed: Reflection cohort FP-004
 * - Issue: Query with 2,355 IDs causes "Request Header Fields Too Large" error
 * - Root Cause: No header size calculation - SF CLI URL + query exceeds 8192 byte limit
 * - Impact: 3 hours wasted per occurrence, $20K annual ROI
 *
 * Usage:
 *   const batcher = require('./smart-query-batcher');
 *
 *   // Automatic batching based on header size
 *   const allRecords = await batcher.queryWithBatching({
 *     sobject: 'Account',
 *     fields: ['Id', 'Name', 'Industry'],
 *     ids: array_of_2355_ids,  // Will auto-batch to stay under 8KB limit
 *     orgAlias: 'myorg'
 *   });
 *
 * @module smart-query-batcher
 * @version 1.0.0
 * @created 2025-10-22
 */

const { execSync } = require('child_process');

/**
 * HTTP header size limit for Salesforce CLI
 * Standard: 8192 bytes (8KB)
 * Safe limit: 7500 bytes (leave 692 bytes buffer for URL overhead)
 */
const HEADER_SIZE_LIMIT = 7500;

/**
 * Calculate approximate header size for a query
 *
 * Includes:
 * - Base URL (~100 bytes): https://instance.salesforce.com/services/data/vXX.0/query?q=
 * - SOQL query string
 * - Additional headers (~200 bytes): Authorization, Content-Type, etc.
 *
 * @param {string} query - SOQL query string
 * @param {string} orgAlias - Org alias for URL estimation
 * @returns {number} Estimated header size in bytes
 */
function calculateHeaderSize(query, orgAlias = 'default') {
  const baseUrlOverhead = 100; // Salesforce instance URL
  const headerOverhead = 200;  // Auth + headers
  const orgUrlSize = orgAlias.length;

  const querySize = Buffer.byteLength(query, 'utf8');

  return baseUrlOverhead + orgUrlSize + querySize + headerOverhead;
}

/**
 * Determine optimal batch size for ID list
 *
 * Calculates how many IDs can fit in a single query without exceeding header limit.
 *
 * @param {Array} ids - Array of Salesforce IDs
 * @param {Array} fields - Fields to select
 * @param {string} sobject - Object name
 * @returns {number} Optimal batch size
 */
function calculateOptimalBatchSize(ids, fields, sobject) {
  // Build a sample query with 1 ID
  const sampleId = ids[0] || '001000000000000AAA';
  const fieldsStr = fields.join(', ');
  const sampleQuery = `SELECT ${fieldsStr} FROM ${sobject} WHERE Id IN ('${sampleId}')`;

  const baseQuerySize = Buffer.byteLength(sampleQuery, 'utf8');
  const perIdOverhead = Buffer.byteLength(`','${sampleId}`, 'utf8'); // Each additional ID adds this

  // Calculate how many IDs can fit
  const availableSpace = HEADER_SIZE_LIMIT - baseQuerySize - 400; // 400 bytes buffer
  const maxIds = Math.floor(availableSpace / perIdOverhead);

  // Conservative limits
  const safeBatchSize = Math.min(
    maxIds,
    2000  // Salesforce SOQL IN clause limit
  );

  return Math.max(safeBatchSize, 10); // Minimum 10 IDs per batch
}

/**
 * Split array into batches
 *
 * @param {Array} array - Array to split
 * @param {number} batchSize - Size of each batch
 * @returns {Array} Array of batches
 */
function splitIntoBatches(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Execute SOQL query with automatic batching
 *
 * @param {Object} options - Query options
 * @param {string} options.sobject - Object name
 * @param {Array} options.fields - Fields to select
 * @param {Array} options.ids - IDs to query (will be batched)
 * @param {string} options.orgAlias - Org alias
 * @param {string} options.additionalWhere - Additional WHERE conditions (optional)
 * @param {boolean} options.useToolingApi - Use Tooling API (default: false)
 * @returns {Promise<Array>} All records from all batches
 */
async function queryWithBatching(options) {
  const { sobject, fields, ids, orgAlias, additionalWhere, useToolingApi } = options;

  if (!sobject || !fields || !ids || !orgAlias) {
    throw new Error('Missing required parameters: sobject, fields, ids, orgAlias');
  }

  if (ids.length === 0) {
    return [];
  }

  // Calculate optimal batch size
  const batchSize = calculateOptimalBatchSize(ids, fields, sobject);

  console.log(`Smart Batching: ${ids.length} IDs → ${Math.ceil(ids.length / batchSize)} batches (${batchSize} IDs/batch)`);

  // Split into batches
  const batches = splitIntoBatches(ids, batchSize);

  // Execute each batch
  const allRecords = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Build query for this batch
    const fieldsStr = fields.join(', ');
    const idsStr = batch.map(id => `'${id}'`).join(', ');
    let whereClause = `Id IN (${idsStr})`;

    if (additionalWhere) {
      whereClause += ` AND ${additionalWhere}`;
    }

    const query = `SELECT ${fieldsStr} FROM ${sobject} WHERE ${whereClause}`;

    // Calculate and log header size
    const headerSize = calculateHeaderSize(query, orgAlias);
    if (headerSize > HEADER_SIZE_LIMIT) {
      console.warn(`⚠️  Warning: Batch ${i + 1} header size (${headerSize} bytes) exceeds limit (${HEADER_SIZE_LIMIT} bytes)`);
      console.warn(`   Query may fail. Consider reducing fields or batch size.`);
    }

    // Execute query
    try {
      console.log(`Executing batch ${i + 1}/${batches.length} (${batch.length} IDs, ${headerSize} bytes)...`);

      const cmd = `sf data query --query "${query}" --target-org ${orgAlias} ${useToolingApi ? '--use-tooling-api' : ''} --json`;

      const result = JSON.parse(execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'] // Suppress stderr
      }));

      if (result.status === 0 && result.result && result.result.records) {
        allRecords.push(...result.result.records);
        console.log(`✅ Batch ${i + 1} complete: ${result.result.records.length} records`);
      } else {
        throw new Error(result.message || 'Query failed');
      }

      // Rate limiting
      if (i < batches.length - 1) {
        await sleep(300); // 300ms between batches
      }

    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed: ${error.message}`);
      throw error;
    }
  }

  console.log(`✅ Total records retrieved: ${allRecords.length}`);
  return allRecords;
}

/**
 * Test if query would exceed header limit
 *
 * @param {string} query - SOQL query
 * @param {string} orgAlias - Org alias
 * @returns {Object} { exceeds: boolean, size: number, limit: number }
 */
function testHeaderSize(query, orgAlias = 'default') {
  const size = calculateHeaderSize(query, orgAlias);
  return {
    exceeds: size > HEADER_SIZE_LIMIT,
    size,
    limit: HEADER_SIZE_LIMIT,
    safetyMargin: HEADER_SIZE_LIMIT - size
  };
}

/**
 * Sleep utility
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export functions
module.exports = {
  queryWithBatching,
  calculateHeaderSize,
  calculateOptimalBatchSize,
  splitIntoBatches,
  testHeaderSize
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node smart-query-batcher.js <org-alias> <sobject> <id-file> [fields]');
    console.log('');
    console.log('Example:');
    console.log('  node smart-query-batcher.js myorg Account account-ids.txt "Id,Name,Industry"');
    console.log('');
    console.log('id-file format: One ID per line or comma-separated');
    process.exit(1);
  }

  const orgAlias = args[0];
  const sobject = args[1];
  const idFile = args[2];
  const fields = args[3] ? args[3].split(',') : ['Id'];

  // Read IDs from file
  const fs = require('fs');
  const idContent = fs.readFileSync(idFile, 'utf-8');
  const ids = idContent.split(/[,\n\r]+/).map(id => id.trim()).filter(id => id);

  console.log(`Querying ${ids.length} ${sobject} records...`);

  queryWithBatching({ sobject, fields, ids, orgAlias })
    .then(records => {
      console.log('\nResults:');
      console.log(JSON.stringify(records, null, 2));
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
