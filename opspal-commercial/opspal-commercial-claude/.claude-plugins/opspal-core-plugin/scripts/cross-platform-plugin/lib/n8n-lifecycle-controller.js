#!/usr/bin/env node
/**
 * n8n Lifecycle Controller
 *
 * Controls workflow activation states and scheduling for n8n Cloud.
 * Provides programmatic workflow lifecycle management.
 *
 * @version 1.0.0
 * @requires N8N_API_KEY environment variable
 * @requires N8N_BASE_URL environment variable (e.g., https://your-instance.n8n.cloud)
 *
 * Usage:
 *   node n8n-lifecycle-controller.js activate <workflow-id>
 *   node n8n-lifecycle-controller.js deactivate <workflow-id>
 *   node n8n-lifecycle-controller.js status <workflow-id>
 *   node n8n-lifecycle-controller.js list [--active|--inactive|--all]
 *   node n8n-lifecycle-controller.js bulk-activate --tag <tag> | --prefix <prefix>
 *   node n8n-lifecycle-controller.js bulk-deactivate --tag <tag> | --prefix <prefix>
 *   node n8n-lifecycle-controller.js schedule <workflow-id> --activate "0 8 * * *" --deactivate "0 20 * * *"
 *   node n8n-lifecycle-controller.js history <workflow-id>
 *   node n8n-lifecycle-controller.js rollback <workflow-id>
 */

const fs = require('fs');
const path = require('path');

// Configuration
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://your-instance.n8n.cloud';
const HISTORY_FILE = path.join(__dirname, '..', '..', 'data', 'n8n-lifecycle-history.json');

/**
 * Make authenticated API request to n8n
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} body - Request body (optional)
 * @returns {Promise<object>} API response
 */
async function n8nRequest(endpoint, method = 'GET', body = null) {
  if (!N8N_API_KEY) {
    throw new Error('N8N_API_KEY environment variable is required');
  }

  const url = `${N8N_BASE_URL}/api/v1${endpoint}`;
  const options = {
    method,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`n8n API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Load state history from file
 * @returns {object} History data
 */
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Warning: Could not load history file, starting fresh');
  }
  return { workflows: {} };
}

/**
 * Save state history to file
 * @param {object} history - History data to save
 */
function saveHistory(history) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Record state change in history
 * @param {string} workflowId - Workflow ID
 * @param {string} previousState - Previous state
 * @param {string} newState - New state
 * @param {string} action - Action performed
 */
function recordStateChange(workflowId, previousState, newState, action) {
  const history = loadHistory();

  if (!history.workflows[workflowId]) {
    history.workflows[workflowId] = [];
  }

  history.workflows[workflowId].push({
    timestamp: new Date().toISOString(),
    previousState,
    newState,
    action,
    executedBy: process.env.USER || 'unknown'
  });

  // Keep only last 50 entries per workflow
  if (history.workflows[workflowId].length > 50) {
    history.workflows[workflowId] = history.workflows[workflowId].slice(-50);
  }

  saveHistory(history);
}

/**
 * Activate a workflow
 * @param {string} workflowId - Workflow ID to activate
 * @returns {Promise<object>} Activation result
 */
async function activateWorkflow(workflowId) {
  // Get current state first
  const workflow = await n8nRequest(`/workflows/${workflowId}`);
  const previousState = workflow.active ? 'active' : 'inactive';

  if (workflow.active) {
    return {
      success: true,
      message: 'Workflow already active',
      workflowId,
      state: 'active'
    };
  }

  const result = await n8nRequest(`/workflows/${workflowId}/activate`, 'POST');

  recordStateChange(workflowId, previousState, 'active', 'activate');

  return {
    success: true,
    message: 'Workflow activated successfully',
    workflowId,
    workflowName: workflow.name,
    state: 'active',
    timestamp: new Date().toISOString()
  };
}

/**
 * Deactivate a workflow
 * @param {string} workflowId - Workflow ID to deactivate
 * @returns {Promise<object>} Deactivation result
 */
async function deactivateWorkflow(workflowId) {
  // Get current state first
  const workflow = await n8nRequest(`/workflows/${workflowId}`);
  const previousState = workflow.active ? 'active' : 'inactive';

  if (!workflow.active) {
    return {
      success: true,
      message: 'Workflow already inactive',
      workflowId,
      state: 'inactive'
    };
  }

  const result = await n8nRequest(`/workflows/${workflowId}/deactivate`, 'POST');

  recordStateChange(workflowId, previousState, 'inactive', 'deactivate');

  return {
    success: true,
    message: 'Workflow deactivated successfully',
    workflowId,
    workflowName: workflow.name,
    state: 'inactive',
    timestamp: new Date().toISOString()
  };
}

/**
 * Get workflow status
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<object>} Workflow status
 */
async function getWorkflowStatus(workflowId) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);

  return {
    workflowId: workflow.id,
    name: workflow.name,
    active: workflow.active,
    state: workflow.active ? 'active' : 'inactive',
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    tags: workflow.tags || [],
    nodeCount: workflow.nodes?.length || 0
  };
}

/**
 * List workflows with optional filter
 * @param {string} filter - Filter type: 'active', 'inactive', or 'all'
 * @returns {Promise<array>} List of workflows
 */
async function listWorkflows(filter = 'all') {
  const workflows = await n8nRequest('/workflows');

  let filtered = workflows;
  if (filter === 'active') {
    filtered = workflows.filter(w => w.active);
  } else if (filter === 'inactive') {
    filtered = workflows.filter(w => !w.active);
  }

  return filtered.map(w => ({
    id: w.id,
    name: w.name,
    active: w.active,
    state: w.active ? 'active' : 'inactive',
    tags: w.tags || [],
    updatedAt: w.updatedAt
  }));
}

/**
 * Bulk activate workflows by tag or prefix
 * @param {object} options - Filter options (tag or prefix)
 * @returns {Promise<object>} Bulk operation result
 */
async function bulkActivate(options) {
  const workflows = await n8nRequest('/workflows');
  let toActivate = [];

  if (options.tag) {
    toActivate = workflows.filter(w =>
      w.tags?.some(t => t.name === options.tag || t === options.tag)
    );
  } else if (options.prefix) {
    toActivate = workflows.filter(w =>
      w.name.startsWith(options.prefix)
    );
  }

  // Filter to only inactive workflows
  toActivate = toActivate.filter(w => !w.active);

  const results = {
    total: toActivate.length,
    success: 0,
    failed: 0,
    details: []
  };

  for (const workflow of toActivate) {
    try {
      await activateWorkflow(workflow.id);
      results.success++;
      results.details.push({ id: workflow.id, name: workflow.name, status: 'activated' });
    } catch (error) {
      results.failed++;
      results.details.push({ id: workflow.id, name: workflow.name, status: 'failed', error: error.message });
    }

    // Rate limiting - wait between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Bulk deactivate workflows by tag or prefix
 * @param {object} options - Filter options (tag or prefix)
 * @returns {Promise<object>} Bulk operation result
 */
async function bulkDeactivate(options) {
  const workflows = await n8nRequest('/workflows');
  let toDeactivate = [];

  if (options.tag) {
    toDeactivate = workflows.filter(w =>
      w.tags?.some(t => t.name === options.tag || t === options.tag)
    );
  } else if (options.prefix) {
    toDeactivate = workflows.filter(w =>
      w.name.startsWith(options.prefix)
    );
  }

  // Filter to only active workflows
  toDeactivate = toDeactivate.filter(w => w.active);

  const results = {
    total: toDeactivate.length,
    success: 0,
    failed: 0,
    details: []
  };

  for (const workflow of toDeactivate) {
    try {
      await deactivateWorkflow(workflow.id);
      results.success++;
      results.details.push({ id: workflow.id, name: workflow.name, status: 'deactivated' });
    } catch (error) {
      results.failed++;
      results.details.push({ id: workflow.id, name: workflow.name, status: 'failed', error: error.message });
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Get state history for a workflow
 * @param {string} workflowId - Workflow ID
 * @returns {array} State history entries
 */
function getHistory(workflowId) {
  const history = loadHistory();
  return history.workflows[workflowId] || [];
}

/**
 * Rollback workflow to previous state
 * @param {string} workflowId - Workflow ID
 * @returns {Promise<object>} Rollback result
 */
async function rollbackWorkflow(workflowId) {
  const history = getHistory(workflowId);

  if (history.length === 0) {
    return {
      success: false,
      message: 'No history available for rollback',
      workflowId
    };
  }

  const lastEntry = history[history.length - 1];
  const targetState = lastEntry.previousState;

  let result;
  if (targetState === 'active') {
    result = await activateWorkflow(workflowId);
  } else {
    result = await deactivateWorkflow(workflowId);
  }

  return {
    ...result,
    rollbackFrom: lastEntry.newState,
    rollbackTo: targetState,
    originalAction: lastEntry.action
  };
}

/**
 * Create schedule configuration for workflow activation windows
 * @param {string} workflowId - Workflow ID
 * @param {string} activateCron - Cron expression for activation
 * @param {string} deactivateCron - Cron expression for deactivation
 * @returns {object} Schedule configuration
 */
function createSchedule(workflowId, activateCron, deactivateCron) {
  const schedulesFile = path.join(__dirname, '..', '..', 'data', 'n8n-schedules.json');

  let schedules = {};
  try {
    if (fs.existsSync(schedulesFile)) {
      schedules = JSON.parse(fs.readFileSync(schedulesFile, 'utf8'));
    }
  } catch (e) {
    // Start fresh
  }

  schedules[workflowId] = {
    activateCron,
    deactivateCron,
    createdAt: new Date().toISOString(),
    enabled: true
  };

  const dir = path.dirname(schedulesFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(schedulesFile, JSON.stringify(schedules, null, 2));

  return {
    success: true,
    message: 'Schedule created successfully',
    workflowId,
    schedule: schedules[workflowId],
    instructions: [
      'To execute scheduled operations, add cron jobs:',
      `Activate: ${activateCron} -> node n8n-lifecycle-controller.js activate ${workflowId}`,
      `Deactivate: ${deactivateCron} -> node n8n-lifecycle-controller.js deactivate ${workflowId}`,
      '',
      'Or use the n8n Schedule Trigger in a control workflow.'
    ]
  };
}

/**
 * Parse command line arguments
 * @param {array} args - Command line arguments
 * @returns {object} Parsed arguments
 */
function parseArgs(args) {
  const parsed = {
    command: args[0],
    workflowId: null,
    options: {}
  };

  if (args[1] && !args[1].startsWith('--')) {
    parsed.workflowId = args[1];
  }

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) {
      parsed.options.tag = args[i + 1];
      i++;
    } else if (args[i] === '--prefix' && args[i + 1]) {
      parsed.options.prefix = args[i + 1];
      i++;
    } else if (args[i] === '--activate' && args[i + 1]) {
      parsed.options.activateCron = args[i + 1];
      i++;
    } else if (args[i] === '--deactivate' && args[i + 1]) {
      parsed.options.deactivateCron = args[i + 1];
      i++;
    } else if (args[i] === '--active') {
      parsed.options.filter = 'active';
    } else if (args[i] === '--inactive') {
      parsed.options.filter = 'inactive';
    } else if (args[i] === '--all') {
      parsed.options.filter = 'all';
    } else if (args[i] === '--json') {
      parsed.options.json = true;
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
n8n Lifecycle Controller v1.0.0

Usage:
  node n8n-lifecycle-controller.js <command> [options]

Commands:
  activate <workflow-id>     Activate a workflow
  deactivate <workflow-id>   Deactivate a workflow
  status <workflow-id>       Get workflow status
  list [--active|--inactive] List workflows
  bulk-activate              Activate multiple workflows
    --tag <tag>              Filter by tag
    --prefix <prefix>        Filter by name prefix
  bulk-deactivate            Deactivate multiple workflows
    --tag <tag>              Filter by tag
    --prefix <prefix>        Filter by name prefix
  schedule <workflow-id>     Create activation schedule
    --activate "cron"        Cron for activation
    --deactivate "cron"      Cron for deactivation
  history <workflow-id>      View state change history
  rollback <workflow-id>     Rollback to previous state

Options:
  --json                     Output in JSON format

Environment Variables:
  N8N_API_KEY                n8n API key (required)
  N8N_BASE_URL               n8n instance URL (default: https://your-instance.n8n.cloud)

Examples:
  node n8n-lifecycle-controller.js activate abc123
  node n8n-lifecycle-controller.js list --active
  node n8n-lifecycle-controller.js bulk-activate --tag production
  node n8n-lifecycle-controller.js schedule abc123 --activate "0 8 * * *" --deactivate "0 20 * * *"
`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const parsed = parseArgs(args);
  const outputJson = parsed.options.json;

  try {
    let result;

    switch (parsed.command) {
      case 'activate':
        if (!parsed.workflowId) {
          throw new Error('Workflow ID required');
        }
        result = await activateWorkflow(parsed.workflowId);
        break;

      case 'deactivate':
        if (!parsed.workflowId) {
          throw new Error('Workflow ID required');
        }
        result = await deactivateWorkflow(parsed.workflowId);
        break;

      case 'status':
        if (!parsed.workflowId) {
          throw new Error('Workflow ID required');
        }
        result = await getWorkflowStatus(parsed.workflowId);
        break;

      case 'list':
        result = await listWorkflows(parsed.options.filter || 'all');
        break;

      case 'bulk-activate':
        if (!parsed.options.tag && !parsed.options.prefix) {
          throw new Error('Either --tag or --prefix required');
        }
        result = await bulkActivate(parsed.options);
        break;

      case 'bulk-deactivate':
        if (!parsed.options.tag && !parsed.options.prefix) {
          throw new Error('Either --tag or --prefix required');
        }
        result = await bulkDeactivate(parsed.options);
        break;

      case 'schedule':
        if (!parsed.workflowId) {
          throw new Error('Workflow ID required');
        }
        if (!parsed.options.activateCron || !parsed.options.deactivateCron) {
          throw new Error('Both --activate and --deactivate cron expressions required');
        }
        result = createSchedule(
          parsed.workflowId,
          parsed.options.activateCron,
          parsed.options.deactivateCron
        );
        break;

      case 'history':
        if (!parsed.workflowId) {
          throw new Error('Workflow ID required');
        }
        result = getHistory(parsed.workflowId);
        break;

      case 'rollback':
        if (!parsed.workflowId) {
          throw new Error('Workflow ID required');
        }
        result = await rollbackWorkflow(parsed.workflowId);
        break;

      default:
        throw new Error(`Unknown command: ${parsed.command}`);
    }

    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Pretty print based on result type
      if (Array.isArray(result)) {
        if (result.length === 0) {
          console.log('No results found');
        } else {
          console.table(result);
        }
      } else if (result.details) {
        // Bulk operation result
        console.log(`\nBulk Operation Complete`);
        console.log(`Total: ${result.total}`);
        console.log(`Success: ${result.success}`);
        console.log(`Failed: ${result.failed}`);
        if (result.details.length > 0) {
          console.log('\nDetails:');
          console.table(result.details);
        }
      } else if (result.instructions) {
        // Schedule result
        console.log(`\n${result.message}`);
        console.log(`\nSchedule Configuration:`);
        console.log(JSON.stringify(result.schedule, null, 2));
        console.log(`\nInstructions:`);
        result.instructions.forEach(i => console.log(`  ${i}`));
      } else {
        // Standard result
        console.log(`\n${result.message || 'Operation complete'}`);
        Object.entries(result).forEach(([key, value]) => {
          if (key !== 'message' && key !== 'success') {
            console.log(`  ${key}: ${value}`);
          }
        });
      }
    }

    process.exit(0);

  } catch (error) {
    if (outputJson) {
      console.log(JSON.stringify({ success: false, error: error.message }));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for programmatic use
module.exports = {
  activateWorkflow,
  deactivateWorkflow,
  getWorkflowStatus,
  listWorkflows,
  bulkActivate,
  bulkDeactivate,
  getHistory,
  rollbackWorkflow,
  createSchedule
};
