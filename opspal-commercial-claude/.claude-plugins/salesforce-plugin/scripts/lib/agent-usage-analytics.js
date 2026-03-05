#!/usr/bin/env node

/**
 * Agent Usage Analytics Tracker
 *
 * Tracks when agents were used, when they should have been used but weren't,
 * and generates compliance reports.
 *
 * Usage:
 *   node agent-usage-analytics.js log <task> <agent_used> <should_use_agent>
 *   node agent-usage-analytics.js report [days]
 *   node agent-usage-analytics.js compliance
 */

const fs = require('fs');
const path = require('path');

// Configuration
const LOG_DIR = path.join(__dirname, '../../.claude/analytics');
const LOG_FILE = path.join(LOG_DIR, 'agent-usage.jsonl');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Agent trigger patterns (from agent-triggers.json)
const MANDATORY_PATTERNS = {
    'production.*deploy': 'release-coordinator',
    'delete.*(field|object|class)': 'sfdc-metadata-manager',
    'bulk.*(update|insert|delete)': 'sfdc-data-operations',
    'permission.*set.*(create|update)': 'sfdc-security-admin',
    '(create|update).*flow': 'sfdc-automation-builder',
    'revops.*audit': 'sfdc-revops-auditor'
};

const KEYWORD_PATTERNS = {
    'deploy|release': 'release-coordinator',
    'merge|consolidate': 'sfdc-merge-orchestrator',
    'conflict|error': 'sfdc-conflict-resolver',
    'field|object|metadata': 'sfdc-metadata-manager',
    'data|import|bulk': 'sfdc-data-operations',
    'apex|trigger': 'sfdc-apex-developer',
    'report|dashboard': 'sfdc-reports-dashboards',
    'flow|automation': 'sfdc-automation-builder',
    'permission|security': 'sfdc-security-admin'
};

/**
 * Determine if an agent should have been used based on task description
 */
function analyzeTaskForAgent(taskDescription) {
    const task = taskDescription.toLowerCase();

    // Check mandatory patterns
    for (const [pattern, agent] of Object.entries(MANDATORY_PATTERNS)) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(task)) {
            return {
                shouldUseAgent: true,
                recommendedAgent: agent,
                priority: 'MANDATORY',
                reason: `Matched mandatory pattern: ${pattern}`
            };
        }
    }

    // Check keyword patterns
    for (const [pattern, agent] of Object.entries(KEYWORD_PATTERNS)) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(task)) {
            return {
                shouldUseAgent: true,
                recommendedAgent: agent,
                priority: 'RECOMMENDED',
                reason: `Matched keyword pattern: ${pattern}`
            };
        }
    }

    // Check complexity heuristics
    const wordCount = task.split(/\s+/).length;
    const actionVerbs = task.match(/\b(create|update|delete|deploy|modify|change|add|remove|configure)\b/gi) || [];

    if (wordCount > 15 || actionVerbs.length > 2) {
        return {
            shouldUseAgent: true,
            recommendedAgent: 'principal-engineer',
            priority: 'RECOMMENDED',
            reason: 'Complex task detected (long description or multiple actions)'
        };
    }

    return {
        shouldUseAgent: false,
        recommendedAgent: null,
        priority: 'OPTIONAL',
        reason: 'Simple task - direct execution acceptable'
    };
}

/**
 * Log an agent usage event
 */
function logUsage(taskDescription, agentUsed, metadata = {}) {
    const analysis = analyzeTaskForAgent(taskDescription);

    const event = {
        timestamp: new Date().toISOString(),
        task: taskDescription,
        agentUsed: agentUsed || null,
        shouldUseAgent: analysis.shouldUseAgent,
        recommendedAgent: analysis.recommendedAgent,
        priority: analysis.priority,
        reason: analysis.reason,
        compliant: agentUsed ? true : !analysis.shouldUseAgent,
        metadata
    };

    // Append to log file (JSONL format)
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n');

    // Return compliance status
    return {
        logged: true,
        compliant: event.compliant,
        analysis
    };
}

/**
 * Read log entries
 */
function readLogs(daysBack = 7) {
    if (!fs.existsSync(LOG_FILE)) {
        return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    return lines
        .map(line => JSON.parse(line))
        .filter(entry => new Date(entry.timestamp) >= cutoffDate);
}

/**
 * Generate compliance report
 */
function generateComplianceReport(daysBack = 7) {
    const logs = readLogs(daysBack);

    if (logs.length === 0) {
        return {
            period: `Last ${daysBack} days`,
            totalTasks: 0,
            message: 'No data collected yet'
        };
    }

    const totalTasks = logs.length;
    const compliantTasks = logs.filter(l => l.compliant).length;
    const mandatoryViolations = logs.filter(l => l.priority === 'MANDATORY' && !l.agentUsed).length;
    const recommendedMissed = logs.filter(l => l.priority === 'RECOMMENDED' && !l.agentUsed).length;

    // Agent usage breakdown
    const agentUsage = {};
    logs.forEach(log => {
        if (log.agentUsed) {
            agentUsage[log.agentUsed] = (agentUsage[log.agentUsed] || 0) + 1;
        }
    });

    // Most common violations
    const violations = logs.filter(l => !l.compliant);
    const violationPatterns = {};
    violations.forEach(v => {
        const key = v.recommendedAgent || 'unknown';
        violationPatterns[key] = (violationPatterns[key] || 0) + 1;
    });

    return {
        period: `Last ${daysBack} days`,
        totalTasks,
        compliantTasks,
        complianceRate: ((compliantTasks / totalTasks) * 100).toFixed(1) + '%',
        mandatoryViolations,
        recommendedMissed,
        agentUsage,
        violationPatterns,
        topViolations: Object.entries(violationPatterns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([agent, count]) => ({ agent, count }))
    };
}

/**
 * Generate detailed report
 */
function generateDetailedReport(daysBack = 7) {
    const report = generateComplianceReport(daysBack);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║          AGENT USAGE ANALYTICS REPORT                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    if (report.totalTasks === 0) {
        console.log('No data collected yet. Start logging agent usage with:');
        console.log('  node agent-usage-analytics.js log "<task>" "<agent|null>"\n');
        return;
    }

    console.log(`Period: ${report.period}`);
    console.log(`Total Tasks: ${report.totalTasks}`);
    console.log(`Compliance Rate: ${report.complianceRate}`);
    console.log('');

    console.log('Violations:');
    console.log(`  ⛔ Mandatory Agent Violations: ${report.mandatoryViolations}`);
    console.log(`  ⚠️  Recommended Agent Missed: ${report.recommendedMissed}`);
    console.log('');

    if (Object.keys(report.agentUsage).length > 0) {
        console.log('Agent Usage:');
        Object.entries(report.agentUsage)
            .sort((a, b) => b[1] - a[1])
            .forEach(([agent, count]) => {
                console.log(`  • ${agent}: ${count} times`);
            });
        console.log('');
    }

    if (report.topViolations.length > 0) {
        console.log('Top Missed Agents:');
        report.topViolations.forEach(({ agent, count }) => {
            console.log(`  • ${agent}: ${count} times`);
        });
        console.log('');
    }

    // Recommendations
    if (report.mandatoryViolations > 0) {
        console.log('🚨 ACTION REQUIRED:');
        console.log(`  ${report.mandatoryViolations} mandatory agent violations detected.`);
        console.log('  Review .claude/AGENT_DECISION_CARD.md for mandatory agent requirements.\n');
    } else if (report.recommendedMissed > 3) {
        console.log('⚠️  RECOMMENDATION:');
        console.log(`  ${report.recommendedMissed} tasks could benefit from agents.`);
        console.log('  Consider using agents more proactively for better results.\n');
    } else {
        console.log('✅ GOOD COMPLIANCE:');
        console.log('  Agent usage is aligned with recommendations.\n');
    }
}

// CLI Interface
const command = process.argv[2];

switch (command) {
    case 'log': {
        const task = process.argv[3];
        const agent = process.argv[4] === 'null' ? null : process.argv[4];

        if (!task) {
            console.error('Usage: node agent-usage-analytics.js log "<task>" "<agent|null>"');
            process.exit(1);
        }

        const result = logUsage(task, agent);
        console.log('Logged:', result.compliant ? '✓ Compliant' : '✗ Non-compliant');

        if (!result.compliant) {
            console.log(`Recommended: ${result.analysis.recommendedAgent}`);
            console.log(`Priority: ${result.analysis.priority}`);
        }
        break;
    }

    case 'report': {
        const days = parseInt(process.argv[3]) || 7;
        generateDetailedReport(days);
        break;
    }

    case 'compliance': {
        const report = generateComplianceReport(7);
        console.log(JSON.stringify(report, null, 2));
        break;
    }

    case 'analyze': {
        const task = process.argv[3];
        if (!task) {
            console.error('Usage: node agent-usage-analytics.js analyze "<task>"');
            process.exit(1);
        }

        const analysis = analyzeTaskForAgent(task);
        console.log(JSON.stringify(analysis, null, 2));
        break;
    }

    default:
        console.log('Agent Usage Analytics Tracker\n');
        console.log('Usage:');
        console.log('  node agent-usage-analytics.js log "<task>" "<agent|null>"');
        console.log('  node agent-usage-analytics.js report [days]');
        console.log('  node agent-usage-analytics.js compliance');
        console.log('  node agent-usage-analytics.js analyze "<task>"\n');
        console.log('Examples:');
        console.log('  node agent-usage-analytics.js log "Deploy to production" "release-coordinator"');
        console.log('  node agent-usage-analytics.js log "Create field" null');
        console.log('  node agent-usage-analytics.js report 14');
        console.log('  node agent-usage-analytics.js analyze "Delete Account field"');
}
