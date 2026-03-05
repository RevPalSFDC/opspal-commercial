#!/usr/bin/env node

/**
 * Quality Audit Summary Generator
 *
 * Consolidates quality audit outputs into an executive summary PDF.
 * Invoked by Stop hook in sfdc-quality-auditor agent.
 *
 * Usage:
 *   node quality-audit-summary-generator.js <transcript-path> [--output-dir <dir>]
 */

const fs = require('fs').promises;
const fs_sync = require('fs');
const path = require('path');
const AuditReportGenerator = require('../audit-report-generator');

class QualityAuditSummaryGenerator {
    constructor(transcriptPath, options = {}) {
        this.transcriptPath = transcriptPath;
        this.outputDir = options.outputDir || path.dirname(transcriptPath);
        this.timestamp = new Date().toISOString();
    }

    /**
     * Main entry point - generate consolidated summary
     */
    async generate() {
        console.log('🔍 Quality Audit Summary Generator\n');
        console.log(`Transcript: ${this.transcriptPath}`);
        console.log(`Output Dir: ${this.outputDir}\n`);

        try {
            // Phase 1: Discover generated artifacts
            const artifacts = await this.discoverArtifacts();
            console.log(`✅ Found ${artifacts.reports.length} reports, ${artifacts.diagrams.length} diagrams\n`);

            // Phase 2: Extract key findings from reports
            const findings = await this.extractFindings(artifacts.reports);
            console.log(`✅ Extracted findings from ${findings.length} sources\n`);

            // Phase 3: Calculate consolidated quality score
            const qualityScore = this.calculateQualityScore(findings);
            console.log(`✅ Quality Score: ${qualityScore.overall}/100\n`);

            // Phase 4: Generate executive summary data structure
            const summaryData = this.buildSummaryData(findings, qualityScore, artifacts);
            console.log(`✅ Built summary data structure\n`);

            // Phase 5: Generate executive summary PDF
            const pdfPath = await this.generatePDF(summaryData);
            console.log(`✅ Generated PDF: ${pdfPath}\n`);

            // Phase 6: Generate JSON manifest
            const manifestPath = await this.generateManifest(summaryData, artifacts);
            console.log(`✅ Generated manifest: ${manifestPath}\n`);

            return {
                success: true,
                pdf: pdfPath,
                manifest: manifestPath,
                qualityScore: qualityScore.overall,
                artifactCount: artifacts.reports.length + artifacts.diagrams.length
            };

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Discover all generated artifacts in output directory
     */
    async discoverArtifacts() {
        const artifacts = {
            reports: [],
            diagrams: [],
            data: []
        };

        try {
            const files = await fs.readdir(this.outputDir);

            for (const file of files) {
                const filePath = path.join(this.outputDir, file);
                const stat = await fs.stat(filePath);

                if (!stat.isFile()) continue;

                const ext = path.extname(file);

                // Reports
                if (ext === '.md' && !file.includes('diagram') && !file.includes('.mmd')) {
                    artifacts.reports.push({ path: filePath, name: file, type: 'report' });
                }
                // Diagrams (Mermaid or markdown with diagrams)
                else if (file.includes('drift') || file.includes('consolidation') ||
                         file.includes('trends') || file.includes('conflict')) {
                    artifacts.diagrams.push({ path: filePath, name: file, type: 'diagram' });
                }
                // Data files
                else if (ext === '.json' || ext === '.csv') {
                    artifacts.data.push({ path: filePath, name: file, type: 'data' });
                }
            }

            return artifacts;

        } catch (error) {
            console.warn(`⚠️  Could not discover artifacts: ${error.message}`);
            return artifacts;
        }
    }

    /**
     * Extract findings from reports
     */
    async extractFindings(reports) {
        const findings = [];

        for (const report of reports) {
            try {
                const content = await fs.readFile(report.path, 'utf8');

                // Extract JSON data if present
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    try {
                        const data = JSON.parse(jsonMatch[1]);
                        findings.push({
                            source: report.name,
                            type: 'structured',
                            data
                        });
                        continue;
                    } catch (e) {
                        // Fall through to text extraction
                    }
                }

                // Extract key metrics from markdown
                const metrics = this.extractMetricsFromMarkdown(content, report.name);
                if (metrics) {
                    findings.push({
                        source: report.name,
                        type: 'text',
                        metrics
                    });
                }

            } catch (error) {
                console.warn(`⚠️  Could not extract findings from ${report.name}: ${error.message}`);
            }
        }

        return findings;
    }

    /**
     * Extract metrics from markdown content
     */
    extractMetricsFromMarkdown(content, sourceName) {
        const metrics = {
            source: sourceName,
            scores: {},
            counts: {},
            issues: []
        };

        // Extract scores (pattern: Score: 85/100 or Health: 82%)
        const scoreMatches = content.matchAll(/(?:score|health|quality):\s*(\d+)(?:\/100|%)?/gi);
        for (const match of scoreMatches) {
            const label = match[0].split(':')[0].trim().toLowerCase();
            metrics.scores[label] = parseInt(match[1]);
        }

        // Extract counts (pattern: Found 23 issues, 12 recommendations)
        const countMatches = content.matchAll(/(\d+)\s+(issues|problems|warnings|recommendations|opportunities)/gi);
        for (const match of countMatches) {
            const label = match[2].toLowerCase();
            metrics.counts[label] = parseInt(match[1]);
        }

        // Extract critical issues (lines with ❌, 🔴, or CRITICAL)
        const criticalLines = content.split('\n').filter(line =>
            line.match(/❌|🔴|CRITICAL|HIGH PRIORITY|URGENT/i)
        );
        metrics.issues = criticalLines.slice(0, 10); // Top 10

        return Object.keys(metrics.scores).length > 0 ||
               Object.keys(metrics.counts).length > 0 ||
               metrics.issues.length > 0 ? metrics : null;
    }

    /**
     * Calculate consolidated quality score
     */
    calculateQualityScore(findings) {
        let totalScore = 0;
        let scoreCount = 0;
        const categories = {
            fieldHealth: [],
            automation: [],
            performance: [],
            security: [],
            compliance: []
        };

        // Aggregate scores from all findings
        for (const finding of findings) {
            if (finding.type === 'structured' && finding.data.scores) {
                for (const [key, value] of Object.entries(finding.data.scores)) {
                    totalScore += value;
                    scoreCount++;

                    // Categorize
                    if (key.includes('field')) categories.fieldHealth.push(value);
                    else if (key.includes('automation') || key.includes('flow')) categories.automation.push(value);
                    else if (key.includes('performance')) categories.performance.push(value);
                    else if (key.includes('security')) categories.security.push(value);
                    else if (key.includes('compliance')) categories.compliance.push(value);
                }
            }
            else if (finding.type === 'text' && finding.metrics.scores) {
                for (const [key, value] of Object.entries(finding.metrics.scores)) {
                    totalScore += value;
                    scoreCount++;
                }
            }
        }

        const overall = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

        return {
            overall,
            fieldHealth: this.avg(categories.fieldHealth) || 0,
            automation: this.avg(categories.automation) || 0,
            performance: this.avg(categories.performance) || 0,
            security: this.avg(categories.security) || 0,
            compliance: this.avg(categories.compliance) || 0
        };
    }

    /**
     * Calculate average
     */
    avg(arr) {
        return arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    }

    /**
     * Build summary data structure for report generation
     */
    buildSummaryData(findings, qualityScore, artifacts) {
        // Aggregate issue counts
        let criticalCount = 0;
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        const allIssues = [];

        for (const finding of findings) {
            if (finding.type === 'text' && finding.metrics.counts) {
                criticalCount += finding.metrics.counts.critical || 0;
                highCount += finding.metrics.counts.high || 0;
                mediumCount += finding.metrics.counts.medium || 0;
                lowCount += finding.metrics.counts.low || 0;
            }
            if (finding.metrics && finding.metrics.issues) {
                allIssues.push(...finding.metrics.issues);
            }
        }

        // Build recommendations list
        const recommendations = this.extractRecommendations(findings);

        return {
            metadata: {
                auditDate: this.timestamp,
                orgAlias: this.extractOrgAlias(),
                artifactCount: artifacts.reports.length + artifacts.diagrams.length,
                version: '1.0.0'
            },
            scores: qualityScore,
            analysis: {
                totalIssues: criticalCount + highCount + mediumCount + lowCount,
                criticalIssues: criticalCount,
                highIssues: highCount,
                mediumIssues: mediumCount,
                lowIssues: lowCount,
                topIssues: allIssues.slice(0, 10)
            },
            recommendations: recommendations,
            artifacts: {
                reports: artifacts.reports.map(r => r.name),
                diagrams: artifacts.diagrams.map(d => d.name),
                data: artifacts.data.map(d => d.name)
            },
            detailedFindings: {
                sources: findings.map(f => ({
                    source: f.source,
                    type: f.type,
                    summary: this.summarizeFinding(f)
                }))
            }
        };
    }

    /**
     * Extract org alias from transcript path
     */
    extractOrgAlias() {
        const match = this.transcriptPath.match(/instances[\/\\]([^\/\\]+)/);
        return match ? match[1] : 'unknown';
    }

    /**
     * Extract recommendations from findings
     */
    extractRecommendations(findings) {
        const recommendations = [];

        for (const finding of findings) {
            if (finding.type === 'structured' && finding.data.recommendations) {
                recommendations.push(...finding.data.recommendations);
            }
            else if (finding.type === 'text') {
                // Extract bullet points starting with recommendation keywords
                const content = finding.metrics.issues.join('\n');
                const recMatches = content.matchAll(/(?:✅|📝|💡|Recommendation:|Action:)\s*(.+)/gi);
                for (const match of recMatches) {
                    recommendations.push({
                        title: match[1].trim(),
                        source: finding.source,
                        priority: 2 // Default to medium
                    });
                }
            }
        }

        return recommendations.slice(0, 20); // Top 20
    }

    /**
     * Summarize a finding for the detailed section
     */
    summarizeFinding(finding) {
        if (finding.type === 'structured') {
            return {
                scoreCount: Object.keys(finding.data.scores || {}).length,
                issueCount: finding.data.analysis?.totalIssues || 0,
                recCount: finding.data.recommendations?.length || 0
            };
        } else {
            return {
                scoreCount: Object.keys(finding.metrics?.scores || {}).length,
                issueCount: finding.metrics?.issues?.length || 0,
                countKeys: Object.keys(finding.metrics?.counts || {})
            };
        }
    }

    /**
     * Generate PDF using AuditReportGenerator
     */
    async generatePDF(summaryData) {
        const generator = new AuditReportGenerator(summaryData);
        const pdfPath = path.join(this.outputDir, `quality-audit-summary-${Date.now()}.html`);

        await generator.generateReport('html', pdfPath);

        return pdfPath;
    }

    /**
     * Generate JSON manifest
     */
    async generateManifest(summaryData, artifacts) {
        const manifestPath = path.join(this.outputDir, 'quality-audit-manifest.json');

        const manifest = {
            ...summaryData,
            generatedAt: this.timestamp,
            generatedBy: 'quality-audit-summary-generator.js',
            hookType: 'Stop',
            agentName: 'sfdc-quality-auditor'
        };

        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        return manifestPath;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node quality-audit-summary-generator.js <transcript-path> [--output-dir <dir>]');
        console.log('\nGenerates consolidated executive summary from quality audit outputs.');
        console.log('Invoked by Stop hook in sfdc-quality-auditor agent.');
        process.exit(1);
    }

    const transcriptPath = args[0];
    let outputDir = path.dirname(transcriptPath);

    const outputDirIndex = args.indexOf('--output-dir');
    if (outputDirIndex > -1 && args[outputDirIndex + 1]) {
        outputDir = args[outputDirIndex + 1];
    }

    // Verify transcript exists
    if (!fs_sync.existsSync(transcriptPath)) {
        console.error(`❌ Transcript not found: ${transcriptPath}`);
        process.exit(1);
    }

    // Run generator
    const generator = new QualityAuditSummaryGenerator(transcriptPath, { outputDir });
    generator.generate().then(result => {
        if (result.success) {
            console.log('\n✅ Quality Audit Summary Generated Successfully');
            console.log(`   PDF: ${result.pdf}`);
            console.log(`   Manifest: ${result.manifest}`);
            console.log(`   Quality Score: ${result.qualityScore}/100`);
            console.log(`   Artifacts: ${result.artifactCount}`);
            process.exit(0);
        } else {
            console.error(`\n❌ Generation Failed: ${result.error}`);
            process.exit(1);
        }
    }).catch(error => {
        console.error(`\n❌ Unexpected Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    });
}

module.exports = QualityAuditSummaryGenerator;
