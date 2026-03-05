#!/usr/bin/env node

/**
 * Report Format Switcher
 *
 * Automatically switches report export format when row limits detected:
 * - Summary (2k limit) → Tabular (no limit) when estimate >2,000
 * - Warns when approaching limits
 * - Provides format recommendations
 *
 * Usage:
 *   const switcher = new ReportFormatSwitcher(orgAlias);
 *   const format = await switcher.selectFormat(reportId, requestedFormat);
 *
 * @module report-format-switcher
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #6 - Analytics API 2,000 Row Limit ($8k ROI)
 */

const ReportRowEstimator = require('./report-row-estimator');

class ReportFormatSwitcher {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.autoSwitch = options.autoSwitch !== false; // Default true

        this.estimator = new ReportRowEstimator(orgAlias, { verbose: false });

        this.limits = {
            SUMMARY: 2000,
            SUMMARY_WARNING: 1800
        };
    }

    /**
     * Select appropriate format for report
     *
     * @param {string} reportId - Report ID
     * @param {string} requestedFormat - Format requested by user
     * @returns {Object} Format selection result
     */
    async selectFormat(reportId, requestedFormat = 'SUMMARY') {
        const result = {
            reportId: reportId,
            requestedFormat: requestedFormat,
            selectedFormat: requestedFormat,
            switched: false,
            reason: null,
            warning: null,
            rowEstimate: null
        };

        // Estimate row count
        const estimate = await this.estimator.estimate(reportId);
        result.rowEstimate = estimate;

        // Check if switching needed
        if (requestedFormat === 'SUMMARY') {
            if (estimate.estimatedRows > this.limits.SUMMARY) {
                // Exceeds limit - switch to Tabular
                if (this.autoSwitch) {
                    result.selectedFormat = 'TABULAR';
                    result.switched = true;
                    result.reason = `Estimated ${estimate.estimatedRows} rows exceeds Summary limit (2,000) - switching to Tabular`;

                    if (this.verbose) {
                        console.log(`⚠️  Auto-switching: SUMMARY → TABULAR (estimated ${estimate.estimatedRows} rows)`);
                    }
                } else {
                    result.warning = `Estimated ${estimate.estimatedRows} rows exceeds Summary limit - data may be truncated`;
                }
            } else if (estimate.estimatedRows > this.limits.SUMMARY_WARNING) {
                // Approaching limit - warn
                result.warning = `Estimated ${estimate.estimatedRows} rows approaching Summary limit (2,000) - monitor for truncation`;

                if (this.verbose) {
                    console.log(`⚠️  Warning: Approaching Summary limit (${estimate.estimatedRows}/2,000 rows)`);
                }
            }
        }

        return result;
    }

    /**
     * Validate format selection
     *
     * @param {string} format - Selected format
     * @param {number} estimatedRows - Estimated row count
     * @returns {Object} Validation result
     */
    validateFormat(format, estimatedRows) {
        const result = {
            valid: true,
            warnings: [],
            errors: []
        };

        if (format === 'SUMMARY' && estimatedRows > this.limits.SUMMARY) {
            result.errors.push({
                type: 'FORMAT_LIMIT_EXCEEDED',
                message: `Summary format will truncate at 2,000 rows (estimated: ${estimatedRows})`,
                severity: 'HIGH',
                recommendation: 'Use TABULAR format instead'
            });
            result.valid = false;
        } else if (format === 'SUMMARY' && estimatedRows > this.limits.SUMMARY_WARNING) {
            result.warnings.push({
                type: 'APPROACHING_LIMIT',
                message: `Approaching Summary limit (estimated: ${estimatedRows}/2,000)`,
                severity: 'MEDIUM',
                recommendation: 'Monitor row count or use TABULAR format'
            });
        }

        return result;
    }

    /**
     * Check if result was truncated
     *
     * @param {Object} reportResult - Report execution result
     * @param {string} format - Format used
     * @returns {Object} Truncation check result
     */
    checkTruncation(reportResult, format) {
        const result = {
            truncated: false,
            confidence: 'LOW',
            reason: null,
            recommendation: null
        };

        const rowCount = reportResult.factMap?.length ||
                        reportResult.allData?.length ||
                        0;

        // Exact 2,000 rows in Summary format = likely truncated
        if (format === 'SUMMARY' && rowCount === 2000) {
            result.truncated = true;
            result.confidence = 'HIGH';
            result.reason = 'Result is exactly 2,000 rows in Summary format - likely truncated';
            result.recommendation = 'Re-run with TABULAR format to get complete data';
        }

        return result;
    }
}

// CLI usage
if (require.main === module) {
    const orgAlias = process.argv[2];
    const reportId = process.argv[3];
    const requestedFormat = process.argv[4] || 'SUMMARY';

    if (!orgAlias || !reportId) {
        console.log('Report Format Switcher');
        console.log('');
        console.log('Usage:');
        console.log('  node report-format-switcher.js <org-alias> <report-id> [format]');
        console.log('');
        console.log('Example:');
        console.log('  node report-format-switcher.js my-org 00O... SUMMARY');
        process.exit(1);
    }

    const switcher = new ReportFormatSwitcher(orgAlias, { verbose: true, autoSwitch: true });

    switcher.selectFormat(reportId, requestedFormat).then(result => {
        console.log('\n=== Format Selection ===\n');
        console.log(`Requested: ${result.requestedFormat}`);
        console.log(`Selected: ${result.selectedFormat}`);
        console.log(`Switched: ${result.switched ? '✅ Yes' : '❌ No'}`);

        if (result.switched) {
            console.log(`\n⚠️  ${result.reason}`);
        }

        if (result.warning) {
            console.log(`\n⚠️  ${result.warning}`);
        }

        if (result.rowEstimate) {
            console.log(`\nEstimated Rows: ${result.rowEstimate.estimatedRows}`);
            console.log(`Confidence: ${result.rowEstimate.confidence}`);
        }

        process.exit(0);
    });
}

module.exports = ReportFormatSwitcher;
