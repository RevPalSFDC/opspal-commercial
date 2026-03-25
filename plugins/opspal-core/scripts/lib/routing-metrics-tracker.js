#!/usr/bin/env node

/**
 * Routing Metrics Tracker - Track agent routing performance
 *
 * Records routing decisions, tracks success rates, and provides analytics
 * for optimizing routing system performance.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');
const { resolveRoutingSemantics } = require('./routing-semantics');

function isExecutionGated(event = {}) {
    return resolveRoutingSemantics(event, {
        allowLegacy: true,
        source: 'routing-metrics-tracker'
    }).executionBlockUntilCleared;
}

function getRoutedAgent(event = {}) {
    return resolveRoutingSemantics(event, {
        allowLegacy: true,
        source: 'routing-metrics-tracker'
    }).routedAgent;
}

class RoutingMetricsTracker {
    constructor(options = {}) {
        this.metricsFile = options.metricsFile || path.join('/tmp', 'routing-metrics.jsonl');
        this.verbose = options.verbose || false;
        this.enableTracking = options.enableTracking !== false; // Default to enabled
    }

    /**
     * Record a routing decision
     * @param {Object} event - Routing event data
     */
    recordRouting(event) {
        if (!this.enableTracking) return;
        const semantics = resolveRoutingSemantics(event, {
            allowLegacy: true,
            source: 'routing-metrics-tracker'
        });

        const record = {
            timestamp: new Date().toISOString(),
            type: 'routing_decision',
            taskDescription: event.taskDescription || '',
            suggestedAgent: semantics.routedAgent,
            requiredAgent: semantics.requiredAgent,
            selectedAgent: event.selectedAgent || null,
            confidence: event.confidence || 0,
            complexity: event.complexity || 0,
            autoRouted: event.autoRouted || false,
            userOverride: event.userOverride || false,
            executionBlockUntilCleared: semantics.executionBlockUntilCleared,
            promptGuidanceOnly: semantics.promptGuidanceOnly,
            requiresSpecialist: semantics.requiresSpecialist,
            guidanceAction: semantics.guidanceAction,
            routeKind: semantics.routeKind,
            reason: event.reason || ''
        };

        this.writeRecord(record);

        if (this.verbose) {
            console.log(`[METRICS] Recorded routing: ${record.suggestedAgent || 'none'}`);
        }
    }

    /**
     * Record agent execution result
     * @param {Object} event - Execution event data
     */
    recordExecution(event) {
        if (!this.enableTracking) return;

        const record = {
            timestamp: new Date().toISOString(),
            type: 'agent_execution',
            agent: event.agent || null,
            success: event.success || false,
            duration: event.duration || 0,
            errorType: event.errorType || null,
            errorMessage: event.errorMessage || null,
            taskComplexity: event.taskComplexity || 0
        };

        this.writeRecord(record);

        if (this.verbose) {
            console.log(`[METRICS] Recorded execution: ${record.agent} (${record.success ? 'success' : 'failed'})`);
        }
    }

    /**
     * Record routing validation result
     * @param {Object} event - Validation event data
     */
    recordValidation(event) {
        if (!this.enableTracking) return;
        const semantics = resolveRoutingSemantics(event, {
            allowLegacy: true,
            source: 'routing-metrics-tracker'
        });

        const record = {
            timestamp: new Date().toISOString(),
            type: 'routing_validation',
            valid: event.valid || false,
            executionBlockUntilCleared: semantics.executionBlockUntilCleared,
            requiredAgent: semantics.requiredAgent,
            currentAgent: event.currentAgent || null,
            severity: event.severity || 'LOW',
            errorCount: event.errorCount || 0,
            warningCount: event.warningCount || 0
        };

        this.writeRecord(record);

        if (this.verbose) {
            console.log(`[METRICS] Recorded validation: ${record.valid ? 'passed' : 'failed'}`);
        }
    }

    /**
     * Write a record to the metrics file
     * @param {Object} record - Record to write
     */
    writeRecord(record) {
        try {
            fs.appendFileSync(this.metricsFile, JSON.stringify(record) + '\n', 'utf-8');
        } catch (error) {
            if (this.verbose) {
                console.error(`[METRICS ERROR] Failed to write record: ${error.message}`);
            }
        }
    }

    /**
     * Read all metrics records
     * @param {Object} filters - Optional filters
     * @returns {Array} Array of records
     */
    readMetrics(filters = {}) {
        if (!fs.existsSync(this.metricsFile)) {
            return [];
        }

        const lines = fs.readFileSync(this.metricsFile, 'utf-8')
            .split('\n')
            .filter(line => line.trim());

        const records = lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(r => r !== null);

        // Apply filters
        let filtered = records;

        if (filters.type) {
            filtered = filtered.filter(r => r.type === filters.type);
        }

        if (filters.agent) {
            filtered = filtered.filter(r =>
                r.suggestedAgent === filters.agent ||
                r.requiredAgent === filters.agent ||
                r.selectedAgent === filters.agent ||
                r.agent === filters.agent
            );
        }

        if (filters.since) {
            const sinceDate = new Date(filters.since);
            filtered = filtered.filter(r => new Date(r.timestamp) >= sinceDate);
        }

        if (filters.success !== undefined) {
            filtered = filtered.filter(r => r.success === filters.success);
        }

        return filtered;
    }

    /**
     * Get routing statistics
     * @param {Object} filters - Optional filters
     * @returns {Object} Statistics
     */
    getRoutingStats(filters = {}) {
        const records = this.readMetrics({ ...filters, type: 'routing_decision' });

        if (records.length === 0) {
            return {
                totalRoutings: 0,
                autoRouted: 0,
                userOverride: 0,
                executionGated: 0,
                autoRoutingRate: 0,
                overrideRate: 0,
                executionGateRate: 0,
                topAgents: []
            };
        }

        const autoRouted = records.filter(r => r.autoRouted).length;
        const userOverride = records.filter(r => r.userOverride).length;
        const executionGated = records.filter(isExecutionGated).length;

        // Count agent usage
        const agentCounts = {};
        for (const record of records) {
            const agent = record.selectedAgent || getRoutedAgent(record);
            if (agent) {
                agentCounts[agent] = (agentCounts[agent] || 0) + 1;
            }
        }

        const topAgents = Object.entries(agentCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([agent, count]) => ({ agent, count, percentage: (count / records.length * 100).toFixed(1) }));

        return {
            totalRoutings: records.length,
            autoRouted,
            userOverride,
            executionGated,
            autoRoutingRate: (autoRouted / records.length * 100).toFixed(1),
            overrideRate: (userOverride / records.length * 100).toFixed(1),
            executionGateRate: (executionGated / records.length * 100).toFixed(1),
            topAgents
        };
    }

    /**
     * Get execution statistics
     * @param {Object} filters - Optional filters
     * @returns {Object} Statistics
     */
    getExecutionStats(filters = {}) {
        const records = this.readMetrics({ ...filters, type: 'agent_execution' });

        if (records.length === 0) {
            return {
                totalExecutions: 0,
                successful: 0,
                failed: 0,
                successRate: 0,
                avgDuration: 0,
                topErrors: []
            };
        }

        const successful = records.filter(r => r.success).length;
        const failed = records.length - successful;
        const avgDuration = records.reduce((sum, r) => sum + (r.duration || 0), 0) / records.length;

        // Count error types
        const errorCounts = {};
        for (const record of records.filter(r => !r.success && r.errorType)) {
            errorCounts[record.errorType] = (errorCounts[record.errorType] || 0) + 1;
        }

        const topErrors = Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([error, count]) => ({ error, count }));

        return {
            totalExecutions: records.length,
            successful,
            failed,
            successRate: (successful / records.length * 100).toFixed(1),
            avgDuration: Math.round(avgDuration),
            topErrors
        };
    }

    /**
     * Get validation statistics
     * @param {Object} filters - Optional filters
     * @returns {Object} Statistics
     */
    getValidationStats(filters = {}) {
        const records = this.readMetrics({ ...filters, type: 'routing_validation' });

        if (records.length === 0) {
            return {
                totalValidations: 0,
                passed: 0,
                failed: 0,
                executionGated: 0,
                passRate: 0,
                executionGateRate: 0
            };
        }

        const passed = records.filter(r => r.valid).length;
        const executionGated = records.filter(isExecutionGated).length;

        return {
            totalValidations: records.length,
            passed,
            failed: records.length - passed,
            executionGated,
            passRate: (passed / records.length * 100).toFixed(1),
            executionGateRate: (executionGated / records.length * 100).toFixed(1)
        };
    }

    /**
     * Get comprehensive report
     * @param {Object} filters - Optional filters
     * @returns {Object} Full report
     */
    getReport(filters = {}) {
        return {
            generatedAt: new Date().toISOString(),
            filters,
            routing: this.getRoutingStats(filters),
            execution: this.getExecutionStats(filters),
            validation: this.getValidationStats(filters)
        };
    }

    /**
     * Format report for display
     * @param {Object} report - Report object
     * @returns {string} Formatted output
     */
    formatReport(report) {
        const lines = [];

        lines.push('='.repeat(60));
        lines.push('Routing Metrics Report');
        lines.push('='.repeat(60));
        lines.push(`Generated: ${report.generatedAt}`);
        lines.push('');

        // Routing statistics
        lines.push('ROUTING DECISIONS');
        lines.push('-'.repeat(60));
        lines.push(`Total routings:      ${report.routing.totalRoutings}`);
        lines.push(`Auto-routed:         ${report.routing.autoRouted} (${report.routing.autoRoutingRate}%)`);
        lines.push(`User overrides:      ${report.routing.userOverride} (${report.routing.overrideRate}%)`);
        lines.push(`Execution gated:     ${report.routing.executionGated} (${report.routing.executionGateRate}%)`);
        lines.push('');

        if (report.routing.topAgents.length > 0) {
            lines.push('Top Agents:');
            for (const agent of report.routing.topAgents) {
                lines.push(`  ${agent.agent.padEnd(40)} ${agent.count} (${agent.percentage}%)`);
            }
            lines.push('');
        }

        // Execution statistics
        lines.push('AGENT EXECUTION');
        lines.push('-'.repeat(60));
        lines.push(`Total executions:    ${report.execution.totalExecutions}`);
        lines.push(`Successful:          ${report.execution.successful} (${report.execution.successRate}%)`);
        lines.push(`Failed:              ${report.execution.failed}`);
        lines.push(`Avg duration:        ${report.execution.avgDuration}ms`);
        lines.push('');

        if (report.execution.topErrors.length > 0) {
            lines.push('Top Errors:');
            for (const error of report.execution.topErrors) {
                lines.push(`  ${error.error.padEnd(40)} ${error.count}`);
            }
            lines.push('');
        }

        // Validation statistics
        lines.push('VALIDATION');
        lines.push('-'.repeat(60));
        lines.push(`Total validations:   ${report.validation.totalValidations}`);
        lines.push(`Passed:              ${report.validation.passed} (${report.validation.passRate}%)`);
        lines.push(`Failed:              ${report.validation.failed}`);
        lines.push(`Execution gated:     ${report.validation.executionGated} (${report.validation.executionGateRate}%)`);
        lines.push('');

        lines.push('='.repeat(60));

        return lines.join('\n');
    }

    /**
     * Clear all metrics
     */
    clearMetrics() {
        if (fs.existsSync(this.metricsFile)) {
            fs.unlinkSync(this.metricsFile);
            if (this.verbose) {
                console.log('[METRICS] Cleared all metrics');
            }
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const tracker = new RoutingMetricsTracker({ verbose: true });

    if (!command || command === '--help' || command === '-h') {
        console.log('Usage: routing-metrics-tracker.js <command> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  report [--since YYYY-MM-DD] [--agent NAME]  Show metrics report');
        console.log('  routing [--since YYYY-MM-DD]                 Show routing stats');
        console.log('  execution [--since YYYY-MM-DD]               Show execution stats');
        console.log('  validation [--since YYYY-MM-DD]              Show validation stats');
        console.log('  clear                                        Clear all metrics');
        console.log('');
        console.log('Examples:');
        console.log('  routing-metrics-tracker.js report');
        console.log('  routing-metrics-tracker.js report --since 2025-01-01');
        console.log('  routing-metrics-tracker.js routing --agent sfdc-revops-auditor');
        process.exit(0);
    }

    // Parse filters
    const filters = {};
    const sinceIndex = args.indexOf('--since');
    if (sinceIndex !== -1 && args[sinceIndex + 1]) {
        filters.since = args[sinceIndex + 1];
    }

    const agentIndex = args.indexOf('--agent');
    if (agentIndex !== -1 && args[agentIndex + 1]) {
        filters.agent = args[agentIndex + 1];
    }

    // Execute command
    switch (command) {
        case 'report':
            const report = tracker.getReport(filters);
            console.log(tracker.formatReport(report));
            break;

        case 'routing':
            const routingStats = tracker.getRoutingStats(filters);
            console.log(JSON.stringify(routingStats, null, 2));
            break;

        case 'execution':
            const executionStats = tracker.getExecutionStats(filters);
            console.log(JSON.stringify(executionStats, null, 2));
            break;

        case 'validation':
            const validationStats = tracker.getValidationStats(filters);
            console.log(JSON.stringify(validationStats, null, 2));
            break;

        case 'clear':
            tracker.clearMetrics();
            console.log('✓ Metrics cleared');
            break;

        default:
            console.error(`Unknown command: ${command}`);
            console.error('Run with --help for usage information');
            process.exit(1);
    }
}

module.exports = { RoutingMetricsTracker };
