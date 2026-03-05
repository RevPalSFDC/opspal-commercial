#!/usr/bin/env node

/**
 * CPQ Scorecard Generator
 *
 * Generates a comprehensive scorecard from CPQ assessment outputs.
 * Designed to run as a Stop hook after sfdc-cpq-assessor completes.
 *
 * Usage:
 *   node cpq-scorecard-generator.js <transcript-path> [--output-dir <dir>]
 *
 * Inputs:
 *   - Transcript path from agent execution
 *   - Working directory containing generated reports
 *
 * Outputs:
 *   - cpq-scorecard.html (executive scorecard)
 *   - cpq-scorecard-manifest.json (metadata for downstream hooks)
 *
 * Features:
 *   - Discovers CPQ assessment artifacts (utilization, configuration, time-series)
 *   - Calculates utilization scores and pricing complexity
 *   - Generates keep/optimize/remove recommendations
 *   - Creates visual scorecard with trend indicators
 *
 * @see quality-audit-summary-generator.js for similar pattern
 */

const fs = require('fs');
const path = require('path');

class CPQScorecardGenerator {
    constructor(transcriptPath, outputDir) {
        this.transcriptPath = transcriptPath;
        this.outputDir = outputDir || path.dirname(transcriptPath);
        this.workingDir = this.outputDir;
    }

    /**
     * Main entry point - generate CPQ scorecard
     */
    async generate() {
        console.log('🔍 CPQ Scorecard Generator\n');

        try {
            // Phase 1: Discover CPQ artifacts
            console.log('Phase 1: Discovering CPQ artifacts...');
            const artifacts = await this.discoverArtifacts();
            console.log(`  Found: ${artifacts.reports.length} reports, ${artifacts.diagrams.length} diagrams\n`);

            // Phase 2: Extract utilization and configuration data
            console.log('Phase 2: Extracting utilization metrics...');
            const metrics = await this.extractMetrics(artifacts.reports);
            console.log(`  Extracted: ${Object.keys(metrics).length} metric categories\n`);

            // Phase 3: Calculate utilization score and recommendation
            console.log('Phase 3: Calculating utilization score...');
            const scorecard = this.calculateScorecard(metrics);
            console.log(`  Utilization Score: ${scorecard.utilizationScore}/100 → ${scorecard.recommendation}\n`);

            // Phase 4: Build scorecard data structure
            console.log('Phase 4: Building scorecard structure...');
            const scorecardData = this.buildScorecardData(metrics, scorecard, artifacts);

            // Phase 5: Generate scorecard HTML/PDF
            console.log('Phase 5: Generating scorecard PDF...');
            const pdfPath = await this.generatePDF(scorecardData);
            console.log(`  ✅ PDF: ${pdfPath}\n`);

            // Phase 6: Generate JSON manifest
            console.log('Phase 6: Creating manifest...');
            const manifestPath = await this.generateManifest(scorecardData, artifacts);
            console.log(`  ✅ Manifest: ${manifestPath}\n`);

            console.log('✅ CPQ scorecard generation complete\n');

            return {
                success: true,
                pdf: pdfPath,
                manifest: manifestPath,
                utilizationScore: scorecard.utilizationScore,
                recommendation: scorecard.recommendation,
                artifactCount: artifacts.reports.length + artifacts.diagrams.length
            };

        } catch (error) {
            console.error('❌ Error generating CPQ scorecard:', error.message);
            throw error;
        }
    }

    /**
     * Discover all CPQ artifacts in working directory
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

            // Reports: markdown or HTML files with CPQ keywords
            if (['.md', '.html'].includes(ext) && this.isCPQReport(file)) {
                artifacts.reports.push(filePath);
            }

            // Diagrams
            if (['.mmd', '.png', '.svg', '.jpg'].includes(ext)) {
                artifacts.diagrams.push(filePath);
            }

            // Data files
            if (['.json', '.csv'].includes(ext) && !file.includes('manifest')) {
                artifacts.dataFiles.push(filePath);
            }
        }

        return artifacts;
    }

    /**
     * Check if file is a CPQ report
     */
    isCPQReport(filename) {
        const cpqKeywords = [
            'cpq',
            'quote',
            'pricing',
            'sbqq',
            'product',
            'discount',
            'utilization',
            'configuration'
        ];

        const lower = filename.toLowerCase();
        return cpqKeywords.some(keyword => lower.includes(keyword));
    }

    /**
     * Extract metrics from CPQ reports
     */
    async extractMetrics(reportPaths) {
        const metrics = {
            utilization: {},
            configuration: {},
            timeSeries: {},
            dataQuality: {}
        };

        for (const reportPath of reportPaths) {
            const content = fs.readFileSync(reportPath, 'utf-8');

            // Extract utilization metrics
            this.extractUtilizationMetrics(content, metrics.utilization);

            // Extract configuration metrics
            this.extractConfigurationMetrics(content, metrics.configuration);

            // Extract time-series patterns
            this.extractTimeSeriesMetrics(content, metrics.timeSeries);

            // Extract data quality
            this.extractDataQualityMetrics(content, metrics.dataQuality);
        }

        return metrics;
    }

    /**
     * Extract utilization metrics
     */
    extractUtilizationMetrics(content, metricsObj) {
        // Quote adoption rate
        const quoteAdoptionMatch = content.match(/quote\s+adoption[:\s]+([\d.]+)%/i);
        if (quoteAdoptionMatch) {
            metricsObj.quoteAdoption = parseFloat(quoteAdoptionMatch[1]);
        }

        // Active quotes
        const activeQuotesMatch = content.match(/(\d+)\s+active\s+quotes/i);
        if (activeQuotesMatch) {
            metricsObj.activeQuotes = parseInt(activeQuotesMatch[1]);
        }

        // Subscription linkage
        const subscriptionMatch = content.match(/subscription\s+linkage[:\s]+([\d.]+)%/i);
        if (subscriptionMatch) {
            metricsObj.subscriptionLinkage = parseFloat(subscriptionMatch[1]);
        }

        // Product usage
        const productUsageMatch = content.match(/(\d+)\s+products?\s+used/i);
        if (productUsageMatch) {
            metricsObj.productsUsed = parseInt(productUsageMatch[1]);
        }
    }

    /**
     * Extract configuration complexity metrics
     */
    extractConfigurationMetrics(content, metricsObj) {
        // Price rules
        const priceRulesMatch = content.match(/(\d+)\s+price\s+rules?/i);
        if (priceRulesMatch) {
            metricsObj.priceRules = parseInt(priceRulesMatch[1]);
        }

        // Product rules
        const productRulesMatch = content.match(/(\d+)\s+product\s+rules?/i);
        if (productRulesMatch) {
            metricsObj.productRules = parseInt(productRulesMatch[1]);
        }

        // Discount schedules
        const discountMatch = content.match(/(\d+)\s+discount\s+schedules?/i);
        if (discountMatch) {
            metricsObj.discountSchedules = parseInt(discountMatch[1]);
        }

        // Calculate complexity score
        const total = (metricsObj.priceRules || 0) +
                     (metricsObj.productRules || 0) +
                     (metricsObj.discountSchedules || 0);
        metricsObj.complexityScore = total;
    }

    /**
     * Extract time-series patterns
     */
    extractTimeSeriesMetrics(content, metricsObj) {
        // Recent vs total pattern
        const recentMatch = content.match(/(\d+)\s+recent.*?(\d+)\s+total/i);
        if (recentMatch) {
            metricsObj.recentCount = parseInt(recentMatch[1]);
            metricsObj.totalCount = parseInt(recentMatch[2]);
            metricsObj.recentRatio = metricsObj.recentCount / metricsObj.totalCount;
        }

        // Latest activity date
        const latestDateMatch = content.match(/latest[:\s]+(\d{4}-\d{2}-\d{2})/i);
        if (latestDateMatch) {
            metricsObj.latestDate = latestDateMatch[1];
            metricsObj.daysSinceLatest = this.daysSince(latestDateMatch[1]);
        }

        // Trend classification
        if (metricsObj.recentRatio >= 0.3) {
            metricsObj.trend = 'active';
        } else if (metricsObj.recentRatio >= 0.1) {
            metricsObj.trend = 'declining';
        } else {
            metricsObj.trend = 'abandoned';
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
     * Calculate days since a date
     */
    daysSince(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Calculate scorecard with utilization score and recommendation
     */
    calculateScorecard(metrics) {
        const { utilization, configuration, timeSeries, dataQuality } = metrics;

        // Calculate utilization score (0-100)
        let utilizationScore = 0;
        let components = 0;

        if (utilization.quoteAdoption !== undefined) {
            utilizationScore += utilization.quoteAdoption;
            components++;
        }
        if (utilization.subscriptionLinkage !== undefined) {
            utilizationScore += utilization.subscriptionLinkage;
            components++;
        }
        if (timeSeries.recentRatio !== undefined) {
            utilizationScore += (timeSeries.recentRatio * 100);
            components++;
        }

        utilizationScore = components > 0 ? Math.round(utilizationScore / components) : 50;

        // Determine recommendation based on thresholds
        let recommendation, confidence;

        if (utilizationScore >= 50) {
            recommendation = 'KEEP';
            confidence = 'HIGH';
        } else if (utilizationScore >= 20) {
            recommendation = 'OPTIMIZE';
            confidence = 'MEDIUM';
        } else {
            recommendation = 'REMOVE';
            confidence = 'HIGH';
        }

        // Calculate pricing complexity rating
        const complexityScore = configuration.complexityScore || 0;
        let complexityRating;

        if (complexityScore < 20) {
            complexityRating = 'SIMPLE';
        } else if (complexityScore < 50) {
            complexityRating = 'MODERATE';
        } else {
            complexityRating = 'COMPLEX';
        }

        return {
            utilizationScore,
            recommendation,
            confidence,
            complexityScore,
            complexityRating,
            trend: timeSeries.trend || 'unknown',
            dataQualityScore: this.calculateDataQualityScore(dataQuality)
        };
    }

    calculateDataQualityScore(dataQuality) {
        const completeness = dataQuality.completeness || 70;
        const accuracy = dataQuality.accuracy || 70;
        return Math.round((completeness + accuracy) / 2);
    }

    /**
     * Build scorecard data structure
     */
    buildScorecardData(metrics, scorecard, artifacts) {
        return {
            type: 'cpq-assessment',
            generatedAt: new Date().toISOString(),
            scorecard,
            metrics,
            artifacts: {
                reports: artifacts.reports.map(p => path.basename(p)),
                diagrams: artifacts.diagrams.map(p => path.basename(p)),
                dataFiles: artifacts.dataFiles.map(p => path.basename(p))
            },
            recommendations: this.generateRecommendations(scorecard, metrics),
            metadata: {
                hookType: 'Stop',
                agentName: 'sfdc-cpq-assessor',
                generatorVersion: '1.0.0'
            }
        };
    }

    /**
     * Generate recommendations based on scorecard
     */
    generateRecommendations(scorecard, metrics) {
        const recommendations = [];

        // Recommendation based on utilization
        if (scorecard.recommendation === 'REMOVE') {
            recommendations.push({
                area: 'CPQ Utilization',
                priority: 'HIGH',
                finding: `Low utilization score: ${scorecard.utilizationScore}/100`,
                recommendation: 'Consider removing CPQ or investigating adoption barriers'
            });
        } else if (scorecard.recommendation === 'OPTIMIZE') {
            recommendations.push({
                area: 'CPQ Adoption',
                priority: 'MEDIUM',
                finding: `Moderate utilization: ${scorecard.utilizationScore}/100`,
                recommendation: 'Focus on increasing adoption through training and process improvements'
            });
        }

        // Complexity recommendations
        if (scorecard.complexityRating === 'COMPLEX') {
            recommendations.push({
                area: 'Pricing Complexity',
                priority: 'MEDIUM',
                finding: `High complexity score: ${scorecard.complexityScore}`,
                recommendation: 'Simplify pricing rules and consolidate duplicate discount schedules'
            });
        }

        // Time-series recommendations
        if (scorecard.trend === 'declining') {
            recommendations.push({
                area: 'Usage Trend',
                priority: 'HIGH',
                finding: 'Declining usage detected',
                recommendation: 'Investigate reasons for declining usage and address user concerns'
            });
        } else if (scorecard.trend === 'abandoned') {
            recommendations.push({
                area: 'Usage Trend',
                priority: 'CRITICAL',
                finding: 'CPQ appears abandoned',
                recommendation: 'Conduct stakeholder interviews to determine if CPQ should be sunset'
            });
        }

        // Data quality recommendations
        if (scorecard.dataQualityScore < 70) {
            recommendations.push({
                area: 'Data Quality',
                priority: 'MEDIUM',
                finding: `Data quality score: ${scorecard.dataQualityScore}/100`,
                recommendation: 'Improve data completeness and accuracy through validation rules'
            });
        }

        return recommendations;
    }

    /**
     * Generate scorecard HTML/PDF
     */
    async generatePDF(scorecardData) {
        const outputPath = path.join(this.outputDir, 'cpq-scorecard.html');

        const html = this.generateHTML(scorecardData);
        fs.writeFileSync(outputPath, html);

        console.log(`  Generated HTML scorecard: ${outputPath}`);
        return outputPath;
    }

    /**
     * Generate HTML for scorecard
     */
    generateHTML(data) {
        const { scorecard, metrics, recommendations, artifacts } = data;

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>CPQ Assessment Scorecard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 3px solid #e67e22; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .scorecard { display: flex; justify-content: space-around; margin: 30px 0; }
        .score-box { text-align: center; padding: 20px; background: #ecf0f1; border-radius: 10px; min-width: 150px; }
        .score-value { font-size: 48px; font-weight: bold; color: ${this.getScoreColor(scorecard.utilizationScore)}; }
        .recommendation-badge {
            display: inline-block;
            padding: 10px 20px;
            margin: 10px 0;
            font-size: 24px;
            font-weight: bold;
            border-radius: 5px;
            color: white;
            background: ${this.getRecommendationColor(scorecard.recommendation)};
        }
        .metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
        .metric-card { padding: 15px; background: #f8f9fa; border-left: 4px solid #3498db; }
        .recommendation { margin: 15px 0; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; }
        .priority-HIGH { border-left-color: #dc3545; }
        .priority-CRITICAL { border-left-color: #721c24; background: #f8d7da; }
        .priority-MEDIUM { border-left-color: #ffc107; }
        .trend-active { color: #28a745; }
        .trend-declining { color: #ffc107; }
        .trend-abandoned { color: #dc3545; }
    </style>
</head>
<body>
    <h1>CPQ Assessment Scorecard</h1>
    <p><strong>Generated:</strong> ${new Date(data.generatedAt).toLocaleString()}</p>

    <div class="scorecard">
        <div class="score-box">
            <div>Utilization Score</div>
            <div class="score-value">${scorecard.utilizationScore}</div>
            <div>/100</div>
        </div>
        <div class="score-box">
            <div>Recommendation</div>
            <div class="recommendation-badge">${scorecard.recommendation}</div>
            <div>Confidence: ${scorecard.confidence}</div>
        </div>
        <div class="score-box">
            <div>Pricing Complexity</div>
            <div style="font-size: 36px; font-weight: bold;">${scorecard.complexityScore}</div>
            <div>${scorecard.complexityRating}</div>
        </div>
        <div class="score-box">
            <div>Trend</div>
            <div style="font-size: 28px; font-weight: bold;" class="trend-${scorecard.trend}">
                ${this.getTrendEmoji(scorecard.trend)} ${this.capitalize(scorecard.trend)}
            </div>
        </div>
    </div>

    <h2>Detailed Metrics</h2>
    <div class="metric-grid">
        ${this.formatMetricsGrid(metrics)}
    </div>

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
        <p>Generated by OpsPal by RevPal</p>
    </footer>
</body>
</html>`;
    }

    formatMetricsGrid(metrics) {
        const cards = [];

        // Utilization metrics
        if (metrics.utilization.quoteAdoption) {
            cards.push(`<div class="metric-card">
                <strong>Quote Adoption</strong><br>
                <span style="font-size: 24px;">${metrics.utilization.quoteAdoption}%</span>
            </div>`);
        }
        if (metrics.utilization.subscriptionLinkage) {
            cards.push(`<div class="metric-card">
                <strong>Subscription Linkage</strong><br>
                <span style="font-size: 24px;">${metrics.utilization.subscriptionLinkage}%</span>
            </div>`);
        }
        if (metrics.utilization.activeQuotes) {
            cards.push(`<div class="metric-card">
                <strong>Active Quotes</strong><br>
                <span style="font-size: 24px;">${metrics.utilization.activeQuotes}</span>
            </div>`);
        }
        if (metrics.utilization.productsUsed) {
            cards.push(`<div class="metric-card">
                <strong>Products Used</strong><br>
                <span style="font-size: 24px;">${metrics.utilization.productsUsed}</span>
            </div>`);
        }

        // Configuration metrics
        if (metrics.configuration.priceRules) {
            cards.push(`<div class="metric-card">
                <strong>Price Rules</strong><br>
                <span style="font-size: 24px;">${metrics.configuration.priceRules}</span>
            </div>`);
        }
        if (metrics.configuration.productRules) {
            cards.push(`<div class="metric-card">
                <strong>Product Rules</strong><br>
                <span style="font-size: 24px;">${metrics.configuration.productRules}</span>
            </div>`);
        }

        return cards.join('') || '<div>No metrics available</div>';
    }

    getScoreColor(score) {
        if (score >= 50) return '#28a745'; // green (KEEP)
        if (score >= 20) return '#ffc107'; // yellow (OPTIMIZE)
        return '#dc3545'; // red (REMOVE)
    }

    getRecommendationColor(recommendation) {
        if (recommendation === 'KEEP') return '#28a745';
        if (recommendation === 'OPTIMIZE') return '#ffc107';
        return '#dc3545';
    }

    getTrendEmoji(trend) {
        if (trend === 'active') return '📈';
        if (trend === 'declining') return '📉';
        if (trend === 'abandoned') return '⚠️';
        return '❓';
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Generate JSON manifest
     */
    async generateManifest(scorecardData, artifacts) {
        const manifestPath = path.join(this.outputDir, 'cpq-scorecard-manifest.json');

        const manifest = {
            ...scorecardData,
            generatedBy: 'cpq-scorecard-generator.js',
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
Usage: node cpq-scorecard-generator.js <transcript-path> [options]

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

    const generator = new CPQScorecardGenerator(transcriptPath, outputDir);

    generator.generate()
        .then(result => {
            console.log('Result:', JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = CPQScorecardGenerator;
