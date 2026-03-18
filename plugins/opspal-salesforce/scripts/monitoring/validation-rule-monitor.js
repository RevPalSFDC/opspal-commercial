#!/usr/bin/env node

/**
 * Validation Rule Change Monitor
 * 
 * Monitors validation rules for changes that might affect deployments:
 * - New validation rules
 * - Modified validation rules  
 * - Rules with PRIORVALUE patterns that block record-triggered flows
 * - Rules that might cause deployment failures
 * 
 * Usage:
 *   node validation-rule-monitor.js --org <alias> [--email alerts@company.com] [--baseline] [--silent]
 * 
 * Cron Example:
 *   0 6 * * * cd /path/to/project && node scripts/monitoring/validation-rule-monitor.js --org production --email devteam@company.com
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { monitoringUtils } = require('./monitoring-utils');
const crypto = require('crypto');
const execAsync = promisify(exec);

class ValidationRuleMonitor {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.emailRecipients = options.email ? options.email.split(',') : [];
        this.silent = options.silent || false;
        this.createBaseline = options.baseline || false;
        this.reportDir = path.join(__dirname, '../../reports/validation-changes');
        this.stateDir = path.join(__dirname, '../../.state');
        this.timestamp = new Date().toISOString().split('T')[0];
        
        this.riskPatterns = {
            // Patterns that can cause deployment issues
            priorValue: {
                pattern: /PRIORVALUE\s*\(/i,
                risk: 'HIGH',
                description: 'PRIORVALUE functions can prevent record-triggered flow execution',
                recommendation: 'Review impact on automated processes and flows'
            },
            
            isChanged: {
                pattern: /ISCHANGED\s*\(/i,
                risk: 'MEDIUM',
                description: 'ISCHANGED functions affect when validation fires',
                recommendation: 'Verify compatibility with automation timing'
            },
            
            complexFormula: {
                pattern: /AND\s*\(.*AND\s*\(.*AND\s*\(/i,
                risk: 'MEDIUM',
                description: 'Complex nested formulas can cause performance issues',
                recommendation: 'Consider simplifying or breaking into multiple rules'
            },
            
            crossObjectReference: {
                pattern: /\w+\.\w+\.\w+/,
                risk: 'MEDIUM',
                description: 'Cross-object references can cause circular dependencies',
                recommendation: 'Verify object relationship dependencies'
            },
            
            profileRestriction: {
                pattern: /\$Profile\.|Profile\.|UserRole\./i,
                risk: 'LOW',
                description: 'Profile-based rules might affect admin operations',
                recommendation: 'Ensure proper admin bypass mechanisms'
            }
        };

        this.deploymentRisks = {
            // Common patterns that cause deployment failures
            hardcodedIds: {
                pattern: /['"][a-zA-Z0-9]{15,18}['"]/,
                risk: 'CRITICAL',
                description: 'Hardcoded IDs will fail in different environments',
                recommendation: 'Replace with dynamic references or custom labels'
            },
            
            devNames: {
                pattern: /(?:sandbox|dev|test|qa)(?:_|\s|\.)/i,
                risk: 'HIGH', 
                description: 'Environment-specific references will fail deployment',
                recommendation: 'Use environment-agnostic naming patterns'
            },
            
            missingFields: {
                pattern: /\b\w+__c\b/,
                risk: 'MEDIUM',
                description: 'Custom field references might not exist in target org',
                recommendation: 'Verify all custom fields exist in deployment target'
            }
        };
    }

    async log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (!this.silent) {
            console.log(logMessage);
        }
        
        // Append to log file
        const logFile = path.join(this.reportDir, `validation-monitor-${this.timestamp}.log`);
        await fs.appendFile(logFile, logMessage + '\n');
    }

    async ensureDirectories() {
        await fs.mkdir(this.reportDir, { recursive: true });
        await fs.mkdir(this.stateDir, { recursive: true });
    }

    async validateSfConnection() {
        try {
            const { stdout } = await execAsync(`sf org display --target-org ${this.orgAlias} --json`);
            const orgInfo = JSON.parse(stdout);
            
            if (!orgInfo.result) {
                throw new Error('Invalid org connection');
            }
            
            await this.log(`Connected to org: ${orgInfo.result.alias} (${orgInfo.result.instanceUrl})`);
            return orgInfo.result;
        } catch (error) {
            await this.log(`Failed to connect to org ${this.orgAlias}: ${error.message}`, 'error');
            throw error;
        }
    }

    async retrieveValidationRules() {
        try {
            await this.log('Retrieving validation rules from all objects...');
            
            // First get all objects that have validation rules
            const objectsQuery = `
                SELECT QualifiedApiName, DeveloperName, Label
                FROM EntityDefinition 
                WHERE IsCustomizable = true
                ORDER BY QualifiedApiName
            `;

            const { stdout: objectsStdout } = await execAsync(`sf data query --query "${objectsQuery}" --target-org ${this.orgAlias} --json`);
            const objectsResult = JSON.parse(objectsStdout);
            
            if (!objectsResult.result?.records) {
                throw new Error('Failed to retrieve objects');
            }

            const objects = objectsResult.result.records;
            await this.log(`Found ${objects.length} objects to check for validation rules`);

            // Get all validation rules using Tooling API
            const validationRulesQuery = `
                SELECT Id, FullName, ValidationName, EntityDefinition.QualifiedApiName,
                       EntityDefinition.Label as ObjectLabel, Active, Description, 
                       ErrorMessage, ErrorDisplayField, CreatedDate, CreatedBy.Name,
                       LastModifiedDate, LastModifiedBy.Name, ValidationFormula
                FROM ValidationRule
                WHERE Active = true
                ORDER BY EntityDefinition.QualifiedApiName, ValidationName
            `;

            const { stdout } = await execAsync(`sf data query --query "${validationRulesQuery}" --use-tooling-api --target-org ${this.orgAlias} --json`);
            const result = JSON.parse(stdout);
            
            if (!result.result?.records) {
                await this.log('No validation rules found or query failed');
                return [];
            }

            const validationRules = result.result.records.map(rule => ({
                id: rule.Id,
                fullName: rule.FullName,
                validationName: rule.ValidationName,
                objectApiName: rule.EntityDefinition?.QualifiedApiName || 'Unknown',
                objectLabel: rule.ObjectLabel || '',
                active: rule.Active,
                description: rule.Description || '',
                errorMessage: rule.ErrorMessage || '',
                errorDisplayField: rule.ErrorDisplayField || '',
                createdDate: rule.CreatedDate,
                createdBy: rule.CreatedBy?.Name || '',
                lastModifiedDate: rule.LastModifiedDate,
                lastModifiedBy: rule.LastModifiedBy?.Name || '',
                validationFormula: rule.ValidationFormula || '',
                // Generate hash for change detection
                contentHash: this.generateContentHash({
                    formula: rule.ValidationFormula || '',
                    errorMessage: rule.ErrorMessage || '',
                    active: rule.Active,
                    errorDisplayField: rule.ErrorDisplayField || ''
                })
            }));

            await this.log(`Retrieved ${validationRules.length} active validation rules`);
            return validationRules;
        } catch (error) {
            await this.log(`Failed to retrieve validation rules: ${error.message}`, 'error');
            throw error;
        }
    }

    generateContentHash(content) {
        const contentString = JSON.stringify(content, Object.keys(content).sort());
        return crypto.createHash('sha256').update(contentString).digest('hex').substring(0, 16);
    }

    async loadPreviousState() {
        const stateFile = path.join(this.stateDir, `validation-rules-${this.orgAlias}.json`);
        
        try {
            const stateContent = await fs.readFile(stateFile, 'utf8');
            const state = JSON.parse(stateContent);
            await this.log(`Loaded previous state: ${state.rules.length} rules from ${state.timestamp}`);
            return state;
        } catch (error) {
            await this.log('No previous state found - this is the first run or creating baseline', 'warn');
            return null;
        }
    }

    async savePreviousState(rules) {
        const stateFile = path.join(this.stateDir, `validation-rules-${this.orgAlias}.json`);
        
        const state = {
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            rulesCount: rules.length,
            rules: rules.map(rule => ({
                id: rule.id,
                fullName: rule.fullName,
                validationName: rule.validationName,
                objectApiName: rule.objectApiName,
                contentHash: rule.contentHash,
                lastModifiedDate: rule.lastModifiedDate
            }))
        };

        await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
        await this.log(`Saved current state: ${rules.length} rules`);
    }

    async analyzeValidationRuleRisks(rule) {
        const risks = [];
        const warnings = [];
        let totalRiskScore = 0;

        // Check for risky patterns in validation formula
        if (rule.validationFormula) {
            for (const [patternName, config] of Object.entries(this.riskPatterns)) {
                if (config.pattern.test(rule.validationFormula)) {
                    const riskLevel = this.getRiskScore(config.risk);
                    risks.push({
                        type: patternName,
                        level: config.risk,
                        score: riskLevel,
                        description: config.description,
                        recommendation: config.recommendation,
                        formula: rule.validationFormula
                    });
                    totalRiskScore += riskLevel;
                }
            }

            // Check for deployment risks
            for (const [patternName, config] of Object.entries(this.deploymentRisks)) {
                if (config.pattern.test(rule.validationFormula)) {
                    const riskLevel = this.getRiskScore(config.risk);
                    risks.push({
                        type: `deployment_${patternName}`,
                        level: config.risk,
                        score: riskLevel,
                        description: config.description,
                        recommendation: config.recommendation,
                        formula: rule.validationFormula
                    });
                    totalRiskScore += riskLevel;
                }
            }
        }

        // Check error message for issues
        if (rule.errorMessage) {
            if (rule.errorMessage.length > 255) {
                warnings.push({
                    type: 'long_error_message',
                    description: 'Error message exceeds recommended length',
                    recommendation: 'Consider shortening error message for better user experience'
                });
            }

            if (!/^[A-Z]/.test(rule.errorMessage)) {
                warnings.push({
                    type: 'error_message_format',
                    description: 'Error message should start with capital letter',
                    recommendation: 'Follow error message formatting standards'
                });
            }
        }

        // Check for recently modified rules (potential deployment conflicts)
        const lastModified = new Date(rule.lastModifiedDate);
        const daysSinceModified = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceModified < 7) {
            warnings.push({
                type: 'recently_modified',
                description: `Rule modified ${Math.floor(daysSinceModified)} days ago`,
                recommendation: 'Verify recent changes do not conflict with planned deployments'
            });
        }

        return {
            totalRiskScore,
            riskCategory: this.getRiskCategory(totalRiskScore),
            risks,
            warnings,
            requiresAttention: totalRiskScore > 15 || risks.some(r => r.level === 'CRITICAL')
        };
    }

    getRiskScore(level) {
        const scores = {
            'CRITICAL': 25,
            'HIGH': 15,
            'MEDIUM': 8,
            'LOW': 3
        };
        return scores[level] || 0;
    }

    getRiskCategory(score) {
        if (score >= 25) return 'CRITICAL';
        if (score >= 15) return 'HIGH';
        if (score >= 8) return 'MEDIUM';
        return 'LOW';
    }

    async detectChanges(currentRules, previousState) {
        const changes = {
            new: [],
            modified: [],
            deleted: [],
            summary: {
                totalChanges: 0,
                newRules: 0,
                modifiedRules: 0,
                deletedRules: 0,
                highRiskChanges: 0
            }
        };

        if (!previousState) {
            await this.log('No previous state to compare - all rules treated as new');
            changes.new = currentRules.map(rule => ({
                rule,
                changeType: 'new',
                detected: new Date().toISOString()
            }));
            changes.summary.newRules = currentRules.length;
            changes.summary.totalChanges = currentRules.length;
            return changes;
        }

        // Create maps for efficient lookup
        const previousRulesMap = new Map();
        previousState.rules.forEach(rule => {
            previousRulesMap.set(rule.fullName, rule);
        });

        const currentRulesMap = new Map();
        currentRules.forEach(rule => {
            currentRulesMap.set(rule.fullName, rule);
        });

        // Detect new and modified rules
        for (const currentRule of currentRules) {
            const previousRule = previousRulesMap.get(currentRule.fullName);
            
            if (!previousRule) {
                // New rule
                changes.new.push({
                    rule: currentRule,
                    changeType: 'new',
                    detected: new Date().toISOString()
                });
                changes.summary.newRules++;
            } else if (previousRule.contentHash !== currentRule.contentHash) {
                // Modified rule
                changes.modified.push({
                    rule: currentRule,
                    previousRule: previousRule,
                    changeType: 'modified',
                    detected: new Date().toISOString(),
                    changes: this.detectSpecificChanges(previousRule, currentRule)
                });
                changes.summary.modifiedRules++;
            }
        }

        // Detect deleted rules
        for (const previousRule of previousState.rules) {
            if (!currentRulesMap.has(previousRule.fullName)) {
                changes.deleted.push({
                    rule: previousRule,
                    changeType: 'deleted',
                    detected: new Date().toISOString()
                });
                changes.summary.deletedRules++;
            }
        }

        changes.summary.totalChanges = changes.summary.newRules + changes.summary.modifiedRules + changes.summary.deletedRules;

        // Analyze risk level of changes
        const allChanges = [...changes.new, ...changes.modified];
        for (const change of allChanges) {
            const riskAnalysis = await this.analyzeValidationRuleRisks(change.rule);
            change.riskAnalysis = riskAnalysis;
            
            if (riskAnalysis.riskCategory === 'HIGH' || riskAnalysis.riskCategory === 'CRITICAL') {
                changes.summary.highRiskChanges++;
            }
        }

        await this.log(`Change detection complete: ${changes.summary.totalChanges} total changes (${changes.summary.newRules} new, ${changes.summary.modifiedRules} modified, ${changes.summary.deletedRules} deleted)`);
        
        return changes;
    }

    detectSpecificChanges(previousRule, currentRule) {
        const changes = [];
        
        if (previousRule.validationFormula !== currentRule.validationFormula) {
            changes.push({
                field: 'validationFormula',
                type: 'formula_changed',
                description: 'Validation formula was modified',
                impact: 'HIGH'
            });
        }

        if (previousRule.errorMessage !== currentRule.errorMessage) {
            changes.push({
                field: 'errorMessage',
                type: 'error_message_changed',
                description: 'Error message was modified',
                impact: 'LOW'
            });
        }

        if (previousRule.active !== currentRule.active) {
            changes.push({
                field: 'active',
                type: 'activation_changed',
                description: currentRule.active ? 'Rule was activated' : 'Rule was deactivated',
                impact: 'HIGH'
            });
        }

        return changes;
    }

    async generateChangeReport(changes) {
        const reportData = {
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            summary: changes.summary,
            changes: changes,
            generatedBy: 'ValidationRuleMonitor'
        };

        // Generate JSON report
        const jsonReportPath = path.join(this.reportDir, `validation-changes-${this.timestamp}.json`);
        await fs.writeFile(jsonReportPath, JSON.stringify(reportData, null, 2));

        // Generate HTML report
        const htmlReportPath = path.join(this.reportDir, `validation-changes-${this.timestamp}.html`);
        const htmlContent = await this.generateHtmlReport(reportData);
        await fs.writeFile(htmlReportPath, htmlContent);

        // Generate CSV for analysis
        const csvReportPath = path.join(this.reportDir, `validation-changes-${this.timestamp}.csv`);
        const csvContent = await this.generateCsvReport(reportData);
        await fs.writeFile(csvReportPath, csvContent);

        await this.log(`Change reports generated: ${jsonReportPath}, ${htmlReportPath}, ${csvReportPath}`);

        return {
            json: jsonReportPath,
            html: htmlReportPath,
            csv: csvReportPath,
            data: reportData
        };
    }

    async generateHtmlReport(reportData) {
        const { summary, changes } = reportData;
        const allChanges = [...changes.new, ...changes.modified, ...changes.deleted];
        const highRiskChanges = allChanges.filter(c => c.riskAnalysis?.riskCategory === 'HIGH' || c.riskAnalysis?.riskCategory === 'CRITICAL');
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Validation Rule Changes Report - ${this.timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .stat-card.changes { border-left-color: #ffc107; }
        .stat-card.high-risk { border-left-color: #dc3545; }
        .stat-value { font-size: 2em; font-weight: bold; color: #333; }
        .stat-label { color: #666; margin-top: 5px; }
        .change-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .change-table th, .change-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .change-table th { background-color: #f8f9fa; font-weight: bold; }
        .change-new { color: #28a745; font-weight: bold; }
        .change-modified { color: #ffc107; font-weight: bold; }
        .change-deleted { color: #dc3545; font-weight: bold; }
        .risk-critical { color: #dc3545; font-weight: bold; }
        .risk-high { color: #fd7e14; font-weight: bold; }
        .risk-medium { color: #ffc107; font-weight: bold; }
        .risk-low { color: #28a745; font-weight: bold; }
        .risks-details { background: #fff3cd; padding: 10px; border-radius: 5px; margin-top: 5px; }
        .risks-details ul { margin: 5px 0; padding-left: 20px; }
        .alert-section { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .no-changes { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; text-align: center; }
        .formula-display { background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 0.9em; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Validation Rule Changes Report</h1>
            <p><strong>Organization:</strong> ${reportData.orgAlias}</p>
            <p><strong>Generated:</strong> ${new Date(reportData.timestamp).toLocaleString()}</p>
            <p><strong>Report Date:</strong> ${this.timestamp}</p>
        </div>

        <div class="summary">
            <div class="stat-card changes">
                <div class="stat-value">${summary.totalChanges}</div>
                <div class="stat-label">Total Changes</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.newRules}</div>
                <div class="stat-label">New Rules</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.modifiedRules}</div>
                <div class="stat-label">Modified Rules</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.deletedRules}</div>
                <div class="stat-label">Deleted Rules</div>
            </div>
            <div class="stat-card high-risk">
                <div class="stat-value">${summary.highRiskChanges}</div>
                <div class="stat-label">High Risk Changes</div>
            </div>
        </div>

        ${summary.totalChanges > 0 ? `
            ${highRiskChanges.length > 0 ? `
            <div class="alert-section">
                <h2>⚠️ High Risk Changes Detected</h2>
                <p>${highRiskChanges.length} validation rule changes have been identified as high risk and may affect deployments or system behavior.</p>
            </div>
            ` : ''}

            <h2>Validation Rule Changes</h2>
            <table class="change-table">
                <thead>
                    <tr>
                        <th>Object</th>
                        <th>Rule Name</th>
                        <th>Change Type</th>
                        <th>Risk Level</th>
                        <th>Modified Date</th>
                        <th>Modified By</th>
                        <th>Risk Factors</th>
                    </tr>
                </thead>
                <tbody>
                    ${allChanges.map(change => {
                        const riskLevel = change.riskAnalysis ? change.riskAnalysis.riskCategory : 'LOW';
                        return `
                        <tr>
                            <td><strong>${change.rule.objectLabel || change.rule.objectApiName}</strong><br><small>${change.rule.objectApiName}</small></td>
                            <td><strong>${change.rule.validationName}</strong><br><small>${change.rule.fullName}</small></td>
                            <td><span class="change-${change.changeType}">${change.changeType.toUpperCase()}</span></td>
                            <td><span class="risk-${riskLevel.toLowerCase()}">${riskLevel}</span></td>
                            <td>${change.rule.lastModifiedDate ? new Date(change.rule.lastModifiedDate).toLocaleDateString() : 'N/A'}</td>
                            <td>${change.rule.lastModifiedBy || 'N/A'}</td>
                            <td>
                                ${change.riskAnalysis && change.riskAnalysis.risks.length > 0 ? `
                                <div class="risks-details">
                                    <strong>Risk Factors:</strong>
                                    <ul>
                                        ${change.riskAnalysis.risks.map(risk => `<li>${risk.description}</li>`).join('')}
                                    </ul>
                                    ${change.rule.validationFormula ? `<div class="formula-display">${change.rule.validationFormula}</div>` : ''}
                                </div>
                                ` : 'No significant risks detected'}
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        ` : `
        <div class="no-changes">
            <h2>✅ No Validation Rule Changes Detected</h2>
            <p>No changes to validation rules since the last monitoring cycle.</p>
        </div>
        `}

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666;">
            <p>Generated by Validation Rule Monitor on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
    }

    async generateCsvReport(reportData) {
        const headers = [
            'Object API Name',
            'Object Label', 
            'Rule Name',
            'Rule Full Name',
            'Change Type',
            'Risk Level',
            'Total Risk Score',
            'Last Modified',
            'Modified By',
            'Risk Factors',
            'Recommendations',
            'Validation Formula'
        ];

        const allChanges = [...reportData.changes.new, ...reportData.changes.modified, ...reportData.changes.deleted];
        
        const rows = allChanges.map(change => {
            const riskLevel = change.riskAnalysis ? change.riskAnalysis.riskCategory : 'LOW';
            const riskScore = change.riskAnalysis ? change.riskAnalysis.totalRiskScore : 0;
            const riskFactors = change.riskAnalysis ? change.riskAnalysis.risks.map(r => r.description).join('; ') : '';
            const recommendations = change.riskAnalysis ? change.riskAnalysis.risks.map(r => r.recommendation).join('; ') : '';
            
            return [
                change.rule.objectApiName || '',
                change.rule.objectLabel || '',
                change.rule.validationName || '',
                change.rule.fullName || '',
                change.changeType || '',
                riskLevel,
                riskScore,
                change.rule.lastModifiedDate || '',
                change.rule.lastModifiedBy || '',
                riskFactors,
                recommendations,
                change.rule.validationFormula || ''
            ];
        });

        return [headers, ...rows].map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }

    async sendEmailAlert(reportData, reportPaths) {
        if (this.emailRecipients.length === 0) {
            await this.log('No email recipients configured, skipping email alert');
            return;
        }

        const { summary, changes } = reportData;
        
        if (summary.totalChanges === 0) {
            await this.log('No changes detected, skipping email alert');
            return;
        }

        const allChanges = [...changes.new, ...changes.modified, ...changes.deleted];
        const highRiskChanges = allChanges.filter(c => c.riskAnalysis?.riskCategory === 'HIGH' || c.riskAnalysis?.riskCategory === 'CRITICAL');

        try {
            const subject = `🚨 Validation Rule Changes Detected - ${summary.totalChanges} Changes (${highRiskChanges.length} High Risk)`;
            const body = `
Validation Rule Change Alert - ${reportData.orgAlias}

CHANGE SUMMARY:
==============
Total Changes: ${summary.totalChanges}
New Rules: ${summary.newRules}
Modified Rules: ${summary.modifiedRules}
Deleted Rules: ${summary.deletedRules}
High Risk Changes: ${summary.highRiskChanges}

${highRiskChanges.length > 0 ? `
HIGH RISK CHANGES REQUIRING ATTENTION:
=====================================
${highRiskChanges.map(change => `
• ${change.rule.objectApiName}.${change.rule.validationName} (${change.changeType.toUpperCase()})
  Risk Level: ${change.riskAnalysis.riskCategory}
  Risk Factors: ${change.riskAnalysis.risks.map(r => r.description).join(', ')}
  Recommendations: ${change.riskAnalysis.risks.map(r => r.recommendation).join(', ')}
`).join('')}
` : ''}

DEPLOYMENT IMPACT ANALYSIS:
===========================
${allChanges.filter(c => c.riskAnalysis?.risks.some(r => r.type.startsWith('deployment_'))).length > 0 ? 
`⚠️ ${allChanges.filter(c => c.riskAnalysis?.risks.some(r => r.type.startsWith('deployment_'))).length} rules may cause deployment issues` :
'✅ No obvious deployment conflicts detected'}

PRIORVALUE PATTERN DETECTION:
=============================
${allChanges.filter(c => c.riskAnalysis?.risks.some(r => r.type === 'priorValue')).length > 0 ?
`⚠️ ${allChanges.filter(c => c.riskAnalysis?.risks.some(r => r.type === 'priorValue')).length} rules use PRIORVALUE patterns that may affect flows` :
'✅ No PRIORVALUE patterns detected'}

IMMEDIATE ACTIONS REQUIRED:
==========================
${highRiskChanges.length > 0 ? `
1. Review high-risk validation rule changes immediately
2. Test impact on existing automation and flows
3. Verify deployment compatibility
4. Update test scenarios to cover new validation logic
5. Communicate changes to affected teams
` : `
1. Review validation rule changes for business impact
2. Update documentation as needed
3. Verify test coverage includes new validation scenarios
`}

REPORTS GENERATED:
==================
- HTML Report: ${path.basename(reportPaths.html)}
- CSV Data: ${path.basename(reportPaths.csv)}
- JSON Data: ${path.basename(reportPaths.json)}

Generated: ${new Date().toLocaleString()}
System: ValidationRuleMonitor
            `;

            const recipients = this.emailRecipients.length > 0
                ? this.emailRecipients
                : null;
            const attachments = [reportPaths.html, reportPaths.csv];

            const sent = await monitoringUtils.sendEmailAlert(
                subject,
                body,
                recipients,
                attachments
            );

            if (sent) {
                await this.log(`Email alert sent for ${summary.totalChanges} changes (${highRiskChanges.length} high risk)`);
            } else {
                await this.log('Email alert failed to send', 'warn');
            }
            
        } catch (error) {
            await this.log(`Failed to send email alert: ${error.message}`, 'error');
        }
    }

    async runMonitoring() {
        try {
            await this.log('Starting Validation Rule Change Monitoring...');
            await this.ensureDirectories();
            
            // Validate connection
            const orgInfo = await this.validateSfConnection();
            
            // Retrieve current validation rules
            const currentRules = await this.retrieveValidationRules();
            
            if (this.createBaseline) {
                await this.log('Creating baseline state...');
                await this.savePreviousState(currentRules);
                await this.log('✅ Baseline created successfully');
                return;
            }

            // Load previous state
            const previousState = await this.loadPreviousState();
            
            // Detect changes
            const changes = await this.detectChanges(currentRules, previousState);
            
            // Generate reports
            const reportPaths = await this.generateChangeReport(changes);
            
            // Save current state for next run
            await this.savePreviousState(currentRules);
            
            // Send email alerts if changes detected
            await this.sendEmailAlert(reportPaths.data, reportPaths);
            
            // Log summary
            const { summary } = changes;
            await this.log(`Monitoring completed. ${summary.totalChanges} changes detected (${summary.highRiskChanges} high risk)`);
            
            if (summary.highRiskChanges > 0) {
                await this.log('⚠️ High risk validation rule changes detected - review required!', 'warn');
                process.exit(1); // Exit with error code for cron monitoring
            } else if (summary.totalChanges > 0) {
                await this.log('ℹ️ Validation rule changes detected - review recommended', 'info');
                process.exit(0);
            } else {
                await this.log('✅ No validation rule changes detected');
                process.exit(0);
            }

        } catch (error) {
            await this.log(`Monitoring failed: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

// CLI execution
async function main() {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i]?.replace(/^--/, '');
        const value = args[i + 1];
        if (key && value !== undefined && !key.match(/^(baseline|silent)$/)) {
            options[key] = value;
        } else if (key === 'baseline' || key === 'silent') {
            options[key] = true;
            i -= 1; // Adjust for flag without value
        }
    }

    if (!options.org) {
        console.error('Usage: node validation-rule-monitor.js --org <alias> [--email alerts@company.com] [--baseline] [--silent]');
        console.error('');
        console.error('Options:');
        console.error('  --org <alias>           Salesforce org alias (required)');
        console.error('  --email <addresses>     Email addresses for alerts (comma-separated)');
        console.error('  --baseline              Create baseline state file (first run)');
        console.error('  --silent                Suppress console output');
        console.error('');
        console.error('Examples:');
        console.error('  # Create baseline (first run)');
        console.error('  node validation-rule-monitor.js --org production --baseline');
        console.error('');
        console.error('  # Daily monitoring with alerts');
        console.error('  node validation-rule-monitor.js --org production --email devteam@company.com');
        console.error('');
        console.error('Cron Example:');
        console.error('  0 6 * * * cd /path/to/project && node scripts/monitoring/validation-rule-monitor.js --org production --email devteam@company.com');
        process.exit(1);
    }

    const monitor = new ValidationRuleMonitor(options.org, {
        email: options.email,
        baseline: options.baseline,
        silent: options.silent
    });

    await monitor.runMonitoring();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = ValidationRuleMonitor;
