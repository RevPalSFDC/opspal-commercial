#!/usr/bin/env node

/**
 * Daily Flow Complexity Audit Script
 * 
 * Monitors all flows in Salesforce org and identifies flows with complexity score ≥ 7
 * Generates daily reports and email alerts for high complexity flows
 * 
 * Usage:
 *   node flow-complexity-audit.js --org <alias> [--threshold 7] [--email alerts@company.com] [--silent]
 * 
 * Cron Example:
 *   0 2 * * * cd /path/to/project && node scripts/monitoring/flow-complexity-audit.js --org production --email devteam@company.com
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { monitoringUtils } = require('./monitoring-utils');
const execAsync = promisify(exec);

class FlowComplexityAuditor {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.threshold = options.threshold || 7;
        this.emailRecipients = options.email ? options.email.split(',') : [];
        this.silent = options.silent || false;
        this.reportDir = path.join(__dirname, '../../reports/daily-complexity');
        this.timestamp = new Date().toISOString().split('T')[0];
        
        this.complexityWeights = {
            // Flow elements complexity scoring
            decisions: 2,           // Decision elements
            loops: 3,              // Loop elements  
            subflows: 2,           // Subflow calls
            actions: 1,            // Action elements
            assignments: 1,        // Variable assignments
            screens: 2,            // Screen elements
            waits: 2,              // Wait elements
            branches: 1,           // Branch paths
            
            // Advanced complexity factors
            recordLookups: 2,      // Record lookups
            recordUpdates: 1,      // Record updates
            recordCreates: 1,      // Record creates
            recordDeletes: 2,      // Record deletes
            emailAlerts: 1,        // Email alerts
            approvals: 3,          // Approval processes
            customApex: 4,         // Custom Apex invocations
            collections: 2,        // Collection operations
            formulas: 1,           // Formula expressions
            
            // Risk multipliers
            triggerMultiplier: 1.5,     // Record-triggered flows
            scheduledMultiplier: 1.2,   // Scheduled flows
            bulkMultiplier: 2.0,        // Bulk operations
        };

        this.riskCategories = {
            LOW: { min: 0, max: 6, color: 'green' },
            MEDIUM: { min: 7, max: 12, color: 'yellow' },
            HIGH: { min: 13, max: 20, color: 'orange' },
            CRITICAL: { min: 21, max: 999, color: 'red' }
        };
    }

    async log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (!this.silent) {
            console.log(logMessage);
        }
        
        // Append to log file
        const logFile = path.join(this.reportDir, `audit-${this.timestamp}.log`);
        await fs.appendFile(logFile, logMessage + '\n');
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

    async retrieveFlowMetadata() {
        try {
            await this.log('Retrieving flow metadata...');
            
            // Query for all active flows
            const soqlQuery = `
                SELECT Id, DurableId, ApiName, Label, Description, TriggerType, 
                       ProcessType, IsActive, LastModifiedDate, CreatedDate
                FROM FlowDefinition 
                WHERE IsActive = true
                ORDER BY LastModifiedDate DESC
            `;

            const { stdout } = await execAsync(`sf data query --query "${soqlQuery}" --target-org ${this.orgAlias} --json`);
            const queryResult = JSON.parse(stdout);
            
            if (!queryResult.result || !queryResult.result.records) {
                throw new Error('No flow data retrieved');
            }

            await this.log(`Found ${queryResult.result.records.length} active flows`);
            return queryResult.result.records;
        } catch (error) {
            await this.log(`Failed to retrieve flow metadata: ${error.message}`, 'error');
            throw error;
        }
    }

    async getFlowDefinition(flowApiName) {
        try {
            // Use Tooling API to get flow definition with detailed metadata
            const soqlQuery = `
                SELECT Id, Description, ProcessType, TriggerType, Metadata
                FROM Flow WHERE Definition.DeveloperName = '${flowApiName}'
            `;

            const { stdout } = await execAsync(`sf data query --query "${soqlQuery}" --use-tooling-api --target-org ${this.orgAlias} --json`);
            const result = JSON.parse(stdout);
            
            if (result.result && result.result.records && result.result.records.length > 0) {
                return result.result.records[0];
            }
            
            return null;
        } catch (error) {
            await this.log(`Warning: Could not retrieve detailed definition for flow ${flowApiName}: ${error.message}`, 'warn');
            return null;
        }
    }

    async calculateFlowComplexity(flowRecord, flowDefinition = null) {
        let complexity = {
            baseScore: 0,
            riskMultiplier: 1.0,
            finalScore: 0,
            breakdown: {},
            riskFactors: [],
            recommendations: []
        };

        try {
            // Base complexity from flow type
            if (flowRecord.ProcessType === 'AutoLaunchedFlow') {
                complexity.baseScore += 2;
                complexity.breakdown.autoLaunched = 2;
            }
            
            if (flowRecord.TriggerType === 'RecordAfterSave' || flowRecord.TriggerType === 'RecordBeforeSave') {
                complexity.riskMultiplier *= this.complexityWeights.triggerMultiplier;
                complexity.riskFactors.push('Record-triggered flow');
            }

            if (flowRecord.TriggerType === 'Scheduled') {
                complexity.riskMultiplier *= this.complexityWeights.scheduledMultiplier;
                complexity.riskFactors.push('Scheduled flow');
            }

            // If we have detailed flow definition, analyze elements
            if (flowDefinition && flowDefinition.Metadata) {
                const metadata = flowDefinition.Metadata;
                
                // Count different element types (simulated - would need actual metadata parsing)
                // This is a simplified version - in reality, you'd parse the flow XML metadata
                const elementCounts = this.estimateElementCounts(flowRecord, metadata);
                
                // Calculate element complexity
                for (const [elementType, count] of Object.entries(elementCounts)) {
                    const weight = this.complexityWeights[elementType] || 1;
                    const elementComplexity = count * weight;
                    complexity.baseScore += elementComplexity;
                    complexity.breakdown[elementType] = elementComplexity;
                }

                // Check for specific risk patterns
                if (elementCounts.loops > 2) {
                    complexity.riskMultiplier *= 1.3;
                    complexity.riskFactors.push('Multiple nested loops detected');
                }

                if (elementCounts.customApex > 0) {
                    complexity.riskMultiplier *= 1.4;
                    complexity.riskFactors.push('Custom Apex integration');
                }
            } else {
                // Estimate complexity based on available metadata
                complexity.baseScore += this.estimateComplexityFromBasicMetadata(flowRecord);
                complexity.breakdown.estimated = true;
            }

            // Calculate final score
            complexity.finalScore = Math.round(complexity.baseScore * complexity.riskMultiplier);

            // Generate recommendations
            complexity.recommendations = this.generateComplexityRecommendations(complexity, flowRecord);

            return complexity;
        } catch (error) {
            await this.log(`Error calculating complexity for ${flowRecord.ApiName}: ${error.message}`, 'error');
            return {
                baseScore: 0,
                riskMultiplier: 1.0,
                finalScore: 999,
                breakdown: { error: true },
                riskFactors: ['Error calculating complexity'],
                recommendations: ['Manual review required']
            };
        }
    }

    estimateElementCounts(flowRecord, metadata) {
        // This is a simplified estimation - in a real implementation,
        // you would parse the actual flow XML metadata
        const baseElements = {
            decisions: 0,
            loops: 0,
            subflows: 0,
            actions: 1,
            assignments: 1,
            screens: 0,
            waits: 0,
            branches: 2,
            recordLookups: 1,
            recordUpdates: 0,
            recordCreates: 0,
            recordDeletes: 0,
            emailAlerts: 0,
            approvals: 0,
            customApex: 0,
            collections: 0,
            formulas: 0
        };

        // Estimate based on flow characteristics
        if (flowRecord.ProcessType === 'Workflow') {
            baseElements.actions = 2;
            baseElements.emailAlerts = 1;
        }

        if (flowRecord.TriggerType === 'RecordAfterSave') {
            baseElements.recordUpdates = 1;
            baseElements.recordLookups = 2;
        }

        // Add some realistic variance
        if (flowRecord.Description && flowRecord.Description.toLowerCase().includes('approval')) {
            baseElements.approvals = 1;
            baseElements.decisions = 2;
        }

        return baseElements;
    }

    estimateComplexityFromBasicMetadata(flowRecord) {
        let score = 3; // Base score

        // Add complexity based on flow characteristics
        if (flowRecord.Description) {
            const desc = flowRecord.Description.toLowerCase();
            if (desc.includes('loop') || desc.includes('iterate')) score += 6;
            if (desc.includes('decision') || desc.includes('condition')) score += 4;
            if (desc.includes('approval')) score += 6;
            if (desc.includes('email') || desc.includes('alert')) score += 2;
            if (desc.includes('create') || desc.includes('update')) score += 3;
        }

        return score;
    }

    generateComplexityRecommendations(complexity, flowRecord) {
        const recommendations = [];

        if (complexity.finalScore >= 15) {
            recommendations.push('Consider breaking this flow into smaller, focused flows');
            recommendations.push('Review for potential conversion to Apex for better maintainability');
        }

        if (complexity.riskFactors.includes('Multiple nested loops detected')) {
            recommendations.push('Optimize loop structures to prevent governor limit issues');
        }

        if (complexity.riskFactors.includes('Record-triggered flow')) {
            recommendations.push('Ensure bulkification for record-triggered operations');
            recommendations.push('Consider consolidation with other flows on the same object');
        }

        if (complexity.breakdown.customApex > 0) {
            recommendations.push('Review Apex integration for error handling and bulk processing');
        }

        return recommendations;
    }

    getRiskCategory(score) {
        for (const [category, range] of Object.entries(this.riskCategories)) {
            if (score >= range.min && score <= range.max) {
                return { category, ...range };
            }
        }
        return this.riskCategories.CRITICAL;
    }

    async generateReport(auditResults) {
        const reportData = {
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            threshold: this.threshold,
            summary: {
                totalFlows: auditResults.length,
                highComplexityFlows: auditResults.filter(r => r.complexity.finalScore >= this.threshold).length,
                criticalFlows: auditResults.filter(r => r.complexity.finalScore >= 21).length,
                averageComplexity: Math.round(auditResults.reduce((sum, r) => sum + r.complexity.finalScore, 0) / auditResults.length)
            },
            flows: auditResults
        };

        // Generate JSON report
        const jsonReportPath = path.join(this.reportDir, `complexity-audit-${this.timestamp}.json`);
        await fs.writeFile(jsonReportPath, JSON.stringify(reportData, null, 2));

        // Generate HTML report
        const htmlReportPath = path.join(this.reportDir, `complexity-audit-${this.timestamp}.html`);
        const htmlContent = await this.generateHtmlReport(reportData);
        await fs.writeFile(htmlReportPath, htmlContent);

        // Generate CSV for analysis
        const csvReportPath = path.join(this.reportDir, `complexity-audit-${this.timestamp}.csv`);
        const csvContent = await this.generateCsvReport(reportData);
        await fs.writeFile(csvReportPath, csvContent);

        await this.log(`Reports generated: ${jsonReportPath}, ${htmlReportPath}, ${csvReportPath}`);

        return {
            json: jsonReportPath,
            html: htmlReportPath,
            csv: csvReportPath,
            data: reportData
        };
    }

    async generateHtmlReport(reportData) {
        const highComplexityFlows = reportData.flows.filter(f => f.complexity.finalScore >= this.threshold);
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flow Complexity Audit Report - ${this.timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .stat-value { font-size: 2em; font-weight: bold; color: #333; }
        .stat-label { color: #666; margin-top: 5px; }
        .flow-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .flow-table th, .flow-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .flow-table th { background-color: #f8f9fa; font-weight: bold; }
        .risk-low { color: #28a745; font-weight: bold; }
        .risk-medium { color: #ffc107; font-weight: bold; }
        .risk-high { color: #fd7e14; font-weight: bold; }
        .risk-critical { color: #dc3545; font-weight: bold; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 10px; }
        .recommendations ul { margin: 10px 0; padding-left: 20px; }
        .alert-section { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .no-issues { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Flow Complexity Audit Report</h1>
            <p><strong>Organization:</strong> ${reportData.orgAlias}</p>
            <p><strong>Generated:</strong> ${new Date(reportData.timestamp).toLocaleString()}</p>
            <p><strong>Complexity Threshold:</strong> ${reportData.threshold}</p>
        </div>

        <div class="summary">
            <div class="stat-card">
                <div class="stat-value">${reportData.summary.totalFlows}</div>
                <div class="stat-label">Total Active Flows</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${reportData.summary.highComplexityFlows}</div>
                <div class="stat-label">High Complexity (≥${this.threshold})</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${reportData.summary.criticalFlows}</div>
                <div class="stat-label">Critical Risk (≥21)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${reportData.summary.averageComplexity}</div>
                <div class="stat-label">Average Complexity</div>
            </div>
        </div>

        ${highComplexityFlows.length > 0 ? `
        <div class="alert-section">
            <h2>⚠️ High Complexity Flows Detected</h2>
            <p>${highComplexityFlows.length} flows exceed the complexity threshold of ${this.threshold}. These flows may require review and potential refactoring.</p>
        </div>
        ` : `
        <div class="no-issues">
            <h2>✅ No High Complexity Flows Detected</h2>
            <p>All flows are within acceptable complexity limits.</p>
        </div>
        `}

        <h2>Flow Analysis Results</h2>
        <table class="flow-table">
            <thead>
                <tr>
                    <th>Flow Name</th>
                    <th>Trigger Type</th>
                    <th>Complexity Score</th>
                    <th>Risk Level</th>
                    <th>Last Modified</th>
                    <th>Actions Required</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.flows
                    .sort((a, b) => b.complexity.finalScore - a.complexity.finalScore)
                    .map(flow => {
                        const risk = this.getRiskCategory(flow.complexity.finalScore);
                        return `
                        <tr>
                            <td><strong>${flow.Label || flow.ApiName}</strong><br><small>${flow.ApiName}</small></td>
                            <td>${flow.TriggerType || 'N/A'}</td>
                            <td><span class="stat-value" style="font-size: 1.2em;">${flow.complexity.finalScore}</span></td>
                            <td><span class="risk-${risk.category.toLowerCase()}">${risk.category}</span></td>
                            <td>${new Date(flow.LastModifiedDate).toLocaleDateString()}</td>
                            <td>
                                ${flow.complexity.finalScore >= this.threshold ? `
                                <div class="recommendations">
                                    <strong>Recommendations:</strong>
                                    <ul>
                                        ${flow.complexity.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                                    </ul>
                                </div>
                                ` : '<span class="risk-low">No action required</span>'}
                            </td>
                        </tr>
                        `;
                    }).join('')}
            </tbody>
        </table>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666;">
            <p>Generated by Salesforce Flow Complexity Auditor on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
    }

    async generateCsvReport(reportData) {
        const headers = [
            'Flow API Name',
            'Flow Label',
            'Trigger Type',
            'Process Type',
            'Complexity Score',
            'Risk Category',
            'Last Modified',
            'Risk Factors',
            'Recommendations'
        ];

        const rows = reportData.flows.map(flow => {
            const risk = this.getRiskCategory(flow.complexity.finalScore);
            return [
                flow.ApiName,
                flow.Label || '',
                flow.TriggerType || '',
                flow.ProcessType || '',
                flow.complexity.finalScore,
                risk.category,
                flow.LastModifiedDate,
                flow.complexity.riskFactors.join('; '),
                flow.complexity.recommendations.join('; ')
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

        const highComplexityFlows = reportData.flows.filter(f => f.complexity.finalScore >= this.threshold);
        
        if (highComplexityFlows.length === 0) {
            await this.log('No high complexity flows found, skipping email alert');
            return;
        }

        try {
            const subject = `🚨 Flow Complexity Alert - ${highComplexityFlows.length} High Complexity Flows Detected`;
            const body = `
Flow Complexity Audit Alert - ${reportData.orgAlias}

SUMMARY:
- Total Flows Analyzed: ${reportData.summary.totalFlows}
- High Complexity Flows (≥${this.threshold}): ${reportData.summary.highComplexityFlows}
- Critical Risk Flows (≥21): ${reportData.summary.criticalFlows}
- Average Complexity Score: ${reportData.summary.averageComplexity}

HIGH COMPLEXITY FLOWS REQUIRING ATTENTION:
${highComplexityFlows.map(flow => `
• ${flow.Label || flow.ApiName} (${flow.ApiName})
  - Complexity Score: ${flow.complexity.finalScore}
  - Risk Level: ${this.getRiskCategory(flow.complexity.finalScore).category}
  - Trigger Type: ${flow.TriggerType || 'N/A'}
  - Recommendations: ${flow.complexity.recommendations.join(', ')}
`).join('')}

NEXT STEPS:
1. Review the attached HTML report for detailed analysis
2. Consider refactoring high complexity flows
3. Evaluate consolidation opportunities
4. Schedule code review for critical risk flows

Reports Generated:
- HTML Report: ${path.basename(reportPaths.html)}
- CSV Data: ${path.basename(reportPaths.csv)}
- JSON Data: ${path.basename(reportPaths.json)}

Generated: ${new Date().toLocaleString()}
Threshold: ${this.threshold}
                `;
            const attachments = [reportPaths.html, reportPaths.csv];

            const recipients = this.emailRecipients.length > 0
                ? this.emailRecipients
                : null;

            const sent = await monitoringUtils.sendEmailAlert(
                subject,
                body,
                recipients,
                attachments
            );

            if (sent) {
                await this.log(`Email alert sent for ${highComplexityFlows.length} high complexity flows`);
            } else {
                await this.log('Email alert failed to send', 'warn');
            }
            
        } catch (error) {
            await this.log(`Failed to send email alert: ${error.message}`, 'error');
        }
    }

    async runAudit() {
        try {
            await this.log('Starting Flow Complexity Audit...');
            
            // Validate connection
            const orgInfo = await this.validateSfConnection();
            
            // Retrieve flows
            const flows = await this.retrieveFlowMetadata();
            
            if (flows.length === 0) {
                await this.log('No active flows found in the organization');
                return;
            }

            // Analyze each flow
            const auditResults = [];
            for (const flow of flows) {
                await this.log(`Analyzing flow: ${flow.ApiName}`);
                
                // Get detailed flow definition if available
                const flowDefinition = await this.getFlowDefinition(flow.ApiName);
                
                // Calculate complexity
                const complexity = await this.calculateFlowComplexity(flow, flowDefinition);
                
                auditResults.push({
                    ...flow,
                    complexity
                });
            }

            // Generate reports
            const reportPaths = await this.generateReport(auditResults);
            
            // Send email alerts if configured
            await this.sendEmailAlert(reportPaths.data, reportPaths);
            
            // Log summary
            const highComplexityCount = auditResults.filter(r => r.complexity.finalScore >= this.threshold).length;
            await this.log(`Audit completed. ${highComplexityCount} of ${auditResults.length} flows exceed complexity threshold of ${this.threshold}`);
            
            if (highComplexityCount > 0) {
                await this.log('⚠️ High complexity flows detected - review required!', 'warn');
                process.exit(1); // Exit with error code for cron monitoring
            } else {
                await this.log('✅ All flows within acceptable complexity limits');
                process.exit(0);
            }

        } catch (error) {
            await this.log(`Audit failed: ${error.message}`, 'error');
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
        if (key && value !== undefined) {
            options[key] = value;
        } else if (key === 'silent') {
            options.silent = true;
            i -= 1; // Adjust for flag without value
        }
    }

    if (!options.org) {
        console.error('Usage: node flow-complexity-audit.js --org <alias> [--threshold 7] [--email alerts@company.com] [--silent]');
        console.error('');
        console.error('Options:');
        console.error('  --org <alias>           Salesforce org alias (required)');
        console.error('  --threshold <number>    Complexity threshold for alerts (default: 7)');
        console.error('  --email <addresses>     Email addresses for alerts (comma-separated)');
        console.error('  --silent                Suppress console output');
        console.error('');
        console.error('Cron Example:');
        console.error('  0 2 * * * cd /path/to/project && node scripts/monitoring/flow-complexity-audit.js --org production --email devteam@company.com');
        process.exit(1);
    }

    const auditor = new FlowComplexityAuditor(options.org, {
        threshold: parseInt(options.threshold) || 7,
        email: options.email,
        silent: options.silent
    });

    await auditor.runAudit();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = FlowComplexityAuditor;
