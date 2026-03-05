#!/usr/bin/env node

/**
 * Salesforce Standards Monitor - Monitoring and alerting for compliance
 * Integrates with Slack and the existing error logging system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

class StandardsMonitor {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
        this.monitoringInterval = options.interval || 3600000; // Default 1 hour
        this.thresholds = {
            critical: 60,  // Below 60% compliance
            warning: 80,   // Below 80% compliance
            success: 95    // Above 95% compliance
        };
        
        // Integration with error logging system
        this.errorLogPath = path.join(this.projectRoot, 'error-logging', 'logs');
        this.metricsPath = path.join(this.projectRoot, 'docs', 'compliance-metrics.json');
        
        // Load or initialize metrics
        this.metrics = this.loadMetrics();
    }

    /**
     * Load existing metrics or create new
     */
    loadMetrics() {
        if (fs.existsSync(this.metricsPath)) {
            return JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
        }
        
        return {
            history: [],
            lastCheck: null,
            currentScore: null,
            trend: 'stable',
            violations: {
                documentation: [],
                reportTypes: [],
                lightningPages: [],
                metadata: []
            }
        };
    }

    /**
     * Save metrics to file
     */
    saveMetrics() {
        const metricsDir = path.dirname(this.metricsPath);
        if (!fs.existsSync(metricsDir)) {
            fs.mkdirSync(metricsDir, { recursive: true });
        }
        
        fs.writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2));
    }

    /**
     * Run compliance check
     */
    async runComplianceCheck() {
        console.log('🔍 Running compliance check...\n');
        
        const SalesforceStandardsValidator = require('./salesforce-standards-validator');
        const validator = new SalesforceStandardsValidator(this.projectRoot);
        
        const orgAlias = process.env.SF_TARGET_ORG;
        const results = await validator.runFullValidation({ 
            org: orgAlias, 
            silent: true 
        });
        
        // Update metrics
        const timestamp = new Date().toISOString();
        const score = results.overall.score;
        
        // Calculate trend
        const previousScore = this.metrics.currentScore;
        let trend = 'stable';
        if (previousScore !== null) {
            if (score > previousScore + 5) trend = 'improving';
            else if (score < previousScore - 5) trend = 'declining';
        }
        
        // Update metrics
        this.metrics.lastCheck = timestamp;
        this.metrics.currentScore = score;
        this.metrics.trend = trend;
        this.metrics.violations = {
            documentation: results.documentation.failed,
            reportTypes: results.reportTypes.failed,
            lightningPages: results.lightningPages.failed,
            metadata: results.metadata.failed
        };
        
        // Add to history
        this.metrics.history.push({
            timestamp,
            score,
            passed: results.overall.passed,
            failed: results.overall.failed,
            total: results.overall.totalChecks
        });
        
        // Keep only last 30 days of history
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        this.metrics.history = this.metrics.history.filter(h => 
            new Date(h.timestamp) > thirtyDaysAgo
        );
        
        this.saveMetrics();
        
        return results;
    }

    /**
     * Send Slack notification
     */
    async sendSlackNotification(message, level = 'info') {
        if (!this.slackWebhookUrl) {
            console.log('⚠️  Slack webhook not configured');
            return;
        }

        const colors = {
            critical: '#FF0000',
            warning: '#FFA500',
            success: '#00FF00',
            info: '#0000FF'
        };

        const emoji = {
            critical: '🚨',
            warning: '⚠️',
            success: '✅',
            info: 'ℹ️'
        };

        const payload = {
            attachments: [{
                color: colors[level],
                title: `${emoji[level]} Salesforce Standards Compliance`,
                text: message,
                fields: [
                    {
                        title: 'Project',
                        value: path.basename(this.projectRoot),
                        short: true
                    },
                    {
                        title: 'Score',
                        value: `${this.metrics.currentScore}%`,
                        short: true
                    },
                    {
                        title: 'Trend',
                        value: this.metrics.trend,
                        short: true
                    },
                    {
                        title: 'Timestamp',
                        value: new Date().toLocaleString(),
                        short: true
                    }
                ],
                footer: 'Salesforce Standards Monitor',
                ts: Math.floor(Date.now() / 1000)
            }]
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const url = new URL(this.slackWebhookUrl);
            
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode === 200) {
                    console.log('✅ Slack notification sent');
                    resolve();
                } else {
                    console.error(`❌ Slack notification failed: ${res.statusCode}`);
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });

            req.on('error', (error) => {
                console.error('❌ Slack notification error:', error.message);
                reject(error);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Analyze results and send appropriate alerts
     */
    async analyzeAndAlert(results) {
        const score = results.overall.score;
        let level = 'info';
        let message = '';
        
        if (score < this.thresholds.critical) {
            level = 'critical';
            message = `CRITICAL: Compliance score dropped to ${score}%! Immediate action required.`;
        } else if (score < this.thresholds.warning) {
            level = 'warning';
            message = `WARNING: Compliance score is ${score}%. Review and fix violations.`;
        } else if (score >= this.thresholds.success) {
            level = 'success';
            message = `SUCCESS: Excellent compliance score of ${score}%!`;
        } else {
            level = 'info';
            message = `Compliance score: ${score}%. Some improvements needed.`;
        }
        
        // Add violation summary
        const totalViolations = results.overall.failed;
        if (totalViolations > 0) {
            message += `\n\nViolations found: ${totalViolations}`;
            
            // Add top violations
            const topViolations = [];
            if (results.documentation.failed.length > 0) {
                topViolations.push(`Documentation: ${results.documentation.failed.length}`);
            }
            if (results.reportTypes.failed.length > 0) {
                topViolations.push(`Report Types: ${results.reportTypes.failed.length}`);
            }
            if (results.lightningPages.failed.length > 0) {
                topViolations.push(`Lightning Pages: ${results.lightningPages.failed.length}`);
            }
            if (results.metadata.failed.length > 0) {
                topViolations.push(`Metadata: ${results.metadata.failed.length}`);
            }
            
            if (topViolations.length > 0) {
                message += '\n' + topViolations.join(', ');
            }
        }
        
        // Send alert based on conditions
        const shouldAlert = this.shouldSendAlert(score, level);
        
        if (shouldAlert) {
            await this.sendSlackNotification(message, level);
            this.logToErrorSystem(message, level);
        }
        
        return { level, message };
    }

    /**
     * Determine if alert should be sent
     */
    shouldSendAlert(score, level) {
        // Always alert on critical
        if (level === 'critical') return true;
        
        // Alert on significant changes
        if (this.metrics.history.length > 0) {
            const lastScore = this.metrics.history[this.metrics.history.length - 1].score;
            const change = Math.abs(score - lastScore);
            if (change > 10) return true;
        }
        
        // Alert on first run
        if (this.metrics.history.length === 1) return true;
        
        // Alert on trend changes
        const previousTrend = this.metrics.history.length > 1 
            ? this.calculateTrend(this.metrics.history.slice(-2)[0].score, score)
            : 'stable';
        
        if (previousTrend !== this.metrics.trend && this.metrics.trend === 'declining') {
            return true;
        }
        
        return false;
    }

    /**
     * Calculate trend between two scores
     */
    calculateTrend(oldScore, newScore) {
        if (newScore > oldScore + 5) return 'improving';
        if (newScore < oldScore - 5) return 'declining';
        return 'stable';
    }

    /**
     * Log to error logging system
     */
    logToErrorSystem(message, level) {
        if (!fs.existsSync(this.errorLogPath)) {
            fs.mkdirSync(this.errorLogPath, { recursive: true });
        }
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            source: 'standards-monitor',
            message,
            metrics: {
                score: this.metrics.currentScore,
                trend: this.metrics.trend,
                violations: Object.keys(this.metrics.violations).reduce((acc, key) => {
                    acc[key] = this.metrics.violations[key].length;
                    return acc;
                }, {})
            }
        };
        
        const logFile = path.join(this.errorLogPath, `standards-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    /**
     * Start continuous monitoring
     */
    async startMonitoring() {
        console.log('🚀 Starting Salesforce Standards Monitoring');
        console.log(`Interval: ${this.monitoringInterval / 1000 / 60} minutes\n`);
        
        // Run initial check
        await this.runCheck();
        
        // Set up interval
        this.monitoringTimer = setInterval(async () => {
            await this.runCheck();
        }, this.monitoringInterval);
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n⏹️  Stopping monitoring...');
            clearInterval(this.monitoringTimer);
            process.exit(0);
        });
    }

    /**
     * Run a single check
     */
    async runCheck() {
        try {
            const results = await this.runComplianceCheck();
            const alert = await this.analyzeAndAlert(results);
            
            console.log(`📊 Compliance Score: ${results.overall.score}%`);
            console.log(`📈 Trend: ${this.metrics.trend}`);
            console.log(`${alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : '✅'} Status: ${alert.level.toUpperCase()}`);
            console.log(`Next check: ${new Date(Date.now() + this.monitoringInterval).toLocaleTimeString()}\n`);
        } catch (error) {
            console.error('❌ Monitoring check failed:', error.message);
            this.logToErrorSystem(`Monitoring check failed: ${error.message}`, 'critical');
        }
    }

    /**
     * Generate metrics report
     */
    generateMetricsReport() {
        if (this.metrics.history.length === 0) {
            console.log('No metrics history available');
            return;
        }
        
        const report = {
            current: {
                score: this.metrics.currentScore,
                trend: this.metrics.trend,
                lastCheck: this.metrics.lastCheck
            },
            statistics: {
                average: 0,
                min: 100,
                max: 0,
                improvements: 0,
                declines: 0
            },
            violations: {
                total: 0,
                byCategory: {}
            }
        };
        
        // Calculate statistics
        let sum = 0;
        this.metrics.history.forEach((entry, index) => {
            sum += entry.score;
            report.statistics.min = Math.min(report.statistics.min, entry.score);
            report.statistics.max = Math.max(report.statistics.max, entry.score);
            
            if (index > 0) {
                const prevScore = this.metrics.history[index - 1].score;
                if (entry.score > prevScore) report.statistics.improvements++;
                else if (entry.score < prevScore) report.statistics.declines++;
            }
        });
        
        report.statistics.average = Math.round(sum / this.metrics.history.length);
        
        // Count violations
        Object.keys(this.metrics.violations).forEach(category => {
            const count = this.metrics.violations[category].length;
            report.violations.byCategory[category] = count;
            report.violations.total += count;
        });
        
        // Save report
        const reportPath = path.join(this.projectRoot, 'docs', 'compliance-metrics-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log('📊 Metrics report generated:', reportPath);
        return report;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const monitor = new StandardsMonitor();
    
    switch (command) {
        case 'start':
            const interval = args[1] ? parseInt(args[1]) * 60000 : undefined;
            if (interval) {
                monitor.monitoringInterval = interval;
            }
            monitor.startMonitoring();
            break;
            
        case 'check':
            monitor.runCheck().then(() => process.exit(0));
            break;
            
        case 'report':
            monitor.generateMetricsReport();
            break;
            
        case 'test-slack':
            monitor.sendSlackNotification('Test notification from Standards Monitor', 'info')
                .then(() => console.log('✅ Slack test successful'))
                .catch(error => console.error('❌ Slack test failed:', error.message));
            break;
            
        default:
            console.log('Salesforce Standards Monitor\n');
            console.log('Usage: standards-monitor <command> [options]\n');
            console.log('Commands:');
            console.log('  start [minutes]   Start continuous monitoring');
            console.log('  check             Run single compliance check');
            console.log('  report            Generate metrics report');
            console.log('  test-slack        Test Slack integration\n');
            console.log('Examples:');
            console.log('  standards-monitor start        # Start with default interval');
            console.log('  standards-monitor start 30     # Check every 30 minutes');
            console.log('  standards-monitor check        # Run once');
    }
}

module.exports = StandardsMonitor;