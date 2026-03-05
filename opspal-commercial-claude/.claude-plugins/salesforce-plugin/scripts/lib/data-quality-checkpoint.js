#!/usr/bin/env node
/**
 * Data Quality Checkpoint
 *
 * Validates data quality before allowing analytical conclusions.
 * Prevents premature conclusions from NULL, empty, or unexpected data.
 *
 * CRITICAL: This tool implements the user constraint:
 * "You're supposed to let me know if there is an issue acquiring data,
 * not jumping to conclusions like that"
 *
 * @module data-quality-checkpoint
 * @version 1.0.0
 * @created 2025-10-03
 */

/**
 * Data quality confidence levels
 */
const CONFIDENCE_LEVELS = {
  HIGH: 0.9,      // Data meets all expectations
  MEDIUM: 0.7,    // Data mostly meets expectations, minor issues
  LOW: 0.4,       // Significant data issues present
  CRITICAL: 0.1   // Data unusable or missing
};

/**
 * Issue severity levels
 */
const SEVERITY = {
  BLOCKING: 'blocking',     // Must resolve before proceeding
  WARNING: 'warning',       // Should address but can proceed
  INFO: 'info'              // Informational only
};

/**
 * Check data quality of query results
 *
 * @param {Object} queryResult - Result from sf data query
 * @param {Object} expectedSchema - Expected data structure
 * @param {number} confidenceThreshold - Minimum confidence to proceed (default: 0.7)
 * @returns {Object} Quality check result
 */
function checkDataQuality(queryResult, expectedSchema = {}, confidenceThreshold = 0.7) {
  const issues = [];
  let confidence = 1.0;

  // Check 1: NULL or undefined result
  if (queryResult === null || queryResult === undefined) {
    issues.push({
      type: 'null_result',
      severity: SEVERITY.BLOCKING,
      message: 'Query returned NULL or undefined',
      possibleCauses: [
        'Query syntax error',
        'Object/field permissions issue',
        'Object does not exist',
        'JQ parsing error'
      ],
      recommendedActions: [
        'Verify query syntax with soql-pattern-validator',
        'Check object and field permissions in org',
        'Verify object exists using sf sobject list',
        'Test jq parsing path separately'
      ]
    });
    confidence = CONFIDENCE_LEVELS.CRITICAL;
  }

  // Check 2: Query execution error
  if (queryResult && queryResult.status !== 0 && queryResult.status !== undefined) {
    issues.push({
      type: 'execution_error',
      severity: SEVERITY.BLOCKING,
      message: `Query execution failed with status ${queryResult.status}`,
      error: queryResult.message || 'Unknown error',
      recommendedActions: [
        'Check error message for specific issue',
        'Verify org authentication: sf org display',
        'Test with simpler query to isolate issue'
      ]
    });
    confidence = CONFIDENCE_LEVELS.CRITICAL;
  }

  // Check 3: Empty result when data expected
  if (queryResult && queryResult.result && queryResult.result.records) {
    const records = queryResult.result.records;

    if (Array.isArray(records) && records.length === 0 && expectedSchema.minRecords > 0) {
      issues.push({
        type: 'empty_result',
        severity: SEVERITY.WARNING,
        message: `Expected at least ${expectedSchema.minRecords} records, got 0`,
        possibleCauses: [
          'Data truly does not exist',
          'WHERE clause too restrictive',
          'Object recently created with no data',
          'Time-based filter excluding all records'
        ],
        recommendedActions: [
          'Confirm with user if zero records is expected',
          'Remove WHERE clause and re-query to check total',
          'Check object creation date vs data age'
        ]
      });
      confidence -= 0.3;
    }

    // Check 4: Record count validation
    if (expectedSchema.recordCount && records.length !== expectedSchema.recordCount) {
      issues.push({
        type: 'unexpected_count',
        severity: SEVERITY.INFO,
        message: `Expected ${expectedSchema.recordCount} records, got ${records.length}`,
        impact: 'May indicate data changes or incorrect assumptions'
      });
      confidence -= 0.1;
    }
  }

  // Check 5: Schema validation
  if (queryResult && queryResult.result && queryResult.result.records && expectedSchema.fields) {
    const firstRecord = queryResult.result.records[0];
    if (firstRecord) {
      const missingFields = expectedSchema.fields.filter(field => !(field in firstRecord));

      if (missingFields.length > 0) {
        issues.push({
          type: 'missing_fields',
          severity: SEVERITY.WARNING,
          message: `Expected fields not present: ${missingFields.join(', ')}`,
          possibleCauses: [
            'Field names incorrect',
            'Fields not included in SELECT clause',
            'JQ parsing removed fields'
          ],
          recommendedActions: [
            'Verify field names in query',
            'Check jq parsing path',
            'Use sf sobject describe to confirm field existence'
          ]
        });
        confidence -= 0.2;
      }
    }
  }

  // Check 6: Aggregate result validation
  if (queryResult && queryResult.result && queryResult.result.records) {
    const firstRecord = queryResult.result.records[0];
    if (firstRecord && 'expr0' in firstRecord) {
      issues.push({
        type: 'default_aggregate_alias',
        severity: SEVERITY.WARNING,
        message: 'Aggregate using default alias (expr0) - should use explicit alias',
        impact: 'Makes jq parsing fragile and code harder to maintain',
        recommendedActions: [
          'Update query to use explicit alias: COUNT(Id) total_count',
          'Update jq path to use named alias instead of expr0'
        ]
      });
      confidence -= 0.1;
    }
  }

  // Determine if proceed is allowed
  const proceed = confidence >= confidenceThreshold;
  const blockingIssues = issues.filter(i => i.severity === SEVERITY.BLOCKING);

  return {
    proceed,
    confidence,
    confidenceThreshold,
    issues,
    blockingIssues,
    summary: generateSummary(proceed, confidence, issues)
  };
}

/**
 * Generate user-friendly summary
 */
function generateSummary(proceed, confidence, issues) {
  if (proceed && issues.length === 0) {
    return {
      status: 'PASS',
      message: 'Data quality check passed. Safe to proceed with analysis.',
      confidence: Math.round(confidence * 100) + '%'
    };
  }

  if (!proceed) {
    const blockingIssues = issues.filter(i => i.severity === SEVERITY.BLOCKING);
    return {
      status: 'BLOCKED',
      message: `Data quality check FAILED. ${blockingIssues.length} blocking issue(s) detected.`,
      confidence: Math.round(confidence * 100) + '%',
      action: 'MUST resolve blocking issues before proceeding with conclusions'
    };
  }

  return {
    status: 'WARNING',
    message: `Data quality check passed with warnings. ${issues.length} issue(s) noted.`,
    confidence: Math.round(confidence * 100) + '%',
    action: 'Recommend addressing warnings but can proceed'
  };
}

/**
 * Generate user prompt for data quality issues
 *
 * @param {Object} checkpoint - Result from checkDataQuality
 * @returns {string} Formatted prompt for user
 */
function generateUserPrompt(checkpoint) {
  if (checkpoint.proceed && checkpoint.issues.length === 0) {
    return null; // No prompt needed
  }

  let prompt = '\n🚨 DATA QUALITY CHECKPOINT\n\n';

  prompt += `Status: ${checkpoint.summary.status}\n`;
  prompt += `Confidence: ${checkpoint.summary.confidence}\n`;
  prompt += `Message: ${checkpoint.summary.message}\n\n`;

  if (checkpoint.blockingIssues.length > 0) {
    prompt += 'BLOCKING ISSUES:\n';
    checkpoint.blockingIssues.forEach((issue, idx) => {
      prompt += `\n${idx + 1}. ${issue.message}\n`;
      if (issue.possibleCauses) {
        prompt += '   Possible causes:\n';
        issue.possibleCauses.forEach(cause => {
          prompt += `   - ${cause}\n`;
        });
      }
      if (issue.recommendedActions) {
        prompt += '   Recommended actions:\n';
        issue.recommendedActions.forEach(action => {
          prompt += `   - ${action}\n`;
        });
      }
    });

    prompt += '\n⚠️  CANNOT PROCEED WITH CONCLUSIONS UNTIL RESOLVED\n';
    prompt += '\nOptions:\n';
    prompt += '1. Fix query and retry\n';
    prompt += '2. Check permissions and org connection\n';
    prompt += '3. Confirm with user if zero/null data is expected\n';
    prompt += '4. Skip this query and note limitation in report\n';
  } else if (checkpoint.issues.length > 0) {
    prompt += 'WARNINGS:\n';
    checkpoint.issues.forEach((issue, idx) => {
      prompt += `${idx + 1}. ${issue.message} (${issue.severity})\n`;
    });
    prompt += '\nCan proceed but recommend addressing warnings.\n';
  }

  return prompt;
}

/**
 * Create checkpoint for analysis phase
 *
 * Validates that all required data has been collected before
 * allowing conclusions to be drawn.
 *
 * @param {Object} collectedData - All data collected during discovery
 * @param {Array} requiredDataPoints - List of required data point names
 * @returns {Object} Checkpoint result
 */
function createAnalysisCheckpoint(collectedData, requiredDataPoints) {
  const missing = [];
  const incomplete = [];

  requiredDataPoints.forEach(dataPoint => {
    if (!(dataPoint in collectedData)) {
      missing.push(dataPoint);
    } else if (collectedData[dataPoint] === null || collectedData[dataPoint] === undefined) {
      incomplete.push(dataPoint);
    }
  });

  const proceed = missing.length === 0 && incomplete.length === 0;

  return {
    proceed,
    missing,
    incomplete,
    message: proceed
      ? 'All required data collected. Safe to proceed with analysis.'
      : `Missing or incomplete data: ${[...missing, ...incomplete].join(', ')}`,
    userPrompt: proceed ? null : generateDataGapPrompt(missing, incomplete)
  };
}

/**
 * Generate prompt for data gaps
 */
function generateDataGapPrompt(missing, incomplete) {
  let prompt = '\n🚨 ANALYSIS CHECKPOINT: DATA GAPS DETECTED\n\n';

  if (missing.length > 0) {
    prompt += 'MISSING DATA POINTS:\n';
    missing.forEach(item => {
      prompt += `- ${item}\n`;
    });
  }

  if (incomplete.length > 0) {
    prompt += '\nINCOMPLETE DATA POINTS (NULL/undefined):\n';
    incomplete.forEach(item => {
      prompt += `- ${item}\n`;
    });
  }

  prompt += '\n⚠️  CANNOT DRAW CONCLUSIONS WITH INCOMPLETE DATA\n';
  prompt += '\nRecommended actions:\n';
  prompt += '1. Investigate why data collection failed\n';
  prompt += '2. Retry failed queries with corrected syntax\n';
  prompt += '3. Confirm with user if missing data is expected\n';
  prompt += '4. Document data gaps as limitation in report\n';

  return prompt;
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'check') {
    const resultFile = args[1];
    if (!resultFile) {
      console.error('Usage: data-quality-checkpoint.js check <result-file.json> [confidence-threshold]');
      process.exit(1);
    }

    const fs = require('fs');
    const queryResult = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
    const threshold = args[2] ? parseFloat(args[2]) : 0.7;

    const checkpoint = checkDataQuality(queryResult, {}, threshold);
    const userPrompt = generateUserPrompt(checkpoint);

    if (userPrompt) {
      console.error(userPrompt);
    }

    console.log(JSON.stringify(checkpoint, null, 2));
    process.exit(checkpoint.proceed ? 0 : 1);
  }

  if (command === 'analysis-checkpoint') {
    const dataFile = args[1];
    const requiredFile = args[2];

    if (!dataFile || !requiredFile) {
      console.error('Usage: data-quality-checkpoint.js analysis-checkpoint <data.json> <required.json>');
      process.exit(1);
    }

    const fs = require('fs');
    const collectedData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    const requiredDataPoints = JSON.parse(fs.readFileSync(requiredFile, 'utf-8'));

    const checkpoint = createAnalysisCheckpoint(collectedData, requiredDataPoints);

    if (checkpoint.userPrompt) {
      console.error(checkpoint.userPrompt);
    }

    console.log(JSON.stringify(checkpoint, null, 2));
    process.exit(checkpoint.proceed ? 0 : 1);
  }

  console.error('Usage:');
  console.error('  data-quality-checkpoint.js check <result-file.json> [threshold]');
  console.error('  data-quality-checkpoint.js analysis-checkpoint <data.json> <required.json>');
  process.exit(1);
}

module.exports = {
  checkDataQuality,
  generateUserPrompt,
  createAnalysisCheckpoint,
  CONFIDENCE_LEVELS,
  SEVERITY
};
