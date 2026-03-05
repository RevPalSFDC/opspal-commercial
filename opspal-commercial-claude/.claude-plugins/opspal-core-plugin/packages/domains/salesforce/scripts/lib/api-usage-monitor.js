#!/usr/bin/env node

/**
 * API Usage Monitor
 *
 * Tracks Salesforce API calls and monitors against daily/hourly limits.
 * Alerts when approaching quotas and provides optimization recommendations.
 *
 * Features:
 * - Real-time API call tracking
 * - Daily/hourly usage calculations
 * - Threshold alerts (70%, 85%, 95%)
 * - Weekly usage reports
 * - Per-agent usage breakdown
 * - Optimization recommendations
 *
 * @version 1.0.0
 * @phase Phase 2 - Compliance Automation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class APIUsageMonitor {
    constructor(org, options = {}) {
        this.org = org;
        this.usageDir = path.join(
            process.env.HOME || process.env.USERPROFILE,
            '.claude',
            'api-usage'
        );
        this.usageFile = path.join(this.usageDir, `${org}.json`);

        // Thresholds
        this.thresholds = {
            WARNING: options.warningThreshold || 0.70,    // 70% of limit
            CRITICAL: options.criticalThreshold || 0.85,  // 85% of limit
            EMERGENCY: options.emergencyThreshold || 0.95 // 95% of limit
        };

        // Salesforce limits (typical - will query actual limits)
        this.limits = {
            daily: options.dailyLimit || 15000,  // Default for Enterprise
            hourly: options.hourlyLimit || 1000
        };

        // Usage data structure
        this.usageData = {
            org: this.org,
            calls: [],
            limits: this.limits,
            lastUpdated: Date.now(),
            alerts: []
        };

        this.ensureUsageDirectory();
        this.loadUsageData();
    }

    /**
     * Ensure usage directory exists
     */
    ensureUsageDirectory() {
        if (!fs.existsSync(this.usageDir)) {
            fs.mkdirSync(this.usageDir, { recursive: true });
        }
    }

    /**
     * Load existing usage data
     */
    loadUsageData() {
        try {
            if (fs.existsSync(this.usageFile)) {
                const data = JSON.parse(fs.readFileSync(this.usageFile, 'utf8'));
                this.usageData = {
                    ...this.usageData,
                    ...data
                };
                // Update limits in case they changed
                this.usageData.limits = this.limits;
            }
        } catch (error) {
            console.error(`Warning: Could not load usage data: ${error.message}`);
            // Continue with empty usage data
        }
    }

    /**
     * Save usage data to disk
     */
    saveUsageData() {
        try {
            this.usageData.lastUpdated = Date.now();
            fs.writeFileSync(
                this.usageFile,
                JSON.stringify(this.usageData, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error(`Error saving usage data: ${error.message}`);
        }
    }

    /**
     * Track an API call
     */
    async trackAPICall(callType, endpoint, options = {}) {
        const timestamp = Date.now();

        // Add call to usage data
        this.usageData.calls.push({
            timestamp,
            callType,
            endpoint,
            agent: options.agent || 'unknown',
            command: options.command || '',
            durationMs: options.durationMs || 0,
            success: options.success !== false,
            recordCount: options.recordCount || 0
        });

        // Clean old data (keep 7 days for weekly reports)
        this.cleanOldData(7);

        // Calculate current usage
        const usage = this.calculateUsage();

        // Check thresholds and alert if needed
        await this.checkThresholds(usage);

        // Save updated data
        this.saveUsageData();

        return usage;
    }

    /**
     * Calculate current API usage
     */
    calculateUsage() {
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);
        const lastHour = now - (60 * 60 * 1000);

        const dailyCalls = this.usageData.calls.filter(c => c.timestamp >= last24Hours);
        const hourlyCalls = this.usageData.calls.filter(c => c.timestamp >= lastHour);

        return {
            dailyCount: dailyCalls.length,
            hourlyCount: hourlyCalls.length,
            dailyPercent: dailyCalls.length / this.limits.daily,
            hourlyPercent: hourlyCalls.length / this.limits.hourly,
            remainingDaily: this.limits.daily - dailyCalls.length,
            remainingHourly: this.limits.hourly - hourlyCalls.length,
            timestamp: now
        };
    }

    /**
     * Check thresholds and alert if needed
     */
    async checkThresholds(usage) {
        const level = this.determineAlertLevel(usage);

        if (level) {
            // Check if we already alerted recently (don't spam)
            const recentAlert = this.usageData.alerts.find(a =>
                a.level === level &&
                a.timestamp > (Date.now() - 15 * 60 * 1000) // Within 15 minutes
            );

            if (!recentAlert) {
                await this.sendAlert(level, usage);

                // Record alert
                this.usageData.alerts.push({
                    level,
                    timestamp: Date.now(),
                    usage: {
                        dailyCount: usage.dailyCount,
                        dailyPercent: (usage.dailyPercent * 100).toFixed(1)
                    }
                });

                // Keep only last 20 alerts
                if (this.usageData.alerts.length > 20) {
                    this.usageData.alerts = this.usageData.alerts.slice(-20);
                }
            }
        }
    }

    /**
     * Determine alert level based on usage
     */
    determineAlertLevel(usage) {
        if (usage.dailyPercent >= this.thresholds.EMERGENCY) {
            return 'EMERGENCY';
        } else if (usage.dailyPercent >= this.thresholds.CRITICAL) {
            return 'CRITICAL';
        } else if (usage.dailyPercent >= this.thresholds.WARNING) {
            return 'WARNING';
        }
        return null;
    }

    /**
     * Send alert for threshold breach
     */
    async sendAlert(level, usage) {
        const message = {
            level,
            org: this.org,
            dailyUsage: `${usage.dailyCount}/${this.limits.daily} (${(usage.dailyPercent * 100).toFixed(1)}%)`,
            hourlyUsage: `${usage.hourlyCount}/${this.limits.hourly} (${(usage.hourlyPercent * 100).toFixed(1)}%)`,
            remaining: `${usage.remainingDaily} daily calls remaining`,
            recommendation: this.getRecommendation(level, usage)
        };

        // Console alert
        const emoji = level === 'EMERGENCY' ? '🚨' : level === 'CRITICAL' ? '⚠️' : '📊';
        console.error(`\n${emoji}  ${level} API USAGE ALERT - ${this.org}`);
        console.error(`   Daily: ${message.dailyUsage}`);
        console.error(`   Hourly: ${message.hourlyUsage}`);
        console.error(`   Remaining: ${message.remaining}`);
        console.error(`   Recommendation: ${message.recommendation}\n`);

        // Send Slack alert (if configured)
        if (process.env.SLACK_WEBHOOK_URL) {
            await this.sendSlackAlert(level, message);
        }

        // Log to file
        this.logAlert(level, message);
    }

    /**
     * Get optimization recommendation based on usage level
     */
    getRecommendation(level, usage) {
        if (level === 'EMERGENCY') {
            return 'STOP NON-CRITICAL OPERATIONS. Contact Salesforce support to increase limits.';
        } else if (level === 'CRITICAL') {
            return 'Defer bulk operations. Review recent usage for optimization opportunities.';
        } else {
            return 'Monitor usage closely. Consider batching API calls more efficiently.';
        }
    }

    /**
     * Send Slack alert
     */
    async sendSlackAlert(level, message) {
        try {
            const color = level === 'EMERGENCY' ? 'danger' : level === 'CRITICAL' ? 'warning' : '#3AA3E3';
            const payload = {
                attachments: [{
                    color,
                    title: `${level} API Usage Alert - ${this.org}`,
                    fields: [
                        {
                            title: 'Daily Usage',
                            value: message.dailyUsage,
                            short: true
                        },
                        {
                            title: 'Remaining',
                            value: message.remaining,
                            short: true
                        },
                        {
                            title: 'Recommendation',
                            value: message.recommendation,
                            short: false
                        }
                    ],
                    footer: 'Salesforce API Monitor',
                    ts: Math.floor(Date.now() / 1000)
                }]
            };

            const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error(`Failed to send Slack alert: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error sending Slack alert: ${error.message}`);
        }
    }

    /**
     * Log alert to file
     */
    logAlert(level, message) {
        const logFile = path.join(this.usageDir, `${this.org}_alerts.log`);
        const logEntry = `[${new Date().toISOString()}] ${level} - ${JSON.stringify(message)}\n`;

        try {
            fs.appendFileSync(logFile, logEntry, 'utf8');
        } catch (error) {
            console.error(`Error logging alert: ${error.message}`);
        }
    }

    /**
     * Clean old data
     */
    cleanOldData(daysToKeep = 7) {
        const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        this.usageData.calls = this.usageData.calls.filter(c => c.timestamp >= cutoff);
        this.usageData.alerts = this.usageData.alerts?.filter(a => a.timestamp >= cutoff) || [];
    }

    /**
     * Generate weekly usage report
     */
    generateWeeklyReport() {
        const now = Date.now();
        const last7Days = now - (7 * 24 * 60 * 60 * 1000);
        const weeklyCalls = this.usageData.calls.filter(c => c.timestamp >= last7Days);

        // Group by day
        const dailyUsage = {};
        weeklyCalls.forEach(call => {
            const date = new Date(call.timestamp).toISOString().split('T')[0];
            dailyUsage[date] = (dailyUsage[date] || 0) + 1;
        });

        // Group by agent
        const agentUsage = {};
        weeklyCalls.forEach(call => {
            agentUsage[call.agent] = (agentUsage[call.agent] || 0) + 1;
        });

        // Group by call type
        const callTypeUsage = {};
        weeklyCalls.forEach(call => {
            callTypeUsage[call.callType] = (callTypeUsage[call.callType] || 0) + 1;
        });

        // Calculate statistics
        const total = weeklyCalls.length;
        const avgPerDay = total / 7;
        const successRate = (weeklyCalls.filter(c => c.success).length / total * 100).toFixed(1);

        const report = {
            org: this.org,
            period: {
                start: new Date(last7Days).toISOString(),
                end: new Date(now).toISOString()
            },
            summary: {
                totalCalls: total,
                avgPerDay: Math.round(avgPerDay),
                successRate: `${successRate}%`,
                limit: this.limits.daily,
                peakDay: Object.entries(dailyUsage).sort((a, b) => b[1] - a[1])[0]
            },
            dailyUsage,
            agentUsage: Object.entries(agentUsage)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10) // Top 10 agents
                .reduce((obj, [agent, count]) => ({ ...obj, [agent]: count }), {}),
            callTypeUsage,
            recommendations: this.generateRecommendations(weeklyCalls, agentUsage, callTypeUsage)
        };

        return report;
    }

    /**
     * Generate optimization recommendations
     */
    generateRecommendations(calls, agentUsage, callTypeUsage) {
        const recommendations = [];

        // Check for excessive queries
        const queryCount = callTypeUsage['data query'] || 0;
        if (queryCount > calls.length * 0.5) {
            recommendations.push({
                type: 'OPTIMIZATION',
                message: 'High query volume detected. Consider using bulk queries or caching results.',
                impact: 'HIGH'
            });
        }

        // Check for top API consumers
        const topAgent = Object.entries(agentUsage).sort((a, b) => b[1] - a[1])[0];
        if (topAgent && topAgent[1] > calls.length * 0.3) {
            recommendations.push({
                type: 'REVIEW',
                message: `Agent "${topAgent[0]}" accounts for ${((topAgent[1] / calls.length) * 100).toFixed(1)}% of API calls. Review for optimization.`,
                impact: 'MEDIUM'
            });
        }

        // Check for failures
        const failures = calls.filter(c => !c.success).length;
        if (failures > calls.length * 0.05) {
            recommendations.push({
                type: 'RELIABILITY',
                message: `${failures} failed API calls (${((failures / calls.length) * 100).toFixed(1)}%). Investigate error patterns.`,
                impact: 'HIGH'
            });
        }

        return recommendations;
    }

    /**
     * Get current usage status
     */
    getUsageStatus() {
        const usage = this.calculateUsage();
        const level = this.determineAlertLevel(usage) || 'NORMAL';

        return {
            org: this.org,
            level,
            usage: {
                daily: {
                    count: usage.dailyCount,
                    limit: this.limits.daily,
                    percent: (usage.dailyPercent * 100).toFixed(1),
                    remaining: usage.remainingDaily
                },
                hourly: {
                    count: usage.hourlyCount,
                    limit: this.limits.hourly,
                    percent: (usage.hourlyPercent * 100).toFixed(1),
                    remaining: usage.remainingHourly
                }
            },
            recommendation: level !== 'NORMAL' ? this.getRecommendation(level, usage) : 'Usage is within normal limits.'
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const org = args[1] || process.env.SF_TARGET_ORG;

    if (!org) {
        console.error('Error: No org specified. Provide org alias or set SF_TARGET_ORG.');
        process.exit(1);
    }

    const monitor = new APIUsageMonitor(org);

    switch (command) {
        case 'track':
            // Track an API call
            const callType = args[2] || 'unknown';
            const endpoint = args[3] || '';
            monitor.trackAPICall(callType, endpoint, {
                command: args[4] || '',
                agent: process.env.CLAUDE_AGENT_NAME || 'manual'
            });
            console.log('API call tracked successfully.');
            break;

        case 'status':
            // Get current usage status
            const status = monitor.getUsageStatus();
            console.log(JSON.stringify(status, null, 2));
            break;

        case 'report':
            // Generate weekly report
            const report = monitor.generateWeeklyReport();
            console.log(JSON.stringify(report, null, 2));

            // Optionally save to file
            if (args[2] === '--save') {
                const reportFile = path.join(monitor.usageDir, `${org}_weekly_report_${new Date().toISOString().split('T')[0]}.json`);
                fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
                console.log(`\nReport saved to: ${reportFile}`);
            }
            break;

        case 'check':
            // Pre-operation quota check
            const usage = monitor.calculateUsage();
            const operationSize = parseInt(args[2]) || 1;

            if (usage.remainingDaily < operationSize) {
                console.error(`ERROR: Insufficient API quota. Operation requires ${operationSize} calls, but only ${usage.remainingDaily} remaining.`);
                process.exit(1);
            } else if (usage.remainingDaily < operationSize * 2) {
                console.warn(`WARNING: Low API quota. ${usage.remainingDaily} calls remaining.`);
            } else {
                console.log(`OK: Sufficient quota. ${usage.remainingDaily} calls remaining.`);
            }
            break;

        default:
            console.log(`
API Usage Monitor - Salesforce API Quota Tracking

Usage:
  node api-usage-monitor.js track <org> <callType> [endpoint] [command]
  node api-usage-monitor.js status <org>
  node api-usage-monitor.js report <org> [--save]
  node api-usage-monitor.js check <org> [operationSize]

Examples:
  node api-usage-monitor.js track myorg "data query" "Account" "sf data query ..."
  node api-usage-monitor.js status myorg
  node api-usage-monitor.js report myorg --save
  node api-usage-monitor.js check myorg 500

Environment Variables:
  SF_TARGET_ORG - Default org if not specified
  SLACK_WEBHOOK_URL - Slack webhook for alerts
  CLAUDE_AGENT_NAME - Agent name for tracking
            `);
            process.exit(1);
    }
}

module.exports = APIUsageMonitor;
