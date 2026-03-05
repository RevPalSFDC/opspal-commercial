#!/usr/bin/env node

/**
 * Executive Reporting System for Salesforce Standards Compliance
 * Generates comprehensive reports for leadership and stakeholders
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ExecutiveReporter {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.outputDir = path.join(this.projectRoot, 'docs', 'executive-reports');
        this.metricsPath = path.join(this.projectRoot, 'docs', 'compliance-metrics.json');
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generate comprehensive executive report
     */
    async generateExecutiveReport(options = {}) {
        console.log('📊 Generating Executive Report...\n');
        
        const reportData = await this.gatherReportData();
        const analysis = this.analyzeData(reportData);
        
        // Generate multiple report formats
        const reports = {
            summary: this.generateExecutiveSummary(reportData, analysis),
            detailed: this.generateDetailedReport(reportData, analysis),
            metrics: this.generateMetricsReport(reportData, analysis),
            recommendations: this.generateRecommendations(reportData, analysis)
        };
        
        // Save reports
        const timestamp = new Date().toISOString().split('T')[0];
        const reportPaths = {};
        
        for (const [type, content] of Object.entries(reports)) {
            const filename = `executive-${type}-${timestamp}.md`;
            const filepath = path.join(this.outputDir, filename);
            fs.writeFileSync(filepath, content);
            reportPaths[type] = filepath;
            console.log(`✅ Generated ${type} report: ${filename}`);
        }
        
        // Generate consolidated PDF if requested
        if (options.pdf) {
            await this.generatePDF(reportPaths, timestamp);
        }
        
        // Send via email if configured
        if (options.email) {
            await this.emailReport(reportPaths, options.email);
        }
        
        console.log('\n📈 Executive reporting complete!');
        return reportPaths;
    }

    /**
     * Gather all relevant data for reporting
     */
    async gatherReportData() {
        const data = {
            metrics: this.loadMetrics(),
            compliance: await this.runComplianceCheck(),
            trends: this.calculateTrends(),
            costs: this.estimateCosts(),
            risks: this.assessRisks(),
            team: this.getTeamMetrics()
        };
        
        return data;
    }

    /**
     * Load compliance metrics
     */
    loadMetrics() {
        if (fs.existsSync(this.metricsPath)) {
            return JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
        }
        return null;
    }

    /**
     * Run fresh compliance check
     */
    async runComplianceCheck() {
        try {
            const SalesforceStandardsValidator = require('./salesforce-standards-validator');
            const validator = new SalesforceStandardsValidator(this.projectRoot);
            const orgAlias = process.env.SF_TARGET_ORG;
            
            return await validator.runFullValidation({ 
                org: orgAlias, 
                silent: true 
            });
        } catch (error) {
            console.error('Failed to run compliance check:', error.message);
            return null;
        }
    }

    /**
     * Calculate trends from historical data
     */
    calculateTrends() {
        const metrics = this.loadMetrics();
        if (!metrics || !metrics.history || metrics.history.length < 2) {
            return { available: false };
        }
        
        const history = metrics.history;
        const recent = history.slice(-7);  // Last 7 days
        const previous = history.slice(-14, -7);  // Previous 7 days
        
        const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
        const previousAvg = previous.length > 0 
            ? previous.reduce((sum, h) => sum + h.score, 0) / previous.length
            : recentAvg;
        
        return {
            available: true,
            weeklyChange: recentAvg - previousAvg,
            currentTrend: metrics.trend,
            averageScore: recentAvg,
            volatility: this.calculateVolatility(recent)
        };
    }

    /**
     * Calculate score volatility
     */
    calculateVolatility(data) {
        if (data.length < 2) return 0;
        
        const scores = data.map(d => d.score);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Estimate costs and ROI
     */
    estimateCosts() {
        // Estimate based on violations and time to fix
        const costPerViolation = {
            documentation: 15,  // minutes
            reportTypes: 30,
            lightningPages: 45,
            metadata: 20
        };
        
        const hourlyRate = 150;  // Average developer hourly rate
        
        const metrics = this.loadMetrics();
        if (!metrics || !metrics.violations) {
            return { available: false };
        }
        
        let totalMinutes = 0;
        Object.keys(metrics.violations).forEach(category => {
            const count = (metrics.violations[category] || []).length;
            totalMinutes += count * (costPerViolation[category] || 20);
        });
        
        const totalHours = totalMinutes / 60;
        const totalCost = totalHours * hourlyRate;
        
        // Calculate savings from automation
        const manualMultiplier = 3;  // Manual work takes 3x longer
        const manualCost = totalCost * manualMultiplier;
        const savings = manualCost - totalCost;
        
        return {
            available: true,
            estimatedFixTime: totalHours.toFixed(1),
            estimatedCost: totalCost.toFixed(2),
            automationSavings: savings.toFixed(2),
            roi: ((savings / totalCost) * 100).toFixed(0)
        };
    }

    /**
     * Assess compliance risks
     */
    assessRisks() {
        const metrics = this.loadMetrics();
        if (!metrics) return { level: 'unknown' };
        
        const score = metrics.currentScore || 0;
        const trend = metrics.trend || 'stable';
        
        let riskLevel = 'low';
        let risks = [];
        
        if (score < 60) {
            riskLevel = 'critical';
            risks.push('Critical compliance violations requiring immediate attention');
        } else if (score < 80) {
            riskLevel = 'high';
            risks.push('Significant compliance gaps that could impact deployment');
        } else if (score < 95) {
            riskLevel = 'medium';
            risks.push('Minor compliance issues that should be addressed');
        }
        
        if (trend === 'declining') {
            risks.push('Declining trend indicates deteriorating code quality');
        }
        
        // Check specific risk areas
        if (metrics.violations) {
            if (metrics.violations.metadata && metrics.violations.metadata.length > 10) {
                risks.push('High number of metadata violations could cause deployment failures');
            }
            if (metrics.violations.documentation && metrics.violations.documentation.length > 5) {
                risks.push('Poor documentation could impact team productivity');
            }
        }
        
        return {
            level: riskLevel,
            risks: risks,
            mitigations: this.generateMitigations(riskLevel)
        };
    }

    /**
     * Generate risk mitigations
     */
    generateMitigations(riskLevel) {
        const mitigations = {
            critical: [
                'Immediate code freeze until violations are resolved',
                'Assign dedicated team to fix critical issues',
                'Implement daily compliance checks',
                'Executive review of all changes'
            ],
            high: [
                'Prioritize compliance fixes in next sprint',
                'Implement pre-commit hooks to prevent new violations',
                'Schedule team training on standards',
                'Increase code review requirements'
            ],
            medium: [
                'Include compliance fixes in regular development',
                'Set up automated monitoring',
                'Quarterly compliance reviews',
                'Update team documentation'
            ],
            low: [
                'Maintain current processes',
                'Monitor trends monthly',
                'Celebrate compliance achievements'
            ]
        };
        
        return mitigations[riskLevel] || mitigations.low;
    }

    /**
     * Get team metrics
     */
    getTeamMetrics() {
        // In production, this would integrate with Git/JIRA/etc.
        return {
            totalDevelopers: 8,
            complianceChampions: ['John Doe', 'Jane Smith'],
            recentContributors: 5,
            trainingCompleted: 6
        };
    }

    /**
     * Analyze all data
     */
    analyzeData(data) {
        const analysis = {
            overallHealth: 'good',
            keyFindings: [],
            achievements: [],
            concerns: []
        };
        
        // Determine overall health
        if (data.compliance && data.compliance.overall) {
            const score = data.compliance.overall.score;
            if (score >= 95) {
                analysis.overallHealth = 'excellent';
                analysis.achievements.push('Exceptional compliance score achieved');
            } else if (score >= 80) {
                analysis.overallHealth = 'good';
                analysis.achievements.push('Compliance standards are being met');
            } else if (score >= 60) {
                analysis.overallHealth = 'fair';
                analysis.concerns.push('Compliance score needs improvement');
            } else {
                analysis.overallHealth = 'poor';
                analysis.concerns.push('Critical compliance issues detected');
            }
        }
        
        // Add trend analysis
        if (data.trends.available) {
            if (data.trends.weeklyChange > 5) {
                analysis.achievements.push(`${data.trends.weeklyChange.toFixed(1)}% improvement this week`);
            } else if (data.trends.weeklyChange < -5) {
                analysis.concerns.push(`${Math.abs(data.trends.weeklyChange).toFixed(1)}% decline this week`);
            }
            
            if (data.trends.volatility > 10) {
                analysis.concerns.push('High volatility in compliance scores');
            }
        }
        
        // Add cost analysis
        if (data.costs.available) {
            analysis.keyFindings.push(`Estimated ${data.costs.estimatedFixTime} hours to fix all issues`);
            analysis.keyFindings.push(`Automation saves $${data.costs.automationSavings} (${data.costs.roi}% ROI)`);
        }
        
        // Add risk analysis
        if (data.risks.level === 'critical' || data.risks.level === 'high') {
            analysis.concerns.push(...data.risks.risks);
        }
        
        return analysis;
    }

    /**
     * Generate executive summary
     */
    generateExecutiveSummary(data, analysis) {
        const date = new Date().toLocaleDateString();
        const score = data.compliance?.overall?.score || 'N/A';
        
        let summary = `# Executive Summary - Salesforce Standards Compliance\n\n`;
        summary += `**Date:** ${date}\n`;
        summary += `**Project:** ${path.basename(this.projectRoot)}\n\n`;
        
        summary += `## 🎯 Key Metrics\n\n`;
        summary += `- **Compliance Score:** ${score}%\n`;
        summary += `- **Overall Health:** ${analysis.overallHealth.toUpperCase()}\n`;
        summary += `- **Risk Level:** ${data.risks.level?.toUpperCase() || 'UNKNOWN'}\n`;
        
        if (data.costs.available) {
            summary += `- **Time to Resolution:** ${data.costs.estimatedFixTime} hours\n`;
            summary += `- **Automation ROI:** ${data.costs.roi}%\n`;
        }
        
        summary += `\n## 📊 Executive Dashboard\n\n`;
        
        // Add visual representation
        const scoreBar = this.generateScoreBar(score);
        summary += `Compliance: ${scoreBar}\n\n`;
        
        if (analysis.achievements.length > 0) {
            summary += `### ✅ Achievements\n`;
            analysis.achievements.forEach(a => {
                summary += `- ${a}\n`;
            });
            summary += '\n';
        }
        
        if (analysis.concerns.length > 0) {
            summary += `### ⚠️ Areas of Concern\n`;
            analysis.concerns.forEach(c => {
                summary += `- ${c}\n`;
            });
            summary += '\n';
        }
        
        summary += `## 💡 Recommendations\n\n`;
        const recommendations = this.getTopRecommendations(data, analysis);
        recommendations.forEach((rec, index) => {
            summary += `${index + 1}. ${rec}\n`;
        });
        
        summary += `\n## 📈 Next Steps\n\n`;
        summary += `1. Review detailed report for specific violations\n`;
        summary += `2. Prioritize fixes based on risk assessment\n`;
        summary += `3. Allocate resources for remediation\n`;
        summary += `4. Schedule follow-up review in 2 weeks\n`;
        
        return summary;
    }

    /**
     * Generate visual score bar
     */
    generateScoreBar(score) {
        const filled = Math.round(score / 5);
        const empty = 20 - filled;
        return '█'.repeat(filled) + '░'.repeat(empty) + ` ${score}%`;
    }

    /**
     * Get top recommendations
     */
    getTopRecommendations(data, analysis) {
        const recommendations = [];
        
        if (data.compliance?.overall?.score < 80) {
            recommendations.push('Immediately address critical compliance violations');
        }
        
        if (data.trends.currentTrend === 'declining') {
            recommendations.push('Investigate and reverse declining compliance trend');
        }
        
        if (data.risks.level === 'critical' || data.risks.level === 'high') {
            recommendations.push('Implement risk mitigation strategies');
        }
        
        if (data.costs.available && parseFloat(data.costs.estimatedFixTime) > 40) {
            recommendations.push('Consider dedicated sprint for compliance fixes');
        }
        
        recommendations.push('Enable automated compliance monitoring');
        recommendations.push('Conduct team training on development standards');
        
        return recommendations.slice(0, 5);
    }

    /**
     * Generate detailed report
     */
    generateDetailedReport(data, analysis) {
        let report = `# Detailed Compliance Report\n\n`;
        report += `Generated: ${new Date().toISOString()}\n\n`;
        
        // Add all sections
        report += this.generateComplianceSection(data.compliance);
        report += this.generateTrendsSection(data.trends);
        report += this.generateViolationsSection(data.compliance);
        report += this.generateCostSection(data.costs);
        report += this.generateRiskSection(data.risks);
        report += this.generateTeamSection(data.team);
        
        return report;
    }

    /**
     * Generate metrics report
     */
    generateMetricsReport(data, analysis) {
        const metrics = {
            timestamp: new Date().toISOString(),
            compliance: data.compliance?.overall || {},
            trends: data.trends,
            costs: data.costs,
            risks: data.risks,
            analysis: analysis
        };
        
        return '# Metrics Report\n\n```json\n' + JSON.stringify(metrics, null, 2) + '\n```';
    }

    /**
     * Generate recommendations report
     */
    generateRecommendations(data, analysis) {
        let report = `# Strategic Recommendations\n\n`;
        
        report += `## Immediate Actions (This Week)\n\n`;
        data.risks.mitigations?.slice(0, 3).forEach((action, i) => {
            report += `${i + 1}. ${action}\n`;
        });
        
        report += `\n## Short-term Goals (This Month)\n\n`;
        report += `1. Achieve 90%+ compliance score\n`;
        report += `2. Implement automated checking in CI/CD\n`;
        report += `3. Complete team training\n`;
        
        report += `\n## Long-term Strategy (This Quarter)\n\n`;
        report += `1. Maintain 95%+ compliance consistently\n`;
        report += `2. Reduce fix time by 50% through automation\n`;
        report += `3. Achieve zero critical violations\n`;
        
        return report;
    }

    // Helper methods for section generation
    generateComplianceSection(compliance) {
        if (!compliance) return '';
        
        let section = `## Compliance Overview\n\n`;
        section += `- Score: ${compliance.overall?.score || 0}%\n`;
        section += `- Status: ${compliance.overall?.status || 'UNKNOWN'}\n`;
        section += `- Total Checks: ${compliance.overall?.totalChecks || 0}\n`;
        section += `- Passed: ${compliance.overall?.passed || 0}\n`;
        section += `- Failed: ${compliance.overall?.failed || 0}\n\n`;
        
        return section;
    }

    generateTrendsSection(trends) {
        if (!trends.available) return '';
        
        let section = `## Trend Analysis\n\n`;
        section += `- Weekly Change: ${trends.weeklyChange > 0 ? '+' : ''}${trends.weeklyChange.toFixed(1)}%\n`;
        section += `- Current Trend: ${trends.currentTrend}\n`;
        section += `- Average Score: ${trends.averageScore.toFixed(1)}%\n`;
        section += `- Volatility: ${trends.volatility.toFixed(1)}\n\n`;
        
        return section;
    }

    generateViolationsSection(compliance) {
        if (!compliance) return '';
        
        let section = `## Violations Breakdown\n\n`;
        
        ['documentation', 'reportTypes', 'lightningPages', 'metadata'].forEach(category => {
            const violations = compliance[category]?.failed || [];
            if (violations.length > 0) {
                section += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
                section += `Count: ${violations.length}\n\n`;
                violations.slice(0, 5).forEach(v => {
                    section += `- ${v.issue || v.check}\n`;
                });
                if (violations.length > 5) {
                    section += `- ... and ${violations.length - 5} more\n`;
                }
                section += '\n';
            }
        });
        
        return section;
    }

    generateCostSection(costs) {
        if (!costs.available) return '';
        
        let section = `## Cost Analysis\n\n`;
        section += `- Estimated Fix Time: ${costs.estimatedFixTime} hours\n`;
        section += `- Estimated Cost: $${costs.estimatedCost}\n`;
        section += `- Automation Savings: $${costs.automationSavings}\n`;
        section += `- ROI: ${costs.roi}%\n\n`;
        
        return section;
    }

    generateRiskSection(risks) {
        let section = `## Risk Assessment\n\n`;
        section += `- Risk Level: ${risks.level?.toUpperCase() || 'UNKNOWN'}\n\n`;
        
        if (risks.risks && risks.risks.length > 0) {
            section += `### Identified Risks\n`;
            risks.risks.forEach(risk => {
                section += `- ${risk}\n`;
            });
            section += '\n';
        }
        
        if (risks.mitigations && risks.mitigations.length > 0) {
            section += `### Mitigation Strategies\n`;
            risks.mitigations.forEach(mitigation => {
                section += `- ${mitigation}\n`;
            });
            section += '\n';
        }
        
        return section;
    }

    generateTeamSection(team) {
        let section = `## Team Metrics\n\n`;
        section += `- Total Developers: ${team.totalDevelopers}\n`;
        section += `- Recent Contributors: ${team.recentContributors}\n`;
        section += `- Training Completed: ${team.trainingCompleted}\n`;

        if (team.complianceChampions && team.complianceChampions.length > 0) {
            section += `- Compliance Champions: ${team.complianceChampions.join(', ')}\n`;
        }

        section += '\n';
        return section;
    }

    /**
     * Generate consolidated PDF from multiple markdown reports
     * Integrates with cross-platform-plugin PDF generator
     */
    async generatePDF(reportPaths, timestamp) {
        try {
            console.log('\n📄 Generating consolidated PDF report...');

            // Import PDF Generator from cross-platform-plugin
            const PDFGenerator = require('../../../../opspal-core/cross-platform-plugin/scripts/lib/pdf-generator');
            const generator = new PDFGenerator({ verbose: false });

            // Prepare documents for collation (ordered for executive presentation)
            const documents = [
                { path: reportPaths.summary, title: 'Executive Summary', order: 0 },
                { path: reportPaths.metrics, title: 'Key Metrics', order: 1 },
                { path: reportPaths.detailed, title: 'Detailed Analysis', order: 2 },
                { path: reportPaths.recommendations, title: 'Recommendations', order: 3 }
            ].filter(doc => fs.existsSync(doc.path)); // Only include existing files

            if (documents.length === 0) {
                console.log('⚠️  No report files found - skipping PDF generation');
                return null;
            }

            // Generate PDF with full features
            const pdfPath = path.join(this.outputDir, `executive-report-${timestamp}.pdf`);

            await generator.collate(documents, pdfPath, {
                toc: true,
                bookmarks: true,
                renderMermaid: true,
                coverPage: {
                    template: 'executive-report'
                },
                metadata: {
                    title: 'Executive Compliance Report',
                    org: process.env.ORG_NAME || 'Organization',
                    period: this.getReportingPeriod(),
                    date: timestamp,
                    version: '1.0'
                }
            });

            console.log(`✅ PDF report generated: ${path.basename(pdfPath)}`);
            const stats = fs.statSync(pdfPath);
            console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);

            return pdfPath;

        } catch (error) {
            console.error('❌ PDF generation failed:', error.message);
            console.log('   Markdown reports are still available');
            // Non-fatal - return null to allow workflow to continue
            return null;
        }
    }

    /**
     * Get reporting period for cover page
     */
    getReportingPeriod() {
        const now = new Date();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    /**
     * Email report (stub for future implementation)
     */
    async emailReport(reportPaths, recipients) {
        console.log('\n📧 Email distribution not yet implemented');
        console.log(`   Would send to: ${recipients}`);
        // Future: Integrate with email service
        return null;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const reporter = new ExecutiveReporter();
    
    async function run() {
        switch (command) {
            case 'generate':
            case undefined:
                await reporter.generateExecutiveReport();
                break;
                
            case 'summary':
                const data = await reporter.gatherReportData();
                const analysis = reporter.analyzeData(data);
                const summary = reporter.generateExecutiveSummary(data, analysis);
                console.log(summary);
                break;
                
            case '--help':
            case 'help':
                console.log('Executive Reporter - Generate compliance reports for leadership\n');
                console.log('Usage: executive-reporter [command]\n');
                console.log('Commands:');
                console.log('  generate    Generate all executive reports (default)');
                console.log('  summary     Generate and display executive summary');
                console.log('  help        Show this help message\n');
                console.log('Examples:');
                console.log('  executive-reporter');
                console.log('  executive-reporter generate');
                console.log('  executive-reporter summary');
                break;
                
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    }
    
    run().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = ExecutiveReporter;