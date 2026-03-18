#!/usr/bin/env node

/**
 * Report Row Estimator
 *
 * Estimates row count for Salesforce reports before execution to:
 * - Choose appropriate export format (Summary vs Tabular)
 * - Prevent silent truncation at 2,000 row limit
 * - Set user expectations
 *
 * Usage:
 *   const estimator = new ReportRowEstimator(orgAlias);
 *   const estimate = await estimator.estimate(reportId);
 *
 * @module report-row-estimator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #6 - Analytics API 2,000 Row Limit ($8k ROI)
 */

const { execSync } = require('child_process');

class ReportRowEstimator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
    }

    /**
     * Estimate row count for report
     *
     * @param {string} reportId - Report ID
     * @returns {Object} Estimation result
     */
    async estimate(reportId) {
        const result = {
            reportId: reportId,
            estimatedRows: 0,
            confidence: 'LOW',
            method: 'unknown',
            recommendation: null
        };

        try {
            // Method 1: Try to get report metadata
            const metadata = this.getReportMetadata(reportId);

            if (metadata && metadata.reportType) {
                // Method 2: Estimate from object count
                const objectCount = await this.getObjectRecordCount(metadata.reportType);
                result.estimatedRows = this.applyFilterHeuristics(objectCount, metadata);
                result.confidence = 'MEDIUM';
                result.method = 'object_count_with_heuristics';
            } else {
                // Fallback: Return low confidence estimate
                result.estimatedRows = 1000; // Conservative default
                result.confidence = 'LOW';
                result.method = 'default_estimate';
            }

        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Estimation failed: ${error.message}`);
            }
            result.estimatedRows = 1000;
            result.confidence = 'LOW';
            result.method = 'error_fallback';
        }

        // Generate recommendation
        result.recommendation = this.getFormatRecommendation(result.estimatedRows);

        return result;
    }

    /**
     * Get report metadata
     */
    getReportMetadata(reportId) {
        try {
            const cmd = `sf data query --query "SELECT DeveloperName, NamespacePrefix FROM Report WHERE Id = '${reportId}'" --target-org ${this.orgAlias} --use-tooling-api --json`;
            const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const response = JSON.parse(output);

            if (response.status === 0 && response.result?.records?.[0]) {
                return response.result.records[0];
            }
        } catch (error) {
            // Metadata unavailable
        }

        return null;
    }

    /**
     * Get object record count
     */
    async getObjectRecordCount(objectName) {
        try {
            const cmd = `sf data query --query "SELECT COUNT() FROM ${objectName}" --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const response = JSON.parse(output);

            if (response.status === 0 && response.result?.records?.[0]) {
                return response.result.records[0].expr0 || 0;
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not get record count: ${error.message}`);
            }
        }

        return 0;
    }

    /**
     * Apply heuristics based on filters
     */
    applyFilterHeuristics(totalCount, metadata) {
        // Simple heuristics - can be enhanced
        let estimate = totalCount;

        // If report has date filters (common), assume ~10% of records
        if (metadata.hasDateFilter) {
            estimate = Math.floor(totalCount * 0.10);
        }

        // If report has owner filter, estimate based on user count
        if (metadata.hasOwnerFilter) {
            estimate = Math.floor(totalCount * 0.05);
        }

        return estimate;
    }

    /**
     * Get format recommendation based on row estimate
     */
    getFormatRecommendation(estimatedRows) {
        if (estimatedRows < 1500) {
            return {
                recommended: 'SUMMARY',
                reason: 'Row count well below Summary limit (2,000)',
                alternatives: ['TABULAR', 'MATRIX']
            };
        } else if (estimatedRows >= 1500 && estimatedRows < 2000) {
            return {
                recommended: 'SUMMARY (with caution)',
                reason: 'Approaching Summary limit - monitor closely',
                alternatives: ['TABULAR (safer choice)'],
                warning: 'May hit 2,000 row limit - consider Tabular'
            };
        } else {
            return {
                recommended: 'TABULAR',
                reason: 'Estimated rows exceed Summary limit (2,000)',
                alternatives: ['MATRIX', 'BULK_API (if >10k)'],
                warning: 'Summary format will truncate data'
            };
        }
    }
}

// CLI usage
if (require.main === module) {
    const orgAlias = process.argv[2];
    const reportId = process.argv[3];

    if (!orgAlias || !reportId) {
        console.log('Report Row Estimator');
        console.log('');
        console.log('Usage:');
        console.log('  node report-row-estimator.js <org-alias> <report-id>');
        console.log('');
        console.log('Example:');
        console.log('  node report-row-estimator.js my-org 00O...');
        process.exit(1);
    }

    const estimator = new ReportRowEstimator(orgAlias, { verbose: true });

    estimator.estimate(reportId).then(result => {
        console.log('\n=== Report Row Estimation ===\n');
        console.log(`Report ID: ${result.reportId}`);
        console.log(`Estimated Rows: ${result.estimatedRows}`);
        console.log(`Confidence: ${result.confidence}`);
        console.log(`Method: ${result.method}`);

        if (result.recommendation) {
            console.log('\n--- Format Recommendation ---');
            console.log(`✅ Recommended: ${result.recommendation.recommended}`);
            console.log(`   Reason: ${result.recommendation.reason}`);

            if (result.recommendation.warning) {
                console.log(`   ⚠️  Warning: ${result.recommendation.warning}`);
            }

            if (result.recommendation.alternatives) {
                console.log(`   Alternatives: ${result.recommendation.alternatives.join(', ')}`);
            }
        }

        process.exit(0);
    });
}

module.exports = ReportRowEstimator;
