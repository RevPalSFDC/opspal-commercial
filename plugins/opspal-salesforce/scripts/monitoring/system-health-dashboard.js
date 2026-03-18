#!/usr/bin/env node

/**
 * System Health Dashboard Script
 * 
 * Aggregates all monitoring data from:
 * - Flow complexity audits
 * - Flow consolidation checks
 * - Validation rule changes
 * - Query performance metrics
 * 
 * Generates comprehensive HTML dashboard with:
 * - Trend analysis over time
 * - Error rate metrics
 * - System health scoring
 * - Actionable insights and alerts
 * 
 * Usage:
 *   node system-health-dashboard.js --org <alias> [--days 30] [--output-dir /path/to/output] [--serve] [--port 3000]
 * 
 * Cron Example:
 *   0 0-23/4 * * * cd /path/to/project && node scripts/monitoring/system-health-dashboard.js --org production --days 7
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const execAsync = promisify(exec);

class SystemHealthDashboard {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.lookbackDays = options.days || 30;
        this.outputDir = options.outputDir || path.join(__dirname, '../../reports/system-health');
        this.serveWebsite = options.serve || false;
        this.webPort = options.port || 3000;
        this.silent = options.silent || false;
        this.timestamp = new Date().toISOString().split('T')[0];
        
        this.reportDirs = {
            complexityReports: path.join(__dirname, '../../reports/daily-complexity'),
            consolidationReports: path.join(__dirname, '../../reports/weekly-consolidation'),
            validationReports: path.join(__dirname, '../../reports/validation-changes'),
            queryReports: path.join(__dirname, '../../reports/query-performance')
        };

        this.healthThresholds = {
            flowComplexity: {
                excellent: { max: 5, score: 100 },
                good: { max: 10, score: 80 },
                fair: { max: 15, score: 60 },
                poor: { max: 999, score: 40 }
            },
            consolidationCompliance: {
                excellent: { min: 95, score: 100 },
                good: { min: 85, score: 80 },
                fair: { min: 70, score: 60 },
                poor: { min: 0, score: 40 }
            },
            validationRuleChanges: {
                excellent: { max: 2, score: 100 },
                good: { max: 5, score: 80 },
                fair: { max: 10, score: 60 },
                poor: { max: 999, score: 40 }
            },
            queryPerformance: {
                excellent: { min: 95, score: 100 },
                good: { min: 85, score: 80 },
                fair: { min: 70, score: 60 },
                poor: { min: 0, score: 40 }
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
        const logFile = path.join(this.outputDir, `dashboard-${this.timestamp}.log`);
        await fs.appendFile(logFile, logMessage + '\n');
    }

    async ensureDirectories() {
        await fs.mkdir(this.outputDir, { recursive: true });
        
        // Ensure report directories exist
        for (const reportDir of Object.values(this.reportDirs)) {
            await fs.mkdir(reportDir, { recursive: true });
        }
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

    async getRecentFiles(directory, pattern, maxAge) {
        try {
            const files = await fs.readdir(directory);
            const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
            
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

    async aggregateFlowComplexityData() {
        await this.log('Aggregating flow complexity data...');
        
        const complexityFiles = await this.getRecentFiles(
            this.reportDirs.complexityReports, 
            /complexity-audit-\d{4}-\d{2}-\d{2}\.json$/,
            this.lookbackDays
        );

        const complexityData = {
            reports: [],
            trends: {
                averageComplexity: [],
                highComplexityCount: [],
                criticalFlowsCount: []
            },
            summary: {
                totalReports: complexityFiles.length,
                lastRun: null,
                currentHighComplexityFlows: 0,
                averageComplexityTrend: 'stable',
                healthScore: 100
            }
        };

        for (const file of complexityFiles) {
            try {
                const content = await fs.readFile(file.path, 'utf8');
                const reportData = JSON.parse(content);
                
                if (reportData.summary) {
                    complexityData.reports.push({
                        date: reportData.timestamp,
                        ...reportData.summary,
                        fileName: file.name
                    });

                    // Build trend data
                    const date = new Date(reportData.timestamp).toISOString().split('T')[0];
                    complexityData.trends.averageComplexity.push({
                        date,
                        value: reportData.summary.averageComplexity || 0
                    });
                    
                    complexityData.trends.highComplexityCount.push({
                        date,
                        value: reportData.summary.highComplexityFlows || 0
                    });
                    
                    complexityData.trends.criticalFlowsCount.push({
                        date,
                        value: reportData.summary.criticalFlows || 0
                    });
                }
            } catch (error) {
                await this.log(`Error processing complexity file ${file.path}: ${error.message}`, 'warn');
            }
        }

        // Calculate summary metrics
        if (complexityData.reports.length > 0) {
            const latestReport = complexityData.reports[0];
            complexityData.summary.lastRun = latestReport.date;
            complexityData.summary.currentHighComplexityFlows = latestReport.highComplexityFlows || 0;
            
            // Calculate health score based on average complexity
            const avgComplexity = latestReport.averageComplexity || 0;
            complexityData.summary.healthScore = this.calculateHealthScore('flowComplexity', avgComplexity);
            
            // Determine trend
            if (complexityData.reports.length >= 2) {
                const current = complexityData.reports[0].averageComplexity || 0;
                const previous = complexityData.reports[1].averageComplexity || 0;
                const change = current - previous;
                
                if (change > 1) {
                    complexityData.summary.averageComplexityTrend = 'increasing';
                } else if (change < -1) {
                    complexityData.summary.averageComplexityTrend = 'decreasing';
                } else {
                    complexityData.summary.averageComplexityTrend = 'stable';
                }
            }
        }

        await this.log(`Processed ${complexityData.reports.length} complexity reports`);
        return complexityData;
    }

    async aggregateConsolidationData() {
        await this.log('Aggregating flow consolidation data...');
        
        const consolidationFiles = await this.getRecentFiles(
            this.reportDirs.consolidationReports, 
            /violations-\d{4}-\d{2}-\d{2}\.json$/,
            this.lookbackDays
        );

        const consolidationData = {
            reports: [],
            trends: {
                complianceRate: [],
                violationCount: [],
                objectsAnalyzed: []
            },
            summary: {
                totalReports: consolidationFiles.length,
                lastRun: null,
                currentComplianceRate: 100,
                currentViolations: 0,
                complianceTrend: 'stable',
                healthScore: 100
            }
        };

        for (const file of consolidationFiles) {
            try {
                const content = await fs.readFile(file.path, 'utf8');
                const reportData = JSON.parse(content);
                
                if (reportData.summary) {
                    consolidationData.reports.push({
                        date: reportData.summary.timestamp,
                        ...reportData.summary,
                        fileName: file.name
                    });

                    // Build trend data
                    const date = new Date(reportData.summary.timestamp).toISOString().split('T')[0];
                    consolidationData.trends.complianceRate.push({
                        date,
                        value: reportData.summary.compliance_rate || 100
                    });
                    
                    consolidationData.trends.violationCount.push({
                        date,
                        value: reportData.summary.total_violations || 0
                    });
                    
                    consolidationData.trends.objectsAnalyzed.push({
                        date,
                        value: reportData.summary.objects_analyzed || 0
                    });
                }
            } catch (error) {
                await this.log(`Error processing consolidation file ${file.path}: ${error.message}`, 'warn');
            }
        }

        // Calculate summary metrics
        if (consolidationData.reports.length > 0) {
            const latestReport = consolidationData.reports[0];
            consolidationData.summary.lastRun = latestReport.date;
            consolidationData.summary.currentComplianceRate = latestReport.compliance_rate || 100;
            consolidationData.summary.currentViolations = latestReport.total_violations || 0;
            
            // Calculate health score based on compliance rate
            consolidationData.summary.healthScore = this.calculateHealthScore('consolidationCompliance', latestReport.compliance_rate || 100);
            
            // Determine trend
            if (consolidationData.reports.length >= 2) {
                const current = consolidationData.reports[0].compliance_rate || 100;
                const previous = consolidationData.reports[1].compliance_rate || 100;
                const change = current - previous;
                
                if (change > 5) {
                    consolidationData.summary.complianceTrend = 'improving';
                } else if (change < -5) {
                    consolidationData.summary.complianceTrend = 'declining';
                } else {
                    consolidationData.summary.complianceTrend = 'stable';
                }
            }
        }

        await this.log(`Processed ${consolidationData.reports.length} consolidation reports`);
        return consolidationData;
    }

    async aggregateValidationRuleData() {
        await this.log('Aggregating validation rule change data...');
        
        const validationFiles = await this.getRecentFiles(
            this.reportDirs.validationReports, 
            /validation-changes-\d{4}-\d{2}-\d{2}\.json$/,
            this.lookbackDays
        );

        const validationData = {
            reports: [],
            trends: {
                totalChanges: [],
                highRiskChanges: [],
                newRules: [],
                modifiedRules: []
            },
            summary: {
                totalReports: validationFiles.length,
                lastRun: null,
                recentChanges: 0,
                recentHighRiskChanges: 0,
                changesTrend: 'stable',
                healthScore: 100
            }
        };

        for (const file of validationFiles) {
            try {
                const content = await fs.readFile(file.path, 'utf8');
                const reportData = JSON.parse(content);
                
                if (reportData.summary) {
                    validationData.reports.push({
                        date: reportData.timestamp,
                        ...reportData.summary,
                        fileName: file.name
                    });

                    // Build trend data
                    const date = new Date(reportData.timestamp).toISOString().split('T')[0];
                    validationData.trends.totalChanges.push({
                        date,
                        value: reportData.summary.totalChanges || 0
                    });
                    
                    validationData.trends.highRiskChanges.push({
                        date,
                        value: reportData.summary.highRiskChanges || 0
                    });
                    
                    validationData.trends.newRules.push({
                        date,
                        value: reportData.summary.newRules || 0
                    });
                    
                    validationData.trends.modifiedRules.push({
                        date,
                        value: reportData.summary.modifiedRules || 0
                    });
                }
            } catch (error) {
                await this.log(`Error processing validation file ${file.path}: ${error.message}`, 'warn');
            }
        }

        // Calculate summary metrics
        if (validationData.reports.length > 0) {
            const latestReport = validationData.reports[0];
            validationData.summary.lastRun = latestReport.date;
            validationData.summary.recentChanges = latestReport.totalChanges || 0;
            validationData.summary.recentHighRiskChanges = latestReport.highRiskChanges || 0;
            
            // Calculate health score based on high-risk changes
            validationData.summary.healthScore = this.calculateHealthScore('validationRuleChanges', latestReport.highRiskChanges || 0);
            
            // Determine trend
            if (validationData.reports.length >= 2) {
                const current = validationData.reports[0].totalChanges || 0;
                const previous = validationData.reports[1].totalChanges || 0;
                
                if (current > previous) {
                    validationData.summary.changesTrend = 'increasing';
                } else if (current < previous) {
                    validationData.summary.changesTrend = 'decreasing';
                } else {
                    validationData.summary.changesTrend = 'stable';
                }
            }
        }

        await this.log(`Processed ${validationData.reports.length} validation rule reports`);
        return validationData;
    }

    async getSystemMetrics() {
        await this.log('Gathering system metrics...');
        
        try {
            // Get current org info
            const { stdout } = await execAsync(`sf org display --target-org ${this.orgAlias} --json`);
            const orgInfo = JSON.parse(stdout);
            
            // Get org limits  
            const { stdout: limitsStdout } = await execAsync(`sf data query --query "SELECT Name, Max, Remaining FROM Organization LIMIT 1" --target-org ${this.orgAlias} --json`);
            const limitsResult = JSON.parse(limitsStdout);
            
            // Get flow count
            const { stdout: flowStdout } = await execAsync(`sf data query --use-tooling-api --query "SELECT COUNT() totalFlows FROM FlowDefinition WHERE IsActive = true" --target-org ${this.orgAlias} --json`);
            const flowResult = JSON.parse(flowStdout);
            
            // Get validation rule count
            const { stdout: validationStdout } = await execAsync(`sf data query --query "SELECT COUNT() totalRules FROM ValidationRule WHERE Active = true" --use-tooling-api --target-org ${this.orgAlias} --json`);
            const validationResult = JSON.parse(validationStdout);

            return {
                orgInfo: orgInfo.result,
                totalActiveFlows: flowResult.result?.records?.[0]?.totalFlows || 0,
                totalActiveValidationRules: validationResult.result?.records?.[0]?.totalRules || 0,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            await this.log(`Error gathering system metrics: ${error.message}`, 'warn');
            return {
                orgInfo: null,
                totalActiveFlows: 0,
                totalActiveValidationRules: 0,
                lastUpdated: new Date().toISOString(),
                error: error.message
            };
        }
    }

    calculateHealthScore(metric, value) {
        const thresholds = this.healthThresholds[metric];
        if (!thresholds) return 100;

        for (const [level, threshold] of Object.entries(thresholds)) {
            if (metric === 'consolidationCompliance' || metric === 'queryPerformance') {
                if (value >= threshold.min) {
                    return threshold.score;
                }
            } else {
                if (value <= threshold.max) {
                    return threshold.score;
                }
            }
        }

        return 40; // Default poor score
    }

    calculateOverallHealthScore(metrics) {
        const weights = {
            flowComplexity: 0.3,
            consolidationCompliance: 0.3,
            validationRuleChanges: 0.2,
            systemMetrics: 0.2
        };

        let weightedSum = 0;
        let totalWeights = 0;

        for (const [metric, weight] of Object.entries(weights)) {
            if (metrics[metric] && metrics[metric].healthScore !== undefined) {
                weightedSum += metrics[metric].healthScore * weight;
                totalWeights += weight;
            }
        }

        return totalWeights > 0 ? Math.round(weightedSum / totalWeights) : 50;
    }

    getHealthStatus(score) {
        if (score >= 90) return { status: 'Excellent', color: '#28a745', icon: '🟢' };
        if (score >= 80) return { status: 'Good', color: '#28a745', icon: '🔵' };
        if (score >= 60) return { status: 'Fair', color: '#ffc107', icon: '🟡' };
        return { status: 'Poor', color: '#dc3545', icon: '🔴' };
    }

    generateInsights(healthData) {
        const insights = [];
        
        // Flow complexity insights
        if (healthData.flowComplexity.summary.healthScore < 70) {
            insights.push({
                type: 'warning',
                category: 'Flow Complexity',
                message: `${healthData.flowComplexity.summary.currentHighComplexityFlows} flows exceed complexity threshold`,
                action: 'Review and refactor high complexity flows',
                priority: 'HIGH',
                impact: 'Maintainability and performance risk'
            });
        }

        if (healthData.flowComplexity.summary.averageComplexityTrend === 'increasing') {
            insights.push({
                type: 'warning',
                category: 'Flow Complexity',
                message: 'Flow complexity is trending upward',
                action: 'Implement flow consolidation and simplification',
                priority: 'MEDIUM',
                impact: 'Technical debt accumulation'
            });
        }

        // Flow consolidation insights
        if (healthData.consolidationCompliance.summary.currentViolations > 0) {
            insights.push({
                type: 'error',
                category: 'Flow Consolidation', 
                message: `${healthData.consolidationCompliance.summary.currentViolations} flow consolidation violations detected`,
                action: 'Follow Flow Consolidation Principle - ONE FLOW PER OBJECT PER TRIGGER TYPE',
                priority: 'HIGH',
                impact: 'Maintenance complexity and execution order issues'
            });
        }

        // Validation rule insights
        if (healthData.validationRuleChanges.summary.recentHighRiskChanges > 0) {
            insights.push({
                type: 'warning',
                category: 'Validation Rules',
                message: `${healthData.validationRuleChanges.summary.recentHighRiskChanges} high-risk validation rule changes detected`,
                action: 'Review validation rules for deployment and automation impact',
                priority: 'HIGH',
                impact: 'Potential deployment failures and flow disruption'
            });
        }

        if (healthData.validationRuleChanges.summary.changesTrend === 'increasing') {
            insights.push({
                type: 'info',
                category: 'Validation Rules',
                message: 'Validation rule changes are increasing',
                action: 'Monitor for pattern and impact on system stability',
                priority: 'MEDIUM',
                impact: 'System stability and predictability'
            });
        }

        // Overall system insights
        const overallScore = this.calculateOverallHealthScore(healthData);
        if (overallScore < 70) {
            insights.push({
                type: 'error',
                category: 'System Health',
                message: `Overall system health score is ${overallScore}% (Fair/Poor)`,
                action: 'Address high-priority issues and implement monitoring improvements',
                priority: 'HIGH',
                impact: 'System reliability and maintainability'
            });
        }

        return insights.sort((a, b) => {
            const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    async generateDashboard(healthData, insights, systemMetrics) {
        const overallScore = this.calculateOverallHealthScore(healthData);
        const healthStatus = this.getHealthStatus(overallScore);
        
        const dashboardHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Salesforce System Health Dashboard - ${this.orgAlias}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8f9fa; color: #333; line-height: 1.6; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; text-align: center; }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { font-size: 1.1em; opacity: 0.9; }
        .health-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .health-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-left: 5px solid ${healthStatus.color}; }
        .health-score { font-size: 3em; font-weight: bold; color: ${healthStatus.color}; text-align: center; }
        .health-status { font-size: 1.2em; text-align: center; margin-top: 10px; color: ${healthStatus.color}; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .metric-card h3 { color: #495057; margin-bottom: 15px; font-size: 1.1em; }
        .metric-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .metric-trend { font-size: 0.9em; opacity: 0.7; }
        .trend-up { color: #e74c3c; }
        .trend-down { color: #27ae60; }
        .trend-stable { color: #6c757d; }
        .insights-section { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .insight-item { padding: 15px; border-left: 4px solid; margin-bottom: 15px; border-radius: 0 8px 8px 0; }
        .insight-error { background: #f8d7da; border-color: #dc3545; }
        .insight-warning { background: #fff3cd; border-color: #ffc107; }
        .insight-info { background: #d1ecf1; border-color: #17a2b8; }
        .insight-priority { font-weight: bold; text-transform: uppercase; font-size: 0.8em; }
        .charts-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 30px; margin-bottom: 30px; }
        .chart-container { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .chart-container h3 { margin-bottom: 20px; color: #495057; }
        .chart-canvas { max-height: 300px; }
        .summary-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-item { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        .stat-value { font-size: 1.5em; font-weight: bold; color: #495057; }
        .stat-label { font-size: 0.9em; color: #6c757d; margin-top: 5px; }
        .refresh-info { text-align: center; color: #6c757d; font-size: 0.9em; margin-top: 30px; padding: 20px; background: white; border-radius: 8px; }
        .priority-high { color: #dc3545; }
        .priority-medium { color: #ffc107; }
        .priority-low { color: #28a745; }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .header { padding: 20px; }
            .header h1 { font-size: 2em; }
            .charts-section { grid-template-columns: 1fr; }
            .chart-container { min-width: 300px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${healthStatus.icon} System Health Dashboard</h1>
            <p>Salesforce Org: <strong>${this.orgAlias}</strong> | Generated: ${new Date().toLocaleString()}</p>
        </div>

        <div class="health-overview">
            <div class="health-card">
                <div class="health-score">${overallScore}%</div>
                <div class="health-status">${healthStatus.status}</div>
                <p style="text-align: center; margin-top: 10px; color: #6c757d;">Overall System Health</p>
            </div>
        </div>

        <div class="summary-stats">
            <div class="stat-item">
                <div class="stat-value">${systemMetrics.totalActiveFlows}</div>
                <div class="stat-label">Active Flows</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${systemMetrics.totalActiveValidationRules}</div>
                <div class="stat-label">Validation Rules</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${healthData.flowComplexity.summary.currentHighComplexityFlows}</div>
                <div class="stat-label">High Complexity Flows</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${healthData.consolidationCompliance.summary.currentViolations}</div>
                <div class="stat-label">Consolidation Violations</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${healthData.validationRuleChanges.summary.recentHighRiskChanges}</div>
                <div class="stat-label">Recent High-Risk Changes</div>
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <h3>📊 Flow Complexity</h3>
                <div class="metric-value" style="color: ${this.getHealthStatus(healthData.flowComplexity.summary.healthScore).color};">
                    ${healthData.flowComplexity.summary.healthScore}%
                </div>
                <div class="metric-trend trend-${healthData.flowComplexity.summary.averageComplexityTrend === 'increasing' ? 'up' : healthData.flowComplexity.summary.averageComplexityTrend === 'decreasing' ? 'down' : 'stable'}">
                    Trend: ${healthData.flowComplexity.summary.averageComplexityTrend}
                </div>
            </div>

            <div class="metric-card">
                <h3>🔄 Flow Consolidation</h3>
                <div class="metric-value" style="color: ${this.getHealthStatus(healthData.consolidationCompliance.summary.healthScore).color};">
                    ${healthData.consolidationCompliance.summary.currentComplianceRate}%
                </div>
                <div class="metric-trend trend-${healthData.consolidationCompliance.summary.complianceTrend === 'declining' ? 'up' : healthData.consolidationCompliance.summary.complianceTrend === 'improving' ? 'down' : 'stable'}">
                    Trend: ${healthData.consolidationCompliance.summary.complianceTrend}
                </div>
            </div>

            <div class="metric-card">
                <h3>⚠️ Validation Changes</h3>
                <div class="metric-value" style="color: ${this.getHealthStatus(healthData.validationRuleChanges.summary.healthScore).color};">
                    ${healthData.validationRuleChanges.summary.healthScore}%
                </div>
                <div class="metric-trend trend-${healthData.validationRuleChanges.summary.changesTrend === 'increasing' ? 'up' : healthData.validationRuleChanges.summary.changesTrend === 'decreasing' ? 'down' : 'stable'}">
                    Trend: ${healthData.validationRuleChanges.summary.changesTrend}
                </div>
            </div>
        </div>

        ${insights.length > 0 ? `
        <div class="insights-section">
            <h2>🔍 System Insights & Recommendations</h2>
            ${insights.map(insight => `
                <div class="insight-item insight-${insight.type}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <strong>${insight.category}</strong>
                        <span class="insight-priority priority-${insight.priority.toLowerCase()}">${insight.priority} PRIORITY</span>
                    </div>
                    <p><strong>Issue:</strong> ${insight.message}</p>
                    <p><strong>Action:</strong> ${insight.action}</p>
                    <p><strong>Impact:</strong> ${insight.impact}</p>
                </div>
            `).join('')}
        </div>
        ` : `
        <div class="insights-section">
            <h2>🔍 System Insights & Recommendations</h2>
            <div style="text-align: center; color: #28a745; padding: 20px;">
                <h3>✅ No Critical Issues Detected</h3>
                <p>Your Salesforce system is operating within healthy parameters.</p>
            </div>
        </div>
        `}

        <div class="charts-section">
            <div class="chart-container">
                <h3>Flow Complexity Trends</h3>
                <canvas id="complexityChart" class="chart-canvas"></canvas>
            </div>

            <div class="chart-container">
                <h3>Consolidation Compliance</h3>
                <canvas id="consolidationChart" class="chart-canvas"></canvas>
            </div>

            <div class="chart-container">
                <h3>Validation Rule Changes</h3>
                <canvas id="validationChart" class="chart-canvas"></canvas>
            </div>
        </div>

        <div class="refresh-info">
            <p><strong>Dashboard Last Updated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Data Range:</strong> Last ${this.lookbackDays} days</p>
            <p><strong>Next Refresh:</strong> ${this.serveWebsite ? 'Real-time updates enabled' : 'Manual refresh required'}</p>
        </div>
    </div>

    <script>
        // Chart.js configurations
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        };

        // Flow Complexity Chart
        const complexityCtx = document.getElementById('complexityChart').getContext('2d');
        new Chart(complexityCtx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(healthData.flowComplexity.trends.averageComplexity.map(d => d.date))},
                datasets: [{
                    label: 'Average Complexity',
                    data: ${JSON.stringify(healthData.flowComplexity.trends.averageComplexity.map(d => d.value))},
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4
                }, {
                    label: 'High Complexity Flows',
                    data: ${JSON.stringify(healthData.flowComplexity.trends.highComplexityCount.map(d => d.value))},
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4
                }]
            },
            options: chartOptions
        });

        // Consolidation Compliance Chart
        const consolidationCtx = document.getElementById('consolidationChart').getContext('2d');
        new Chart(consolidationCtx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(healthData.consolidationCompliance.trends.complianceRate.map(d => d.date))},
                datasets: [{
                    label: 'Compliance Rate %',
                    data: ${JSON.stringify(healthData.consolidationCompliance.trends.complianceRate.map(d => d.value))},
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Violations',
                    data: ${JSON.stringify(healthData.consolidationCompliance.trends.violationCount.map(d => d.value))},
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });

        // Validation Rule Changes Chart
        const validationCtx = document.getElementById('validationChart').getContext('2d');
        new Chart(validationCtx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(healthData.validationRuleChanges.trends.totalChanges.map(d => d.date))},
                datasets: [{
                    label: 'Total Changes',
                    data: ${JSON.stringify(healthData.validationRuleChanges.trends.totalChanges.map(d => d.value))},
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: '#667eea',
                    borderWidth: 1
                }, {
                    label: 'High Risk Changes',
                    data: ${JSON.stringify(healthData.validationRuleChanges.trends.highRiskChanges.map(d => d.value))},
                    backgroundColor: 'rgba(220, 53, 69, 0.6)',
                    borderColor: '#dc3545',
                    borderWidth: 1
                }]
            },
            options: chartOptions
        });

        // Auto-refresh if serving
        ${this.serveWebsite ? `
        setInterval(() => {
            window.location.reload();
        }, 300000); // Refresh every 5 minutes
        ` : ''}
    </script>
</body>
</html>`;

        const dashboardPath = path.join(this.outputDir, `health-dashboard-${this.timestamp}.html`);
        await fs.writeFile(dashboardPath, dashboardHtml);
        
        // Also create a latest version
        const latestPath = path.join(this.outputDir, 'health-dashboard-latest.html');
        await fs.writeFile(latestPath, dashboardHtml);

        await this.log(`Dashboard generated: ${dashboardPath}`);
        return { dashboardPath, latestPath, overallScore, healthStatus };
    }

    async serveWebDashboard(dashboardPath) {
        const server = http.createServer(async (req, res) => {
            try {
                if (req.url === '/' || req.url === '/dashboard') {
                    const content = await fs.readFile(dashboardPath, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(content);
                } else if (req.url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                }
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        });

        server.listen(this.webPort, () => {
            console.log(`🚀 System Health Dashboard serving at http://localhost:${this.webPort}`);
            console.log(`📊 Dashboard: http://localhost:${this.webPort}/dashboard`);
            console.log(`❤️ Health Check: http://localhost:${this.webPort}/health`);
        });

        return server;
    }

    async generateSystemHealthReport() {
        try {
            await this.log('Starting System Health Dashboard generation...');
            await this.ensureDirectories();
            
            // Validate connection
            const orgInfo = await this.validateSfConnection();
            
            // Aggregate all monitoring data
            const [flowComplexity, consolidationCompliance, validationRuleChanges, systemMetrics] = await Promise.all([
                this.aggregateFlowComplexityData(),
                this.aggregateConsolidationData(), 
                this.aggregateValidationRuleData(),
                this.getSystemMetrics()
            ]);

            const healthData = {
                flowComplexity,
                consolidationCompliance,
                validationRuleChanges,
                systemMetrics
            };

            // Generate insights
            const insights = this.generateInsights(healthData);
            
            // Generate dashboard
            const dashboardResult = await this.generateDashboard(healthData, insights, systemMetrics);
            
            // Generate JSON summary
            const summaryData = {
                timestamp: new Date().toISOString(),
                orgAlias: this.orgAlias,
                lookbackDays: this.lookbackDays,
                overallHealthScore: dashboardResult.overallScore,
                healthStatus: dashboardResult.healthStatus,
                metrics: healthData,
                insights: insights,
                systemInfo: systemMetrics
            };

            const jsonSummaryPath = path.join(this.outputDir, `health-summary-${this.timestamp}.json`);
            await fs.writeFile(jsonSummaryPath, JSON.stringify(summaryData, null, 2));
            
            // Serve web dashboard if requested
            if (this.serveWebsite) {
                await this.serveWebDashboard(dashboardResult.latestPath);
            }

            // Log final summary
            await this.log(`System Health Dashboard completed successfully`);
            await this.log(`Overall Health Score: ${dashboardResult.overallScore}% (${dashboardResult.healthStatus.status})`);
            await this.log(`Insights Generated: ${insights.length}`);
            await this.log(`Dashboard: ${dashboardResult.dashboardPath}`);
            
            if (this.serveWebsite) {
                await this.log(`Web server running on port ${this.webPort}`);
                // Keep server running
                process.on('SIGINT', () => {
                    console.log('\n🛑 Shutting down dashboard server...');
                    process.exit(0);
                });
            } else {
                // Return appropriate exit code
                if (dashboardResult.overallScore < 70) {
                    process.exit(1); // Poor health
                } else {
                    process.exit(0); // Good health
                }
            }

        } catch (error) {
            await this.log(`Dashboard generation failed: ${error.message}`, 'error');
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
        if (key && value !== undefined && !key.match(/^(serve|silent)$/)) {
            options[key] = key === 'days' || key === 'port' ? parseInt(value) : value;
        } else if (key === 'serve' || key === 'silent') {
            options[key] = true;
            i -= 1; // Adjust for flag without value
        }
    }

    if (!options.org) {
        console.error('Usage: node system-health-dashboard.js --org <alias> [--days 30] [--output-dir /path/to/output] [--serve] [--port 3000] [--silent]');
        console.error('');
        console.error('Options:');
        console.error('  --org <alias>              Salesforce org alias (required)');
        console.error('  --days <number>            Lookback period in days (default: 30)');
        console.error('  --output-dir <path>        Output directory for reports');
        console.error('  --serve                    Start web server for real-time dashboard');
        console.error('  --port <number>            Web server port (default: 3000)');
        console.error('  --silent                   Suppress console output');
        console.error('');
        console.error('Examples:');
        console.error('  # Generate dashboard');
        console.error('  node system-health-dashboard.js --org production --days 7');
        console.error('');
        console.error('  # Serve web dashboard');
        console.error('  node system-health-dashboard.js --org production --serve --port 3000');
        console.error('');
        console.error('Cron Example:');
        console.error('  0 0-23/4 * * * cd /path/to/project && node scripts/monitoring/system-health-dashboard.js --org production --days 7');
        process.exit(1);
    }

    const dashboard = new SystemHealthDashboard(options.org, {
        days: options.days,
        outputDir: options['output-dir'],
        serve: options.serve,
        port: options.port,
        silent: options.silent
    });

    await dashboard.generateSystemHealthReport();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = SystemHealthDashboard;
