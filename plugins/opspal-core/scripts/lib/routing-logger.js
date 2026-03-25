#!/usr/bin/env node
/**
 * Routing Logger Utility
 *
 * Logs routing decisions to JSONL file for debugging and analytics.
 *
 * Log location: ~/.claude/logs/routing.jsonl
 *
 * Usage:
 *   const { logRouting, readRoutingLog } = require('./routing-logger');
 *
 *   // Log a routing decision
 *   logRouting({
 *     agent: 'sfdc-revops-auditor',
 *     complexity: 0.72,
 *     confidence: 85,
 *     action: 'BLOCKED',
 *     message: 'Run automation audit'
 *   });
 *
 *   // Read recent logs
 *   const logs = readRoutingLog({ limit: 100 });
 *
 * CLI Usage:
 *   node routing-logger.js log '{"agent":"test","complexity":0.5}'
 *   node routing-logger.js read --limit 10
 *   node routing-logger.js stats
 *
 * @version 1.0.0
 * @date 2025-11-27
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Log file location
const LOG_DIR = path.join(os.homedir(), '.claude', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'routing.jsonl');

function getAgent(entry = {}) {
  return entry.agent || entry.suggested_agent || entry.required_agent || null;
}

function isExecutionGated(entry = {}) {
  if (typeof entry.execution_block_until_cleared === 'boolean') {
    return entry.execution_block_until_cleared;
  }
  if (typeof entry.requires_specialist === 'boolean' && typeof entry.prompt_guidance_only === 'boolean') {
    return entry.requires_specialist && !entry.prompt_guidance_only;
  }
  return entry.blocked === true || entry.action === 'BLOCKED' || entry.action === 'MANDATORY_BLOCKED';
}

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log a routing decision to JSONL file
 *
 * @param {Object} data - Routing decision data
 * @param {string} [data.agent] - Recommended agent name
 * @param {number} [data.complexity] - Task complexity (0-1)
 * @param {number} [data.confidence] - Match confidence (0-100)
 * @param {string} [data.action] - Action taken (BLOCKED, ALLOWED, RECOMMENDED)
 * @param {string} [data.message] - Original user message (truncated)
 * @param {string} [data.source] - Source of routing (hybrid, direct, fallback)
 */
function logRouting(data) {
  try {
    ensureLogDir();

    const entry = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...data
    };

    // Truncate message if too long (for privacy and storage)
    if (entry.message && entry.message.length > 200) {
      entry.message = entry.message.substring(0, 200) + '...';
    }

    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    return true;
  } catch (error) {
    // Fail silently - logging should never break the main flow
    if (process.env.ROUTING_VERBOSE === '1') {
      console.error('[routing-logger] Failed to log:', error.message);
    }
    return false;
  }
}

/**
 * Read routing log entries
 *
 * @param {Object} options - Read options
 * @param {number} [options.limit=100] - Maximum entries to return
 * @param {string} [options.since] - ISO date string to filter from
 * @param {string} [options.agent] - Filter by agent name
 * @param {string} [options.action] - Filter by action (BLOCKED, ALLOWED, etc.)
 * @returns {Array} Array of log entries
 */
function readRoutingLog(options = {}) {
  const { limit = 100, since, agent, action } = options;

  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    let entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Apply filters
    if (since) {
      const sinceDate = new Date(since);
      entries = entries.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (agent) {
      entries = entries.filter(e => e.agent === agent);
    }

    if (action) {
      entries = entries.filter(e => e.action === action);
    }

    // Return most recent entries (last N)
    return entries.slice(-limit);
  } catch (error) {
    console.error('[routing-logger] Failed to read log:', error.message);
    return [];
  }
}

/**
 * Get routing statistics
 *
 * @param {Object} options - Stats options
 * @param {string} [options.since] - ISO date string to filter from
 * @returns {Object} Statistics summary
 */
function getRoutingStats(options = {}) {
  const entries = readRoutingLog({ limit: 10000, ...options });

  if (entries.length === 0) {
    return {
      total: 0,
      message: 'No routing log entries found'
    };
  }

  const stats = {
    total: entries.length,
    byAction: {},
    byAgent: {},
    avgComplexity: 0,
    avgConfidence: 0,
    executionGated: 0,
    blocked: 0,
    allowed: 0,
    timeRange: {
      first: entries[0]?.timestamp,
      last: entries[entries.length - 1]?.timestamp
    }
  };

  let complexitySum = 0;
  let confidenceSum = 0;
  let complexityCount = 0;
  let confidenceCount = 0;

  for (const entry of entries) {
    // Count by action
    const action = entry.guidance_action || entry.routing_action_type || entry.action || 'UNKNOWN';
    stats.byAction[action] = (stats.byAction[action] || 0) + 1;

    if (isExecutionGated(entry)) {
      stats.executionGated++;
      stats.blocked++;
    }
    if (action === 'ALLOWED') stats.allowed++;

    // Count by agent
    const agent = getAgent(entry);
    if (agent && agent !== 'null' && agent !== '') {
      stats.byAgent[agent] = (stats.byAgent[agent] || 0) + 1;
    }

    // Sum for averages
    if (typeof entry.complexity === 'number') {
      complexitySum += entry.complexity;
      complexityCount++;
    }
    if (typeof entry.confidence === 'number') {
      confidenceSum += entry.confidence;
      confidenceCount++;
    }
  }

  stats.avgComplexity = complexityCount > 0 ? (complexitySum / complexityCount).toFixed(3) : 0;
  stats.avgConfidence = confidenceCount > 0 ? (confidenceSum / confidenceCount).toFixed(1) : 0;

  // Sort agents by frequency
  stats.topAgents = Object.entries(stats.byAgent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([agent, count]) => ({ agent, count, pct: ((count / entries.length) * 100).toFixed(1) + '%' }));

  return stats;
}

/**
 * Clear routing log (for testing/maintenance)
 */
function clearRoutingLog() {
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
    return true;
  }
  return false;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'log': {
      const data = JSON.parse(args[1] || '{}');
      const success = logRouting(data);
      console.log(success ? 'Logged successfully' : 'Failed to log');
      break;
    }

    case 'read': {
      const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10', 10);
      const entries = readRoutingLog({ limit });
      console.log(JSON.stringify(entries, null, 2));
      break;
    }

    case 'stats': {
      const since = args.find(a => a.startsWith('--since='))?.split('=')[1];
      const stats = getRoutingStats({ since });
      console.log(JSON.stringify(stats, null, 2));
      break;
    }

    case 'clear': {
      const cleared = clearRoutingLog();
      console.log(cleared ? 'Log cleared' : 'No log file to clear');
      break;
    }

    case 'path': {
      console.log(LOG_FILE);
      break;
    }

    default:
      console.log(`
Routing Logger - Log and analyze routing decisions

Commands:
  log '{"agent":"...","complexity":0.5}'  Log a routing decision
  read [--limit=N]                        Read recent log entries
  stats [--since=DATE]                    Show routing statistics
  clear                                   Clear the log file
  path                                    Show log file path

Log location: ${LOG_FILE}
      `.trim());
  }
}

module.exports = {
  logRouting,
  readRoutingLog,
  getRoutingStats,
  clearRoutingLog,
  LOG_FILE,
  LOG_DIR
};
