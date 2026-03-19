#!/usr/bin/env node
/**
 * Compliance Tracker
 *
 * Tracks and analyzes routing compliance - detecting when Claude ignores
 * agent routing recommendations.
 *
 * Usage:
 *   node compliance-tracker.js log <recommended> <actual> <action>
 *   node compliance-tracker.js stats
 *   node compliance-tracker.js report
 *   node compliance-tracker.js recent [count]
 *   node compliance-tracker.js rate
 *
 * Log file: ~/.claude/logs/compliance.jsonl
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const LOG_DIR = path.join(os.homedir(), '.claude', 'logs');
const COMPLIANCE_LOG = path.join(LOG_DIR, 'compliance.jsonl');
const ROUTING_LOG = path.join(LOG_DIR, 'routing.jsonl');

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log a compliance violation
 * @param {string} recommendedAgent - The agent that was recommended
 * @param {string} actualTool - The tool that was actually used
 * @param {string} actionType - The action type (BLOCKED, RECOMMENDED, etc.)
 */
function logViolation(recommendedAgent, actualTool, actionType) {
  ensureLogDir();

  const entry = {
    timestamp: new Date().toISOString(),
    type: 'routing_ignored',
    recommended_agent: recommendedAgent,
    actual_tool: actualTool,
    action_type: actionType,
    violation: true
  };

  fs.appendFileSync(COMPLIANCE_LOG, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Read all compliance entries
 * @returns {Array} Array of compliance entries
 */
function readComplianceLog() {
  if (!fs.existsSync(COMPLIANCE_LOG)) {
    return [];
  }

  const content = fs.readFileSync(COMPLIANCE_LOG, 'utf8');
  return content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(entry => entry !== null);
}

/**
 * Read routing log entries
 * @returns {Array} Array of routing entries
 */
function readRoutingLog() {
  if (!fs.existsSync(ROUTING_LOG)) {
    return [];
  }

  const content = fs.readFileSync(ROUTING_LOG, 'utf8');
  return content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(entry => entry !== null);
}

/**
 * Calculate compliance rate
 * @returns {Object} Compliance statistics
 */
function getComplianceRate() {
  const routingEntries = readRoutingLog();
  const complianceEntries = readComplianceLog();

  // Count blocking decisions
  const blockingDecisions = routingEntries.filter(
    e => e.blocked === true || e.action === 'BLOCKED' || e.action === 'MANDATORY_BLOCKED'
  );

  // Count violations (blocked but not using the required Agent route)
  const violations = complianceEntries.filter(e => e.violation === true);

  const totalBlocking = blockingDecisions.length;
  const totalViolations = violations.length;

  // Calculate compliance rate
  // Compliance = (blocking decisions - violations) / blocking decisions
  const complianceRate = totalBlocking > 0
    ? ((totalBlocking - totalViolations) / totalBlocking * 100).toFixed(1)
    : 100;

  return {
    total_routing_decisions: routingEntries.length,
    blocking_decisions: totalBlocking,
    violations: totalViolations,
    compliance_rate: `${complianceRate}%`,
    compliance_rate_numeric: parseFloat(complianceRate)
  };
}

/**
 * Get detailed statistics
 * @returns {Object} Detailed compliance statistics
 */
function getStats() {
  const routingEntries = readRoutingLog();
  const complianceEntries = readComplianceLog();

  // Group by action type
  const byAction = {};
  routingEntries.forEach(entry => {
    const action = entry.action || 'unknown';
    byAction[action] = (byAction[action] || 0) + 1;
  });

  // Most ignored agents
  const ignoredAgents = {};
  complianceEntries.forEach(entry => {
    const agent = entry.recommended_agent || 'unknown';
    ignoredAgents[agent] = (ignoredAgents[agent] || 0) + 1;
  });

  // Sort by count
  const topIgnored = Object.entries(ignoredAgents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([agent, count]) => ({ agent, count }));

  // Recent violations (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentViolations = complianceEntries.filter(
    e => new Date(e.timestamp) > oneDayAgo
  ).length;

  return {
    ...getComplianceRate(),
    by_action: byAction,
    most_ignored_agents: topIgnored,
    violations_last_24h: recentViolations,
    log_file: COMPLIANCE_LOG
  };
}

/**
 * Generate formatted report
 * @returns {string} Formatted compliance report
 */
function generateReport() {
  const stats = getStats();

  let report = `
╔══════════════════════════════════════════════════════════════════╗
║              ROUTING COMPLIANCE REPORT                           ║
╚══════════════════════════════════════════════════════════════════╝

📊 OVERALL STATISTICS
────────────────────────────────────────────────────────────────────
  Total Routing Decisions: ${stats.total_routing_decisions}
  Blocking Decisions:      ${stats.blocking_decisions}
  Compliance Violations:   ${stats.violations}
  Compliance Rate:         ${stats.compliance_rate}
  Violations (24h):        ${stats.violations_last_24h}

📈 DECISIONS BY ACTION TYPE
────────────────────────────────────────────────────────────────────`;

  for (const [action, count] of Object.entries(stats.by_action)) {
    report += `\n  ${action.padEnd(20)} ${count}`;
  }

  if (stats.most_ignored_agents.length > 0) {
    report += `

🚨 MOST IGNORED AGENTS
────────────────────────────────────────────────────────────────────`;
    for (const { agent, count } of stats.most_ignored_agents) {
      report += `\n  ${agent.padEnd(30)} ${count} violation(s)`;
    }
  }

  report += `

📁 LOG FILE
────────────────────────────────────────────────────────────────────
  ${stats.log_file}

💡 RECOMMENDATIONS
────────────────────────────────────────────────────────────────────`;

  if (stats.compliance_rate_numeric < 70) {
    report += '\n  ⚠️  Low compliance rate - consider lowering blocking thresholds';
  } else if (stats.compliance_rate_numeric < 85) {
    report += '\n  📝 Moderate compliance - review most-ignored agents';
  } else {
    report += '\n  ✅ Good compliance rate - system working well';
  }

  if (stats.most_ignored_agents.length > 0) {
    report += `\n  📌 Top ignored: ${stats.most_ignored_agents[0].agent}`;
  }

  report += '\n';

  return report;
}

/**
 * Get recent violations
 * @param {number} count - Number of recent violations to return
 * @returns {Array} Recent violations
 */
function getRecentViolations(count = 10) {
  const entries = readComplianceLog();
  return entries.slice(-count).reverse();
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'log':
      const recommended = args[1];
      const actual = args[2];
      const action = args[3] || 'BLOCKED';
      const entry = logViolation(recommended, actual, action);
      console.log(JSON.stringify(entry));
      break;

    case 'stats':
      console.log(JSON.stringify(getStats(), null, 2));
      break;

    case 'report':
      console.log(generateReport());
      break;

    case 'recent':
      const count = parseInt(args[1]) || 10;
      console.log(JSON.stringify(getRecentViolations(count), null, 2));
      break;

    case 'rate':
      console.log(JSON.stringify(getComplianceRate(), null, 2));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Usage: compliance-tracker.js <log|stats|report|recent|rate> [args]');
      console.error('\nCommands:');
      console.error('  log <recommended> <actual> <action>  - Log a violation');
      console.error('  stats                                - Get detailed statistics');
      console.error('  report                               - Generate formatted report');
      console.error('  recent [count]                       - Get recent violations');
      console.error('  rate                                 - Get compliance rate');
      process.exit(1);
  }
}

module.exports = {
  logViolation,
  readComplianceLog,
  readRoutingLog,
  getComplianceRate,
  getStats,
  generateReport,
  getRecentViolations,
  COMPLIANCE_LOG,
  ROUTING_LOG
};
