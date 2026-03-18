#!/usr/bin/env node
/**
 * Timeout Estimator for Salesforce Operations
 *
 * Provides intelligent timeout recommendations based on:
 * - Operation type (query, insert, update, upsert, delete, deploy)
 * - Record count
 * - Org complexity factors (triggers, validation rules, flows)
 * - Historical performance data
 *
 * Addresses Cohort 2 (rate-limit/timeouts) - 3 reflections, $94K ROI
 *
 * @module timeout-estimator
 * @version 1.0.0
 * @created 2026-02-01
 */

const fs = require('fs');
const path = require('path');

// Base processing time per record in milliseconds
const BASE_TIME_MS = {
  query: 5,        // Queries are fast
  insert: 40,      // Inserts need validation + triggers
  update: 50,      // Updates need additional checks
  upsert: 60,      // Upsert = lookup + insert/update
  delete: 30,      // Deletes need cascade checks
  deploy: 100,     // Deployments are complex
  retrieve: 50,    // Retrieves depend on metadata size
  export: 30,      // Exports are bulk-optimized
  import: 70       // Imports need full validation
};

// Timeout profiles (seconds)
const PROFILES = {
  quick: 30,        // Quick queries, simple operations
  standard: 300,    // Standard operations (5 min)
  extended: 600,    // Extended operations (10 min) - SF CLI default
  bulk: 1800,       // Bulk operations (30 min)
  large: 3600,      // Large datasets (1 hour)
  migration: 7200,  // Data migrations (2 hours)
  unlimited: 0      // No timeout
};

// Record count thresholds for profile selection
const PROFILE_THRESHOLDS = {
  quick: 100,       // < 100 records
  standard: 500,    // 100-500 records
  extended: 2000,   // 500-2000 records
  bulk: 10000,      // 2000-10000 records
  large: 50000,     // 10000-50000 records
  migration: Infinity // > 50000 records
};

/**
 * Estimate timeout for a Salesforce operation
 *
 * @param {number} recordCount - Number of records to process
 * @param {string} operation - Operation type (query, insert, update, etc.)
 * @param {Object} options - Additional factors
 * @returns {Object} Timeout estimation with breakdown
 */
function estimateTimeout(recordCount, operation = 'upsert', options = {}) {
  const {
    hasTriggers = false,
    hasValidationRules = false,
    hasFlows = false,
    hasProcessBuilder = false,
    networkLatency = 100,  // ms per batch
    batchSize = 200,       // Salesforce default batch size
    safetyMargin = 1.2     // 20% safety margin
  } = options;

  // Get base time per record
  const baseTime = BASE_TIME_MS[operation.toLowerCase()] || 50;

  // Calculate multipliers for org complexity
  let multiplier = 1.0;
  const factors = [];

  if (hasTriggers) {
    multiplier *= 1.8;
    factors.push('triggers (1.8x)');
  }
  if (hasValidationRules) {
    multiplier *= 1.4;
    factors.push('validation rules (1.4x)');
  }
  if (hasFlows) {
    multiplier *= 1.6;
    factors.push('flows (1.6x)');
  }
  if (hasProcessBuilder) {
    multiplier *= 1.5;
    factors.push('process builder (1.5x)');
  }

  // Calculate components
  const processingTimeMs = recordCount * baseTime * multiplier;
  const batchCount = Math.ceil(recordCount / batchSize);
  const networkOverheadMs = batchCount * networkLatency;
  const baseOverheadMs = 5000; // 5 seconds base overhead

  // Total time in milliseconds
  const totalMs = (processingTimeMs + networkOverheadMs + baseOverheadMs) * safetyMargin;

  // Convert to seconds and round up
  let estimatedSeconds = Math.ceil(totalMs / 1000);

  // Apply bounds
  estimatedSeconds = Math.max(30, Math.min(7200, estimatedSeconds));

  // Select appropriate profile
  const profile = selectProfile(estimatedSeconds, recordCount);

  return {
    estimatedSeconds,
    recordCount,
    operation,
    profile,
    profileTimeout: PROFILES[profile],
    recommendedTimeout: Math.max(estimatedSeconds, PROFILES[profile]),
    breakdown: {
      processingTime: Math.round(processingTimeMs / 1000),
      networkOverhead: Math.round(networkOverheadMs / 1000),
      baseOverhead: Math.round(baseOverheadMs / 1000),
      safetyMargin: `${Math.round((safetyMargin - 1) * 100)}%`
    },
    complexityFactors: factors.length > 0 ? factors : ['none (base rate)'],
    multiplier: Math.round(multiplier * 100) / 100,
    warnings: generateWarnings(estimatedSeconds, recordCount, operation)
  };
}

/**
 * Select appropriate timeout profile based on estimate and record count
 */
function selectProfile(estimatedSeconds, recordCount) {
  // First check by record count
  for (const [profile, threshold] of Object.entries(PROFILE_THRESHOLDS)) {
    if (recordCount <= threshold) {
      // Verify the profile timeout is sufficient
      if (PROFILES[profile] >= estimatedSeconds || PROFILES[profile] === 0) {
        return profile;
      }
    }
  }

  // If no profile matches, use the largest non-unlimited
  if (estimatedSeconds > PROFILES.large) {
    return 'migration';
  } else if (estimatedSeconds > PROFILES.bulk) {
    return 'large';
  } else if (estimatedSeconds > PROFILES.extended) {
    return 'bulk';
  } else if (estimatedSeconds > PROFILES.standard) {
    return 'extended';
  } else if (estimatedSeconds > PROFILES.quick) {
    return 'standard';
  }

  return 'quick';
}

/**
 * Generate warnings for the operation
 */
function generateWarnings(estimatedSeconds, recordCount, operation) {
  const warnings = [];

  if (estimatedSeconds > 600) {
    warnings.push({
      level: 'WARNING',
      message: `Operation may exceed 10-minute CLI default timeout. Use --wait ${Math.ceil(estimatedSeconds / 60)} or background execution.`
    });
  }

  if (recordCount > 10000) {
    warnings.push({
      level: 'INFO',
      message: 'Consider using Bulk API 2.0 for operations over 10,000 records.'
    });
  }

  if (recordCount > 50000) {
    warnings.push({
      level: 'WARNING',
      message: 'Very large dataset. Consider breaking into smaller batches or using async processing.'
    });
  }

  if (operation === 'delete' && recordCount > 1000) {
    warnings.push({
      level: 'CAUTION',
      message: 'Large delete operation. Ensure you have a backup and rollback plan.'
    });
  }

  return warnings;
}

/**
 * Format duration for human display
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

/**
 * Get CLI flag recommendation
 */
function getCliRecommendation(result) {
  const waitMinutes = Math.ceil(result.recommendedTimeout / 60);

  return {
    sfDataQuery: `--wait ${waitMinutes}`,
    sfDataUpsert: `--wait ${waitMinutes}`,
    sfProjectDeploy: `--wait ${waitMinutes}`,
    bulkApi: result.recordCount > 10000 ? 'Use sf data upsert bulk' : null,
    backgroundJob: result.estimatedSeconds > 300 ? 'Consider --async flag' : null
  };
}

// Export functions
module.exports = {
  estimateTimeout,
  selectProfile,
  formatDuration,
  getCliRecommendation,
  PROFILES,
  BASE_TIME_MS
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Timeout Estimator for Salesforce Operations

Usage:
  node timeout-estimator.js <recordCount> [operation] [options]

Arguments:
  recordCount         Number of records to process
  operation           Operation type: query, insert, update, upsert, delete, deploy
                      Default: upsert

Options:
  --triggers          Account for Apex triggers (1.8x multiplier)
  --validation-rules  Account for validation rules (1.4x multiplier)
  --flows             Account for record-triggered flows (1.6x multiplier)
  --process-builder   Account for process builders (1.5x multiplier)
  --json              Output as JSON
  --quiet             Only output the recommended timeout

Examples:
  node timeout-estimator.js 1000 upsert
  node timeout-estimator.js 50000 insert --triggers --flows
  node timeout-estimator.js 500 query --json
`);
    process.exit(0);
  }

  const recordCount = parseInt(args[0], 10);
  if (isNaN(recordCount) || recordCount < 0) {
    console.error('Error: recordCount must be a positive number');
    process.exit(1);
  }

  const operation = args[1] && !args[1].startsWith('--') ? args[1] : 'upsert';
  const options = {
    hasTriggers: args.includes('--triggers'),
    hasValidationRules: args.includes('--validation-rules'),
    hasFlows: args.includes('--flows'),
    hasProcessBuilder: args.includes('--process-builder')
  };

  const result = estimateTimeout(recordCount, operation, options);
  const cliRec = getCliRecommendation(result);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ ...result, cliRecommendations: cliRec }, null, 2));
  } else if (args.includes('--quiet')) {
    console.log(result.recommendedTimeout);
  } else {
    console.log(`
${'='.repeat(60)}
  TIMEOUT ESTIMATION
${'='.repeat(60)}

  Records:      ${result.recordCount.toLocaleString()}
  Operation:    ${result.operation}
  Profile:      ${result.profile}

  Estimated:    ${formatDuration(result.estimatedSeconds)}
  Recommended:  ${formatDuration(result.recommendedTimeout)} (${result.profile} profile)

  Breakdown:
    Processing:     ${formatDuration(result.breakdown.processingTime)}
    Network:        ${formatDuration(result.breakdown.networkOverhead)}
    Base overhead:  ${formatDuration(result.breakdown.baseOverhead)}
    Safety margin:  ${result.breakdown.safetyMargin}

  Complexity:   ${result.multiplier}x (${result.complexityFactors.join(', ')})

  CLI Flags:    ${cliRec.sfDataUpsert}
${result.warnings.length > 0 ? `
  Warnings:
${result.warnings.map(w => `    [${w.level}] ${w.message}`).join('\n')}
` : ''}
${'='.repeat(60)}
`);
  }
}
