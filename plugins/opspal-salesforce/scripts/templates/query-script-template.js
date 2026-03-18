#!/usr/bin/env node

/**
 * Query Script Template - With Pagination & Process Management
 *
 * This is a reference implementation showing best practices for Salesforce query scripts.
 * Copy this template and adapt it for your specific use case.
 *
 * Features:
 * - Cursor-based pagination (no OFFSET limit)
 * - Process lock (prevents concurrent execution)
 * - Progress tracking (real-time visibility)
 * - Error handling (graceful failure)
 *
 * Usage:
 *   node scripts/your_script.js <org-alias> [options]
 *
 * Monitor:
 *   node scripts/check-progress.js --watch your_script.js
 *
 * @version 1.0.0
 * @created 2025-10-14
 */

const path = require('path');
const { paginateQuery, estimateRecordCount } = require('../lib/salesforce-pagination');
const { acquireLock, releaseLock } = require('../lib/process-lock-manager');
const { ProgressWriter } = require('../lib/progress-file-writer');

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  scriptName: path.basename(__filename),
  batchSize: 200,
  verbose: true
};

// =============================================================================
// Main Script Logic
// =============================================================================

/**
 * Main entry point
 */
async function main() {
  // Parse arguments
  const org = process.argv[2];
  if (!org) {
    console.error('Usage: node query-script-template.js <org-alias>');
    process.exit(1);
  }

  // Step 1: Acquire process lock (prevents concurrent execution)
  console.log(`\n🔒 Acquiring process lock for ${CONFIG.scriptName}...`);
  const lock = await acquireLock({
    scriptName: CONFIG.scriptName,
    args: [org],
    verbose: CONFIG.verbose
  });

  if (!lock.acquired) {
    console.error(`\n❌ Script is already running`);
    console.error(`   PID ${lock.metadata.pid} started at ${lock.metadata.startedAt}`);
    console.error(`   Wait for completion or force release with:`);
    console.error(`   node scripts/lib/process-lock-manager.js release ${CONFIG.scriptName}`);
    process.exit(1);
  }

  console.log('✅ Lock acquired\n');

  try {
    // Step 2: Define your SOQL query
    const query = buildQuery();
    console.log('📋 Query:');
    console.log(`   ${query}\n`);

    // Step 3: Estimate record count for progress tracking
    console.log('📊 Estimating record count...');
    const countQuery = 'SELECT COUNT() FROM Account'; // Adapt to your object
    const estimatedCount = await estimateRecordCount(countQuery, org);
    console.log(`   Estimated: ~${estimatedCount} records\n`);

    // Step 4: Initialize progress tracking
    const progress = new ProgressWriter({
      scriptName: CONFIG.scriptName,
      totalSteps: estimatedCount,
      verbose: CONFIG.verbose,
      metadata: {
        org,
        startedAt: new Date().toISOString()
      }
    });

    // Step 5: Query with cursor-based pagination
    let allRecords = [];
    let fetchedCount = 0;

    console.log('📥 Fetching records...');
    const result = await paginateQuery({
      query,
      targetOrg: org,
      batchSize: CONFIG.batchSize,
      strategy: 'auto', // Auto-select best strategy (keyset/queryMore/bulk)
      onBatch: (batch) => {
        // Process each batch as it arrives
        allRecords.push(...batch.records);
        fetchedCount += batch.records.length;

        // Update progress
        progress.update({
          currentStep: fetchedCount,
          message: `Fetched ${fetchedCount} of ~${estimatedCount} records`,
          metadata: {
            lastRecordId: batch.records[batch.records.length - 1]?.Id,
            batchNumber: batch.batchNumber
          }
        });

        // Optional: Process batch immediately instead of accumulating
        // processBatch(batch.records, org, progress);
      }
    });

    console.log(`\n✅ Fetched ${allRecords.length} records`);
    console.log(`   Strategy used: ${result.strategy}`);
    console.log(`   Total batches: ${result.batches}\n`);

    // Step 6: Process the records
    console.log('⚙️  Processing records...');
    await processRecords(allRecords, org, progress);

    // Step 7: Complete
    progress.complete(`Successfully processed ${allRecords.length} records for ${org}`);
    console.log('\n✅ Script completed successfully!\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);

  } finally {
    // Step 8: Always release lock (even on error)
    console.log('🔓 Releasing lock...');
    await releaseLock(lock.lockFile);
    console.log('✅ Lock released\n');
  }
}

// =============================================================================
// Query Builder
// =============================================================================

/**
 * Build the SOQL query
 * IMPORTANT: Must include ORDER BY Id for cursor-based pagination
 *
 * @returns {string} SOQL query
 */
function buildQuery() {
  // TODO: Customize this for your use case
  return `
    SELECT
      Id,
      Name,
      Industry,
      AnnualRevenue,
      CreatedDate
    FROM Account
    WHERE Type = 'Customer'
    ORDER BY Id
  `.trim().replace(/\s+/g, ' ');
}

// =============================================================================
// Record Processing
// =============================================================================

/**
 * Process fetched records
 *
 * @param {Array} records - Records to process
 * @param {string} org - Target org
 * @param {ProgressWriter} progress - Progress tracker
 */
async function processRecords(records, org, progress) {
  // Reset progress for processing phase
  progress.state.totalSteps = records.length;
  progress.state.currentStep = 0;

  for (let i = 0; i < records.length; i++) {
    // TODO: Implement your processing logic
    await processRecord(records[i], org);

    // Update progress
    progress.update({
      currentStep: i + 1,
      message: `Processing record ${i + 1}/${records.length}: ${records[i].Name || records[i].Id}`,
      metadata: {
        recordId: records[i].Id,
        recordName: records[i].Name
      }
    });
  }
}

/**
 * Process a single record
 *
 * @param {Object} record - Record to process
 * @param {string} org - Target org
 */
async function processRecord(record, org) {
  // TODO: Implement your record processing logic
  // Examples:
  // - Update fields
  // - Create related records
  // - Export to CSV
  // - Send to external API
  // - Generate reports

  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 10));

  if (CONFIG.verbose) {
    console.log(`   Processed: ${record.Name || record.Id}`);
  }
}

// =============================================================================
// Entry Point
// =============================================================================

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
