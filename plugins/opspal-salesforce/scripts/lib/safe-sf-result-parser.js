#!/usr/bin/env node
/**
 * Safe Salesforce CLI Result Parser
 *
 * Validates SF CLI output before JSON.parse to prevent cascading parse failures.
 * Handles:
 * - Non-JSON output (error messages, deprecation warnings)
 * - Mixed stderr/stdout content
 * - Empty output
 * - Partial JSON
 * - SF CLI error responses (status !== 0)
 *
 * Usage:
 *   const { safeParseSfResult, safeExecSfCommand } = require('./safe-sf-result-parser');
 *
 *   // Parse existing output
 *   const result = safeParseSfResult(rawOutput);
 *   if (result.success) { use(result.data); }
 *
 *   // Execute and parse in one step
 *   const result = safeExecSfCommand('sf data query --query "..." --json --target-org myorg');
 *   if (result.success) { use(result.data); }
 *
 * @version 1.0.0
 */

const { execSync } = require('child_process');

/**
 * Classification of SF CLI failures
 */
const FAILURE_TYPES = {
  EMPTY_OUTPUT: 'empty_output',
  NOT_JSON: 'not_json',
  PARSE_ERROR: 'parse_error',
  SF_ERROR: 'sf_error',
  COMMAND_FAILED: 'command_failed',
  TIMEOUT: 'timeout',
  INVALID_OBJECT: 'invalid_object',
  INVALID_FIELD: 'invalid_field',
  PERMISSION_ERROR: 'permission_error',
  UNKNOWN: 'unknown'
};

/**
 * Classify an SF CLI error from its message or output
 * @param {string} message - Error message or raw output
 * @returns {string} FAILURE_TYPE constant
 */
function classifyError(message) {
  if (!message) return FAILURE_TYPES.UNKNOWN;
  const lower = message.toLowerCase();

  if (lower.includes('sobject type') && lower.includes('not supported')) return FAILURE_TYPES.INVALID_OBJECT;
  if (lower.includes('invalid_type')) return FAILURE_TYPES.INVALID_OBJECT;
  if (lower.includes('sobject type') && lower.includes('does not exist')) return FAILURE_TYPES.INVALID_OBJECT;
  if (lower.includes('no such column') || lower.includes('invalid_field')) return FAILURE_TYPES.INVALID_FIELD;
  if (lower.includes('insufficient_access') || lower.includes('insufficient access')) return FAILURE_TYPES.PERMISSION_ERROR;
  if (lower.includes('timeout') || lower.includes('etimedout')) return FAILURE_TYPES.TIMEOUT;

  return FAILURE_TYPES.UNKNOWN;
}

/**
 * Safely parse SF CLI JSON output
 *
 * @param {string} rawOutput - Raw stdout from sf CLI command
 * @returns {object} { success: boolean, data?: object, error?: string, failureType?: string, rawOutput?: string }
 */
function safeParseSfResult(rawOutput) {
  // Handle empty/null output
  if (!rawOutput || rawOutput.trim().length === 0) {
    return {
      success: false,
      error: 'Empty output from sf CLI',
      failureType: FAILURE_TYPES.EMPTY_OUTPUT,
      data: null
    };
  }

  const trimmed = rawOutput.trim();

  // Check if it looks like JSON at all (starts with { or [)
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // Not JSON — might be a plain error message or warning text
    return {
      success: false,
      error: `Non-JSON output from sf CLI: ${trimmed.substring(0, 200)}`,
      failureType: FAILURE_TYPES.NOT_JSON,
      rawOutput: trimmed.substring(0, 500)
    };
  }

  // Attempt parse
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (parseErr) {
    return {
      success: false,
      error: `JSON parse error: ${parseErr.message}`,
      failureType: FAILURE_TYPES.PARSE_ERROR,
      rawOutput: trimmed.substring(0, 500)
    };
  }

  // Check SF CLI status field
  if (parsed.status !== undefined && parsed.status !== 0) {
    const errorMessage = parsed.message || parsed.name || JSON.stringify(parsed.result || {}).substring(0, 200);
    return {
      success: false,
      error: errorMessage,
      failureType: classifyError(errorMessage),
      data: parsed
    };
  }

  // Success
  return {
    success: true,
    data: parsed,
    records: parsed.result?.records || [],
    totalSize: parsed.result?.totalSize || 0
  };
}

/**
 * Execute an SF CLI command and safely parse the result.
 * Uses execSync with separated stdio to prevent stderr/stdout mixing.
 *
 * NOTE: This function is intended for use with hardcoded or agent-constructed
 * sf CLI commands only. All inputs are from trusted internal callers (agent
 * instructions, scripts). This is NOT exposed to external user input.
 *
 * @param {string} command - Full sf CLI command (should include --json flag)
 * @param {object} options - execSync options
 * @param {number} options.timeout - Timeout in ms (default: 30000)
 * @param {number} options.maxBuffer - Max buffer in bytes (default: 10MB)
 * @returns {object} { success, data, records, totalSize, error, failureType }
 */
function safeExecSfCommand(command, options = {}) {
  const timeout = options.timeout || 30000;
  const maxBuffer = options.maxBuffer || 10 * 1024 * 1024;

  // Ensure --json flag is present for parseable output
  const hasJsonFlag = /--json\b/.test(command) || /--result-format\s+json\b/.test(command);
  if (!hasJsonFlag) {
    command = command + ' --json';
  }

  let stdout = '';
  let stderr = '';

  try {
    // stdio: ['pipe', 'pipe', 'pipe'] separates stderr from stdout, preventing mixing
    stdout = execSync(command, {
      encoding: 'utf8',
      timeout,
      maxBuffer,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (execError) {
    // execSync throws on non-zero exit — SF CLI often returns useful JSON in stdout even on error
    stdout = execError.stdout || '';
    stderr = execError.stderr || '';

    // Try to parse stdout even from an error exit
    if (stdout && stdout.trim().length > 0) {
      const parsed = safeParseSfResult(stdout);
      if (parsed.data) {
        return {
          ...parsed,
          success: false,
          stderr: stderr.substring(0, 500)
        };
      }
    }

    // No useful JSON output — classify from error message
    const errorMessage = stderr || execError.message || 'Command failed';
    return {
      success: false,
      error: errorMessage.substring(0, 500),
      failureType: classifyError(errorMessage),
      rawOutput: stdout.substring(0, 200),
      stderr: stderr.substring(0, 500)
    };
  }

  // Command succeeded (exit 0)
  return safeParseSfResult(stdout);
}

/**
 * Execute multiple SF CLI queries with individual error isolation.
 * Each query is executed independently; one failure does not affect others.
 *
 * @param {Array<{name: string, command: string}>} queries - Named queries to execute
 * @param {object} options - Options passed to safeExecSfCommand
 * @returns {object} { results: {name: result}, succeeded: string[], failed: string[], partial: boolean }
 */
function safeExecMultipleQueries(queries, options = {}) {
  const results = {};
  const succeeded = [];
  const failed = [];

  for (const { name, command } of queries) {
    const result = safeExecSfCommand(command, options);
    results[name] = result;

    if (result.success) {
      succeeded.push(name);
    } else {
      failed.push(name);
    }
  }

  const multiResult = {
    results,
    succeeded,
    failed,
    partial: succeeded.length > 0 && failed.length > 0,
    allSucceeded: failed.length === 0,
    allFailed: succeeded.length === 0
  };

  // Generate execution receipt if the receipt library is available
  try {
    const { generateReceiptFromMultiQuery, formatReceiptBlock } = require('./execution-receipt');
    const receipt = generateReceiptFromMultiQuery(multiResult, options.orgAlias || 'unknown');
    multiResult.receipt = receipt;
    multiResult.receiptBlock = formatReceiptBlock(receipt);
  } catch (e) {
    // Receipt library not available — degrade gracefully
  }

  return multiResult;
}

// CLI entry point
if (require.main === module) {
  const command = process.argv.slice(2).join(' ');
  if (!command) {
    console.error('Usage: node safe-sf-result-parser.js <sf-cli-command>');
    process.exit(1);
  }
  const result = safeExecSfCommand(command);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

module.exports = {
  safeParseSfResult,
  safeExecSfCommand,
  safeExecMultipleQueries,
  classifyError,
  FAILURE_TYPES
};
