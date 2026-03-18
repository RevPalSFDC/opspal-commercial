#!/usr/bin/env node

/**
 * Shared Monitoring Utilities
 * 
 * Common functions and utilities used across all monitoring scripts:
 * - Configuration management
 * - Email/notification services
 * - File system utilities
 * - Logging utilities
 * - Health score calculations
 * - Trend analysis
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const net = require('net');
const tls = require('tls');
const os = require('os');
const execAsync = promisify(exec);

class MonitoringUtils {
    constructor(configPath = null) {
        this.configPath = configPath || path.join(__dirname, 'monitoring-config.json');
        this.config = null;
        this.logLevel = 'info';
    }

    /**
     * Configuration Management
     */
    async loadConfig() {
        try {
            const configContent = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configContent);
            return this.config;
        } catch (error) {
            throw new Error(`Failed to load monitoring configuration: ${error.message}`);
        }
    }

    async getConfig() {
        if (!this.config) {
            await this.loadConfig();
        }
        return this.config;
    }

    async getOrgConfig(orgAlias) {
        const config = await this.getConfig();
        return config.organizations[orgAlias] || null;
    }

    async getScheduleConfig(scheduleName) {
        const config = await this.getConfig();
        return config.monitoring.schedules[scheduleName] || null;
    }

    async getThresholds(orgAlias = null) {
        const config = await this.getConfig();
        let thresholds = { ...config.monitoring.thresholds };
        
        if (orgAlias) {
            const orgConfig = await this.getOrgConfig(orgAlias);
            if (orgConfig && orgConfig.monitoring.customThresholds) {
                // Merge custom thresholds
                for (const [key, value] of Object.entries(orgConfig.monitoring.customThresholds)) {
                    const [category, threshold] = key.split('.');
                    if (thresholds[category]) {
                        thresholds[category][threshold] = value;
                    }
                }
            }
        }
        
        return thresholds;
    }

    /**
     * Logging Utilities
     */
    async log(message, level = 'info', context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            context
        };

        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        // Console output
        if (this.shouldLog(level)) {
            console.log(logMessage);
        }

        // File logging (if context provides logFile)
        if (context.logFile) {
            try {
                await fs.appendFile(context.logFile, JSON.stringify(logEntry) + '\n');
            } catch (error) {
                console.error(`Failed to write to log file: ${error.message}`);
            }
        }

        return logEntry;
    }

    shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level.toLowerCase()] >= levels[this.logLevel];
    }

    setLogLevel(level) {
        this.logLevel = level.toLowerCase();
    }

    /**
     * File System Utilities
     */
    async ensureDirectory(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            return true;
        } catch (error) {
            await this.log(`Failed to create directory ${dirPath}: ${error.message}`, 'error');
            return false;
        }
    }

    async getRecentFiles(directory, pattern, maxAgeDays) {
        try {
            const files = await fs.readdir(directory);
            const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
            
            const recentFiles = [];
            for (const file of files) {
                if (pattern.test(file)) {
                    const filePath = path.join(directory, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.mtime > cutoffDate) {
                        recentFiles.push({
                            path: filePath,
                            name: file,
                            mtime: stats.mtime,
                            size: stats.size
                        });
                    }
                }
            }
            
            return recentFiles.sort((a, b) => b.mtime - a.mtime);
        } catch (error) {
            await this.log(`Error reading directory ${directory}: ${error.message}`, 'warn');
            return [];
        }
    }

    async cleanupOldFiles(directory, pattern, maxAgeDays) {
        try {
            const files = await fs.readdir(directory);
            const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
            let deletedCount = 0;
            
            for (const file of files) {
                if (pattern.test(file)) {
                    const filePath = path.join(directory, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        await fs.unlink(filePath);
                        deletedCount++;
                        await this.log(`Deleted old file: ${file}`, 'debug');
                    }
                }
            }
            
            if (deletedCount > 0) {
                await this.log(`Cleaned up ${deletedCount} old files from ${directory}`, 'info');
            }
            
            return deletedCount;
        } catch (error) {
            await this.log(`Error cleaning up files in ${directory}: ${error.message}`, 'error');
            return 0;
        }
    }

    /**
     * Health Score Calculations
     */
    calculateHealthScore(metric, value, thresholds) {
        if (!thresholds[metric]) {
            return 100; // Default to healthy if no thresholds defined
        }

        const metricThresholds = thresholds[metric];
        
        // Handle different threshold patterns
        if (metricThresholds.excellent !== undefined) {
            // Pattern: excellent/good/fair/poor with max values
            if (metricThresholds.excellent.max !== undefined) {
                if (value <= metricThresholds.excellent.max) return metricThresholds.excellent.score || 100;
                if (value <= metricThresholds.good.max) return metricThresholds.good.score || 80;
                if (value <= metricThresholds.fair.max) return metricThresholds.fair.score || 60;
                return metricThresholds.poor.score || 40;
            }
            // Pattern: excellent/good/fair/poor with min values  
            if (metricThresholds.excellent.min !== undefined) {
                if (value >= metricThresholds.excellent.min) return metricThresholds.excellent.score || 100;
                if (value >= metricThresholds.good.min) return metricThresholds.good.score || 80;
                if (value >= metricThresholds.fair.min) return metricThresholds.fair.score || 60;
                return metricThresholds.poor.score || 40;
            }
        }
        
        // Simple warning/critical pattern
        if (metricThresholds.warning !== undefined && metricThresholds.critical !== undefined) {
            if (value <= metricThresholds.critical) return 40;
            if (value <= metricThresholds.warning) return 70;
            return 100;
        }
        
        return 100; // Default to healthy
    }

    calculateOverallHealthScore(metrics, weights = null) {
        const defaultWeights = {
            flowComplexity: 0.3,
            consolidationCompliance: 0.3,
            validationRuleChanges: 0.2,
            systemMetrics: 0.2
        };

        const actualWeights = weights || defaultWeights;
        let weightedSum = 0;
        let totalWeights = 0;

        for (const [metric, weight] of Object.entries(actualWeights)) {
            if (metrics[metric] && metrics[metric].healthScore !== undefined) {
                weightedSum += metrics[metric].healthScore * weight;
                totalWeights += weight;
            }
        }

        return totalWeights > 0 ? Math.round(weightedSum / totalWeights) : 50;
    }

    getHealthStatus(score) {
        if (score >= 90) return { status: 'Excellent', color: '#28a745', icon: '🟢', priority: 'low' };
        if (score >= 80) return { status: 'Good', color: '#28a745', icon: '🔵', priority: 'low' };
        if (score >= 60) return { status: 'Fair', color: '#ffc107', icon: '🟡', priority: 'medium' };
        return { status: 'Poor', color: '#dc3545', icon: '🔴', priority: 'high' };
    }

    /**
     * Trend Analysis
     */
    calculateTrend(dataPoints, lookBackPeriods = 3) {
        if (dataPoints.length < 2) {
            return { trend: 'stable', change: 0, confidence: 'low' };
        }

        const recent = dataPoints.slice(0, Math.min(lookBackPeriods, dataPoints.length));
        if (recent.length < 2) {
            return { trend: 'stable', change: 0, confidence: 'low' };
        }

        const values = recent.map(d => d.value || d);
        const oldest = values[values.length - 1];
        const newest = values[0];
        const change = newest - oldest;
        const percentChange = oldest !== 0 ? (change / oldest) * 100 : 0;

        let trend = 'stable';
        if (Math.abs(percentChange) > 5) {
            trend = percentChange > 0 ? 'increasing' : 'decreasing';
        }

        const confidence = values.length >= lookBackPeriods ? 'high' : 'medium';

        return {
            trend,
            change,
            percentChange,
            confidence,
            dataPoints: values.length
        };
    }

    detectAnomalies(dataPoints, threshold = 2) {
        if (dataPoints.length < 3) {
            return [];
        }

        const values = dataPoints.map(d => d.value || d);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const anomalies = [];
        dataPoints.forEach((point, index) => {
            const value = point.value || point;
            const zScore = Math.abs(value - mean) / stdDev;
            
            if (zScore > threshold) {
                anomalies.push({
                    index,
                    point,
                    value,
                    zScore,
                    deviation: value - mean
                });
            }
        });

        return anomalies;
    }

    /**
     * Notification Services
     */
    async sendEmailAlert(subject, body, recipients = null, attachments = [], options = {}) {
        const emailConfig = await this.getEmailConfig();
        const enabled = typeof emailConfig.enabled === 'boolean' ? emailConfig.enabled : true;

        if (!enabled && !options.force) {
            await this.log('Email alerts disabled in configuration', 'info');
            return false;
        }

        const toAddresses = this.resolveRecipients(recipients, emailConfig);
        if (!toAddresses || toAddresses.length === 0) {
            await this.log('No email recipients configured', 'warn');
            return false;
        }

        const smtpConfig = this.resolveSmtpConfig(emailConfig);
        const from = this.resolveFrom(emailConfig, smtpConfig);

        if (!smtpConfig.host) {
            await this.log('SMTP host not configured; set SMTP_HOST or monitoring-config.json', 'error');
            return false;
        }

        try {
            const message = await this.buildMimeMessage(from, toAddresses, subject, body, attachments);
            await this.sendSmtpMessage(smtpConfig, from, toAddresses, message);

            await this.log(`Email alert sent: ${subject}`, 'info');
            await this.log(`Recipients: ${toAddresses.join(', ')}`, 'info');
            return true;
        } catch (error) {
            await this.log(`Failed to send email alert: ${error.message}`, 'error');
            return false;
        }
    }

    async getEmailConfig() {
        try {
            const config = await this.getConfig();
            return config.monitoring?.alerting?.email || {};
        } catch (error) {
            return {};
        }
    }

    resolveRecipients(recipients, emailConfig) {
        const normalized = this.normalizeRecipients(recipients);
        if (normalized.length > 0) {
            return normalized;
        }

        if (Array.isArray(emailConfig.defaultRecipients)) {
            return emailConfig.defaultRecipients.filter(Boolean);
        }

        if (process.env.NOTIFICATION_EMAIL) {
            return this.normalizeRecipients(process.env.NOTIFICATION_EMAIL);
        }

        return [];
    }

    normalizeRecipients(recipients) {
        if (!recipients) {
            return [];
        }
        if (Array.isArray(recipients)) {
            return recipients.flatMap(item => this.normalizeRecipients(item));
        }
        if (typeof recipients === 'string') {
            return recipients
                .split(',')
                .map(value => value.trim())
                .filter(Boolean);
        }
        return [];
    }

    resolveSmtpConfig(emailConfig) {
        const smtpConfig = { ...(emailConfig.smtpConfig || {}) };

        if (process.env.SMTP_HOST) {
            smtpConfig.host = process.env.SMTP_HOST;
        }
        if (process.env.SMTP_PORT) {
            smtpConfig.port = Number(process.env.SMTP_PORT);
        }
        if (process.env.SMTP_SECURE) {
            smtpConfig.secure = ['1', 'true', 'yes'].includes(process.env.SMTP_SECURE.toLowerCase());
        }
        if (process.env.SMTP_USER) {
            smtpConfig.user = process.env.SMTP_USER;
        }
        if (process.env.SMTP_PASS) {
            smtpConfig.pass = process.env.SMTP_PASS;
        }
        if (process.env.SMTP_TIMEOUT_MS) {
            smtpConfig.timeoutMs = Number(process.env.SMTP_TIMEOUT_MS);
        }

        if (!smtpConfig.port) {
            smtpConfig.port = smtpConfig.secure ? 465 : 25;
        }
        if (smtpConfig.user && smtpConfig.pass) {
            smtpConfig.auth = { user: smtpConfig.user, pass: smtpConfig.pass };
        }

        return smtpConfig;
    }

    resolveFrom(emailConfig, smtpConfig) {
        return (
            smtpConfig.from
            || emailConfig.from
            || process.env.SMTP_FROM
            || process.env.MAIL_FROM
            || process.env.NOTIFICATION_EMAIL
            || `claude-monitor@${os.hostname()}`
        );
    }

    async buildMimeMessage(from, toAddresses, subject, body, attachments = []) {
        const safeAttachments = [];

        for (const attachment of attachments || []) {
            if (!attachment) {
                continue;
            }
            try {
                const content = await fs.readFile(attachment);
                safeAttachments.push({
                    path: attachment,
                    content,
                    filename: path.basename(attachment),
                    mimeType: this.getMimeType(attachment)
                });
            } catch (error) {
                await this.log(`Skipping attachment (unreadable): ${attachment}`, 'warn');
            }
        }

        const headers = [
            `From: ${from}`,
            `To: ${toAddresses.join(', ')}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0'
        ];

        if (safeAttachments.length === 0) {
            headers.push('Content-Type: text/plain; charset="utf-8"');
            return `${headers.join('\r\n')}\r\n\r\n${body}`;
        }

        const boundary = `----=_Part_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

        const parts = [];
        parts.push(
            `--${boundary}\r\nContent-Type: text/plain; charset=\"utf-8\"\r\nContent-Transfer-Encoding: 7bit\r\n\r\n${body}\r\n`
        );

        for (const attachment of safeAttachments) {
            const encoded = attachment.content.toString('base64');
            parts.push(
                `--${boundary}\r\n` +
                `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n` +
                'Content-Transfer-Encoding: base64\r\n' +
                `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n` +
                `${encoded.replace(/(.{76})/g, '$1\r\n')}\r\n`
            );
        }

        parts.push(`--${boundary}--\r\n`);

        return `${headers.join('\r\n')}\r\n\r\n${parts.join('')}`;
    }

    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.html':
            case '.htm':
                return 'text/html';
            case '.csv':
                return 'text/csv';
            case '.json':
                return 'application/json';
            case '.txt':
            case '.log':
                return 'text/plain';
            default:
                return 'application/octet-stream';
        }
    }

    async sendSmtpMessage(smtpConfig, from, toAddresses, message) {
        const host = smtpConfig.host;
        const port = Number(smtpConfig.port || (smtpConfig.secure ? 465 : 25));
        const timeoutMs = Number(smtpConfig.timeoutMs || 15000);

        const socket = smtpConfig.secure
            ? tls.connect({ host, port, servername: host })
            : net.createConnection({ host, port });

        socket.setEncoding('utf8');
        socket.setTimeout(timeoutMs);

        let buffer = '';
        const pending = [];

        const enqueueResponse = (expectedCodes) => (
            new Promise((resolve, reject) => {
                pending.push({ expectedCodes, resolve, reject });
            })
        );

        const flushLine = (line) => {
            if (line.length < 4) {
                return;
            }
            const code = Number(line.slice(0, 3));
            if (Number.isNaN(code)) {
                return;
            }
            if (line[3] === '-') {
                return;
            }
            const pendingRequest = pending.shift();
            if (!pendingRequest) {
                return;
            }
            const expected = pendingRequest.expectedCodes;
            if (!expected.includes(code)) {
                pendingRequest.reject(new Error(`SMTP error ${code}: ${line}`));
            } else {
                pendingRequest.resolve(code);
            }
        };

        socket.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            lines.filter(Boolean).forEach(flushLine);
        });

        socket.on('error', (error) => {
            while (pending.length > 0) {
                pending.shift().reject(error);
            }
        });

        socket.on('timeout', () => {
            socket.destroy(new Error('SMTP connection timed out'));
        });

        const sendCommand = (command) => {
            if (command) {
                socket.write(`${command}\r\n`);
            }
        };

        try {
            await enqueueResponse([220]);

            sendCommand(`EHLO ${os.hostname()}`);
            await enqueueResponse([250]);

            const auth = smtpConfig.auth;
            if (auth && auth.user && auth.pass) {
                sendCommand('AUTH LOGIN');
                await enqueueResponse([334]);
                sendCommand(Buffer.from(auth.user).toString('base64'));
                await enqueueResponse([334]);
                sendCommand(Buffer.from(auth.pass).toString('base64'));
                await enqueueResponse([235]);
            }

            sendCommand(`MAIL FROM:<${from}>`);
            await enqueueResponse([250]);

            for (const recipient of toAddresses) {
                sendCommand(`RCPT TO:<${recipient}>`);
                await enqueueResponse([250, 251]);
            }

            sendCommand('DATA');
            await enqueueResponse([354]);

            const normalized = message.replace(/\r?\n/g, '\r\n');
            const dotStuffed = normalized
                .split('\r\n')
                .map(line => (line.startsWith('.') ? `.${line}` : line))
                .join('\r\n');

            socket.write(`${dotStuffed}\r\n.\r\n`);
            await enqueueResponse([250]);

            sendCommand('QUIT');
            await enqueueResponse([221]);
            socket.end();
        } catch (error) {
            socket.end();
            throw error;
        }
    }

    async sendSlackAlert(message, channel = null) {
        const config = await this.getConfig();
        const slackConfig = config.monitoring.alerting.slack;
        
        if (!slackConfig.enabled || !slackConfig.webhookUrl) {
            await this.log('Slack alerts not configured', 'info');
            return false;
        }

        try {
            const payload = {
                text: message,
                channel: channel || slackConfig.channel
            };

            // HTTP POST to webhook URL
            await this.log(`Slack alert prepared: ${message}`, 'info');
            // Implementation would use HTTP client to post to webhook
            
            return true;
        } catch (error) {
            await this.log(`Failed to send Slack alert: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Salesforce Connection Utilities
     */
    async validateSfConnection(orgAlias) {
        try {
            const { stdout } = await execAsync(`sf org display --target-org ${orgAlias} --json`);
            const orgInfo = JSON.parse(stdout);
            
            if (!orgInfo.result) {
                throw new Error('Invalid org connection');
            }
            
            return {
                isValid: true,
                orgInfo: orgInfo.result
            };
        } catch (error) {
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    async getOrgLimits(orgAlias) {
        try {
            const { stdout } = await execAsync(`sf org list limits --target-org ${orgAlias} --json`);
            const result = JSON.parse(stdout);
            return result.result || {};
        } catch (error) {
            await this.log(`Failed to get org limits for ${orgAlias}: ${error.message}`, 'error');
            return {};
        }
    }

    /**
     * Report Generation Utilities
     */
    async generateCsvReport(data, headers, outputPath) {
        try {
            const csvRows = [headers];
            
            for (const row of data) {
                const csvRow = headers.map(header => {
                    const value = row[header] || '';
                    // Escape commas and quotes
                    return `"${String(value).replace(/"/g, '""')}"`;
                });
                csvRows.push(csvRow);
            }

            const csvContent = csvRows.map(row => row.join(',')).join('\n');
            await fs.writeFile(outputPath, csvContent);
            
            await this.log(`CSV report generated: ${outputPath}`, 'info');
            return outputPath;
        } catch (error) {
            await this.log(`Failed to generate CSV report: ${error.message}`, 'error');
            throw error;
        }
    }

    async generateJsonReport(data, outputPath) {
        try {
            const jsonContent = JSON.stringify(data, null, 2);
            await fs.writeFile(outputPath, jsonContent);
            
            await this.log(`JSON report generated: ${outputPath}`, 'info');
            return outputPath;
        } catch (error) {
            await this.log(`Failed to generate JSON report: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Performance Monitoring
     */
    async measureExecutionTime(asyncFunction, context = 'operation') {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        try {
            const result = await asyncFunction();
            const endTime = Date.now();
            const endMemory = process.memoryUsage();
            
            const performance = {
                executionTime: endTime - startTime,
                memoryUsage: {
                    heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                    heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                    rss: endMemory.rss - startMemory.rss
                },
                success: true
            };

            await this.log(`${context} completed in ${performance.executionTime}ms`, 'debug', { performance });
            
            return { result, performance };
        } catch (error) {
            const endTime = Date.now();
            const performance = {
                executionTime: endTime - startTime,
                success: false,
                error: error.message
            };

            await this.log(`${context} failed after ${performance.executionTime}ms: ${error.message}`, 'error', { performance });
            
            throw error;
        }
    }

    /**
     * Maintenance Operations
     */
    async runMaintenance() {
        await this.log('Starting maintenance operations...', 'info');
        const config = await this.getConfig();
        const retention = config.monitoring.retention;
        
        const maintenanceResults = {
            reportsDeleted: 0,
            logsDeleted: 0,
            dashboardsDeleted: 0,
            errors: []
        };

        try {
            // Clean up old reports
            const reportDirs = [
                path.join(__dirname, '../../reports/daily-complexity'),
                path.join(__dirname, '../../reports/weekly-consolidation'),
                path.join(__dirname, '../../reports/validation-changes'),
                path.join(__dirname, '../../reports/system-health')
            ];

            for (const reportDir of reportDirs) {
                try {
                    const deleted = await this.cleanupOldFiles(
                        reportDir,
                        /.*\.(json|html|csv)$/,
                        retention.reportRetentionDays
                    );
                    maintenanceResults.reportsDeleted += deleted;
                } catch (error) {
                    maintenanceResults.errors.push(`Failed to clean ${reportDir}: ${error.message}`);
                }
            }

            // Clean up old logs
            const logPatterns = [
                /audit-.*\.log$/,
                /consolidation-check-.*\.log$/,
                /validation-monitor-.*\.log$/,
                /dashboard-.*\.log$/
            ];

            for (const pattern of logPatterns) {
                for (const reportDir of reportDirs) {
                    try {
                        const deleted = await this.cleanupOldFiles(
                            reportDir,
                            pattern,
                            retention.logRetentionDays
                        );
                        maintenanceResults.logsDeleted += deleted;
                    } catch (error) {
                        maintenanceResults.errors.push(`Failed to clean logs in ${reportDir}: ${error.message}`);
                    }
                }
            }

            await this.log(`Maintenance completed: ${maintenanceResults.reportsDeleted} reports, ${maintenanceResults.logsDeleted} logs deleted`, 'info');
            
            if (maintenanceResults.errors.length > 0) {
                await this.log(`Maintenance errors: ${maintenanceResults.errors.join('; ')}`, 'warn');
            }

            return maintenanceResults;
        } catch (error) {
            await this.log(`Maintenance failed: ${error.message}`, 'error');
            throw error;
        }
    }
}

// Export singleton instance
const monitoringUtils = new MonitoringUtils();

module.exports = {
    MonitoringUtils,
    monitoringUtils
};

// CLI usage for utility functions
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args[0] === 'maintenance') {
        monitoringUtils.runMaintenance()
            .then(results => {
                console.log('Maintenance completed:', results);
                process.exit(0);
            })
            .catch(error => {
                console.error('Maintenance failed:', error.message);
                process.exit(1);
            });
    } else if (args[0] === 'test-config') {
        monitoringUtils.loadConfig()
            .then(config => {
                console.log('Configuration loaded successfully');
                console.log(`Default org: ${config.monitoring.defaultOrg}`);
                console.log(`Enabled schedules: ${Object.keys(config.monitoring.schedules).filter(s => config.monitoring.schedules[s].enabled).length}`);
                process.exit(0);
            })
            .catch(error => {
                console.error('Configuration test failed:', error.message);
                process.exit(1);
            });
    } else if (args[0] === 'send-email') {
        const jsonIndex = args.indexOf('--json');
        if (jsonIndex === -1 || !args[jsonIndex + 1]) {
            console.error('Usage: node monitoring-utils.js send-email --json <payload.json>');
            process.exit(1);
        }

        const payloadPath = args[jsonIndex + 1];
        fs.readFile(payloadPath, 'utf8')
            .then(content => JSON.parse(content))
            .then(async payload => {
                const subject = payload.subject || 'Monitoring Alert';
                const body = payload.body || '';
                const recipients = payload.recipients || payload.to || null;
                const attachments = payload.attachments || [];

                const sent = await monitoringUtils.sendEmailAlert(
                    subject,
                    body,
                    recipients,
                    attachments,
                    { force: true }
                );

                if (sent) {
                    console.log('Email sent successfully');
                    process.exit(0);
                } else {
                    console.error('Email delivery failed');
                    process.exit(1);
                }
            })
            .catch(error => {
                console.error('Failed to send email:', error.message);
                process.exit(1);
            });
    } else {
        console.error('Usage: node monitoring-utils.js [maintenance|test-config|send-email]');
        process.exit(1);
    }
}
