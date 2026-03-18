#!/usr/bin/env node

/**
 * Analytics API Validator
 *
 * Validates Salesforce Analytics/Reports API requests to prevent:
 * - Silent truncation at 2,000 rows (Summary format)
 * - Performance issues with large exports
 * - Format selection mismatches
 *
 * Usage:
 *   const validator = new AnalyticsAPIValidator(orgAlias);
 *   const result = await validator.validate(reportRequest);
 *
 * @module analytics-api-validator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #6 - Analytics API 2,000 Row Limit ($8k ROI)
 */

const ReportRowEstimator = require('./report-row-estimator');
const ReportFormatSwitcher = require('./report-format-switcher');
const fs = require('fs');
const path = require('path');

class AnalyticsAPIValidator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.autoSwitch = options.autoSwitch !== false;

        this.estimator = new ReportRowEstimator(orgAlias, { verbose: false });
        this.switcher = new ReportFormatSwitcher(orgAlias, { verbose: false, autoSwitch: this.autoSwitch });

        this.limitsConfig = this.loadLimitsConfig();

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            formatSwitches: 0,
            truncationsDetected: 0
        };
    }

    /**
     * Load analytics API limits configuration
     */
    loadLimitsConfig() {
        try {
            const configPath = path.join(__dirname, '../../config/analytics-api-limits.json');
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            // Use defaults
        }

        return {
            format_limits: {
                SUMMARY: { hard_limit: 2000, warning_threshold: 1800 },
                TABULAR: { hard_limit: null, warning_threshold: 5000 }
            }
        };
    }

    /**
     * Validate Analytics API request
     *
     * @param {Object} request - Report request
     * @returns {Object} Validation result
     */
    async validate(request) {
        this.stats.totalValidations++;

        const result = {
            valid: false,
            request: request,
            errors: [],
            warnings: [],
            formatSelection: null,
            rowEstimate: null
        };

        const reportId = request.reportId || request.id;
        const requestedFormat = request.format || request.reportMetadata?.reportFormat || 'SUMMARY';

        // Estimate row count
        const estimate = await this.estimator.estimate(reportId);
        result.rowEstimate = estimate;

        // Validate format selection
        const formatSelection = await this.switcher.selectFormat(reportId, requestedFormat);
        result.formatSelection = formatSelection;

        if (formatSelection.switched) {
            this.stats.formatSwitches++;
            result.warnings.push({
                type: 'FORMAT_SWITCHED',
                message: formatSelection.reason,
                originalFormat: requestedFormat,
                newFormat: formatSelection.selectedFormat
            });
        }

        if (formatSelection.warning) {
            result.warnings.push({
                type: 'FORMAT_WARNING',
                message: formatSelection.warning
            });
        }

        // Check for potential truncation
        if (requestedFormat === 'SUMMARY' && !formatSelection.switched && estimate.estimatedRows > 2000) {
            result.errors.push({
                type: 'TRUNCATION_RISK',
                message: `Summary format will truncate at 2,000 rows (estimated: ${estimate.estimatedRows})`,
                severity: 'HIGH',
                recommendation: 'Use TABULAR format or enable auto-switching'
            });
            this.stats.truncationsDetected++;
        }

        // Determine validity
        result.valid = result.errors.length === 0;

        if (result.valid) {
            this.stats.passed++;
        } else {
            this.stats.failed++;
        }

        return result;
    }

    /**
     * Check if report result was truncated
     */
    checkResultTruncation(reportResult, format) {
        return this.switcher.checkTruncation(reportResult, format);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalValidations > 0
                ? (this.stats.passed / this.stats.totalValidations * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

module.exports = AnalyticsAPIValidator;
