#!/usr/bin/env node

/**
 * Agent Action Audit Logger
 *
 * Comprehensive audit logging for all autonomous agent operations.
 * Logs to multiple destinations for redundancy and compliance.
 *
 * Features:
 * - Local filesystem logging
 * - Supabase database storage
 * - Salesforce Event Monitoring integration
 * - Compliance report generation (GDPR, HIPAA, SOX)
 * - Searchable audit trail
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Agent Action Audit Logger class
 */
class AgentActionAuditLogger {
    constructor(options = {}) {
        this.verbose = options.verbose || false;

        // Determine log directory
        const defaultLogDir = path.join(
            process.env.HOME || process.env.USERPROFILE,
            '.claude',
            'logs',
            'agent-governance'
        );
        const envLogDir = process.env.AUDIT_LOG_PATH;
        this.logDir = options.logDir || envLogDir || defaultLogDir;

        // Create log directory if it doesn't exist
        this.ensureLogDirectory();

        // Retention configuration
        this.retentionDays = this.resolveRetentionDays(options);
        this.lastRetentionCheck = null;

        // Configure storage backends
        this.storageBackends = {
            local: options.enableLocal !== false,
            supabase: options.enableSupabase || false,
            salesforce: options.enableSalesforce || false
        };

        // Supabase configuration
        if (this.storageBackends.supabase) {
            this.supabaseUrl = process.env.SUPABASE_URL;
            this.supabaseKey = process.env.SUPABASE_ANON_KEY ||
                              process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (!this.supabaseUrl || !this.supabaseKey) {
                console.warn('Warning: Supabase credentials not configured');
                this.storageBackends.supabase = false;
            }
        }

        // Initialize statistics
        this.stats = {
            totalLogs: 0,
            successfulWrites: 0,
            failedWrites: 0,
            lastLogTime: null
        };
    }

    /**
     * Log an agent action
     *
     * @param {Object} action - Action details
     * @param {string} action.agent - Agent name
     * @param {string} action.operation - Operation type
     * @param {Object} action.risk - Risk assessment
     * @param {Object} action.approval - Approval details (if applicable)
     * @param {Object} action.execution - Execution results
     * @param {Object} action.verification - Verification results
     * @param {Object} action.reasoning - Decision reasoning
     * @param {Object} action.rollback - Rollback plan
     * @returns {Promise<Object>} Log result
     */
    async logAction(action) {
        const startTime = Date.now();

        try {
            // Generate log entry
            const logEntry = this.createLogEntry(action);

            // Write to configured backends
            const results = await Promise.allSettled([
                this.writeToLocal(logEntry),
                this.storageBackends.supabase ?
                    this.writeToSupabase(logEntry) : Promise.resolve(null),
                this.storageBackends.salesforce ?
                    this.writeToSalesforce(logEntry) : Promise.resolve(null)
            ]);

            // Update statistics
            this.updateStats(results);

            // Apply retention policy if configured (non-fatal)
            try {
                const retentionResult = this.applyRetentionPolicy();
                if (this.verbose && retentionResult?.deletedDirs?.length) {
                    console.log(`🧹 Retention: deleted ${retentionResult.deletedDirs.length} log directories`);
                }
            } catch (retentionError) {
                console.error(`Warning: retention cleanup failed: ${retentionError.message}`);
            }

            // Check for failures
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                console.error(`Warning: ${failures.length} storage backend(s) failed`);
                failures.forEach((f, i) => {
                    console.error(`  Backend ${i + 1}: ${f.reason}`);
                });
            }

            if (this.verbose) {
                console.log(`✅ Audit log created: ${logEntry.logId}`);
                console.log(`   Storage: ${results.filter(r => r.status === 'fulfilled').length}/${results.length} backends`);
                console.log(`   Duration: ${Date.now() - startTime}ms`);
            }

            return {
                success: results.some(r => r.status === 'fulfilled'),
                logId: logEntry.logId,
                timestamp: logEntry.timestamp,
                backends: {
                    local: results[0].status === 'fulfilled',
                    supabase: this.storageBackends.supabase ? results[1].status === 'fulfilled' : null,
                    salesforce: this.storageBackends.salesforce ? results[2].status === 'fulfilled' : null
                },
                duration: Date.now() - startTime
            };

        } catch (error) {
            console.error('Failed to log agent action:', error);
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Create a complete log entry
     */
    createLogEntry(action) {
        const timestamp = new Date().toISOString();
        const logId = this.generateLogId(timestamp);

        return {
            logId,
            timestamp,
            agent: action.agent,
            operation: action.operation,
            riskScore: action.risk?.riskScore || 0,
            riskLevel: action.risk?.riskLevel || 'UNKNOWN',
            approvalRequired: action.risk?.requiresApproval || false,
            approvalStatus: action.approval?.status || 'NOT_REQUIRED',
            approvers: action.approval?.approvers || [],
            approvalTime: action.approval?.approvalTime || null,
            environment: {
                org: action.environment?.org || 'unknown',
                orgId: action.environment?.orgId || null,
                instanceUrl: action.environment?.instanceUrl || null,
                user: action.environment?.user || process.env.USER || process.env.USERNAME
            },
            operationDetails: action.operationDetails || {},
            execution: {
                startTime: action.execution?.startTime || timestamp,
                endTime: action.execution?.endTime || timestamp,
                durationMs: action.execution?.durationMs || 0,
                success: action.execution?.success || false,
                errors: action.execution?.errors || []
            },
            verification: {
                performed: action.verification?.performed || false,
                passed: action.verification?.passed || false,
                method: action.verification?.method || null,
                issues: action.verification?.issues || []
            },
            reasoning: {
                intent: action.reasoning?.intent || '',
                alternativesConsidered: action.reasoning?.alternativesConsidered || [],
                decisionRationale: action.reasoning?.decisionRationale || ''
            },
            rollback: {
                planExists: action.rollback?.planExists || false,
                planDescription: action.rollback?.planDescription || null,
                rollbackCommand: action.rollback?.rollbackCommand || null
            },
            metadata: {
                sessionId: action.metadata?.sessionId || this.generateSessionId(),
                requestId: action.metadata?.requestId || null,
                correlationId: action.metadata?.correlationId || null
            }
        };
    }

    /**
     * Resolve retention days from options or environment
     */
    resolveRetentionDays(options = {}) {
        if (Number.isFinite(options.retentionDays) && options.retentionDays > 0) {
            return Math.round(options.retentionDays);
        }

        const envDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '', 10);
        if (Number.isFinite(envDays) && envDays > 0) {
            return envDays;
        }

        const envYears = parseFloat(process.env.AUDIT_RETENTION_YEARS || '');
        if (Number.isFinite(envYears) && envYears > 0) {
            return Math.round(envYears * 365);
        }

        return null;
    }

    /**
     * Apply retention policy for local logs
     */
    applyRetentionPolicy(options = {}) {
        const retentionDays = Number.isFinite(options.retentionDays) ?
            options.retentionDays :
            this.retentionDays;
        const dryRun = options.dryRun === true;
        const force = options.force === true;

        if (!retentionDays || retentionDays <= 0) {
            return {
                enabled: false,
                retentionDays: null,
                dryRun,
                skipped: true,
                reason: 'Retention disabled'
            };
        }

        const now = Date.now();
        if (!force && this.lastRetentionCheck && (now - this.lastRetentionCheck) < 12 * 60 * 60 * 1000) {
            return {
                enabled: true,
                retentionDays,
                dryRun,
                skipped: true,
                reason: 'Retention recently checked'
            };
        }

        if (!fs.existsSync(this.logDir)) {
            this.lastRetentionCheck = now;
            return {
                enabled: true,
                retentionDays,
                dryRun,
                deletedDirs: [],
                skipped: true,
                reason: 'Log directory missing'
            };
        }

        const cutoff = now - (retentionDays * 24 * 60 * 60 * 1000);
        const deletedDirs = [];
        const skippedDirs = [];
        const errors = [];

        const dateDirs = fs.readdirSync(this.logDir);
        for (const dateDir of dateDirs) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) {
                skippedDirs.push({ dir: dateDir, reason: 'Non-date directory' });
                continue;
            }

            const dirPath = path.join(this.logDir, dateDir);
            let stats;
            try {
                stats = fs.lstatSync(dirPath);
            } catch (error) {
                errors.push({ dir: dateDir, error: error.message });
                continue;
            }

            if (!stats.isDirectory() || stats.isSymbolicLink()) {
                skippedDirs.push({ dir: dateDir, reason: 'Not a directory' });
                continue;
            }

            const dirTimestamp = Date.parse(`${dateDir}T00:00:00Z`);
            if (!Number.isFinite(dirTimestamp)) {
                skippedDirs.push({ dir: dateDir, reason: 'Invalid date' });
                continue;
            }

            if (dirTimestamp < cutoff) {
                if (!dryRun) {
                    try {
                        fs.rmSync(dirPath, { recursive: true, force: true });
                    } catch (error) {
                        errors.push({ dir: dateDir, error: error.message });
                        continue;
                    }
                }
                deletedDirs.push(dateDir);
            }
        }

        this.lastRetentionCheck = now;
        return {
            enabled: true,
            retentionDays,
            dryRun,
            deletedDirs,
            skippedDirs,
            errors
        };
    }

    /**
     * Generate unique log ID
     */
    generateLogId(timestamp) {
        const date = timestamp.split('T')[0];
        const time = timestamp.split('T')[1].replace(/[:.]/g, '-').split('Z')[0];
        const random = crypto.randomBytes(2).toString('hex');
        return `AL-${date}-${time}-${random}`.toUpperCase();
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return `SESSION-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
    }

    /**
     * Write log to local filesystem
     */
    async writeToLocal(logEntry) {
        try {
            // Organize by date
            const date = logEntry.timestamp.split('T')[0];
            const dateDir = path.join(this.logDir, date);

            if (!fs.existsSync(dateDir)) {
                fs.mkdirSync(dateDir, { recursive: true });
            }

            // Write individual log file
            const logFile = path.join(dateDir, `${logEntry.logId}.json`);
            fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2), 'utf8');

            // Append to daily aggregate
            const dailyLog = path.join(dateDir, 'daily-log.jsonl');
            fs.appendFileSync(dailyLog, JSON.stringify(logEntry) + '\n', 'utf8');

            return {
                success: true,
                backend: 'local',
                path: logFile
            };

        } catch (error) {
            throw new Error(`Local storage failed: ${error.message}`);
        }
    }

    /**
     * Write log to Supabase
     */
    async writeToSupabase(logEntry) {
        if (!this.storageBackends.supabase) {
            return null;
        }

        try {
            // Flatten structure for database storage
            const dbEntry = {
                log_id: logEntry.logId,
                timestamp: logEntry.timestamp,
                agent: logEntry.agent,
                operation: logEntry.operation,
                risk_score: logEntry.riskScore,
                risk_level: logEntry.riskLevel,
                approval_required: logEntry.approvalRequired,
                approval_status: logEntry.approvalStatus,
                environment_org: logEntry.environment.org,
                environment_org_id: logEntry.environment.orgId,
                execution_success: logEntry.execution.success,
                execution_duration_ms: logEntry.execution.durationMs,
                verification_performed: logEntry.verification.performed,
                verification_passed: logEntry.verification.passed,
                full_log: logEntry // Store complete JSON in JSONB column
            };

            // Use fetch to POST to Supabase REST API
            const response = await fetch(
                `${this.supabaseUrl}/rest/v1/agent_actions`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(dbEntry)
                }
            );

            if (!response.ok) {
                throw new Error(`Supabase returned ${response.status}: ${response.statusText}`);
            }

            return {
                success: true,
                backend: 'supabase'
            };

        } catch (error) {
            throw new Error(`Supabase storage failed: ${error.message}`);
        }
    }

    /**
     * Write log to Salesforce (via Event Monitoring or Platform Events)
     */
    async writeToSalesforce(logEntry) {
        if (!this.storageBackends.salesforce) {
            return null;
        }

        // LIMITATION: Salesforce Event Monitoring integration not yet implemented
        //
        // Current logging capabilities:
        // - File-based logging (JSON) - IMPLEMENTED
        // - Console output - IMPLEMENTED
        // - Supabase logging (if configured) - IMPLEMENTED
        //
        // Enhancement needed:
        // 1. Salesforce org authentication
        // 2. Platform Event publishing or Event Monitoring API
        // 3. Custom object (AgentAudit__c) or Platform Event definition
        // 4. Field-level security and sharing rules
        //
        // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD
        console.warn('⚠️  Salesforce Event Monitoring integration not yet implemented');
        console.warn('   Audit logs are being written to local files and console only');
        return null;
    }

    /**
     * Update logging statistics
     */
    updateStats(results) {
        this.stats.totalLogs++;
        this.stats.lastLogTime = new Date().toISOString();

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.stats.successfulWrites += successful;
        this.stats.failedWrites += failed;
    }

    /**
     * Search audit logs
     *
     * @param {Object} criteria - Search criteria
     * @param {string} criteria.agent - Filter by agent name
     * @param {string} criteria.operation - Filter by operation type
     * @param {string} criteria.riskLevel - Filter by risk level
     * @param {string} criteria.environment - Filter by environment
     * @param {string} criteria.startDate - Filter by start date (ISO)
     * @param {string} criteria.endDate - Filter by end date (ISO)
     * @param {number} criteria.limit - Maximum results
     * @returns {Array<Object>} Matching log entries
     */
    async searchLogs(criteria = {}) {
        const logs = [];

        try {
            // Determine date range
            const startDate = criteria.startDate ?
                new Date(criteria.startDate).toISOString().split('T')[0] :
                null;
            const endDate = criteria.endDate ?
                new Date(criteria.endDate).toISOString().split('T')[0] :
                new Date().toISOString().split('T')[0];

            // Scan log directories
            const dateDirs = fs.readdirSync(this.logDir);

            for (const dateDir of dateDirs) {
                // Skip if outside date range
                if (startDate && dateDir < startDate) continue;
                if (dateDir > endDate) continue;

                const dailyLogPath = path.join(this.logDir, dateDir, 'daily-log.jsonl');
                if (!fs.existsSync(dailyLogPath)) continue;

                // Read daily log
                const lines = fs.readFileSync(dailyLogPath, 'utf8').trim().split('\n');

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);

                        // Apply filters
                        if (criteria.agent && entry.agent !== criteria.agent) continue;
                        if (criteria.operation && entry.operation !== criteria.operation) continue;
                        if (criteria.riskLevel && entry.riskLevel !== criteria.riskLevel) continue;
                        if (criteria.environment && entry.environment.org !== criteria.environment) continue;

                        logs.push(entry);

                        // Check limit
                        if (criteria.limit && logs.length >= criteria.limit) {
                            return logs;
                        }

                    } catch (parseError) {
                        // Skip malformed lines
                        continue;
                    }
                }
            }

            return logs;

        } catch (error) {
            console.error('Failed to search logs:', error);
            return [];
        }
    }

    /**
     * Generate compliance report
     *
     * @param {string} reportType - Report type (gdpr, hipaa, sox)
     * @param {Object} options - Report options
     * @returns {Object} Compliance report
     */
    async generateComplianceReport(reportType, options = {}) {
        const startDate = options.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = options.endDate || new Date().toISOString();

        // Search all logs in date range
        const logs = await this.searchLogs({ startDate, endDate });

        const report = {
            reportType,
            generatedAt: new Date().toISOString(),
            period: {
                start: startDate,
                end: endDate
            },
            summary: {
                totalActions: logs.length,
                byRiskLevel: this.countByField(logs, 'riskLevel'),
                byAgent: this.countByField(logs, 'agent'),
                byEnvironment: this.countByField(logs, l => l.environment.org),
                approvalMetrics: {
                    totalRequiringApproval: logs.filter(l => l.approvalRequired).length,
                    totalApproved: logs.filter(l => l.approvalStatus === 'GRANTED').length,
                    totalRejected: logs.filter(l => l.approvalStatus === 'REJECTED').length,
                    totalTimedOut: logs.filter(l => l.approvalStatus === 'TIMEOUT').length
                },
                executionMetrics: {
                    totalSuccessful: logs.filter(l => l.execution.success).length,
                    totalFailed: logs.filter(l => !l.execution.success).length,
                    averageDurationMs: this.average(logs, l => l.execution.durationMs)
                },
                verificationMetrics: {
                    totalVerified: logs.filter(l => l.verification.performed).length,
                    totalPassed: logs.filter(l => l.verification.passed).length,
                    totalFailed: logs.filter(l => l.verification.performed && !l.verification.passed).length
                }
            },
            details: this.generateDetailedFindings(reportType, logs),
            recommendations: this.generateRecommendations(reportType, logs)
        };

        return report;
    }

    /**
     * Count occurrences by field
     */
    countByField(logs, field) {
        const counts = {};
        for (const log of logs) {
            const value = typeof field === 'function' ? field(log) : log[field];
            counts[value] = (counts[value] || 0) + 1;
        }
        return counts;
    }

    /**
     * Calculate average
     */
    average(logs, field) {
        if (logs.length === 0) return 0;
        const sum = logs.reduce((acc, log) => {
            const value = typeof field === 'function' ? field(log) : log[field];
            return acc + (value || 0);
        }, 0);
        return Math.round(sum / logs.length);
    }

    /**
     * Generate detailed findings for compliance report
     */
    generateDetailedFindings(reportType, logs) {
        switch (reportType) {
            case 'gdpr':
                return this.generateGDPRFindings(logs);
            case 'hipaa':
                return this.generateHIPAAFindings(logs);
            case 'sox':
                return this.generateSOXFindings(logs);
            default:
                return {};
        }
    }

    /**
     * Generate GDPR-specific findings
     */
    generateGDPRFindings(logs) {
        return {
            dataSubjectRequests: logs.filter(l =>
                l.operation.includes('DELETE') || l.operation.includes('EXPORT')
            ).length,
            dataRetentionCompliance: 'PENDING_MANUAL_REVIEW',
            consentManagement: 'PENDING_MANUAL_REVIEW',
            dataProtectionByDesign: logs.filter(l =>
                l.operationDetails.encryption || l.operationDetails.masking
            ).length
        };
    }

    /**
     * Generate HIPAA-specific findings
     */
    generateHIPAAFindings(logs) {
        return {
            phiAccessLogs: logs.filter(l =>
                l.operationDetails.containsPHI
            ).length,
            encryptionUsage: logs.filter(l =>
                l.operationDetails.encryption
            ).length,
            accessControlViolations: logs.filter(l =>
                l.riskLevel === 'CRITICAL' && l.approvalStatus === 'OVERRIDE'
            ).length
        };
    }

    /**
     * Generate SOX-specific findings
     */
    generateSOXFindings(logs) {
        return {
            changeControlCompliance: logs.filter(l =>
                l.operationDetails.changeTicket
            ).length,
            segregationOfDuties: {
                violations: logs.filter(l =>
                    l.operationDetails.sodViolation
                ).length
            },
            accessReviews: 'PENDING_MANUAL_REVIEW'
        };
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(reportType, logs) {
        const recommendations = [];

        // High-risk operations without approval
        const highRiskNoApproval = logs.filter(l =>
            l.riskLevel === 'HIGH' && !l.approvalRequired
        );
        if (highRiskNoApproval.length > 0) {
            recommendations.push({
                severity: 'HIGH',
                finding: `${highRiskNoApproval.length} high-risk operations without approval`,
                recommendation: 'Review permission matrix to ensure high-risk operations require approval'
            });
        }

        // Failed verifications
        const failedVerifications = logs.filter(l =>
            l.verification.performed && !l.verification.passed
        );
        if (failedVerifications.length > 0) {
            recommendations.push({
                severity: 'MEDIUM',
                finding: `${failedVerifications.length} operations with failed verification`,
                recommendation: 'Investigate root causes and improve pre-deployment validation'
            });
        }

        return recommendations;
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Get logging statistics
     */
    getStats() {
        return {
            ...this.stats,
            backends: this.storageBackends,
            retentionDays: this.retentionDays,
            lastRetentionCheck: this.lastRetentionCheck
        };
    }
}

/**
 * CLI interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
Agent Action Audit Logger - Comprehensive audit logging for agent operations

Commands:
  log <action.json>           Log an action from JSON file
  search [options]            Search audit logs
  report <type> [options]     Generate compliance report
  purge [options]             Purge local logs past retention window

Search Options:
  --agent <name>              Filter by agent name
  --operation <type>          Filter by operation type
  --risk-level <level>        Filter by risk level (LOW/MEDIUM/HIGH/CRITICAL)
  --environment <env>         Filter by environment
  --start-date <ISO>          Start date (ISO format)
  --end-date <ISO>            End date (ISO format)
  --limit <n>                 Maximum results

Report Types:
  gdpr                        GDPR compliance report
  hipaa                       HIPAA compliance report
  sox                         SOX compliance report

Purge Options:
  --days <n>                  Override retention days
  --dry-run                   Show what would be deleted without removing files

Examples:
  # Log an action
  node agent-action-audit-logger.js log action.json

  # Search logs
  node agent-action-audit-logger.js search --agent sfdc-security-admin --risk-level HIGH

  # Generate GDPR report
  node agent-action-audit-logger.js report gdpr --start-date 2025-01-01

  # Generate SOX report
  node agent-action-audit-logger.js report sox --start-date 2025-07-01 --end-date 2025-09-30

  # Purge logs older than retention window
  node agent-action-audit-logger.js purge --days 30 --dry-run
`);
        process.exit(0);
    }

    let retentionDaysOverride = null;
    let dryRun = false;
    if (command === 'purge') {
        for (let i = 1; i < args.length; i++) {
            if (args[i] === '--days') retentionDaysOverride = parseInt(args[++i], 10);
            else if (args[i] === '--dry-run') dryRun = true;
        }
    }

    const logger = new AgentActionAuditLogger({
        verbose: true,
        retentionDays: Number.isFinite(retentionDaysOverride) ? retentionDaysOverride : undefined
    });

    (async () => {
        try {
            if (command === 'log') {
                const actionFile = args[1];
                if (!actionFile) {
                    throw new Error('Action JSON file required');
                }

                const action = JSON.parse(fs.readFileSync(actionFile, 'utf8'));
                const result = await logger.logAction(action);
                console.log(JSON.stringify(result, null, 2));

            } else if (command === 'search') {
                const criteria = {};
                for (let i = 1; i < args.length; i++) {
                    if (args[i] === '--agent') criteria.agent = args[++i];
                    else if (args[i] === '--operation') criteria.operation = args[++i];
                    else if (args[i] === '--risk-level') criteria.riskLevel = args[++i];
                    else if (args[i] === '--environment') criteria.environment = args[++i];
                    else if (args[i] === '--start-date') criteria.startDate = args[++i];
                    else if (args[i] === '--end-date') criteria.endDate = args[++i];
                    else if (args[i] === '--limit') criteria.limit = parseInt(args[++i], 10);
                }

                const logs = await logger.searchLogs(criteria);
                console.log(JSON.stringify(logs, null, 2));

            } else if (command === 'report') {
                const reportType = args[1];
                if (!reportType) {
                    throw new Error('Report type required (gdpr, hipaa, sox)');
                }

                const options = {};
                for (let i = 2; i < args.length; i++) {
                    if (args[i] === '--start-date') options.startDate = args[++i];
                    else if (args[i] === '--end-date') options.endDate = args[++i];
                }

                const report = await logger.generateComplianceReport(reportType, options);
                console.log(JSON.stringify(report, null, 2));

            } else if (command === 'purge') {
                const result = logger.applyRetentionPolicy({ force: true, dryRun });
                console.log(JSON.stringify(result, null, 2));

            } else {
                throw new Error(`Unknown command: ${command}`);
            }

            process.exit(0);

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = AgentActionAuditLogger;
