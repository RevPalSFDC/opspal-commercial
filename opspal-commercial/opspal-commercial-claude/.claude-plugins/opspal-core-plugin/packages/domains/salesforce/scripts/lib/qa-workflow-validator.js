#!/usr/bin/env node
/**
 * QA Workflow Validator
 *
 * Purpose: Validates QA workflow mode selection and prevents stale data issues
 *
 * Features:
 * - Enforces explicit mode selection (execute vs review)
 * - Validates report freshness before review mode
 * - Detects suspicious result changes (e.g., 100% → 40%)
 * - Compares org state before/after testing
 * - Provides mode-specific guidance to agents
 *
 * Usage:
 *   node scripts/lib/qa-workflow-validator.js validate-mode <mode> <org-alias>
 *   node scripts/lib/qa-workflow-validator.js check-regression <old-report> <new-report>
 *   node scripts/lib/qa-workflow-validator.js pre-flight <reports-dir> <org-alias>
 *
 * Prevention: Addresses issue_002 (prompt/LLM mismatch) and issue_005 (concurrency)
 */

const fs = require('fs');
const path = require('path');
const TestReportManager = require('./test-report-manager');

class QAWorkflowValidator {
    constructor() {
        this.reportManager = new TestReportManager();
        this.validModes = ['execute', 'review', 'execute-fresh-tests', 'review-existing-results'];
        this.maxReportAgeHours = 24;
        this.regressionThreshold = 20; // % drop that triggers alert
    }

    /**
     * Validate QA workflow mode selection
     * @param {string} mode - Requested mode (execute or review)
     * @param {string} orgAlias - Salesforce org alias
     * @param {string} reportsDir - Directory containing test reports
     * @returns {Object} Validation results with guidance
     */
    validateMode(mode, orgAlias, reportsDir = './reports') {
        const validation = {
            valid: false,
            mode: mode,
            guidance: [],
            warnings: [],
            errors: [],
            required_actions: []
        };

        // Normalize mode
        const normalizedMode = this.normalizeMode(mode);
        if (!normalizedMode) {
            validation.errors.push(`Invalid mode: "${mode}". Must be one of: ${this.validModes.join(', ')}`);
            validation.guidance.push('Specify explicit mode: "execute" to run fresh tests OR "review" to analyze existing results');
            return validation;
        }

        validation.mode = normalizedMode;

        // Mode-specific validation
        if (normalizedMode === 'execute') {
            return this.validateExecuteMode(validation, orgAlias, reportsDir);
        } else if (normalizedMode === 'review') {
            return this.validateReviewMode(validation, orgAlias, reportsDir);
        }

        return validation;
    }

    /**
     * Validate execute mode requirements
     * @param {Object} validation - Validation object to populate
     * @param {string} orgAlias - Salesforce org alias
     * @param {string} reportsDir - Reports directory
     * @returns {Object} Updated validation object
     */
    validateExecuteMode(validation, orgAlias, reportsDir) {
        validation.guidance.push('MODE: EXECUTE - Will run fresh tests against current org state');
        validation.guidance.push('This will:');
        validation.guidance.push('  1. Archive existing test reports to prevent confusion');
        validation.guidance.push('  2. Execute all test cases against live org');
        validation.guidance.push('  3. Generate new timestamped report with metadata');
        validation.guidance.push('  4. Compare with previous results to detect regressions');

        // Check for existing reports and recommend archival
        const existingReports = this.findTestReports(reportsDir);
        if (existingReports.length > 0) {
            validation.warnings.push(`Found ${existingReports.length} existing test report(s) in ${reportsDir}`);
            validation.required_actions.push('Archive old reports before test execution');
            validation.guidance.push('');
            validation.guidance.push('REQUIRED: Run archival first:');
            validation.guidance.push(`  node scripts/lib/test-report-manager.js archive ${reportsDir}`);
        }

        // Check org authentication
        validation.required_actions.push(`Verify org authentication: sf org display --target-org ${orgAlias}`);
        validation.required_actions.push('Confirm org is in correct state for testing (sandbox preferred)');

        validation.valid = true;
        return validation;
    }

    /**
     * Validate review mode requirements
     * @param {Object} validation - Validation object to populate
     * @param {string} orgAlias - Salesforce org alias
     * @param {string} reportsDir - Reports directory
     * @returns {Object} Updated validation object
     */
    validateReviewMode(validation, orgAlias, reportsDir) {
        validation.guidance.push('MODE: REVIEW - Will analyze existing test reports (no test execution)');

        // Find most recent test report
        const reports = this.findTestReports(reportsDir);
        if (reports.length === 0) {
            validation.errors.push('No test reports found in reports directory');
            validation.guidance.push('Cannot review: No existing test reports found');
            validation.guidance.push('Switch to EXECUTE mode to run fresh tests');
            return validation;
        }

        // Get most recent report
        const latestReport = reports.sort((a, b) => b.mtime - a.mtime)[0];
        validation.guidance.push(`Latest report: ${latestReport.name}`);

        // Validate report freshness
        const reportValidation = this.reportManager.validateReport(latestReport.path, this.maxReportAgeHours);

        if (!reportValidation.valid) {
            validation.errors.push('Latest report is too old or invalid');
            reportValidation.errors.forEach(err => validation.errors.push(`  - ${err}`));
            validation.guidance.push('');
            validation.guidance.push('RECOMMENDATION: Report is stale, switch to EXECUTE mode for fresh results');
            return validation;
        }

        if (reportValidation.warnings.length > 0) {
            reportValidation.warnings.forEach(warn => validation.warnings.push(warn));
        }

        // Add metadata info if available
        if (reportValidation.metadata) {
            const ageHours = (Date.now() - new Date(reportValidation.metadata.execution_timestamp).getTime()) / (1000 * 60 * 60);
            validation.guidance.push(`Report age: ${ageHours.toFixed(1)} hours`);
            validation.guidance.push(`Pass rate: ${reportValidation.metadata.pass_rate}%`);
            validation.guidance.push(`Org: ${reportValidation.metadata.org_alias}`);

            // Check org alias match
            if (reportValidation.metadata.org_alias !== orgAlias) {
                validation.warnings.push(`Report is for different org: ${reportValidation.metadata.org_alias} (requested: ${orgAlias})`);
                validation.guidance.push('');
                validation.guidance.push('WARNING: Org mismatch - results may not be relevant');
            }
        }

        validation.valid = true;
        validation.report_file = latestReport.path;
        return validation;
    }

    /**
     * Check for regression between test reports
     * @param {string} oldReportPath - Path to previous report
     * @param {string} newReportPath - Path to new report
     * @returns {Object} Regression check results
     */
    checkRegression(oldReportPath, newReportPath) {
        const check = {
            regression_detected: false,
            severity: 'NONE',
            details: [],
            recommendations: []
        };

        try {
            const comparison = this.reportManager.compareReports(oldReportPath, newReportPath);

            if (comparison.regression_detected) {
                check.regression_detected = true;

                // Determine severity
                const delta = comparison.summary.old_pass_rate - comparison.summary.new_pass_rate;
                if (delta >= 40) {
                    check.severity = 'CRITICAL';
                    check.recommendations.push('🚨 STOP: Likely reading stale data or major system failure');
                    check.recommendations.push('Action: Re-execute fresh tests immediately');
                    check.recommendations.push('Verify: No code deployments or org changes occurred');
                } else if (delta >= 20) {
                    check.severity = 'HIGH';
                    check.recommendations.push('⚠️  INVESTIGATE: Significant regression detected');
                    check.recommendations.push('Action: Review failed tests and identify root cause');
                } else if (delta >= 10) {
                    check.severity = 'MEDIUM';
                    check.recommendations.push('⚠️  REVIEW: Moderate regression detected');
                    check.recommendations.push('Action: Analyze specific test failures');
                }

                check.details = comparison.regressions;
            } else if (comparison.improvements.length > 0) {
                check.details.push({
                    type: 'improvement',
                    message: `Test results improved: ${comparison.summary.new_pass_rate}% (was ${comparison.summary.old_pass_rate}%)`
                });
            }

        } catch (error) {
            check.details.push({
                type: 'error',
                message: `Regression check failed: ${error.message}`
            });
        }

        return check;
    }

    /**
     * Run pre-flight checks before QA workflow
     * @param {string} reportsDir - Reports directory
     * @param {string} orgAlias - Salesforce org alias
     * @returns {Object} Pre-flight check results
     */
    runPreFlight(reportsDir, orgAlias) {
        const preflight = {
            passed: true,
            checks: [],
            warnings: [],
            errors: []
        };

        // Check 1: Reports directory exists
        if (!fs.existsSync(reportsDir)) {
            preflight.checks.push({
                name: 'Reports directory',
                status: 'WARN',
                message: `Directory does not exist: ${reportsDir} (will be created)`
            });
            preflight.warnings.push('Reports directory will be created');
        } else {
            preflight.checks.push({
                name: 'Reports directory',
                status: 'PASS',
                message: 'Directory exists'
            });
        }

        // Check 2: Look for existing reports
        const reports = this.findTestReports(reportsDir);
        if (reports.length > 0) {
            preflight.checks.push({
                name: 'Existing reports',
                status: 'WARN',
                message: `Found ${reports.length} existing report(s) - recommend archival`
            });
            preflight.warnings.push(`${reports.length} existing test reports should be archived`);
        } else {
            preflight.checks.push({
                name: 'Existing reports',
                status: 'PASS',
                message: 'No existing reports (clean state)'
            });
        }

        // Check 3: Archive directory
        const archiveDir = path.join(reportsDir, 'archive');
        if (!fs.existsSync(archiveDir)) {
            preflight.checks.push({
                name: 'Archive directory',
                status: 'INFO',
                message: 'Archive directory will be created when needed'
            });
        } else {
            const archiveCount = fs.readdirSync(archiveDir).filter(f => {
                return fs.statSync(path.join(archiveDir, f)).isDirectory();
            }).length;

            preflight.checks.push({
                name: 'Archive directory',
                status: 'PASS',
                message: `${archiveCount} previous archive(s) exist`
            });
        }

        return preflight;
    }

    /**
     * Find test report files in directory
     * @param {string} reportsDir - Directory to search
     * @returns {Array} Array of report file info objects
     */
    findTestReports(reportsDir) {
        if (!fs.existsSync(reportsDir)) {
            return [];
        }

        const reportPatterns = [
            /^QA_.*\.md$/,
            /^.*_TEST_RESULTS\.md$/,
            /^.*_STATUS_REPORT\.md$/
        ];

        const files = fs.readdirSync(reportsDir);
        const reports = [];

        for (const file of files) {
            const filePath = path.join(reportsDir, file);
            const stat = fs.statSync(filePath);

            if (!stat.isFile()) continue;
            if (!reportPatterns.some(pattern => pattern.test(file))) continue;

            reports.push({
                name: file,
                path: filePath,
                mtime: stat.mtimeMs,
                size: stat.size
            });
        }

        return reports;
    }

    /**
     * Normalize mode string to canonical form
     * @param {string} mode - User-provided mode string
     * @returns {string|null} Normalized mode or null if invalid
     */
    normalizeMode(mode) {
        const lowerMode = mode.toLowerCase().trim();

        if (lowerMode.includes('execute') || lowerMode.includes('fresh') || lowerMode.includes('run')) {
            return 'execute';
        }

        if (lowerMode.includes('review') || lowerMode.includes('read') || lowerMode.includes('existing')) {
            return 'review';
        }

        return null;
    }

    /**
     * Generate agent guidance message based on validation
     * @param {Object} validation - Validation results
     * @returns {string} Formatted guidance for agent
     */
    generateAgentGuidance(validation) {
        const lines = [];

        lines.push('═'.repeat(60));
        lines.push(`QA WORKFLOW MODE: ${validation.mode.toUpperCase()}`);
        lines.push('═'.repeat(60));
        lines.push('');

        validation.guidance.forEach(line => lines.push(line));

        if (validation.warnings.length > 0) {
            lines.push('');
            lines.push('⚠️  WARNINGS:');
            validation.warnings.forEach(warn => lines.push(`  - ${warn}`));
        }

        if (validation.errors.length > 0) {
            lines.push('');
            lines.push('❌ ERRORS:');
            validation.errors.forEach(err => lines.push(`  - ${err}`));
        }

        if (validation.required_actions.length > 0) {
            lines.push('');
            lines.push('✅ REQUIRED ACTIONS:');
            validation.required_actions.forEach(action => lines.push(`  - ${action}`));
        }

        lines.push('');
        lines.push('═'.repeat(60));

        return lines.join('\n');
    }
}

// CLI Interface
if (require.main === module) {
    const validator = new QAWorkflowValidator();
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.error('Usage: node qa-workflow-validator.js <command> [options]');
        console.error('Commands:');
        console.error('  validate-mode <mode> <org-alias> [reports-dir]');
        console.error('  check-regression <old-report> <new-report>');
        console.error('  pre-flight <reports-dir> <org-alias>');
        process.exit(1);
    }

    switch (command) {
        case 'validate-mode': {
            const mode = args[1];
            const orgAlias = args[2];
            const reportsDir = args[3] || './reports';

            if (!mode || !orgAlias) {
                console.error('Error: mode and org-alias required');
                process.exit(1);
            }

            const validation = validator.validateMode(mode, orgAlias, reportsDir);
            console.log(validator.generateAgentGuidance(validation));

            process.exit(validation.valid ? 0 : 1);
        }

        case 'check-regression': {
            const oldReport = args[1];
            const newReport = args[2];

            if (!oldReport || !newReport) {
                console.error('Error: Both old and new report paths required');
                process.exit(1);
            }

            const check = validator.checkRegression(oldReport, newReport);

            console.log('\n📊 Regression Check Results');
            console.log('═'.repeat(60));

            if (check.regression_detected) {
                console.error(`\n🔴 REGRESSION DETECTED: Severity ${check.severity}`);
                console.error('');
                check.details.forEach(detail => {
                    console.error(`  ${detail.message}`);
                });

                if (check.recommendations.length > 0) {
                    console.error('\n📋 Recommendations:');
                    check.recommendations.forEach(rec => {
                        console.error(`  ${rec}`);
                    });
                }

                process.exit(1);
            } else {
                console.log('\n✅ No regression detected');
                if (check.details.length > 0) {
                    check.details.forEach(detail => {
                        console.log(`  ${detail.message}`);
                    });
                }
            }

            break;
        }

        case 'pre-flight': {
            const reportsDir = args[1] || './reports';
            const orgAlias = args[2];

            const preflight = validator.runPreFlight(reportsDir, orgAlias);

            console.log('\n🚀 Pre-Flight Check Results');
            console.log('═'.repeat(60));

            preflight.checks.forEach(check => {
                const icon = check.status === 'PASS' ? '✅' :
                             check.status === 'WARN' ? '⚠️ ' : 'ℹ️ ';
                console.log(`${icon} ${check.name}: ${check.message}`);
            });

            if (preflight.warnings.length > 0) {
                console.log('\n⚠️  Warnings:');
                preflight.warnings.forEach(warn => console.log(`  - ${warn}`));
            }

            if (preflight.errors.length > 0) {
                console.error('\n❌ Errors:');
                preflight.errors.forEach(err => console.error(`  - ${err}`));
                process.exit(1);
            }

            console.log('\n✅ Pre-flight checks complete');
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

module.exports = QAWorkflowValidator;
