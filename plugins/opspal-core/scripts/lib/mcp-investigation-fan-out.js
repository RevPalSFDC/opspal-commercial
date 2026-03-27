#!/usr/bin/env node
/**
 * MCP Investigation Fan-Out — Cross-Platform Execution Receipt Adapter
 *
 * Wraps MCP tool call results (from HubSpot, Marketo, or any MCP-based platform)
 * into the same execution receipt format used by Salesforce investigation helpers.
 *
 * Unlike the Salesforce investigation-fan-out.js which executes sf CLI commands,
 * this adapter accepts pre-collected MCP tool results and generates receipts from them.
 * The actual MCP tool calls are made by the agent; this adapter provides the receipt layer.
 *
 * Usage:
 *   const { buildMcpInvestigationReceipt } = require('./mcp-investigation-fan-out');
 *
 *   // Agent collects results from MCP tool calls, then builds a receipt:
 *   const receipt = buildMcpInvestigationReceipt({
 *     platform: 'hubspot',
 *     orgIdentifier: 'portal-12345',
 *     helper: 'hubspot-assessment-analyzer',
 *     branches: [
 *       { name: 'contacts', success: true, recordCount: 250, tool: 'hubspot_search' },
 *       { name: 'deals', success: true, recordCount: 100, tool: 'hubspot_search' },
 *       { name: 'workflows', success: false, recordCount: 0, error: '401 Unauthorized' }
 *     ]
 *   });
 *
 * @version 1.0.0
 */

const path = require('path');

// Resolve the shared receipt library from opspal-core
let receiptLib;
try {
  receiptLib = require('./execution-receipt');
} catch (e) {
  // Fallback to relative path for different install contexts
  try {
    receiptLib = require(path.resolve(__dirname, 'execution-receipt'));
  } catch (e2) {
    throw new Error('mcp-investigation-fan-out: Cannot resolve execution-receipt.js library');
  }
}

const { generateReceipt, formatReceiptBlock, verifyReceipt } = receiptLib;

/**
 * Build an execution receipt from MCP tool call results.
 *
 * @param {object} params
 * @param {string} params.platform - Platform name (hubspot, marketo, etc.)
 * @param {string} params.orgIdentifier - Org/portal/instance identifier
 * @param {string} params.helper - Helper/agent name for receipt attribution
 * @param {Array<{name: string, success: boolean, recordCount: number, tool?: string, error?: string, usedFallback?: boolean}>} params.branches
 * @param {number} [params.durationMs=0] - Execution duration in ms
 * @returns {object} { receipt, receiptBlock }
 */
function buildMcpInvestigationReceipt(params) {
  const { platform, orgIdentifier, helper, branches = [], durationMs = 0 } = params;

  const succeeded = {};
  const failed = {};
  const fallbacks = [];

  for (const branch of branches) {
    if (branch.success) {
      succeeded[branch.name] = {
        totalSize: branch.recordCount || 0,
        records: [],
        tool: branch.tool || 'unknown',
        usedFallback: branch.usedFallback || false
      };
      if (branch.usedFallback) {
        fallbacks.push({ name: branch.name, note: `${branch.name} used fallback` });
      }
    } else {
      failed[branch.name] = {
        error: (branch.error || 'unknown').substring(0, 200),
        failureType: branch.failureType || 'unknown',
        tool: branch.tool || 'unknown'
      };
    }
  }

  const succeededCount = Object.keys(succeeded).length;
  const failedCount = Object.keys(failed).length;
  const totalCount = branches.length;

  let status;
  if (totalCount === 0) status = 'failed';
  else if (failedCount === 0) status = 'complete';
  else if (succeededCount === 0) status = 'failed';
  else status = 'partial';

  const receipt = generateReceipt({
    status,
    orgAlias: orgIdentifier || 'unknown',
    totalQueries: totalCount,
    succeededCount,
    failedCount,
    succeeded,
    failed,
    fallbacks,
    durationMs
  }, { helper: `${helper || platform || 'mcp'}@1.0.0` });

  return {
    receipt,
    receiptBlock: formatReceiptBlock(receipt),
    status,
    platform,
    succeededCount,
    failedCount,
    totalCount
  };
}

/**
 * Verify a receipt (delegates to shared receipt library).
 * Convenience re-export so platform plugins don't need to resolve the core lib directly.
 */
function verifyMcpReceipt(receipt, options) {
  return verifyReceipt(receipt, options);
}

// CLI entry point
if (require.main === module) {
  const action = process.argv[2];
  if (action === 'test') {
    // Generate a test receipt for verification testing
    const result = buildMcpInvestigationReceipt({
      platform: 'hubspot',
      orgIdentifier: 'test-portal-123',
      helper: 'hubspot-assessment-analyzer',
      branches: [
        { name: 'contacts', success: true, recordCount: 250, tool: 'hubspot_search' },
        { name: 'deals', success: true, recordCount: 100, tool: 'hubspot_search' },
        { name: 'workflows', success: true, recordCount: 15, tool: 'workflow_enumerate' }
      ],
      durationMs: 2345
    });
    console.log(result.receiptBlock);
  } else {
    console.error('Usage: node mcp-investigation-fan-out.js test');
    process.exit(1);
  }
}

module.exports = {
  buildMcpInvestigationReceipt,
  verifyMcpReceipt
};
