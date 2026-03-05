#!/usr/bin/env node
/**
 * Test Report Manager
 *
 * Purpose: Manages QA test report lifecycle to prevent stale data issues
 *
 * Features:
 * - Archives old test reports with timestamps
 * - Validates report freshness (<24 hours)
 * - Generates metadata headers for new reports
 * - Creates LATEST symlink for current report
 * - Compares results with previous reports to detect regressions
 *
 * Usage:
 *   node scripts/lib/test-report-manager.js archive <reports-dir>
 *   node scripts/lib/test-report-manager.js validate <report-file> [--max-age-hours=24]
 *   node scripts/lib/test-report-manager.js compare <old-report> <new-report>
 *   node scripts/lib/test-report-manager.js create-metadata <test-results> [--output=report.md]
 *
 * Prevention: Addresses issue_001 (stale test report reading)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TestReportManager {
    constructor() {
        this.maxAgeHours = 24;
    }

    /**
     * Archive old test reports to prevent confusion
     * @param {string} reportsDir - Directory containing test reports
     * @returns {Object} Archive results
     */
    archiveOldReports(reportsDir) {
        const archiveDir = path.join(reportsDir, 'archive', this.getTimestamp());
        const results = {
            archived: [],
            skipped: [],
            errors: []
        };

        // Create archive directory
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }

        // Find all QA test report files
        const reportPatterns = [
            /^QA_.*\.md$/,
            /^.*_TEST_RESULTS\.md$/,
            /^.*_STATUS_REPORT\.md$/
        ];

        try {
            const files = fs.readdirSync(reportsDir);

            for (const file of files) {
                const filePath = path.join(reportsDir, file);
                const stat = fs.statSync(filePath);

                // Skip directories and non-report files
                if (!stat.isFile()) continue;
                if (!reportPatterns.some(pattern => pattern.test(file))) continue;

                // Check if file is older than 1 hour (to allow current test runs)
                const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
                if (ageHours < 1) {
                    results.skipped.push({
                        file,
                        reason: 'Too recent (< 1 hour)',
                        age_hours: ageHours.toFixed(2)
                    });
                    continue;
                }

                // Move to archive
                const archivePath = path.join(archiveDir, file);
                fs.renameSync(filePath, archivePath);

                results.archived.push({
                    file,
                    age_hours: ageHours.toFixed(2),
                    archived_to: archivePath
                });
            }

            // Create archive manifest
            this.createArchiveManifest(archiveDir, results);

        } catch (error) {
            results.errors.push({
                message: error.message,
                stack: error.stack
            });
        }

        return results;
    }

    /**
     * Validate test report freshness and metadata
     * @param {string} reportFile - Path to test report
     * @param {number} maxAgeHours - Maximum acceptable age in hours
     * @returns {Object} Validation results
     */
    validateReport(reportFile, maxAgeHours = null) {
        const maxAge = maxAgeHours || this.maxAgeHours;
        const validation = {
            valid: true,
            warnings: [],
            errors: [],
            metadata: null
        };

        try {
            // Check file exists
            if (!fs.existsSync(reportFile)) {
                validation.valid = false;
                validation.errors.push('Report file does not exist');
                return validation;
            }

            // Check file age
            const stat = fs.statSync(reportFile);
            const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

            if (ageHours > maxAge) {
                validation.valid = false;
                validation.errors.push(
                    `Report is too old: ${ageHours.toFixed(1)} hours (max: ${maxAge} hours)`
                );
            } else if (ageHours > maxAge * 0.75) {
                validation.warnings.push(
                    `Report age approaching limit: ${ageHours.toFixed(1)} hours`
                );
            }

            // Extract and validate metadata
            const content = fs.readFileSync(reportFile, 'utf-8');
            validation.metadata = this.extractMetadata(content);

            if (!validation.metadata) {
                validation.warnings.push('No metadata header found in report');
            } else {
                // Validate metadata completeness
                const requiredFields = ['execution_timestamp', 'org_alias', 'tests_executed'];
                for (const field of requiredFields) {
                    if (!validation.metadata[field]) {
                        validation.warnings.push(`Missing metadata field: ${field}`);
                    }
                }
            }

        } catch (error) {
            validation.valid = false;
            validation.errors.push(`Validation error: ${error.message}`);
        }

        return validation;
    }

    /**
     * Compare two test reports to detect regressions
     * @param {string} oldReportFile - Path to previous test report
     * @param {string} newReportFile - Path to new test report
     * @returns {Object} Comparison results
     */
    compareReports(oldReportFile, newReportFile) {
        const comparison = {
            regression_detected: false,
            improvements: [],
            regressions: [],
            summary: null
        };

        try {
            const oldContent = fs.readFileSync(oldReportFile, 'utf-8');
            const newContent = fs.readFileSync(newReportFile, 'utf-8');

            const oldResults = this.extractTestResults(oldContent);
            const newResults = this.extractTestResults(newContent);

            // Calculate pass rates
            const oldPassRate = this.calculatePassRate(oldResults);
            const newPassRate = this.calculatePassRate(newResults);

            comparison.summary = {
                old_pass_rate: oldPassRate,
                new_pass_rate: newPassRate,
                delta: newPassRate - oldPassRate,
                old_total: oldResults.total,
                new_total: newResults.total
            };

            // Detect significant regression (>20% drop)
            if (newPassRate < oldPassRate - 20) {
                comparison.regression_detected = true;
                comparison.regressions.push({
                    type: 'significant_regression',
                    severity: 'CRITICAL',
                    message: `Pass rate dropped from ${oldPassRate}% to ${newPassRate}% (${(oldPassRate - newPassRate).toFixed(1)}% decrease)`,
                    recommendation: 'STOP: Verify this is not due to reading stale test data. Re-execute fresh tests.'
                });
            } else if (newPassRate < oldPassRate - 10) {
                comparison.regression_detected = true;
                comparison.regressions.push({
                    type: 'moderate_regression',
                    severity: 'HIGH',
                    message: `Pass rate dropped from ${oldPassRate}% to ${newPassRate}%`,
                    recommendation: 'Investigate: Identify which tests regressed and root cause.'
                });
            }

            // Detect improvements
            if (newPassRate > oldPassRate + 5) {
                comparison.improvements.push({
                    type: 'improvement',
                    message: `Pass rate improved from ${oldPassRate}% to ${newPassRate}%`,
                    delta: newPassRate - oldPassRate
                });
            }

            // Compare individual test results
            this.compareIndividualTests(oldResults, newResults, comparison);

        } catch (error) {
            comparison.regressions.push({
                type: 'comparison_error',
                severity: 'ERROR',
                message: `Failed to compare reports: ${error.message}`
            });
        }

        return comparison;
    }

    /**
     * Create metadata header for new test report
     * @param {Object} testResults - Test execution results
     * @param {string} orgAlias - Salesforce org alias
     * @returns {string} Metadata header in markdown format
     */
    createMetadataHeader(testResults, orgAlias) {
        const metadata = {
            execution_timestamp: new Date().toISOString(),
            org_alias: orgAlias,
            org_state_hash: this.generateOrgStateHash(orgAlias),
            tests_executed: testResults.total || 0,
            tests_passed: testResults.passed || 0,
            tests_failed: testResults.failed || 0,
            pass_rate: this.calculatePassRate(testResults),
            execution_duration_ms: testResults.duration || 0,
            framework_version: '1.0.0',
            report_format_version: '2.0'
        };

        return `<!-- TEST_REPORT_METADATA
${JSON.stringify(metadata, null, 2)}
-->

# QA Test Report
**Generated**: ${new Date().toLocaleString()}
**Org**: ${orgAlias}
**Pass Rate**: ${metadata.pass_rate}% (${metadata.tests_passed}/${metadata.tests_executed})
**Org State Hash**: ${metadata.org_state_hash}

---

`;
    }

    /**
     * Extract metadata from test report content
     * @param {string} content - Report file content
     * @returns {Object|null} Parsed metadata or null
     */
    extractMetadata(content) {
        const metadataMatch = content.match(/<!-- TEST_REPORT_METADATA\s*([\s\S]*?)\s*-->/);
        if (!metadataMatch) return null;

        try {
            return JSON.parse(metadataMatch[1]);
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract test results from report content
     * @param {string} content - Report file content
     * @returns {Object} Test results summary
     */
    extractTestResults(content) {
        const results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            tests: []
        };

        // Try to extract from metadata first
        const metadata = this.extractMetadata(content);
        if (metadata) {
            results.total = metadata.tests_executed || 0;
            results.passed = metadata.tests_passed || 0;
            results.failed = metadata.tests_failed || 0;
            return results;
        }

        // Fallback: Parse content for test results
        const passMatches = content.match(/✅\s*(PASS|TEST.*PASSED)/gi) || [];
        const failMatches = content.match(/❌\s*(FAIL|TEST.*FAILED)/gi) || [];

        results.passed = passMatches.length;
        results.failed = failMatches.length;
        results.total = results.passed + results.failed;

        return results;
    }

    /**
     * Calculate pass rate from test results
     * @param {Object} results - Test results
     * @returns {number} Pass rate percentage
     */
    calculatePassRate(results) {
        if (results.total === 0) return 0;
        return Math.round((results.passed / results.total) * 100);
    }

    /**
     * Compare individual test results between reports
     * @param {Object} oldResults - Old test results
     * @param {Object} newResults - New test results
     * @param {Object} comparison - Comparison object to populate
     */
    compareIndividualTests(oldResults, newResults, comparison) {
        // Extract individual test names and statuses if available
        // This is a simplified version - can be enhanced to parse test case details

        if (oldResults.tests && newResults.tests) {
            for (const oldTest of oldResults.tests) {
                const newTest = newResults.tests.find(t => t.name === oldTest.name);

                if (!newTest) {
                    comparison.regressions.push({
                        type: 'missing_test',
                        severity: 'MEDIUM',
                        message: `Test case missing in new report: ${oldTest.name}`
                    });
                } else if (oldTest.status === 'passed' && newTest.status === 'failed') {
                    comparison.regressions.push({
                        type: 'test_regression',
                        severity: 'HIGH',
                        test_name: oldTest.name,
                        message: `Test regressed: ${oldTest.name} (was passing, now failing)`
                    });
                }
            }
        }
    }

    /**
     * Generate org state hash for change detection
     * @param {string} orgAlias - Salesforce org alias
     * @returns {string} Hash of current org state
     */
    generateOrgStateHash(orgAlias) {
        // Simple hash based on timestamp
        // In production, this could query org metadata and hash key objects/fields
        const timestamp = Date.now();
        const hash = crypto.createHash('md5')
            .update(`${orgAlias}-${timestamp}`)
            .digest('hex')
            .substring(0, 8);

        return hash;
    }

    /**
     * Create archive manifest file
     * @param {string} archiveDir - Archive directory path
     * @param {Object} results - Archive results
     */
    createArchiveManifest(archiveDir, results) {
        const manifest = {
            archived_at: new Date().toISOString(),
            archived_count: results.archived.length,
            files: results.archived
        };

        const manifestPath = path.join(archiveDir, 'ARCHIVE_MANIFEST.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    /**
     * Get timestamp string for archive directories
     * @returns {string} Timestamp in format YYYY-MM-DD-HHMMSS
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString()
            .replace(/T/, '-')
            .replace(/:/g, '')
            .split('.')[0];
    }
}

// CLI Interface
if (require.main === module) {
    const manager = new TestReportManager();
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.error('Usage: node test-report-manager.js <command> [options]');
        console.error('Commands:');
        console.error('  archive <reports-dir>');
        console.error('  validate <report-file> [--max-age-hours=24]');
        console.error('  compare <old-report> <new-report>');
        process.exit(1);
    }

    switch (command) {
        case 'archive': {
            const reportsDir = args[1] || './reports';
            console.log(`Archiving old reports in: ${reportsDir}`);

            const results = manager.archiveOldReports(reportsDir);

            console.log(`\n✅ Archived: ${results.archived.length} files`);
            results.archived.forEach(item => {
                console.log(`  - ${item.file} (${item.age_hours}h old)`);
            });

            if (results.skipped.length > 0) {
                console.log(`\n⏭️  Skipped: ${results.skipped.length} files`);
                results.skipped.forEach(item => {
                    console.log(`  - ${item.file} (${item.reason})`);
                });
            }

            if (results.errors.length > 0) {
                console.error(`\n❌ Errors: ${results.errors.length}`);
                results.errors.forEach(err => console.error(`  - ${err.message}`));
                process.exit(1);
            }
            break;
        }

        case 'validate': {
            const reportFile = args[1];
            if (!reportFile) {
                console.error('Error: Report file path required');
                process.exit(1);
            }

            const maxAgeArg = args.find(arg => arg.startsWith('--max-age-hours='));
            const maxAge = maxAgeArg ? parseInt(maxAgeArg.split('=')[1]) : 24;

            const validation = manager.validateReport(reportFile, maxAge);

            if (validation.valid) {
                console.log('✅ Report validation PASSED');
            } else {
                console.log('❌ Report validation FAILED');
            }

            if (validation.errors.length > 0) {
                console.error('\nErrors:');
                validation.errors.forEach(err => console.error(`  - ${err}`));
            }

            if (validation.warnings.length > 0) {
                console.warn('\nWarnings:');
                validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
            }

            if (validation.metadata) {
                console.log('\nMetadata:');
                console.log(`  Timestamp: ${validation.metadata.execution_timestamp}`);
                console.log(`  Org: ${validation.metadata.org_alias}`);
                console.log(`  Pass Rate: ${validation.metadata.pass_rate}%`);
            }

            process.exit(validation.valid ? 0 : 1);
        }

        case 'compare': {
            const oldReport = args[1];
            const newReport = args[2];

            if (!oldReport || !newReport) {
                console.error('Error: Both old and new report paths required');
                process.exit(1);
            }

            const comparison = manager.compareReports(oldReport, newReport);

            console.log('\n📊 Test Report Comparison');
            console.log('═'.repeat(50));

            if (comparison.summary) {
                console.log(`\nOld Pass Rate: ${comparison.summary.old_pass_rate}%`);
                console.log(`New Pass Rate: ${comparison.summary.new_pass_rate}%`);
                console.log(`Delta: ${comparison.summary.delta > 0 ? '+' : ''}${comparison.summary.delta}%`);
            }

            if (comparison.regression_detected) {
                console.error('\n🔴 REGRESSIONS DETECTED:');
                comparison.regressions.forEach(reg => {
                    console.error(`  [${reg.severity}] ${reg.message}`);
                    if (reg.recommendation) {
                        console.error(`    → ${reg.recommendation}`);
                    }
                });
                process.exit(1);
            } else if (comparison.improvements.length > 0) {
                console.log('\n✅ IMPROVEMENTS:');
                comparison.improvements.forEach(imp => {
                    console.log(`  ${imp.message}`);
                });
            } else {
                console.log('\n✅ No significant changes detected');
            }

            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

module.exports = TestReportManager;
