#!/usr/bin/env node
/**
 * Investigation Fan-Out Helper
 *
 * Executes multiple investigation queries in parallel using Promise.allSettled,
 * preserving partial results when some queries fail. Prevents one bad query
 * from cancelling useful sibling work.
 *
 * Usage:
 *   const { investigationFanOut } = require('./investigation-fan-out');
 *
 *   const result = await investigationFanOut('myorg', [
 *     { name: 'flows', query: 'SELECT Id FROM FlowDefinitionView', tooling: true },
 *     { name: 'triggers', query: 'SELECT Id FROM ApexTrigger', tooling: true },
 *     { name: 'rules', query: 'SELECT Id FROM WorkflowRule', tooling: true }
 *   ]);
 *
 *   // result.status: 'complete' | 'partial' | 'failed'
 *   // result.succeeded: { flows: {...}, triggers: {...} }
 *   // result.failed: { rules: { error: '...', failureType: '...' } }
 *
 * @version 1.0.0
 */

const { safeExecSfCommand, FAILURE_TYPES } = require('./safe-sf-result-parser');
const { generateReceipt, formatReceiptBlock } = require('./execution-receipt');

/**
 * Known fallbacks for objects that may not exist in all orgs
 */
const OBJECT_FALLBACKS = {
  FlowDefinitionView: {
    fallbackQuery: 'SELECT Id, DefinitionId, ProcessType, TriggerType, Status, VersionNumber FROM Flow WHERE Status = \'Active\'',
    tooling: true,
    note: 'FlowDefinitionView unavailable, using Flow (version) object'
  },
  FlowDefinition: {
    fallbackQuery: 'SELECT Id, DefinitionId, ProcessType, Status FROM Flow WHERE Status = \'Active\'',
    tooling: true,
    note: 'FlowDefinition unavailable, using Flow object'
  },
  ProcessDefinition: {
    fallbackQuery: 'SELECT Id, DefinitionId, ProcessType, Status FROM Flow WHERE ProcessType = \'Workflow\' AND Status = \'Active\'',
    tooling: true,
    note: 'ProcessDefinition unavailable, using Flow object filtered by ProcessType'
  }
};

/**
 * Extract the FROM object from a SOQL query
 * @param {string} query - SOQL query string
 * @returns {string|null} Object name or null
 */
function extractQueryObject(query) {
  const match = query.match(/\bFROM\s+(\w+)/i);
  return match ? match[1] : null;
}

/**
 * Execute a single investigation query with automatic fallback on object unavailability
 *
 * @param {string} orgAlias - Target org alias
 * @param {object} querySpec - { name, query, tooling?, fallbackQuery? }
 * @returns {Promise<object>} Result with success/failure classification
 */
async function executeWithFallback(orgAlias, querySpec) {
  const { name, query, tooling = true, fallbackQuery } = querySpec;

  const command = [
    'sf data query',
    `--query "${query}"`,
    tooling ? '--use-tooling-api' : '',
    '--json',
    `--target-org ${orgAlias}`
  ].filter(Boolean).join(' ');

  const result = safeExecSfCommand(command);

  if (result.success) {
    return {
      name,
      success: true,
      records: result.records,
      totalSize: result.totalSize,
      data: result.data,
      usedFallback: false
    };
  }

  // Check if failure is due to unsupported object and we have a fallback
  if (result.failureType === FAILURE_TYPES.INVALID_OBJECT || result.failureType === FAILURE_TYPES.UNKNOWN) {
    const objectName = extractQueryObject(query);
    const autoFallback = OBJECT_FALLBACKS[objectName];
    const fallback = fallbackQuery || (autoFallback ? autoFallback.fallbackQuery : null);

    if (fallback) {
      const fallbackCmd = [
        'sf data query',
        `--query "${fallback}"`,
        tooling ? '--use-tooling-api' : '',
        '--json',
        `--target-org ${orgAlias}`
      ].filter(Boolean).join(' ');

      const fallbackResult = safeExecSfCommand(fallbackCmd);

      if (fallbackResult.success) {
        return {
          name,
          success: true,
          records: fallbackResult.records,
          totalSize: fallbackResult.totalSize,
          data: fallbackResult.data,
          usedFallback: true,
          fallbackNote: autoFallback?.note || `Used fallback query for ${name}`,
          originalError: result.error
        };
      }
    }
  }

  // Both primary and fallback failed
  return {
    name,
    success: false,
    error: result.error,
    failureType: result.failureType,
    records: [],
    totalSize: 0
  };
}

/**
 * Fan out multiple investigation queries, preserving partial results.
 *
 * Uses Promise.allSettled so one failure never cancels siblings.
 * Returns structured partial-investigation state.
 *
 * @param {string} orgAlias - Target org alias
 * @param {Array<{name: string, query: string, tooling?: boolean, fallbackQuery?: string}>} querySpecs
 * @param {object} options - { concurrency?: number }
 * @returns {Promise<object>} Investigation result
 */
async function investigationFanOut(orgAlias, querySpecs, options = {}) {
  const startTime = Date.now();

  // Execute all queries with Promise.allSettled — no sibling cancellation
  const promises = querySpecs.map(spec => executeWithFallback(orgAlias, spec));
  const settled = await Promise.allSettled(promises);

  const succeeded = {};
  const failed = {};
  const fallbacks = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const val = result.value;
      if (val.success) {
        succeeded[val.name] = val;
        if (val.usedFallback) {
          fallbacks.push({ name: val.name, note: val.fallbackNote });
        }
      } else {
        failed[val.name] = val;
      }
    } else {
      // Promise rejected (shouldn't happen with our try/catch, but safety net)
      failed[`unknown_${Date.now()}`] = {
        success: false,
        error: result.reason?.message || 'Promise rejected',
        failureType: FAILURE_TYPES.UNKNOWN
      };
    }
  }

  const succeededCount = Object.keys(succeeded).length;
  const failedCount = Object.keys(failed).length;
  const totalCount = querySpecs.length;

  let status;
  if (failedCount === 0) {
    status = 'complete';
  } else if (succeededCount === 0) {
    status = 'failed';
  } else {
    status = 'partial';
  }

  const result = {
    status,
    orgAlias,
    totalQueries: totalCount,
    succeededCount,
    failedCount,
    succeeded,
    failed,
    fallbacks,
    durationMs: Date.now() - startTime,
    summary: `Investigation ${status}: ${succeededCount}/${totalCount} queries succeeded` +
             (fallbacks.length > 0 ? ` (${fallbacks.length} used fallbacks)` : '') +
             (failedCount > 0 ? ` | Failed: ${Object.keys(failed).join(', ')}` : '')
  };

  // Generate deterministic execution receipt tied to real query results
  const receipt = generateReceipt(result, { helper: 'investigation-fan-out@1.0.0' });
  result.receipt = receipt;
  result.receiptBlock = formatReceiptBlock(receipt);

  return result;
}

// CLI entry point
if (require.main === module) {
  const orgAlias = process.argv[2];
  if (!orgAlias) {
    console.error('Usage: node investigation-fan-out.js <org-alias>');
    console.error('  Runs a standard automation investigation fan-out');
    process.exit(1);
  }

  const standardQueries = [
    { name: 'flows', query: 'SELECT Id, DeveloperName, ProcessType, Status, VersionNumber FROM FlowDefinitionView', tooling: true },
    { name: 'triggers', query: 'SELECT Id, Name, TableEnumOrId, Status FROM ApexTrigger', tooling: true },
    { name: 'validationRules', query: 'SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, Active FROM ValidationRule', tooling: true },
    { name: 'workflowRules', query: 'SELECT Id, Name, TableEnumOrId FROM WorkflowRule', tooling: true },
    { name: 'apexClasses', query: 'SELECT Id, Name, Status FROM ApexClass WHERE NamespacePrefix = null', tooling: true }
  ];

  investigationFanOut(orgAlias, standardQueries).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'failed' ? 1 : 0);
  });
}

module.exports = {
  investigationFanOut,
  executeWithFallback,
  OBJECT_FALLBACKS,
  extractQueryObject
};
