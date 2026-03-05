#!/usr/bin/env node

/**
 * Change Auditor System
 * =====================
 * Records and tracks all metadata changes with full context
 * Maintains audit trail for accountability and rollback capability
 */

const fs = require('fs').promises;
const path = require('path');

class ChangeAuditor {
    constructor() {
        this.auditDir = path.join(process.cwd(), 'logs', 'metadata-changes');
        this.alertThreshold = {
            extraChanges: 1,  // Alert on ANY unrequested change
            highRiskChanges: 1
        };
        this.initializeAuditDirectory();
    }

    /**
     * Initialize audit directory structure
     */
    async initializeAuditDirectory() {
        try {
            await fs.mkdir(this.auditDir, { recursive: true });
            await fs.mkdir(path.join(this.auditDir, 'daily'), { recursive: true });
            await fs.mkdir(path.join(this.auditDir, 'alerts'), { recursive: true });
            await fs.mkdir(path.join(this.auditDir, 'rollback'), { recursive: true });
        } catch (error) {
            console.error('Failed to initialize audit directory:', error);
        }
    }

    /**
     * Record a metadata change
     */
    async recordChange(context) {
        const auditEntry = {
            id: this.generateAuditId(),
            timestamp: new Date().toISOString(),
            user: context.user || process.env.USER || 'unknown',
            agent: context.agent,
            org: context.org,
            changeType: context.changeType,
            objectName: context.objectName,
            requested: {
                description: context.requestedChange,
                fields: context.requestedFields || []
            },
            executed: {
                changes: context.executedChanges || [],
                preserved: context.preservedElements || [],
                duration: context.duration
            },
            validation: context.validationResult || {},
            rollback: {
                possible: true,
                snapshot: context.beforeSnapshot || {},
                instructions: context.rollbackInstructions || []
            }
        };

        // Save audit entry
        await this.saveAuditEntry(auditEntry);

        // Check for violations
        const violations = this.checkForViolations(auditEntry);
        if (violations.length > 0) {
            await this.handleViolations(auditEntry, violations);
        }

        // Create rollback file if needed
        if (context.beforeSnapshot) {
            await this.createRollbackFile(auditEntry);
        }

        return {
            auditId: auditEntry.id,
            recorded: true,
            violations: violations
        };
    }

    /**
     * Generate unique audit ID
     */
    generateAuditId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        return `audit_${timestamp}_${random}`;
    }

    /**
     * Save audit entry to file
     */
    async saveAuditEntry(entry) {
        const date = new Date();
        const dailyFile = path.join(
            this.auditDir,
            'daily',
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.json`
        );

        try {
            // Read existing entries
            let entries = [];
            try {
                const content = await fs.readFile(dailyFile, 'utf8');
                entries = JSON.parse(content);
            } catch (error) {
                // File doesn't exist yet
            }

            // Add new entry
            entries.push(entry);

            // Save updated file
            await fs.writeFile(dailyFile, JSON.stringify(entries, null, 2));

            // Also save individual file for important changes
            if (this.isImportantChange(entry)) {
                const individualFile = path.join(this.auditDir, `${entry.id}.json`);
                await fs.writeFile(individualFile, JSON.stringify(entry, null, 2));
            }
        } catch (error) {
            console.error('Failed to save audit entry:', error);
        }
    }

    /**
     * Check for violations in the change
     */
    checkForViolations(entry) {
        const violations = [];

        // Check for unrequested changes
        if (entry.executed.changes) {
            for (const change of entry.executed.changes) {
                if (!this.wasRequested(change, entry.requested)) {
                    violations.push({
                        type: 'UNREQUESTED_CHANGE',
                        severity: 'HIGH',
                        detail: `Unrequested change to ${change.field}: ${change.from} → ${change.to}`,
                        field: change.field,
                        change: change
                    });
                }
            }
        }

        // Check for high-risk changes
        const highRiskFields = ['fieldType', 'required', 'unique', 'sharingModel'];
        for (const change of entry.executed.changes || []) {
            if (highRiskFields.includes(change.field)) {
                violations.push({
                    type: 'HIGH_RISK_CHANGE',
                    severity: 'MEDIUM',
                    detail: `High-risk change to ${change.field}`,
                    field: change.field,
                    change: change
                });
            }
        }

        // Check for missing preservation
        const shouldPreserve = ['existingFields', 'validationRules', 'recordTypes'];
        for (const item of shouldPreserve) {
            if (!entry.executed.preserved?.includes(item)) {
                violations.push({
                    type: 'MISSING_PRESERVATION',
                    severity: 'MEDIUM',
                    detail: `Failed to explicitly preserve ${item}`,
                    field: item
                });
            }
        }

        return violations;
    }

    /**
     * Check if a change was requested
     */
    wasRequested(change, requested) {
        if (!requested.fields || requested.fields.length === 0) {
            // If no specific fields requested, check description
            return requested.description?.toLowerCase().includes(change.field.toLowerCase());
        }
        return requested.fields.some(field => field === change.field);
    }

    /**
     * Handle violations
     */
    async handleViolations(entry, violations) {
        // Create alert file
        const alertFile = path.join(
            this.auditDir,
            'alerts',
            `alert_${entry.id}.json`
        );

        const alert = {
            auditId: entry.id,
            timestamp: new Date().toISOString(),
            agent: entry.agent,
            violations: violations,
            entry: entry
        };

        await fs.writeFile(alertFile, JSON.stringify(alert, null, 2));

        // Log to console
        console.error('\n⚠️ CHANGE VIOLATIONS DETECTED:');
        violations.forEach(v => {
            console.error(`  [${v.severity}] ${v.type}: ${v.detail}`);
        });
        console.error(`  Audit ID: ${entry.id}\n`);

        // Create summary alert
        await this.createSummaryAlert(violations, entry);
    }

    /**
     * Create summary alert for violations
     */
    async createSummaryAlert(violations, entry) {
        const summaryFile = path.join(this.auditDir, 'alerts', 'summary.json');
        
        let summary = { alerts: [] };
        try {
            const content = await fs.readFile(summaryFile, 'utf8');
            summary = JSON.parse(content);
        } catch (error) {
            // File doesn't exist yet
        }

        summary.alerts.push({
            timestamp: new Date().toISOString(),
            auditId: entry.id,
            agent: entry.agent,
            violationCount: violations.length,
            highSeverityCount: violations.filter(v => v.severity === 'HIGH').length,
            types: [...new Set(violations.map(v => v.type))]
        });

        // Keep only last 100 alerts
        if (summary.alerts.length > 100) {
            summary.alerts = summary.alerts.slice(-100);
        }

        await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
    }

    /**
     * Check if change is important enough for individual file
     */
    isImportantChange(entry) {
        // Important if has violations
        if (entry.validation && !entry.validation.valid) {
            return true;
        }

        // Important if high-risk change
        const hasHighRisk = entry.executed.changes?.some(c => 
            ['fieldType', 'required', 'unique', 'sharingModel'].includes(c.field)
        );

        return hasHighRisk;
    }

    /**
     * Create rollback file
     */
    async createRollbackFile(entry) {
        const rollbackFile = path.join(
            this.auditDir,
            'rollback',
            `rollback_${entry.id}.json`
        );

        const rollback = {
            auditId: entry.id,
            timestamp: entry.timestamp,
            object: entry.objectName,
            beforeState: entry.rollback.snapshot,
            instructions: entry.rollback.instructions || this.generateRollbackInstructions(entry),
            changes: entry.executed.changes
        };

        await fs.writeFile(rollbackFile, JSON.stringify(rollback, null, 2));
    }

    /**
     * Generate rollback instructions
     */
    generateRollbackInstructions(entry) {
        const instructions = [];

        for (const change of entry.executed.changes || []) {
            instructions.push({
                step: instructions.length + 1,
                action: 'revert',
                field: change.field,
                from: change.to,
                to: change.from,
                command: this.generateRollbackCommand(change, entry.objectName)
            });
        }

        return instructions;
    }

    /**
     * Generate rollback command
     */
    generateRollbackCommand(change, objectName) {
        if (change.field === 'label') {
            return `sf data update record --sobject CustomObject --where "DeveloperName='${objectName}'" --values "Label='${change.from}'"`;
        }
        // Add more rollback commands as needed
        return `# Manual rollback required for ${change.field}`;
    }

    /**
     * Get audit history for an object
     */
    async getObjectHistory(objectName, limit = 10) {
        const allAudits = [];
        const files = await fs.readdir(path.join(this.auditDir, 'daily'));
        
        for (const file of files.slice(-7)) { // Last 7 days
            try {
                const content = await fs.readFile(
                    path.join(this.auditDir, 'daily', file),
                    'utf8'
                );
                const entries = JSON.parse(content);
                const objectEntries = entries.filter(e => e.objectName === objectName);
                allAudits.push(...objectEntries);
            } catch (error) {
                // Skip invalid files
            }
        }

        // Sort by timestamp and limit
        return allAudits
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Generate audit report
     */
    async generateReport(startDate, endDate) {
        const report = {
            period: {
                start: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                end: endDate || new Date().toISOString()
            },
            summary: {
                totalChanges: 0,
                byAgent: {},
                byObject: {},
                violations: 0,
                highRiskChanges: 0
            },
            violations: [],
            details: []
        };

        // Read audit files
        const files = await fs.readdir(path.join(this.auditDir, 'daily'));
        
        for (const file of files) {
            try {
                const content = await fs.readFile(
                    path.join(this.auditDir, 'daily', file),
                    'utf8'
                );
                const entries = JSON.parse(content);
                
                for (const entry of entries) {
                    const entryDate = new Date(entry.timestamp);
                    if (entryDate >= new Date(report.period.start) && 
                        entryDate <= new Date(report.period.end)) {
                        
                        report.summary.totalChanges++;
                        
                        // Count by agent
                        report.summary.byAgent[entry.agent] = 
                            (report.summary.byAgent[entry.agent] || 0) + 1;
                        
                        // Count by object
                        report.summary.byObject[entry.objectName] = 
                            (report.summary.byObject[entry.objectName] || 0) + 1;
                        
                        // Add to details
                        report.details.push({
                            id: entry.id,
                            timestamp: entry.timestamp,
                            agent: entry.agent,
                            object: entry.objectName,
                            changeCount: entry.executed.changes?.length || 0
                        });
                    }
                }
            } catch (error) {
                // Skip invalid files
            }
        }

        // Read alerts
        try {
            const alertSummary = await fs.readFile(
                path.join(this.auditDir, 'alerts', 'summary.json'),
                'utf8'
            );
            const alerts = JSON.parse(alertSummary);
            report.violations = alerts.alerts.filter(a => {
                const alertDate = new Date(a.timestamp);
                return alertDate >= new Date(report.period.start) && 
                       alertDate <= new Date(report.period.end);
            });
            report.summary.violations = report.violations.length;
            report.summary.highRiskChanges = report.violations.reduce(
                (sum, v) => sum + v.highSeverityCount, 0
            );
        } catch (error) {
            // No alerts file
        }

        return report;
    }
}

// CLI interface
if (require.main === module) {
    const auditor = new ChangeAuditor();
    
    // Example usage
    const example = async () => {
        console.log('Change Auditor - Example Audit\n');
        
        const context = {
            user: 'example_user',
            agent: 'sfdc-metadata-manager',
            org: 'sandbox',
            changeType: 'objectRelabel',
            objectName: 'Timeframe__c',
            requestedChange: 'Relabel Timeframe to Pricing Segment',
            requestedFields: ['label'],
            executedChanges: [
                {
                    field: 'label',
                    from: 'Timeframe',
                    to: 'Pricing Segment',
                    requested: true
                },
                {
                    field: 'nameFieldType',
                    from: 'Text',
                    to: 'AutoNumber',
                    requested: false  // This will trigger a violation!
                }
            ],
            preservedElements: [
                'existingFields',
                'validationRules',
                'recordTypes',
                'pageLayouts'
            ],
            beforeSnapshot: {
                label: 'Timeframe',
                nameField: { type: 'Text', length: 255 },
                fields: 12,
                validationRules: 3
            },
            duration: '2.3s'
        };
        
        const result = await auditor.recordChange(context);
        
        console.log('\n📝 Audit Result:');
        console.log(`Audit ID: ${result.auditId}`);
        console.log(`Recorded: ${result.recorded}`);
        
        if (result.violations.length > 0) {
            console.log('\n⚠️ Violations Found:');
            result.violations.forEach(v => {
                console.log(`  - [${v.severity}] ${v.type}: ${v.detail}`);
            });
        }
        
        // Generate report
        console.log('\n📊 Generating Report...');
        const report = await auditor.generateReport();
        console.log('\nReport Summary:');
        console.log(`Total Changes: ${report.summary.totalChanges}`);
        console.log(`Violations: ${report.summary.violations}`);
        console.log(`High Risk Changes: ${report.summary.highRiskChanges}`);
    };
    
    example();
}

module.exports = ChangeAuditor;