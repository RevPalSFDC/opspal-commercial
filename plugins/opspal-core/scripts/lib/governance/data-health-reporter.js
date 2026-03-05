/**
 * Data Health Reporter
 *
 * Generates comprehensive data quality health reports and scorecards
 * based on field telemetry, anomaly detection, and governance metrics.
 *
 * @module governance/data-health-reporter
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Report types
 */
const REPORT_TYPES = {
    SCORECARD: 'scorecard',
    DETAILED: 'detailed',
    EXECUTIVE: 'executive',
    FIELD_HEALTH: 'field_health',
    ANOMALY_SUMMARY: 'anomaly_summary',
    TREND: 'trend'
};

/**
 * Report formats
 */
const REPORT_FORMATS = {
    JSON: 'json',
    MARKDOWN: 'markdown',
    HTML: 'html',
    CSV: 'csv'
};

/**
 * Health grade definitions
 */
const HEALTH_GRADES = {
    A: { min: 90, label: 'Excellent', color: '#22c55e' },
    B: { min: 80, label: 'Good', color: '#84cc16' },
    C: { min: 70, label: 'Fair', color: '#eab308' },
    D: { min: 60, label: 'Poor', color: '#f97316' },
    F: { min: 0, label: 'Critical', color: '#ef4444' }
};

/**
 * Data Health Reporter
 */
class DataHealthReporter {
    /**
     * Create a data health reporter
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Dependencies
        this.telemetryAnalyzer = options.telemetryAnalyzer || null;
        this.anomalyDetector = options.anomalyDetector || null;
        this.governanceController = options.governanceController || null;

        // Configuration
        this.orgName = options.orgName || 'Unknown Org';
        this.defaultFormat = options.defaultFormat || REPORT_FORMATS.JSON;
        this.includeRecommendations = options.includeRecommendations !== false;
        this.includeTrends = options.includeTrends !== false;

        // Weight configuration for overall score
        this.scoreWeights = {
            population: 0.30,
            staleness: 0.25,
            anomalies: 0.20,
            compliance: 0.15,
            consistency: 0.10,
            ...options.scoreWeights
        };

        // History for trend analysis
        this._history = [];
        this._maxHistoryEntries = options.maxHistoryEntries || 90;
    }

    /**
     * Generate a health scorecard
     * @param {Object} data - Analysis data
     * @param {Object} options - Report options
     * @returns {Object} Health scorecard
     */
    generateScorecard(data, options = {}) {
        const startTime = Date.now();

        // Calculate dimension scores
        const dimensions = this._calculateDimensionScores(data);

        // Calculate overall score
        const overallScore = this._calculateOverallScore(dimensions);
        const grade = this._scoreToGrade(overallScore);

        // Get top issues
        const topIssues = this._identifyTopIssues(data, dimensions);

        // Generate quick wins
        const quickWins = this._identifyQuickWins(data, dimensions);

        const scorecard = {
            type: REPORT_TYPES.SCORECARD,
            generatedAt: new Date().toISOString(),
            orgName: this.orgName,
            summary: {
                overallScore,
                grade: grade.letter,
                gradeLabel: grade.label,
                trend: this._calculateTrend(overallScore)
            },
            dimensions,
            topIssues: topIssues.slice(0, 5),
            quickWins: quickWins.slice(0, 3),
            recordCounts: this._extractRecordCounts(data),
            duration_ms: Date.now() - startTime
        };

        // Store in history for trend analysis
        this._addToHistory({
            date: scorecard.generatedAt,
            overallScore,
            dimensions
        });

        return scorecard;
    }

    /**
     * Generate a detailed health report
     * @param {Object} data - Analysis data
     * @param {Object} options - Report options
     * @returns {Object} Detailed report
     */
    generateDetailedReport(data, options = {}) {
        const startTime = Date.now();
        const scorecard = this.generateScorecard(data, options);

        // Add detailed breakdowns
        const detailedReport = {
            ...scorecard,
            type: REPORT_TYPES.DETAILED,
            fieldAnalysis: this._generateFieldAnalysis(data),
            anomalyBreakdown: this._generateAnomalyBreakdown(data),
            complianceStatus: this._generateComplianceStatus(data),
            populationAnalysis: this._generatePopulationAnalysis(data),
            stalenessAnalysis: this._generateStalenessAnalysis(data),
            recommendations: this.includeRecommendations
                ? this._generateDetailedRecommendations(data, scorecard)
                : [],
            trends: this.includeTrends
                ? this._generateTrendAnalysis()
                : null,
            metadata: {
                reportVersion: '1.0.0',
                dataSourceCount: this._countDataSources(data),
                fieldsAnalyzed: this._countFieldsAnalyzed(data),
                recordsAnalyzed: this._countRecordsAnalyzed(data)
            },
            duration_ms: Date.now() - startTime
        };

        return detailedReport;
    }

    /**
     * Generate an executive summary report
     * @param {Object} data - Analysis data
     * @param {Object} options - Report options
     * @returns {Object} Executive summary
     */
    generateExecutiveSummary(data, options = {}) {
        const scorecard = this.generateScorecard(data, options);

        return {
            type: REPORT_TYPES.EXECUTIVE,
            generatedAt: new Date().toISOString(),
            orgName: this.orgName,

            // BLUF - Bottom Line Up Front
            bottomLine: this._generateBottomLine(scorecard),

            // Key metrics (3-5 numbers)
            keyMetrics: {
                overallHealthScore: scorecard.summary.overallScore,
                grade: scorecard.summary.grade,
                criticalIssues: scorecard.topIssues.filter(i => i.priority === 'high').length,
                recordsAtRisk: this._calculateRecordsAtRisk(data),
                estimatedImpact: this._estimateBusinessImpact(scorecard)
            },

            // Status indicators
            statusIndicators: Object.entries(scorecard.dimensions).map(([name, dim]) => ({
                name: this._formatDimensionName(name),
                score: dim.score,
                status: this._scoreToStatus(dim.score),
                trend: dim.trend || 'stable'
            })),

            // Priority actions (max 3)
            priorityActions: scorecard.topIssues.slice(0, 3).map(issue => ({
                action: issue.recommendation,
                impact: issue.impact,
                effort: issue.effort || 'medium'
            })),

            // Comparison to previous period
            comparison: this._generatePeriodComparison()
        };
    }

    /**
     * Calculate dimension scores
     * @private
     */
    _calculateDimensionScores(data) {
        const dimensions = {};

        // Population dimension
        dimensions.population = {
            score: this._calculatePopulationScore(data),
            weight: this.scoreWeights.population,
            metrics: this._extractPopulationMetrics(data)
        };

        // Staleness dimension
        dimensions.staleness = {
            score: this._calculateStalenessScore(data),
            weight: this.scoreWeights.staleness,
            metrics: this._extractStalenessMetrics(data)
        };

        // Anomalies dimension
        dimensions.anomalies = {
            score: this._calculateAnomalyScore(data),
            weight: this.scoreWeights.anomalies,
            metrics: this._extractAnomalyMetrics(data)
        };

        // Compliance dimension
        dimensions.compliance = {
            score: this._calculateComplianceScore(data),
            weight: this.scoreWeights.compliance,
            metrics: this._extractComplianceMetrics(data)
        };

        // Consistency dimension
        dimensions.consistency = {
            score: this._calculateConsistencyScore(data),
            weight: this.scoreWeights.consistency,
            metrics: this._extractConsistencyMetrics(data)
        };

        return dimensions;
    }

    /**
     * Calculate overall weighted score
     * @private
     */
    _calculateOverallScore(dimensions) {
        let totalWeight = 0;
        let weightedSum = 0;

        for (const dim of Object.values(dimensions)) {
            weightedSum += dim.score * dim.weight;
            totalWeight += dim.weight;
        }

        return totalWeight > 0
            ? Math.round(weightedSum / totalWeight)
            : 0;
    }

    /**
     * Calculate population score
     * @private
     */
    _calculatePopulationScore(data) {
        if (!data.fieldAnalysis) return 50;

        const fields = Object.values(data.fieldAnalysis);
        if (fields.length === 0) return 50;

        const avgPopulation = fields.reduce((sum, f) =>
            sum + (f.metrics?.populationRate || 0), 0) / fields.length;

        return Math.round(avgPopulation * 100);
    }

    /**
     * Calculate staleness score
     * @private
     */
    _calculateStalenessScore(data) {
        if (!data.fieldAnalysis) return 50;

        const fields = Object.values(data.fieldAnalysis);
        if (fields.length === 0) return 50;

        const avgFreshness = fields.reduce((sum, f) =>
            sum + (1 - (f.metrics?.stalenessRate || 0)), 0) / fields.length;

        return Math.round(avgFreshness * 100);
    }

    /**
     * Calculate anomaly score
     * @private
     */
    _calculateAnomalyScore(data) {
        if (!data.anomalies) return 80;

        const totalRecords = data.totalRecords || 1000;
        const anomalyCount = data.anomalies.length || 0;
        const anomalyRate = anomalyCount / totalRecords;

        // Fewer anomalies = higher score
        if (anomalyRate <= 0.01) return 95;
        if (anomalyRate <= 0.05) return 80;
        if (anomalyRate <= 0.10) return 65;
        if (anomalyRate <= 0.20) return 50;
        return 30;
    }

    /**
     * Calculate compliance score
     * @private
     */
    _calculateComplianceScore(data) {
        if (!data.compliance) return 70;

        const checks = data.compliance.checks || [];
        if (checks.length === 0) return 70;

        const passingChecks = checks.filter(c => c.passed).length;
        return Math.round((passingChecks / checks.length) * 100);
    }

    /**
     * Calculate consistency score
     * @private
     */
    _calculateConsistencyScore(data) {
        if (!data.consistency) return 70;

        // Based on format consistency, duplicate rate, relationship integrity
        const formatScore = data.consistency.formatConsistency || 0.8;
        const duplicateScore = 1 - (data.consistency.duplicateRate || 0.1);
        const relationshipScore = data.consistency.relationshipIntegrity || 0.9;

        return Math.round(((formatScore + duplicateScore + relationshipScore) / 3) * 100);
    }

    /**
     * Convert score to letter grade
     * @private
     */
    _scoreToGrade(score) {
        for (const [letter, config] of Object.entries(HEALTH_GRADES)) {
            if (score >= config.min) {
                return { letter, label: config.label, color: config.color };
            }
        }
        return { letter: 'F', label: 'Critical', color: '#ef4444' };
    }

    /**
     * Convert score to status string
     * @private
     */
    _scoreToStatus(score) {
        if (score >= 80) return 'healthy';
        if (score >= 60) return 'warning';
        return 'critical';
    }

    /**
     * Identify top issues
     * @private
     */
    _identifyTopIssues(data, dimensions) {
        const issues = [];

        // Check each dimension for issues
        for (const [name, dim] of Object.entries(dimensions)) {
            if (dim.score < 70) {
                issues.push({
                    dimension: name,
                    score: dim.score,
                    priority: dim.score < 50 ? 'high' : 'medium',
                    issue: this._describeIssue(name, dim),
                    recommendation: this._generateRecommendation(name, dim),
                    impact: this._estimateImpact(name, dim),
                    metrics: dim.metrics
                });
            }
        }

        // Add anomaly-specific issues
        if (data.anomalies) {
            const highSeverity = data.anomalies.filter(a => a.severity === 'high');
            if (highSeverity.length > 0) {
                issues.push({
                    dimension: 'anomalies',
                    score: dimensions.anomalies?.score || 50,
                    priority: 'high',
                    issue: `${highSeverity.length} high-severity anomalies detected`,
                    recommendation: 'Review and resolve high-severity anomalies immediately',
                    impact: 'Data integrity at risk',
                    count: highSeverity.length
                });
            }
        }

        return issues.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        });
    }

    /**
     * Identify quick wins
     * @private
     */
    _identifyQuickWins(data, dimensions) {
        const quickWins = [];

        // Low-hanging fruit based on dimension scores
        if (dimensions.population?.score < 80 && dimensions.population?.score >= 60) {
            quickWins.push({
                action: 'Enable enrichment for low-population fields',
                estimatedImprovement: '+10-15 points',
                effort: 'low',
                timeframe: '1-2 days'
            });
        }

        if (dimensions.staleness?.score < 80) {
            quickWins.push({
                action: 'Schedule re-enrichment for stale records',
                estimatedImprovement: '+5-10 points',
                effort: 'low',
                timeframe: '1 day'
            });
        }

        if (dimensions.consistency?.score < 80) {
            quickWins.push({
                action: 'Run duplicate detection and merge obvious matches',
                estimatedImprovement: '+5-8 points',
                effort: 'medium',
                timeframe: '2-3 days'
            });
        }

        return quickWins;
    }

    /**
     * Generate bottom line summary
     * @private
     */
    _generateBottomLine(scorecard) {
        const grade = scorecard.summary.grade;
        const trend = scorecard.summary.trend;
        const criticalCount = scorecard.topIssues.filter(i => i.priority === 'high').length;

        let summary = `Data quality is ${scorecard.summary.gradeLabel.toLowerCase()} (Grade ${grade}).`;

        if (trend === 'improving') {
            summary += ' Quality has been improving over the past period.';
        } else if (trend === 'declining') {
            summary += ' Quality has been declining and needs attention.';
        }

        if (criticalCount > 0) {
            summary += ` ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} require${criticalCount === 1 ? 's' : ''} immediate attention.`;
        }

        return summary;
    }

    /**
     * Calculate trend from history
     * @private
     */
    _calculateTrend(currentScore) {
        if (this._history.length < 2) return 'stable';

        const recent = this._history.slice(-7);
        const avgRecent = recent.reduce((sum, h) => sum + h.overallScore, 0) / recent.length;

        if (currentScore > avgRecent + 3) return 'improving';
        if (currentScore < avgRecent - 3) return 'declining';
        return 'stable';
    }

    /**
     * Add entry to history
     * @private
     */
    _addToHistory(entry) {
        this._history.push(entry);
        if (this._history.length > this._maxHistoryEntries) {
            this._history.shift();
        }
    }

    /**
     * Generate trend analysis
     * @private
     */
    _generateTrendAnalysis() {
        if (this._history.length < 2) {
            return { available: false, message: 'Insufficient history for trend analysis' };
        }

        const scores = this._history.map(h => h.overallScore);
        const dates = this._history.map(h => h.date);

        // Calculate simple moving average
        const windowSize = Math.min(7, scores.length);
        const movingAvg = [];
        for (let i = windowSize - 1; i < scores.length; i++) {
            const window = scores.slice(i - windowSize + 1, i + 1);
            movingAvg.push(Math.round(window.reduce((a, b) => a + b, 0) / windowSize));
        }

        // Determine trend direction
        const firstHalf = movingAvg.slice(0, Math.floor(movingAvg.length / 2));
        const secondHalf = movingAvg.slice(Math.floor(movingAvg.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        return {
            available: true,
            dataPoints: scores.length,
            currentScore: scores[scores.length - 1],
            averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            minScore: Math.min(...scores),
            maxScore: Math.max(...scores),
            direction: secondAvg > firstAvg + 2 ? 'improving' :
                secondAvg < firstAvg - 2 ? 'declining' : 'stable',
            movingAverage: movingAvg,
            periodStart: dates[0],
            periodEnd: dates[dates.length - 1]
        };
    }

    /**
     * Generate period comparison
     * @private
     */
    _generatePeriodComparison() {
        if (this._history.length < 14) {
            return null;
        }

        const currentWeek = this._history.slice(-7);
        const previousWeek = this._history.slice(-14, -7);

        const currentAvg = currentWeek.reduce((sum, h) => sum + h.overallScore, 0) / 7;
        const previousAvg = previousWeek.reduce((sum, h) => sum + h.overallScore, 0) / 7;

        return {
            currentPeriodAvg: Math.round(currentAvg),
            previousPeriodAvg: Math.round(previousAvg),
            change: Math.round(currentAvg - previousAvg),
            percentChange: Math.round(((currentAvg - previousAvg) / previousAvg) * 100)
        };
    }

    // Helper methods for metrics extraction
    _extractPopulationMetrics(data) {
        if (!data.fieldAnalysis) return {};
        const fields = Object.values(data.fieldAnalysis);
        return {
            avgPopulationRate: fields.length > 0
                ? Math.round(fields.reduce((sum, f) => sum + (f.metrics?.populationRate || 0), 0) / fields.length * 100) / 100
                : 0,
            lowPopulationFields: fields.filter(f => (f.metrics?.populationRate || 0) < 0.7).length,
            criticalFieldsCoverage: this._calculateCriticalFieldsCoverage(data)
        };
    }

    _extractStalenessMetrics(data) {
        if (!data.fieldAnalysis) return {};
        const fields = Object.values(data.fieldAnalysis);
        return {
            avgStalenessRate: fields.length > 0
                ? Math.round(fields.reduce((sum, f) => sum + (f.metrics?.stalenessRate || 0), 0) / fields.length * 100) / 100
                : 0,
            staleFields: fields.filter(f => (f.metrics?.stalenessRate || 0) > 0.25).length,
            oldestUpdateDays: this._findOldestUpdate(data)
        };
    }

    _extractAnomalyMetrics(data) {
        if (!data.anomalies) return {};
        return {
            totalAnomalies: data.anomalies.length,
            bySeverity: {
                high: data.anomalies.filter(a => a.severity === 'high').length,
                medium: data.anomalies.filter(a => a.severity === 'medium').length,
                low: data.anomalies.filter(a => a.severity === 'low').length
            },
            byType: this._groupAnomaliesByType(data.anomalies)
        };
    }

    _extractComplianceMetrics(data) {
        if (!data.compliance) return {};
        return {
            checksRun: data.compliance.checks?.length || 0,
            checksPassed: data.compliance.checks?.filter(c => c.passed).length || 0,
            gdprCompliant: data.compliance.gdpr?.compliant || false,
            ccpaCompliant: data.compliance.ccpa?.compliant || false
        };
    }

    _extractConsistencyMetrics(data) {
        return {
            formatConsistency: data.consistency?.formatConsistency || null,
            duplicateRate: data.consistency?.duplicateRate || null,
            relationshipIntegrity: data.consistency?.relationshipIntegrity || null
        };
    }

    _extractRecordCounts(data) {
        return {
            total: data.totalRecords || 0,
            accounts: data.recordCounts?.accounts || 0,
            contacts: data.recordCounts?.contacts || 0,
            leads: data.recordCounts?.leads || 0
        };
    }

    _calculateCriticalFieldsCoverage(data) {
        // Placeholder - would check critical fields population
        return 0.85;
    }

    _findOldestUpdate(data) {
        // Placeholder - would find oldest update in field analysis
        return null;
    }

    _groupAnomaliesByType(anomalies) {
        const grouped = {};
        for (const anomaly of anomalies) {
            const type = anomaly.type || 'unknown';
            grouped[type] = (grouped[type] || 0) + 1;
        }
        return grouped;
    }

    _calculateRecordsAtRisk(data) {
        // Records with anomalies or staleness issues
        return (data.anomalies?.length || 0) +
            (data.staleRecords?.length || 0);
    }

    _estimateBusinessImpact(scorecard) {
        const score = scorecard.summary.overallScore;
        if (score >= 90) return 'minimal';
        if (score >= 70) return 'low';
        if (score >= 50) return 'moderate';
        return 'significant';
    }

    _formatDimensionName(name) {
        return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
    }

    _describeIssue(dimensionName, dimension) {
        const descriptions = {
            population: `Data population is at ${dimension.score}%, below target`,
            staleness: `${100 - dimension.score}% of data may be outdated`,
            anomalies: `Anomaly rate is higher than acceptable`,
            compliance: `Compliance checks are failing`,
            consistency: `Data consistency issues detected`
        };
        return descriptions[dimensionName] || `${dimensionName} score is ${dimension.score}%`;
    }

    _generateRecommendation(dimensionName, dimension) {
        const recommendations = {
            population: 'Enable automated enrichment for low-population fields',
            staleness: 'Schedule periodic data refresh and re-enrichment',
            anomalies: 'Review and resolve detected anomalies',
            compliance: 'Address failing compliance checks',
            consistency: 'Run deduplication and standardization processes'
        };
        return recommendations[dimensionName] || `Improve ${dimensionName} score`;
    }

    _estimateImpact(dimensionName, dimension) {
        if (dimension.score < 50) return 'high';
        if (dimension.score < 70) return 'medium';
        return 'low';
    }

    _countDataSources(data) {
        return data.dataSources?.length || 1;
    }

    _countFieldsAnalyzed(data) {
        return Object.keys(data.fieldAnalysis || {}).length;
    }

    _countRecordsAnalyzed(data) {
        return data.totalRecords || 0;
    }

    // Placeholder methods for detailed breakdowns
    _generateFieldAnalysis(data) {
        return data.fieldAnalysis || {};
    }

    _generateAnomalyBreakdown(data) {
        return data.anomalies || [];
    }

    _generateComplianceStatus(data) {
        return data.compliance || {};
    }

    _generatePopulationAnalysis(data) {
        return this._extractPopulationMetrics(data);
    }

    _generateStalenessAnalysis(data) {
        return this._extractStalenessMetrics(data);
    }

    _generateDetailedRecommendations(data, scorecard) {
        const recommendations = [];

        for (const issue of scorecard.topIssues) {
            recommendations.push({
                dimension: issue.dimension,
                priority: issue.priority,
                recommendation: issue.recommendation,
                expectedImprovement: `+${Math.round((100 - issue.score) * 0.3)} points`,
                steps: this._getRecommendationSteps(issue.dimension)
            });
        }

        return recommendations;
    }

    _getRecommendationSteps(dimension) {
        const steps = {
            population: [
                'Identify fields with lowest population rates',
                'Enable enrichment sources for those fields',
                'Monitor population improvement over 7 days'
            ],
            staleness: [
                'Export list of stale records',
                'Queue for re-enrichment',
                'Validate enrichment results'
            ],
            anomalies: [
                'Export anomaly report',
                'Review high-severity anomalies first',
                'Correct or flag as expected exceptions'
            ],
            compliance: [
                'Review failing compliance checks',
                'Update non-compliant records',
                'Re-run compliance validation'
            ],
            consistency: [
                'Run duplicate detection',
                'Review potential matches',
                'Merge confirmed duplicates'
            ]
        };
        return steps[dimension] || ['Review and address issues'];
    }

    /**
     * Format report in specified format
     * @param {Object} report - Report data
     * @param {string} format - Output format
     * @returns {string} Formatted report
     */
    formatReport(report, format = this.defaultFormat) {
        switch (format) {
            case REPORT_FORMATS.MARKDOWN:
                return this._formatAsMarkdown(report);
            case REPORT_FORMATS.HTML:
                return this._formatAsHTML(report);
            case REPORT_FORMATS.CSV:
                return this._formatAsCSV(report);
            case REPORT_FORMATS.JSON:
            default:
                return JSON.stringify(report, null, 2);
        }
    }

    _formatAsMarkdown(report) {
        let md = `# Data Quality Health Report\n\n`;
        md += `**Generated:** ${report.generatedAt}\n`;
        md += `**Organization:** ${report.orgName}\n\n`;

        if (report.summary) {
            md += `## Summary\n\n`;
            md += `- **Overall Score:** ${report.summary.overallScore}/100\n`;
            md += `- **Grade:** ${report.summary.grade} (${report.summary.gradeLabel})\n`;
            md += `- **Trend:** ${report.summary.trend}\n\n`;
        }

        if (report.dimensions) {
            md += `## Dimension Scores\n\n`;
            md += `| Dimension | Score | Status |\n`;
            md += `|-----------|-------|--------|\n`;
            for (const [name, dim] of Object.entries(report.dimensions)) {
                md += `| ${this._formatDimensionName(name)} | ${dim.score} | ${this._scoreToStatus(dim.score)} |\n`;
            }
            md += `\n`;
        }

        if (report.topIssues?.length > 0) {
            md += `## Top Issues\n\n`;
            for (const issue of report.topIssues) {
                md += `### ${issue.issue}\n`;
                md += `- **Priority:** ${issue.priority}\n`;
                md += `- **Recommendation:** ${issue.recommendation}\n\n`;
            }
        }

        return md;
    }

    _formatAsHTML(report) {
        // Simplified HTML output
        return `<!DOCTYPE html>
<html>
<head><title>Data Quality Report</title></head>
<body>
<h1>Data Quality Health Report</h1>
<p>Generated: ${report.generatedAt}</p>
<p>Overall Score: ${report.summary?.overallScore || 'N/A'}/100</p>
<p>Grade: ${report.summary?.grade || 'N/A'}</p>
</body>
</html>`;
    }

    _formatAsCSV(report) {
        const rows = ['dimension,score,status'];
        if (report.dimensions) {
            for (const [name, dim] of Object.entries(report.dimensions)) {
                rows.push(`${name},${dim.score},${this._scoreToStatus(dim.score)}`);
            }
        }
        return rows.join('\n');
    }

    /**
     * Set telemetry analyzer
     */
    setTelemetryAnalyzer(analyzer) {
        this.telemetryAnalyzer = analyzer;
    }

    /**
     * Set anomaly detector
     */
    setAnomalyDetector(detector) {
        this.anomalyDetector = detector;
    }

    /**
     * Clear history
     */
    clearHistory() {
        this._history = [];
    }

    /**
     * Get report types
     */
    static get TYPES() {
        return { ...REPORT_TYPES };
    }

    /**
     * Get report formats
     */
    static get FORMATS() {
        return { ...REPORT_FORMATS };
    }

    /**
     * Get health grades
     */
    static get GRADES() {
        return { ...HEALTH_GRADES };
    }
}

module.exports = {
    DataHealthReporter,
    REPORT_TYPES,
    REPORT_FORMATS,
    HEALTH_GRADES
};
