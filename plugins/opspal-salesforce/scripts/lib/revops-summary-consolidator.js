#!/usr/bin/env node

/**
 * RevOps Summary Consolidator
 *
 * Consolidates multiple RevOps audit outputs into a single executive summary.
 * Designed to run as a Stop hook after sfdc-revops-auditor completes.
 *
 * Usage:
 *   node revops-summary-consolidator.js <transcript-path> [--output-dir <dir>]
 *
 * Inputs:
 *   - Transcript path from agent execution
 *   - Working directory containing generated reports
 *
 * Outputs:
 *   - revops-executive-summary.html (executive PDF)
 *   - revops-summary-manifest.json (metadata for downstream hooks)
 *
 * Features:
 *   - Discovers RevOps artifacts (pipeline analysis, funnel reports, forecast accuracy)
 *   - Extracts key metrics and health scores
 *   - Calculates consolidated health score
 *   - Generates executive summary with recommendations
 *
 * @see quality-audit-summary-generator.js for similar pattern
 */

const fs = require('fs');
const path = require('path');
const { loadLog: loadMetricLog, summarizeLog: summarizeMetricLog } = require('./metric-semantic-log');
const { loadLog: loadDiagnosticsLog, summarizeLog: summarizeDiagnosticsLog } = require('./report-diagnostics-log');
const { loadLog: loadPersonaLog, summarizeLog: summarizePersonaLog } = require('./persona-kpi-log');

class RevOpsSummaryConsolidator {
    constructor(transcriptPath, outputDir) {
        this.transcriptPath = transcriptPath;
        this.outputDir = outputDir || path.dirname(transcriptPath);
        this.workingDir = this.outputDir;
        this.orgAlias = this.resolveOrgAlias();
    }

    /**
     * Main entry point - consolidate RevOps assessment outputs
     */
    async generate() {
        console.log('🔍 RevOps Summary Consolidator\n');

        try {
            // Phase 1: Discover generated artifacts
            console.log('Phase 1: Discovering RevOps artifacts...');
            const artifacts = await this.discoverArtifacts();
            console.log(`  Found: ${artifacts.reports.length} reports, ${artifacts.diagrams.length} diagrams\n`);

            // Phase 2: Extract key metrics from reports
            console.log('Phase 2: Extracting metrics and findings...');
            const metrics = await this.extractMetrics(artifacts.reports);
            const diagnosticsWarnings = [];
            const metricSemantics = this.loadMetricSemanticsSummary();
            if (metricSemantics) {
                metrics.metricSemantics = metricSemantics;
                if (!metricSemantics.totalEntries) {
                    diagnosticsWarnings.push('Metric semantics log is empty; report semantic validation may not have run.');
                }
            } else {
                diagnosticsWarnings.push('Metric semantics log not found; report semantic validation may not have run.');
            }
            const reportDiagnostics = this.loadReportDiagnosticsSummary();
            if (reportDiagnostics) {
                metrics.reportDiagnostics = reportDiagnostics;
                if (!reportDiagnostics.totalEntries) {
                    diagnosticsWarnings.push('Report diagnostics log is empty; report-intelligence-diagnostics may not have run.');
                }
            } else {
                diagnosticsWarnings.push('Report diagnostics log not found; report-intelligence-diagnostics may not have run.');
            }
            const personaKpi = this.loadPersonaKpiSummary();
            if (personaKpi) {
                metrics.personaKpi = personaKpi;
                if (!personaKpi.totalEntries) {
                    diagnosticsWarnings.push('Persona KPI log is empty; persona-kpi-validator may not have run.');
                }
            } else {
                diagnosticsWarnings.push('Persona KPI log not found; persona-kpi-validator may not have run.');
            }
            console.log(`  Extracted: ${Object.keys(metrics).length} metric categories\n`);

            // Phase 3: Calculate consolidated health score
            console.log('Phase 3: Calculating health score...');
            const healthScore = this.calculateHealthScore(metrics);
            console.log(`  Overall Health: ${healthScore.overall}/100 (${healthScore.grade})\n`);

            // Phase 4: Generate executive summary data structure
            console.log('Phase 4: Building summary structure...');
            const summaryData = this.buildSummaryData(metrics, healthScore, artifacts, diagnosticsWarnings);

            // Phase 5: Generate executive summary HTML/PDF
            console.log('Phase 5: Generating executive summary PDF...');
            const pdfPath = await this.generatePDF(summaryData);
            console.log(`  ✅ PDF: ${pdfPath}\n`);

            // Phase 6: Generate JSON manifest for downstream hooks
            console.log('Phase 6: Creating manifest...');
            const manifestPath = await this.generateManifest(summaryData, artifacts);
            console.log(`  ✅ Manifest: ${manifestPath}\n`);

            console.log('✅ RevOps summary consolidation complete\n');

            return {
                success: true,
                pdf: pdfPath,
                manifest: manifestPath,
                healthScore: healthScore.overall,
                artifactCount: artifacts.reports.length + artifacts.diagrams.length
            };

        } catch (error) {
            console.error('❌ Error consolidating RevOps summary:', error.message);
            throw error;
        }
    }

    /**
     * Discover all RevOps artifacts in working directory
     */
    async discoverArtifacts() {
        const artifacts = {
            reports: [],
            diagrams: [],
            dataFiles: []
        };

        if (!fs.existsSync(this.workingDir)) {
            console.warn(`  ⚠️  Working directory not found: ${this.workingDir}`);
            return artifacts;
        }

        const files = fs.readdirSync(this.workingDir);

        for (const file of files) {
            const filePath = path.join(this.workingDir, file);
            const ext = path.extname(file).toLowerCase();

            // Reports: markdown or HTML files with RevOps keywords
            if (['.md', '.html'].includes(ext) && this.isRevOpsReport(file)) {
                artifacts.reports.push(filePath);
            }

            // Diagrams: mermaid or image files
            if (['.mmd', '.png', '.svg', '.jpg'].includes(ext)) {
                artifacts.diagrams.push(filePath);
            }

            // Data files: JSON or CSV with metrics
            if (['.json', '.csv'].includes(ext) && !file.includes('manifest')) {
                artifacts.dataFiles.push(filePath);
            }
        }

        return artifacts;
    }

    /**
     * Check if file is a RevOps report
     */
    isRevOpsReport(filename) {
        const revopsKeywords = [
            'revops',
            'pipeline',
            'funnel',
            'forecast',
            'conversion',
            'velocity',
            'health',
            'gtm',
            'revenue'
        ];

        const lower = filename.toLowerCase();
        return revopsKeywords.some(keyword => lower.includes(keyword));
    }

    /**
     * Extract key metrics from reports
     */
    async extractMetrics(reportPaths) {
        const metrics = {
            pipeline: {},
            funnel: {},
            forecast: {},
            dataQuality: {},
            automation: {},
            gtm: {}
        };

        for (const reportPath of reportPaths) {
            const content = fs.readFileSync(reportPath, 'utf-8');

            // Extract pipeline metrics
            this.extractPipelineMetrics(content, metrics.pipeline);

            // Extract funnel metrics
            this.extractFunnelMetrics(content, metrics.funnel);

            // Extract forecast metrics
            this.extractForecastMetrics(content, metrics.forecast);

            // Extract data quality metrics
            this.extractDataQualityMetrics(content, metrics.dataQuality);
        }

        return metrics;
    }

    /**
     * Extract pipeline-specific metrics
     */
    extractPipelineMetrics(content, metricsObj) {
        // Look for pipeline value, count, velocity
        const pipelineValueMatch = content.match(/pipeline\s+value[:\s]+\$?([\d,]+)/i);
        const stageCountMatch = content.match(/(\d+)\s+opportunities/i);
        const velocityMatch = content.match(/velocity[:\s]+([\d.]+)\s+days/i);

        if (pipelineValueMatch) {
            metricsObj.totalValue = pipelineValueMatch[1].replace(/,/g, '');
        }
        if (stageCountMatch) {
            metricsObj.opportunityCount = parseInt(stageCountMatch[1]);
        }
        if (velocityMatch) {
            metricsObj.avgVelocity = parseFloat(velocityMatch[1]);
        }
    }

    /**
     * Extract funnel conversion metrics
     */
    extractFunnelMetrics(content, metricsObj) {
        // Look for stage conversion rates
        const conversionMatches = content.matchAll(/([\w\s]+)\s*(?:conversion|rate)[:\s]+([\d.]+)%/gi);

        for (const match of conversionMatches) {
            const stage = match[1].trim().toLowerCase();
            const rate = parseFloat(match[2]);
            metricsObj[stage] = rate;
        }
    }

    /**
     * Extract forecast accuracy metrics
     */
    extractForecastMetrics(content, metricsObj) {
        const accuracyMatch = content.match(/forecast\s+accuracy[:\s]+([\d.]+)%/i);
        const varianceMatch = content.match(/variance[:\s]+([+-]?[\d.]+)%/i);

        if (accuracyMatch) {
            metricsObj.accuracy = parseFloat(accuracyMatch[1]);
        }
        if (varianceMatch) {
            metricsObj.variance = parseFloat(varianceMatch[1]);
        }
    }

    /**
     * Extract data quality metrics
     */
    extractDataQualityMetrics(content, metricsObj) {
        const completenessMatch = content.match(/completeness[:\s]+([\d.]+)%/i);
        const accuracyMatch = content.match(/accuracy[:\s]+([\d.]+)%/i);

        if (completenessMatch) {
            metricsObj.completeness = parseFloat(completenessMatch[1]);
        }
        if (accuracyMatch) {
            metricsObj.accuracy = parseFloat(accuracyMatch[1]);
        }
    }

    /**
     * Calculate consolidated health score
     */
    calculateHealthScore(metrics) {
        const weights = {
            pipeline: 0.25,
            funnel: 0.25,
            forecast: 0.20,
            dataQuality: 0.20,
            automation: 0.10
        };

        const scores = {};

        // Pipeline health (based on velocity and value)
        scores.pipeline = this.scorePipeline(metrics.pipeline);

        // Funnel health (based on conversion rates)
        scores.funnel = this.scoreFunnel(metrics.funnel);

        // Forecast health (based on accuracy)
        scores.forecast = this.scoreForecast(metrics.forecast);

        // Data quality health
        scores.dataQuality = this.scoreDataQuality(metrics.dataQuality);

        // Automation health (default if not available)
        scores.automation = metrics.automation.score || 70;

        // Calculate weighted average
        const overall = Object.keys(weights).reduce((sum, key) => {
            return sum + (scores[key] * weights[key]);
        }, 0);

        const grade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : 'D';

        return {
            overall: Math.round(overall),
            grade,
            breakdown: scores,
            weights
        };
    }

    scorePipeline(pipeline) {
        // Simple heuristic: velocity < 30 days = good
        const velocity = pipeline.avgVelocity || 45;
        if (velocity < 30) return 90;
        if (velocity < 45) return 75;
        if (velocity < 60) return 60;
        return 45;
    }

    scoreFunnel(funnel) {
        // Average conversion rates
        const rates = Object.values(funnel).filter(v => typeof v === 'number');
        if (rates.length === 0) return 70; // default

        const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
        return Math.min(100, avg * 1.2); // Scale up slightly
    }

    scoreForecast(forecast) {
        const accuracy = forecast.accuracy || 70;
        return accuracy;
    }

    scoreDataQuality(dataQuality) {
        const completeness = dataQuality.completeness || 70;
        const accuracy = dataQuality.accuracy || 70;
        return (completeness + accuracy) / 2;
    }

    /**
     * Build summary data structure
     */
    buildSummaryData(metrics, healthScore, artifacts, diagnosticsWarnings = []) {
        return {
            type: 'revops-assessment',
            generatedAt: new Date().toISOString(),
            healthScore,
            metrics,
            artifacts: {
                reports: artifacts.reports.map(p => path.basename(p)),
                diagrams: artifacts.diagrams.map(p => path.basename(p)),
                dataFiles: artifacts.dataFiles.map(p => path.basename(p))
            },
            recommendations: this.generateRecommendations(healthScore, metrics),
            metadata: {
                hookType: 'Stop',
                agentName: 'sfdc-revops-auditor',
                consolidatorVersion: '1.0.0',
                warnings: diagnosticsWarnings.length > 0 ? diagnosticsWarnings : undefined
            }
        };
    }

    /**
     * Generate recommendations based on health score
     */
    generateRecommendations(healthScore, metrics) {
        const recommendations = [];

        // Pipeline recommendations
        if (healthScore.breakdown.pipeline < 70) {
            recommendations.push({
                area: 'Pipeline Management',
                priority: 'HIGH',
                finding: `Pipeline velocity is ${metrics.pipeline.avgVelocity || 'unknown'} days`,
                recommendation: 'Implement stage automation and improve qualification criteria'
            });
        }

        // Funnel recommendations
        if (healthScore.breakdown.funnel < 60) {
            recommendations.push({
                area: 'Funnel Optimization',
                priority: 'HIGH',
                finding: 'Low conversion rates detected',
                recommendation: 'Review stage definitions and entry/exit criteria'
            });
        }

        // Forecast recommendations
        if (healthScore.breakdown.forecast < 75) {
            recommendations.push({
                area: 'Forecast Accuracy',
                priority: 'MEDIUM',
                finding: `Forecast accuracy: ${metrics.forecast.accuracy || 'unknown'}%`,
                recommendation: 'Improve data quality and sales process adherence'
            });
        }

        // Data quality recommendations
        if (healthScore.breakdown.dataQuality < 70) {
            recommendations.push({
                area: 'Data Quality',
                priority: 'HIGH',
                finding: 'Data completeness or accuracy issues',
                recommendation: 'Implement validation rules and required fields'
            });
        }

        if (metrics.metricSemantics) {
            const semanticWarnings = metrics.metricSemantics.semanticWarnings || 0;
            const failureModeWarnings = metrics.metricSemantics.failureModeWarnings || 0;
            if (semanticWarnings > 0 || failureModeWarnings > 0) {
                recommendations.push({
                    area: 'Reporting Semantics',
                    priority: failureModeWarnings > 0 ? 'HIGH' : 'MEDIUM',
                    finding: `Found ${semanticWarnings} semantic warnings and ${failureModeWarnings} failure mode warnings in report definitions`,
                    recommendation: 'Confirm metric field mappings, date filters, and joins for high-impact reports'
                });
            }
        }

        if (metrics.reportDiagnostics) {
            const failCount = metrics.reportDiagnostics.failCount || 0;
            const warnCount = metrics.reportDiagnostics.warnCount || 0;
            if (failCount > 0 || warnCount > 0) {
                recommendations.push({
                    area: 'Report Diagnostics',
                    priority: failCount > 0 ? 'HIGH' : 'MEDIUM',
                    finding: `Report diagnostics flagged ${failCount} fail and ${warnCount} warn statuses`,
                    recommendation: 'Review report intent alignment, filters, and health rubric issues before wider use'
                });
            }
        }

        if (metrics.personaKpi) {
            const warnCount = metrics.personaKpi.warnCount || 0;
            if (warnCount > 0) {
                recommendations.push({
                    area: 'Persona KPI Alignment',
                    priority: 'MEDIUM',
                    finding: `Persona KPI checks flagged ${warnCount} warning(s)`,
                    recommendation: 'Adjust dashboard KPIs and targets to align with executive and RevOps decision needs'
                });
            }
        }

        return recommendations;
    }

    /**
     * Generate executive summary PDF
     */
    async generatePDF(summaryData) {
        const outputPath = path.join(this.outputDir, 'revops-executive-summary.html');

        const html = this.generateHTML(summaryData);
        fs.writeFileSync(outputPath, html);

        console.log(`  Generated HTML summary: ${outputPath}`);
        return outputPath;
    }

    /**
     * Generate HTML for executive summary
     */
    generateHTML(data) {
        const { healthScore, metrics, recommendations, artifacts } = data;

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>RevOps Executive Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .health-score { font-size: 48px; font-weight: bold; color: ${this.getScoreColor(healthScore.overall)}; }
        .grade { font-size: 24px; margin-left: 10px; }
        .metric-box { display: inline-block; margin: 10px; padding: 15px; background: #ecf0f1; border-radius: 5px; }
        .recommendation { margin: 15px 0; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; }
        .priority-HIGH { border-left-color: #dc3545; }
        .priority-MEDIUM { border-left-color: #ffc107; }
        .priority-LOW { border-left-color: #28a745; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #3498db; color: white; }
    </style>
</head>
<body>
    <h1>RevOps Assessment - Executive Summary</h1>
    <p><strong>Generated:</strong> ${new Date(data.generatedAt).toLocaleString()}</p>

    <h2>Overall Health Score</h2>
    <div>
        <span class="health-score">${healthScore.overall}</span>
        <span class="grade">Grade: ${healthScore.grade}</span>
    </div>

    <h2>Health Breakdown</h2>
    <div>
        ${Object.entries(healthScore.breakdown).map(([area, score]) => `
            <div class="metric-box">
                <strong>${this.capitalize(area)}</strong><br>
                <span style="font-size: 24px; color: ${this.getScoreColor(score)};">${score}</span>/100
            </div>
        `).join('')}
    </div>

    <h2>Key Metrics</h2>
    <table>
        <tr><th>Metric</th><th>Value</th></tr>
        ${this.formatMetricsTable(metrics)}
    </table>

    <h2>Metric Semantics</h2>
    <table>
        <tr><th>Signal</th><th>Value</th></tr>
        ${this.formatMetricSemanticsTable(metrics.metricSemantics)}
    </table>

    <h2>Report Diagnostics</h2>
    <table>
        <tr><th>Signal</th><th>Value</th></tr>
        ${this.formatReportDiagnosticsTable(metrics.reportDiagnostics)}
    </table>

    <h2>Persona KPI Alignment</h2>
    <table>
        <tr><th>Signal</th><th>Value</th></tr>
        ${this.formatPersonaKpiTable(metrics.personaKpi)}
    </table>

    <h2>Recommendations</h2>
    ${recommendations.map(rec => `
        <div class="recommendation priority-${rec.priority}">
            <strong>${rec.area}</strong> (Priority: ${rec.priority})<br>
            <strong>Finding:</strong> ${rec.finding}<br>
            <strong>Recommendation:</strong> ${rec.recommendation}
        </div>
    `).join('')}

    <h2>Generated Artifacts</h2>
    <ul>
        ${artifacts.reports.map(r => `<li>Report: ${r}</li>`).join('')}
        ${artifacts.diagrams.map(d => `<li>Diagram: ${d}</li>`).join('')}
    </ul>

    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; color: #7f8c8d;">
        <p>Generated by sfdc-revops-auditor Stop hook</p>
    </footer>
</body>
</html>`;
    }

    formatMetricsTable(metrics) {
        const rows = [];

        if (metrics.pipeline.totalValue) {
            rows.push(`<tr><td>Pipeline Value</td><td>$${this.formatNumber(metrics.pipeline.totalValue)}</td></tr>`);
        }
        if (metrics.pipeline.opportunityCount) {
            rows.push(`<tr><td>Opportunity Count</td><td>${metrics.pipeline.opportunityCount}</td></tr>`);
        }
        if (metrics.pipeline.avgVelocity) {
            rows.push(`<tr><td>Avg Sales Velocity</td><td>${metrics.pipeline.avgVelocity} days</td></tr>`);
        }
        if (metrics.forecast.accuracy) {
            rows.push(`<tr><td>Forecast Accuracy</td><td>${metrics.forecast.accuracy}%</td></tr>`);
        }
        if (metrics.dataQuality.completeness) {
            rows.push(`<tr><td>Data Completeness</td><td>${metrics.dataQuality.completeness}%</td></tr>`);
        }

        return rows.join('') || '<tr><td colspan="2">No metrics extracted</td></tr>';
    }

    formatMetricSemanticsTable(metricSemantics) {
        if (!metricSemantics) {
            return '<tr><td colspan="2">No metric semantics log found</td></tr>';
        }

        const rows = [];
        rows.push(`<tr><td>Mapping Decisions</td><td>${metricSemantics.mappingDecisions || 0}</td></tr>`);
        rows.push(`<tr><td>Semantic Warnings</td><td>${metricSemantics.semanticWarnings || 0}</td></tr>`);
        rows.push(`<tr><td>Failure Mode Warnings</td><td>${metricSemantics.failureModeWarnings || 0}</td></tr>`);

        if (metricSemantics.lastUpdated) {
            rows.push(`<tr><td>Last Updated</td><td>${this.formatDate(metricSemantics.lastUpdated)}</td></tr>`);
        }

        return rows.join('');
    }

    formatReportDiagnosticsTable(reportDiagnostics) {
        if (!reportDiagnostics) {
            return '<tr><td colspan="2">No report diagnostics log found</td></tr>';
        }

        const rows = [];
        rows.push(`<tr><td>Pass</td><td>${reportDiagnostics.passCount || 0}</td></tr>`);
        rows.push(`<tr><td>Warn</td><td>${reportDiagnostics.warnCount || 0}</td></tr>`);
        rows.push(`<tr><td>Fail</td><td>${reportDiagnostics.failCount || 0}</td></tr>`);

        if (reportDiagnostics.lastUpdated) {
            rows.push(`<tr><td>Last Updated</td><td>${this.formatDate(reportDiagnostics.lastUpdated)}</td></tr>`);
        }

        return rows.join('');
    }

    formatPersonaKpiTable(personaKpi) {
        if (!personaKpi) {
            return '<tr><td colspan="2">No persona KPI log found</td></tr>';
        }

        const rows = [];
        rows.push(`<tr><td>Pass</td><td>${personaKpi.passCount || 0}</td></tr>`);
        rows.push(`<tr><td>Warn</td><td>${personaKpi.warnCount || 0}</td></tr>`);

        if (personaKpi.lastUpdated) {
            rows.push(`<tr><td>Last Updated</td><td>${this.formatDate(personaKpi.lastUpdated)}</td></tr>`);
        }

        return rows.join('');
    }

    resolveOrgAlias() {
        if (process.env.ORG_ALIAS) {
            return process.env.ORG_ALIAS;
        }

        const candidates = [this.transcriptPath, this.outputDir, this.workingDir].filter(Boolean);
        for (const candidate of candidates) {
            const match = candidate.match(/instances[\\/]+salesforce[\\/]+([^\\/]+)/i);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    loadMetricSemanticsSummary() {
        const orgAlias = this.orgAlias || this.resolveOrgAlias();
        if (!orgAlias) {
            return null;
        }

        try {
            const log = loadMetricLog(orgAlias);
            const summary = summarizeMetricLog(log);
            summary.orgAlias = orgAlias;
            return summary;
        } catch (error) {
            console.warn(`  ⚠️  Unable to load metric semantics log for ${orgAlias}: ${error.message}`);
            return null;
        }
    }

    loadReportDiagnosticsSummary() {
        const orgAlias = this.orgAlias || this.resolveOrgAlias();
        if (!orgAlias) {
            return null;
        }

        try {
            const log = loadDiagnosticsLog(orgAlias);
            const summary = summarizeDiagnosticsLog(log);
            summary.orgAlias = orgAlias;
            return summary;
        } catch (error) {
            console.warn(`  ⚠️  Unable to load report diagnostics log for ${orgAlias}: ${error.message}`);
            return null;
        }
    }

    loadPersonaKpiSummary() {
        const orgAlias = this.orgAlias || this.resolveOrgAlias();
        if (!orgAlias) {
            return null;
        }

        try {
            const log = loadPersonaLog(orgAlias);
            const summary = summarizePersonaLog(log);
            summary.orgAlias = orgAlias;
            return summary;
        } catch (error) {
            console.warn(`  ⚠️  Unable to load persona KPI log for ${orgAlias}: ${error.message}`);
            return null;
        }
    }

    formatNumber(num) {
        return parseInt(num).toLocaleString();
    }

    formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleString();
    }

    getScoreColor(score) {
        if (score >= 85) return '#28a745'; // green
        if (score >= 70) return '#ffc107'; // yellow
        if (score >= 55) return '#fd7e14'; // orange
        return '#dc3545'; // red
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Generate JSON manifest for downstream hooks
     */
    async generateManifest(summaryData, artifacts) {
        const manifestPath = path.join(this.outputDir, 'revops-summary-manifest.json');

        const manifest = {
            ...summaryData,
            generatedBy: 'revops-summary-consolidator.js',
            version: '1.0.0'
        };

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        return manifestPath;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Usage: node revops-summary-consolidator.js <transcript-path> [options]

Options:
  --output-dir <dir>    Output directory for generated files
  --help                Show this help message

Environment Variables:
  WORKING_DIR          Override working directory for artifact discovery
  ORG_ALIAS            Org alias for context (optional)
`);
        process.exit(0);
    }

    const transcriptPath = args[0];
    const outputDirIdx = args.indexOf('--output-dir');
    const outputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;

    const consolidator = new RevOpsSummaryConsolidator(transcriptPath, outputDir);

    consolidator.generate()
        .then(result => {
            console.log('Result:', JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = RevOpsSummaryConsolidator;
