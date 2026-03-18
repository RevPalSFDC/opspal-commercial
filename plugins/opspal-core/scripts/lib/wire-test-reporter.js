#!/usr/bin/env node
/**
 * Live Wire Sync Test - Comprehensive Reporter
 *
 * Purpose: Generate JSON, Markdown, and PDF reports from wire test results.
 * Produces spec-compliant reports with guidance and recommendations.
 *
 * Features:
 * - JSON report (spec schema)
 * - Markdown summary (human-readable)
 * - PDF deliverable (using PDFGenerationHelper)
 * - Guidance integration
 * - Collision reporting
 * - Performance metrics
 *
 * Usage:
 *   const Reporter = require('./wire-test-reporter');
 *   const reporter = new Reporter(config, ledger, guidance);
 *
 *   // Generate all reports
 *   await reporter.generateAllReports(outputDir);
 */

const fs = require('fs');
const path = require('path');
const Guidance = require('./wire-test-guidance');

class WireTestReporter {
    constructor(config, ledger, testResults = {}) {
        this.config = config;
        this.ledger = ledger;
        this.testResults = testResults;
        this.runId = config.run_id;
        this.timestamp = config.timestamp;
    }

    /**
     * Generate all reports (JSON, Markdown, PDF)
     * @param {string} outputDir - Output directory
     * @returns {Promise<object>}
     */
    async generateAllReports(outputDir) {
        console.log('\n📄 Generating Wire Test Reports');
        console.log('═'.repeat(60));

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const baseFilename = `wire-test-report-${timestamp}`;

        const results = {
            outputDir,
            timestamp,
            generated: {}
        };

        // 1. Generate JSON report
        console.log('\n1️⃣  Generating JSON report...');
        const jsonPath = path.join(outputDir, `${baseFilename}.json`);
        const jsonReport = this.generateJSONReport();
        fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
        results.generated.json = jsonPath;
        console.log(`  ✅ ${jsonPath}`);

        // 2. Generate Markdown summary
        console.log('\n2️⃣  Generating Markdown summary...');
        const mdPath = path.join(outputDir, `${baseFilename}.md`);
        const mdReport = this.generateMarkdownReport(jsonReport);
        fs.writeFileSync(mdPath, mdReport);
        results.generated.markdown = mdPath;
        console.log(`  ✅ ${mdPath}`);

        // 3. Generate PDF (if enabled)
        if (this.config.output.generatePDF) {
            console.log('\n3️⃣  Generating PDF report...');
            try {
                const PDFGenerationHelper = require('./pdf-generation-helper');
                const pdfPath = await PDFGenerationHelper.generateSingleReportPDF({
                    markdownPath: mdPath,
                    orgAlias: this.config.salesforce.orgAlias || 'wire-test',
                    reportType: 'Wire Test Results',
                    profile: 'cover-toc',
                    metadata: {
                        title: `Live Wire Sync Test - ${this.config.salesforce.orgAlias}`,
                        date: new Date().toISOString().split('T')[0],
                        version: '1.0.0'
                    }
                });
                results.generated.pdf = pdfPath;
                console.log(`  ✅ ${pdfPath}`);
            } catch (error) {
                console.warn(`  ⚠️  PDF generation failed: ${error.message}`);
                results.generated.pdf = null;
            }
        }

        console.log('\n═'.repeat(60));
        console.log('✅ All reports generated');

        return results;
    }

    /**
     * Generate JSON report (spec-compliant)
     * @returns {object}
     */
    generateJSONReport() {
        const ledgerSummary = this.ledger.getSummary();
        const probeResults = this.ledger.getAllProbeResults();

        // Calculate summary stats
        const summary = {
            total_pairs: Object.keys(probeResults).length,
            pass_sf_to_hs: 0,
            pass_hs_to_sf: 0,
            partial: 0,
            failures: 0,
            collisions_one_to_many: this.testResults.collisions?.one_to_many?.length || 0,
            collisions_many_to_one: this.testResults.collisions?.many_to_one?.length || 0,
            mapping_gaps: []
        };

        Object.values(probeResults).forEach(probe => {
            const sfPassed = probe.sf_to_hs?.status === 'pass';
            const hsPassed = probe.hs_to_sf?.status === 'pass';

            if (sfPassed) summary.pass_sf_to_hs++;
            if (hsPassed) summary.pass_hs_to_sf++;

            if (sfPassed && hsPassed) {
                // Both pass - counted above
            } else if (sfPassed || hsPassed) {
                summary.partial++;
            } else {
                summary.failures++;
            }
        });

        // Build records array
        const records = Object.entries(probeResults).map(([syncAnchor, probe]) => {
            const record = {
                object: 'account', // TODO: Get from test results
                sync_anchor: syncAnchor,
                salesforce: {
                    id: null, // TODO: Get from probe metadata
                    former_ids: [],
                    hubspot_id_field: null,
                    wire_test_1: {
                        before: null,
                        after: null,
                        timestamp: probe.sf_to_hs?.timestamp || null
                    },
                    wire_test_2: {
                        before: null,
                        after: null,
                        timestamp: probe.hs_to_sf?.timestamp || null
                    }
                },
                hubspot: {
                    id: null, // TODO: Get from probe metadata
                    former_ids: [],
                    salesforce_id_field: null,
                    wire_test_1: {
                        observed: null,
                        timestamp: probe.sf_to_hs?.completedAt || null
                    },
                    wire_test_2: {
                        before: null,
                        after: null,
                        timestamp: probe.hs_to_sf?.timestamp || null
                    }
                },
                probe_results: {
                    sf_to_hs: {
                        status: probe.sf_to_hs?.status || 'unknown',
                        lag_seconds: probe.sf_to_hs?.result?.lag_seconds || null
                    },
                    hs_to_sf: {
                        status: probe.hs_to_sf?.status || 'unknown',
                        lag_seconds: probe.hs_to_sf?.result?.lag_seconds || null
                    }
                },
                collisions: {
                    one_to_many: false, // TODO: Check collision results
                    many_to_one: false,
                    details: []
                },
                guidance: this._getRecordGuidance(probe)
            };

            return record;
        });

        // Generate comprehensive guidance
        const comprehensiveGuidance = Guidance.getComprehensiveGuidance({
            probes: probeResults,
            collisions: this.testResults.collisions || {}
        });

        return {
            run_metadata: {
                run_id: this.runId,
                started_at: this.timestamp,
                sla_seconds: this.config.sla_seconds,
                polling_interval_seconds: this.config.polling_interval_seconds,
                account_selectors: this.config.account_selectors,
                object_types: this.config.object_types,
                sample_size_per_account: this.config.sample_size_per_account
            },
            summary,
            records,
            guidance: comprehensiveGuidance,
            ledger_summary: ledgerSummary
        };
    }

    /**
     * Generate Markdown report
     * @param {object} jsonReport - JSON report data
     * @returns {string}
     */
    generateMarkdownReport(jsonReport) {
        const md = [];

        // Header
        md.push(`# Live Wire Sync Test Results`);
        md.push('');
        md.push(`**Run ID**: ${this.runId}`);
        md.push(`**Date**: ${new Date(this.timestamp).toLocaleString()}`);
        md.push(`**Organization**: ${this.config.salesforce.orgAlias}`);
        md.push('');
        md.push('═'.repeat(80));
        md.push('');

        // Executive Summary
        md.push(`## Executive Summary`);
        md.push('');
        md.push(`- **Total Pairs Tested**: ${jsonReport.summary.total_pairs}`);
        md.push(`- **SF→HS Passing**: ${jsonReport.summary.pass_sf_to_hs}/${jsonReport.summary.total_pairs} (${this._percentage(jsonReport.summary.pass_sf_to_hs, jsonReport.summary.total_pairs)})`);
        md.push(`- **HS→SF Passing**: ${jsonReport.summary.pass_hs_to_sf}/${jsonReport.summary.total_pairs} (${this._percentage(jsonReport.summary.pass_hs_to_sf, jsonReport.summary.total_pairs)})`);
        md.push(`- **Partial Sync**: ${jsonReport.summary.partial} pairs`);
        md.push(`- **Complete Failures**: ${jsonReport.summary.failures} pairs`);
        md.push(`- **ID Collisions**: ${jsonReport.summary.collisions_one_to_many + jsonReport.summary.collisions_many_to_one} detected`);
        md.push('');

        // Overall Health
        const health = jsonReport.guidance.summary.overall_health;
        const healthIcon = health === 'healthy' ? '✅' : health === 'warning' ? '⚠️' : '❌';
        md.push(`### Overall Health: ${healthIcon} ${health.toUpperCase()}`);
        md.push('');
        md.push(`- **Critical Issues**: ${jsonReport.guidance.summary.critical_issues}`);
        md.push(`- **Warnings**: ${jsonReport.guidance.summary.warnings}`);
        md.push(`- **Successes**: ${jsonReport.guidance.summary.successes}`);
        md.push('');
        md.push('═'.repeat(80));
        md.push('');

        // Test Configuration
        md.push(`## Test Configuration`);
        md.push('');
        md.push(`- **SLA**: ${this.config.sla_seconds}s`);
        md.push(`- **Polling Interval**: ${this.config.polling_interval_seconds}s`);
        md.push(`- **Object Types**: ${this.config.object_types.join(', ')}`);
        md.push(`- **Account Selectors**: ${this.config.account_selectors.length} defined`);
        md.push('');
        md.push('═'.repeat(80));
        md.push('');

        // Detailed Results
        md.push(`## Detailed Test Results`);
        md.push('');

        jsonReport.records.forEach((record, index) => {
            md.push(`### ${index + 1}. Sync Anchor: \`${record.sync_anchor}\``);
            md.push('');

            const sfStatus = record.probe_results.sf_to_hs.status;
            const hsStatus = record.probe_results.hs_to_sf.status;
            const sfIcon = sfStatus === 'pass' ? '✅' : sfStatus === 'timeout' ? '⏱️' : '❌';
            const hsIcon = hsStatus === 'pass' ? '✅' : hsStatus === 'timeout' ? '⏱️' : '❌';

            md.push(`- **SF→HS**: ${sfIcon} ${sfStatus.toUpperCase()}${record.probe_results.sf_to_hs.lag_seconds ? ` (${record.probe_results.sf_to_hs.lag_seconds}s lag)` : ''}`);
            md.push(`- **HS→SF**: ${hsIcon} ${hsStatus.toUpperCase()}${record.probe_results.hs_to_sf.lag_seconds ? ` (${record.probe_results.hs_to_sf.lag_seconds}s lag)` : ''}`);

            if (record.guidance && record.guidance.length > 0) {
                md.push('');
                md.push(`**Guidance**:`);
                record.guidance.forEach(g => {
                    md.push(`- ${g}`);
                });
            }

            md.push('');
        });

        md.push('═'.repeat(80));
        md.push('');

        // Recommendations
        if (jsonReport.guidance.next_steps && jsonReport.guidance.next_steps.length > 0) {
            md.push(`## Recommended Actions`);
            md.push('');
            md.push(`The following actions are prioritized by severity and impact:`);
            md.push('');

            jsonReport.guidance.next_steps.forEach(step => {
                const severityIcon = step.severity === 'critical' ? '🔴' : step.severity === 'error' ? '🟠' : step.severity === 'warning' ? '🟡' : '🟢';
                md.push(`### ${step.step}. ${severityIcon} ${step.action}`);
                md.push('');
                md.push(`**Related to**: ${step.related_to}`);
                md.push('');
                md.push(`**Command/Action**:`);
                md.push('```');
                md.push(step.command);
                md.push('```');
                md.push('');
            });

            md.push('═'.repeat(80));
            md.push('');
        }

        // Collision Details
        if (jsonReport.summary.collisions_one_to_many > 0 || jsonReport.summary.collisions_many_to_one > 0) {
            md.push(`## ID Collisions Detected`);
            md.push('');

            if (this.testResults.collisions?.one_to_many) {
                md.push(`### One-to-Many Collisions (${this.testResults.collisions.one_to_many.length})`);
                md.push('');
                this.testResults.collisions.one_to_many.forEach(collision => {
                    md.push(`- **HubSpot ${collision.hubspot_id}** → ${collision.count} Salesforce records`);
                    md.push(`  - Salesforce IDs: ${collision.salesforce_ids.join(', ')}`);
                });
                md.push('');
            }

            if (this.testResults.collisions?.many_to_one) {
                md.push(`### Many-to-One Collisions (${this.testResults.collisions.many_to_one.length})`);
                md.push('');
                this.testResults.collisions.many_to_one.forEach(collision => {
                    md.push(`- **Salesforce ${collision.salesforce_id}** → ${collision.count} HubSpot records`);
                    md.push(`  - HubSpot IDs: ${collision.hubspot_ids.join(', ')}`);
                });
                md.push('');
            }

            md.push('═'.repeat(80));
            md.push('');
        }

        // Footer
        md.push(`## Report Metadata`);
        md.push('');
        md.push(`- **Generated**: ${new Date().toISOString()}`);
        md.push(`- **Generator**: Live Wire Sync Test v1.0.0`);
        md.push(`- **Report Format**: JSON + Markdown + PDF`);
        md.push('');
        md.push('---');
        md.push('');
        md.push(`💡 **Tip**: Review the "Recommended Actions" section for prioritized next steps.`);
        md.push('');

        return md.join('\n');
    }

    /**
     * Get guidance for a single record
     * @private
     */
    _getRecordGuidance(probe) {
        const sfResult = probe.sf_to_hs || { status: 'unknown' };
        const hsResult = probe.hs_to_sf || { status: 'unknown' };

        const probeGuidance = Guidance.getProbeGuidance(sfResult, hsResult);

        return probeGuidance.map(g => g.title);
    }

    /**
     * Calculate percentage
     * @private
     */
    _percentage(value, total) {
        if (total === 0) return '0%';
        return `${Math.round((value / total) * 100)}%`;
    }
}

module.exports = WireTestReporter;
