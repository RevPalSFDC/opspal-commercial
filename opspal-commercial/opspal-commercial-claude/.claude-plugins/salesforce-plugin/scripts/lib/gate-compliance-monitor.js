#!/usr/bin/env node

/**
 * Gate Compliance Monitor
 * ========================
 * Monitors and reports on gate system usage and compliance
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const yaml = require('js-yaml');

class GateComplianceMonitor {
    constructor() {
        this.logDir = path.join(process.cwd(), 'deployment-logs');
        this.configPath = path.join(__dirname, '../../agents/shared/gate-config.yaml');
        this.metrics = {
            totalOperations: 0,
            gatedOperations: 0,
            bypassedOperations: 0,
            blockedOperations: 0,
            approvedOperations: 0,
            rollbacksCreated: 0,
            rollbacksExecuted: 0,
            mcpUsage: 0,
            cliUsage: 0,
            violations: [],
            agentMetrics: new Map(),
            environmentMetrics: {
                production: { total: 0, blocked: 0, approved: 0 },
                uat: { total: 0, blocked: 0, approved: 0 },
                sandbox: { total: 0, blocked: 0, approved: 0 }
            }
        };
        this.gateConfig = null;
    }

    /**
     * Start monitoring
     */
    async monitor(options = {}) {
        console.log('🔍 Gate Compliance Monitor\n');
        console.log('=' .repeat(60));

        // Load gate configuration
        await this.loadGateConfig();

        // Analyze logs
        await this.analyzeLogs(options);

        // Calculate compliance rates
        this.calculateCompliance();

        // Generate report
        this.generateReport(options);

        // Check for violations
        this.checkViolations();

        // Export metrics if requested
        if (options.export) {
            this.exportMetrics(options.export);
        }

        return this.metrics;
    }

    /**
     * Load gate configuration
     */
    async loadGateConfig() {
        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            this.gateConfig = yaml.load(content);
        } catch (error) {
            console.warn('⚠️ Could not load gate config:', error.message);
        }
    }

    /**
     * Analyze deployment logs
     */
    async analyzeLogs(options) {
        if (!fs.existsSync(this.logDir)) {
            console.warn('⚠️ No deployment logs directory found');
            return;
        }

        const logFiles = fs.readdirSync(this.logDir)
            .filter(file => file.endsWith('.jsonl'));

        console.log(`📊 Analyzing ${logFiles.length} log files...\n`);

        for (const logFile of logFiles) {
            await this.analyzeLogFile(path.join(this.logDir, logFile), options);
        }
    }

    /**
     * Analyze a single log file
     */
    async analyzeLogFile(filePath, options) {
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            try {
                const entry = JSON.parse(line);
                this.processLogEntry(entry, options);
            } catch (error) {
                // Skip malformed lines
            }
        }
    }

    /**
     * Process a single log entry
     */
    processLogEntry(entry, options) {
        // Filter by date range if specified
        if (options.startDate && new Date(entry.timestamp) < new Date(options.startDate)) {
            return;
        }
        if (options.endDate && new Date(entry.timestamp) > new Date(options.endDate)) {
            return;
        }

        this.metrics.totalOperations++;

        // Track gate usage
        if (entry.gateValidation) {
            this.metrics.gatedOperations++;
            
            if (entry.gateValidation.passed === false) {
                this.metrics.blockedOperations++;
            }
            
            if (entry.gateValidation.bypassed) {
                this.metrics.bypassedOperations++;
                this.trackViolation('bypass', entry);
            }
        }

        // Track approvals
        if (entry.approval) {
            if (entry.approval.approved) {
                this.metrics.approvedOperations++;
            }
        }

        // Track rollbacks
        if (entry.rollback) {
            if (entry.rollback.created) {
                this.metrics.rollbacksCreated++;
            }
            if (entry.rollback.executed) {
                this.metrics.rollbacksExecuted++;
            }
        }

        // Track tool usage
        if (entry.tool === 'mcp') {
            this.metrics.mcpUsage++;
        } else if (entry.tool === 'cli') {
            this.metrics.cliUsage++;
            
            // Check if CLI usage was justified
            if (!entry.fallbackJustification) {
                this.trackViolation('unjustified-cli', entry);
            }
        }

        // Track by agent
        if (entry.agent) {
            if (!this.metrics.agentMetrics.has(entry.agent)) {
                this.metrics.agentMetrics.set(entry.agent, {
                    total: 0,
                    gated: 0,
                    bypassed: 0,
                    blocked: 0
                });
            }
            
            const agentMetrics = this.metrics.agentMetrics.get(entry.agent);
            agentMetrics.total++;
            
            if (entry.gateValidation) {
                agentMetrics.gated++;
                if (entry.gateValidation.bypassed) {
                    agentMetrics.bypassed++;
                }
                if (entry.gateValidation.passed === false) {
                    agentMetrics.blocked++;
                }
            }
        }

        // Track by environment
        if (entry.environment) {
            const env = entry.environment.toLowerCase();
            if (this.metrics.environmentMetrics[env]) {
                this.metrics.environmentMetrics[env].total++;
                
                if (entry.gateValidation && entry.gateValidation.passed === false) {
                    this.metrics.environmentMetrics[env].blocked++;
                }
                
                if (entry.approval && entry.approval.approved) {
                    this.metrics.environmentMetrics[env].approved++;
                }
            }
        }
    }

    /**
     * Track violations
     */
    trackViolation(type, entry) {
        this.metrics.violations.push({
            type,
            timestamp: entry.timestamp,
            agent: entry.agent,
            command: entry.command,
            reason: entry.reason || 'Not specified'
        });
    }

    /**
     * Calculate compliance rates
     */
    calculateCompliance() {
        if (this.metrics.totalOperations === 0) {
            this.metrics.complianceRate = 0;
            this.metrics.gateUsageRate = 0;
            this.metrics.mcpUsageRate = 0;
            return;
        }

        // Overall compliance rate
        this.metrics.complianceRate = 
            ((this.metrics.gatedOperations - this.metrics.bypassedOperations) / 
             this.metrics.totalOperations * 100).toFixed(2);

        // Gate usage rate
        this.metrics.gateUsageRate = 
            (this.metrics.gatedOperations / this.metrics.totalOperations * 100).toFixed(2);

        // MCP usage rate
        const toolOperations = this.metrics.mcpUsage + this.metrics.cliUsage;
        this.metrics.mcpUsageRate = toolOperations > 0 ?
            (this.metrics.mcpUsage / toolOperations * 100).toFixed(2) : 0;

        // Bypass rate
        this.metrics.bypassRate = 
            (this.metrics.bypassedOperations / this.metrics.totalOperations * 100).toFixed(2);

        // Block rate
        this.metrics.blockRate = 
            (this.metrics.blockedOperations / this.metrics.totalOperations * 100).toFixed(2);
    }

    /**
     * Check for violations against thresholds
     */
    checkViolations() {
        if (!this.gateConfig) return;

        const thresholds = this.gateConfig.monitoring.alert_thresholds;
        const alerts = [];

        // Check bypass rate
        if (this.metrics.bypassRate > thresholds.gate_bypass_rate * 100) {
            alerts.push(`⚠️ Gate bypass rate (${this.metrics.bypassRate}%) exceeds threshold (${thresholds.gate_bypass_rate * 100}%)`);
        }

        // Check MCP failure rate
        const mcpFailureRate = 100 - parseFloat(this.metrics.mcpUsageRate);
        if (mcpFailureRate > thresholds.mcp_failure_rate * 100) {
            alerts.push(`⚠️ MCP failure rate (${mcpFailureRate.toFixed(2)}%) exceeds threshold (${thresholds.mcp_failure_rate * 100}%)`);
        }

        // Check for unapproved production deployments
        const prodUnapproved = this.metrics.environmentMetrics.production.total - 
                              this.metrics.environmentMetrics.production.approved;
        if (prodUnapproved > thresholds.unapproved_production) {
            alerts.push(`🚨 CRITICAL: ${prodUnapproved} unapproved production deployments detected!`);
        }

        if (alerts.length > 0) {
            console.log('\n⚠️ COMPLIANCE ALERTS:');
            alerts.forEach(alert => console.log(alert));
        }
    }

    /**
     * Generate compliance report
     */
    generateReport(options) {
        console.log('\n📊 COMPLIANCE METRICS');
        console.log('=' .repeat(60));

        console.log('\n🎯 Overall Compliance:');
        console.log(`  Compliance Rate: ${this.metrics.complianceRate}%`);
        console.log(`  Gate Usage Rate: ${this.metrics.gateUsageRate}%`);
        console.log(`  MCP Usage Rate: ${this.metrics.mcpUsageRate}%`);
        console.log(`  Bypass Rate: ${this.metrics.bypassRate}%`);
        console.log(`  Block Rate: ${this.metrics.blockRate}%`);

        console.log('\n📈 Operation Statistics:');
        console.log(`  Total Operations: ${this.metrics.totalOperations}`);
        console.log(`  Gated Operations: ${this.metrics.gatedOperations}`);
        console.log(`  Bypassed Operations: ${this.metrics.bypassedOperations}`);
        console.log(`  Blocked Operations: ${this.metrics.blockedOperations}`);
        console.log(`  Approved Operations: ${this.metrics.approvedOperations}`);

        console.log('\n🔄 Rollback Statistics:');
        console.log(`  Rollbacks Created: ${this.metrics.rollbacksCreated}`);
        console.log(`  Rollbacks Executed: ${this.metrics.rollbacksExecuted}`);

        console.log('\n🌍 Environment Breakdown:');
        Object.entries(this.metrics.environmentMetrics).forEach(([env, metrics]) => {
            console.log(`  ${env.charAt(0).toUpperCase() + env.slice(1)}:`);
            console.log(`    Total: ${metrics.total}`);
            console.log(`    Blocked: ${metrics.blocked}`);
            console.log(`    Approved: ${metrics.approved}`);
        });

        if (this.metrics.agentMetrics.size > 0) {
            console.log('\n🤖 Agent Performance:');
            const sortedAgents = Array.from(this.metrics.agentMetrics.entries())
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, options.topAgents || 10);

            sortedAgents.forEach(([agent, metrics]) => {
                const complianceRate = metrics.total > 0 ? 
                    ((metrics.gated - metrics.bypassed) / metrics.total * 100).toFixed(1) : 0;
                console.log(`  ${agent}:`);
                console.log(`    Operations: ${metrics.total} | Compliance: ${complianceRate}%`);
                if (metrics.bypassed > 0) {
                    console.log(`    ⚠️ Bypassed: ${metrics.bypassed}`);
                }
            });
        }

        if (this.metrics.violations.length > 0 && options.showViolations) {
            console.log('\n⚠️ Recent Violations:');
            this.metrics.violations.slice(-10).forEach(violation => {
                console.log(`  [${violation.timestamp}] ${violation.type}: ${violation.agent || 'unknown'}`);
                console.log(`    Command: ${violation.command || 'N/A'}`);
                console.log(`    Reason: ${violation.reason}`);
            });
        }

        console.log('\n' + '=' .repeat(60));
    }

    /**
     * Export metrics to file
     */
    exportMetrics(filename) {
        const exportData = {
            timestamp: new Date().toISOString(),
            summary: {
                complianceRate: this.metrics.complianceRate,
                gateUsageRate: this.metrics.gateUsageRate,
                mcpUsageRate: this.metrics.mcpUsageRate,
                bypassRate: this.metrics.bypassRate,
                totalOperations: this.metrics.totalOperations
            },
            details: this.metrics
        };

        fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
        console.log(`\n✅ Metrics exported to: ${filename}`);
    }
}

// CLI interface
if (require.main === module) {
    const monitor = new GateComplianceMonitor();
    const args = process.argv.slice(2);

    // Parse command line options
    const options = {
        showViolations: args.includes('--violations'),
        export: args.includes('--export') ? 
            `compliance-report-${new Date().toISOString().split('T')[0]}.json` : null,
        topAgents: 10
    };

    // Parse date range
    const startDateIndex = args.indexOf('--start');
    if (startDateIndex >= 0 && args[startDateIndex + 1]) {
        options.startDate = args[startDateIndex + 1];
    }

    const endDateIndex = args.indexOf('--end');
    if (endDateIndex >= 0 && args[endDateIndex + 1]) {
        options.endDate = args[endDateIndex + 1];
    }

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Gate Compliance Monitor
=======================

Monitor and report on gate system compliance.

Usage:
  node gate-compliance-monitor.js [options]

Options:
  --start DATE      Start date for analysis (YYYY-MM-DD)
  --end DATE        End date for analysis (YYYY-MM-DD)
  --violations      Show violation details
  --export          Export metrics to JSON file
  --help            Show this help message

Examples:
  # Monitor all operations
  node gate-compliance-monitor.js
  
  # Monitor with date range
  node gate-compliance-monitor.js --start 2025-09-01 --end 2025-09-10
  
  # Show violations and export
  node gate-compliance-monitor.js --violations --export
`);
        process.exit(0);
    }

    monitor.monitor(options).catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}

module.exports = GateComplianceMonitor;