#!/usr/bin/env node

/**
 * Cohort Analysis Engine
 *
 * Purpose: Analyze customer/deal cohorts over time for retention and behavior patterns.
 * Generates retention matrices, LTV analysis, and cohort-based insights.
 *
 * Usage:
 *   const { CohortAnalysisEngine } = require('./cohort-analysis-engine');
 *
 *   const engine = new CohortAnalysisEngine();
 *   const cohort = engine.createCohort(records, 'signupMonth', 'monthly');
 *   const retention = engine.calculateRetentionMatrix(cohort, 12);
 *
 * @module cohort-analysis-engine
 * @version 1.0.0
 * @created 2025-12-14
 */

const fs = require('fs');
const path = require('path');

/**
 * Cohort Analysis Engine
 */
class CohortAnalysisEngine {
    /**
     * Initialize cohort analysis engine
     *
     * @param {Object} config - Configuration options
     * @param {string} [config.dateFormat='YYYY-MM'] - Date format for cohort labels
     * @param {number} [config.minCohortSize=10] - Minimum cohort size to analyze
     */
    constructor(config = {}) {
        this.dateFormat = config.dateFormat ?? 'YYYY-MM';
        this.minCohortSize = config.minCohortSize ?? 10;
    }

    /**
     * Create cohorts from records based on a date field
     *
     * @param {Array<Object>} records - Records to cohort
     * @param {string} cohortField - Field to use for cohort assignment (date field)
     * @param {string} [cohortPeriod='monthly'] - Cohort period: 'monthly', 'quarterly', 'yearly'
     * @returns {Object} Cohort structure
     */
    createCohort(records, cohortField, cohortPeriod = 'monthly') {
        if (!records || records.length === 0) {
            return {
                success: false,
                error: 'No records provided'
            };
        }

        const cohorts = new Map();

        records.forEach(record => {
            const dateValue = record[cohortField];
            if (!dateValue) return;

            const cohortKey = this._getCohortKey(dateValue, cohortPeriod);

            if (!cohorts.has(cohortKey)) {
                cohorts.set(cohortKey, {
                    key: cohortKey,
                    period: cohortPeriod,
                    records: [],
                    startDate: dateValue,
                    metrics: {}
                });
            }

            cohorts.get(cohortKey).records.push(record);
        });

        // Convert to sorted array
        const cohortArray = Array.from(cohorts.values())
            .sort((a, b) => a.key.localeCompare(b.key));

        return {
            success: true,
            field: cohortField,
            period: cohortPeriod,
            totalRecords: records.length,
            cohortCount: cohortArray.length,
            cohorts: cohortArray,
            summary: this._generateCohortSummary(cohortArray)
        };
    }

    /**
     * Create custom cohorts using a segmentation function
     *
     * @param {Array<Object>} records - Records to cohort
     * @param {Function} segmentFunction - Function(record) => cohortKey
     * @returns {Object} Cohort structure
     */
    createCustomCohort(records, segmentFunction) {
        if (!records || records.length === 0) {
            return { success: false, error: 'No records provided' };
        }

        const cohorts = new Map();

        records.forEach(record => {
            const cohortKey = segmentFunction(record);
            if (!cohortKey) return;

            if (!cohorts.has(cohortKey)) {
                cohorts.set(cohortKey, {
                    key: cohortKey,
                    period: 'custom',
                    records: [],
                    metrics: {}
                });
            }

            cohorts.get(cohortKey).records.push(record);
        });

        const cohortArray = Array.from(cohorts.values())
            .sort((a, b) => a.key.localeCompare(b.key));

        return {
            success: true,
            field: 'custom',
            period: 'custom',
            totalRecords: records.length,
            cohortCount: cohortArray.length,
            cohorts: cohortArray
        };
    }

    /**
     * Calculate retention matrix for cohorts
     *
     * @param {Object} cohortData - Cohort data from createCohort
     * @param {number} periods - Number of periods to track
     * @param {Object} [options] - Calculation options
     * @param {string} [options.activeField] - Field indicating active status
     * @param {string} [options.activityDateField] - Field containing activity date
     * @returns {Object} Retention matrix
     */
    calculateRetentionMatrix(cohortData, periods, options = {}) {
        if (!cohortData.success) {
            return cohortData;
        }

        const { activeField, activityDateField = 'lastActivityDate' } = options;
        const matrix = {
            cohorts: [],
            periodLabels: this._generatePeriodLabels(periods),
            averageRetention: new Array(periods).fill(0),
            counts: new Array(periods).fill(0)
        };

        cohortData.cohorts.forEach(cohort => {
            const cohortSize = cohort.records.length;
            if (cohortSize < this.minCohortSize) return;

            const retentionRow = {
                cohortKey: cohort.key,
                cohortSize,
                retention: new Array(periods).fill(null),
                retentionPercentages: new Array(periods).fill(null)
            };

            // Period 0 is always 100%
            retentionRow.retention[0] = cohortSize;
            retentionRow.retentionPercentages[0] = 100;

            // Calculate retention for subsequent periods
            for (let p = 1; p < periods; p++) {
                const periodStart = this._addPeriods(cohort.startDate, p, cohortData.period);
                const periodEnd = this._addPeriods(cohort.startDate, p + 1, cohortData.period);

                let activeCount = 0;
                cohort.records.forEach(record => {
                    const activityDate = new Date(record[activityDateField]);
                    if (activeField) {
                        if (record[activeField] && activityDate >= periodStart && activityDate < periodEnd) {
                            activeCount++;
                        }
                    } else {
                        if (activityDate >= periodStart) {
                            activeCount++;
                        }
                    }
                });

                retentionRow.retention[p] = activeCount;
                retentionRow.retentionPercentages[p] = Math.round((activeCount / cohortSize) * 100);

                // Update averages
                matrix.averageRetention[p] += retentionRow.retentionPercentages[p];
                matrix.counts[p]++;
            }

            matrix.cohorts.push(retentionRow);
        });

        // Calculate averages
        matrix.averageRetention = matrix.averageRetention.map((sum, i) =>
            matrix.counts[i] > 0 ? Math.round(sum / matrix.counts[i]) : null
        );

        matrix.averageRetention[0] = 100; // Period 0 always 100%

        return {
            success: true,
            periods,
            cohortCount: matrix.cohorts.length,
            matrix,
            insights: this._generateRetentionInsights(matrix)
        };
    }

    /**
     * Calculate churn by cohort
     *
     * @param {Object} cohortData - Cohort data
     * @param {Object} options - Options
     * @param {string} options.churnField - Field indicating churned status
     * @param {string} [options.churnDateField] - Field with churn date
     * @returns {Object} Churn analysis by cohort
     */
    calculateChurnByCohort(cohortData, options = {}) {
        if (!cohortData.success) {
            return cohortData;
        }

        const { churnField, churnDateField } = options;

        if (!churnField) {
            return { success: false, error: 'churnField option is required' };
        }

        const churnAnalysis = {
            cohorts: [],
            overall: { total: 0, churned: 0, churnRate: 0 }
        };

        cohortData.cohorts.forEach(cohort => {
            const cohortSize = cohort.records.length;
            const churned = cohort.records.filter(r => r[churnField]).length;

            churnAnalysis.overall.total += cohortSize;
            churnAnalysis.overall.churned += churned;

            churnAnalysis.cohorts.push({
                cohortKey: cohort.key,
                cohortSize,
                churned,
                churnRate: (churned / cohortSize) * 100,
                retained: cohortSize - churned,
                retentionRate: ((cohortSize - churned) / cohortSize) * 100
            });
        });

        churnAnalysis.overall.churnRate =
            (churnAnalysis.overall.churned / churnAnalysis.overall.total) * 100;

        // Find best and worst cohorts
        const sorted = [...churnAnalysis.cohorts].sort((a, b) => a.churnRate - b.churnRate);
        churnAnalysis.bestCohort = sorted[0];
        churnAnalysis.worstCohort = sorted[sorted.length - 1];

        return {
            success: true,
            analysis: churnAnalysis,
            insights: this._generateChurnInsights(churnAnalysis)
        };
    }

    /**
     * Calculate expansion revenue by cohort
     *
     * @param {Object} cohortData - Cohort data
     * @param {Object} options - Options
     * @param {string} options.initialRevenueField - Field with initial revenue
     * @param {string} options.currentRevenueField - Field with current revenue
     * @returns {Object} Expansion analysis by cohort
     */
    calculateExpansionByCohort(cohortData, options = {}) {
        if (!cohortData.success) {
            return cohortData;
        }

        const { initialRevenueField, currentRevenueField } = options;

        if (!initialRevenueField || !currentRevenueField) {
            return { success: false, error: 'Revenue fields are required' };
        }

        const expansionAnalysis = {
            cohorts: [],
            overall: {
                initialRevenue: 0,
                currentRevenue: 0,
                expansion: 0,
                expansionRate: 0
            }
        };

        cohortData.cohorts.forEach(cohort => {
            let initialSum = 0;
            let currentSum = 0;

            cohort.records.forEach(record => {
                const initial = parseFloat(record[initialRevenueField]) || 0;
                const current = parseFloat(record[currentRevenueField]) || 0;
                initialSum += initial;
                currentSum += current;
            });

            const expansion = currentSum - initialSum;
            const expansionRate = initialSum > 0 ? (expansion / initialSum) * 100 : 0;

            expansionAnalysis.overall.initialRevenue += initialSum;
            expansionAnalysis.overall.currentRevenue += currentSum;

            expansionAnalysis.cohorts.push({
                cohortKey: cohort.key,
                cohortSize: cohort.records.length,
                initialRevenue: initialSum,
                currentRevenue: currentSum,
                expansion,
                expansionRate
            });
        });

        expansionAnalysis.overall.expansion =
            expansionAnalysis.overall.currentRevenue - expansionAnalysis.overall.initialRevenue;
        expansionAnalysis.overall.expansionRate =
            (expansionAnalysis.overall.expansion / expansionAnalysis.overall.initialRevenue) * 100;

        return {
            success: true,
            analysis: expansionAnalysis
        };
    }

    /**
     * Calculate LTV by cohort
     *
     * @param {Object} cohortData - Cohort data
     * @param {Object} options - Options
     * @param {string} options.revenueField - Field with cumulative revenue
     * @returns {Object} LTV analysis by cohort
     */
    calculateLTVByCohort(cohortData, options = {}) {
        if (!cohortData.success) {
            return cohortData;
        }

        const { revenueField } = options;

        if (!revenueField) {
            return { success: false, error: 'revenueField option is required' };
        }

        const ltvAnalysis = {
            cohorts: [],
            overall: { totalRevenue: 0, totalCustomers: 0, averageLTV: 0 }
        };

        cohortData.cohorts.forEach(cohort => {
            const revenues = cohort.records.map(r => parseFloat(r[revenueField]) || 0);
            const totalRevenue = revenues.reduce((a, b) => a + b, 0);
            const averageLTV = totalRevenue / cohort.records.length;

            ltvAnalysis.overall.totalRevenue += totalRevenue;
            ltvAnalysis.overall.totalCustomers += cohort.records.length;

            ltvAnalysis.cohorts.push({
                cohortKey: cohort.key,
                cohortSize: cohort.records.length,
                totalRevenue,
                averageLTV,
                medianLTV: this._median(revenues),
                minLTV: Math.min(...revenues),
                maxLTV: Math.max(...revenues)
            });
        });

        ltvAnalysis.overall.averageLTV =
            ltvAnalysis.overall.totalRevenue / ltvAnalysis.overall.totalCustomers;

        // Sort by LTV
        const sortedByLTV = [...ltvAnalysis.cohorts].sort((a, b) => b.averageLTV - a.averageLTV);
        ltvAnalysis.bestCohort = sortedByLTV[0];
        ltvAnalysis.worstCohort = sortedByLTV[sortedByLTV.length - 1];

        return {
            success: true,
            analysis: ltvAnalysis,
            insights: this._generateLTVInsights(ltvAnalysis)
        };
    }

    /**
     * Calculate CAC payback by cohort
     *
     * @param {Object} cohortData - Cohort data
     * @param {Object} options - Options
     * @param {string} options.cacField - Field with CAC value
     * @param {string} options.mrrField - Field with MRR value
     * @returns {Object} CAC payback analysis by cohort
     */
    calculatePaybackByCohort(cohortData, options = {}) {
        if (!cohortData.success) {
            return cohortData;
        }

        const { cacField, mrrField } = options;

        if (!cacField || !mrrField) {
            return { success: false, error: 'cacField and mrrField options are required' };
        }

        const paybackAnalysis = {
            cohorts: []
        };

        cohortData.cohorts.forEach(cohort => {
            const paybacks = cohort.records.map(r => {
                const cac = parseFloat(r[cacField]) || 0;
                const mrr = parseFloat(r[mrrField]) || 0;
                return mrr > 0 ? cac / mrr : null;
            }).filter(p => p !== null);

            if (paybacks.length === 0) return;

            const avgPayback = paybacks.reduce((a, b) => a + b, 0) / paybacks.length;

            paybackAnalysis.cohorts.push({
                cohortKey: cohort.key,
                cohortSize: cohort.records.length,
                avgPaybackMonths: avgPayback,
                medianPaybackMonths: this._median(paybacks),
                under12Months: paybacks.filter(p => p < 12).length,
                pctUnder12Months: (paybacks.filter(p => p < 12).length / paybacks.length) * 100
            });
        });

        return {
            success: true,
            analysis: paybackAnalysis
        };
    }

    /**
     * Generate retention heatmap data
     *
     * @param {Object} retentionMatrix - Retention matrix from calculateRetentionMatrix
     * @returns {Object} Heatmap data structure
     */
    generateRetentionHeatmap(retentionMatrix) {
        if (!retentionMatrix.success) {
            return retentionMatrix;
        }

        const heatmap = {
            rows: retentionMatrix.matrix.cohorts.map(cohort => ({
                label: cohort.cohortKey,
                cells: cohort.retentionPercentages.map((pct, i) => ({
                    period: i,
                    value: pct,
                    color: this._getHeatmapColor(pct)
                }))
            })),
            columnLabels: retentionMatrix.matrix.periodLabels,
            legend: [
                { label: 'Excellent (80%+)', color: '#22c55e' },
                { label: 'Good (60-80%)', color: '#84cc16' },
                { label: 'Average (40-60%)', color: '#eab308' },
                { label: 'Below Average (20-40%)', color: '#f97316' },
                { label: 'Poor (<20%)', color: '#ef4444' }
            ]
        };

        return heatmap;
    }

    /**
     * Generate markdown table for retention matrix
     *
     * @param {Object} retentionMatrix - Retention matrix
     * @returns {string} Markdown table
     */
    generateRetentionTable(retentionMatrix) {
        if (!retentionMatrix.success) {
            return `Error: ${retentionMatrix.error}`;
        }

        const { matrix, periods } = retentionMatrix;

        // Header
        let table = `| Cohort | Size |`;
        for (let i = 0; i < periods; i++) {
            table += ` M${i} |`;
        }
        table += `\n|--------|------|`;
        for (let i = 0; i < periods; i++) {
            table += `------|`;
        }
        table += '\n';

        // Data rows
        matrix.cohorts.forEach(cohort => {
            table += `| ${cohort.cohortKey} | ${cohort.cohortSize} |`;
            cohort.retentionPercentages.forEach(pct => {
                table += ` ${pct !== null ? pct + '%' : '-'} |`;
            });
            table += '\n';
        });

        // Average row
        table += `| **Average** | - |`;
        matrix.averageRetention.forEach(avg => {
            table += ` ${avg !== null ? avg + '%' : '-'} |`;
        });
        table += '\n';

        return table;
    }

    /**
     * Identify best performing cohorts
     *
     * @param {Object} cohortData - Cohort data with metrics
     * @param {string} metric - Metric to rank by
     * @returns {Array} Ranked cohorts
     */
    identifyBestCohorts(cohortData, metric) {
        if (!cohortData.success) {
            return [];
        }

        return cohortData.cohorts
            .filter(c => c.metrics && c.metrics[metric] !== undefined)
            .sort((a, b) => b.metrics[metric] - a.metrics[metric])
            .slice(0, 5)
            .map((c, i) => ({
                rank: i + 1,
                cohortKey: c.key,
                value: c.metrics[metric],
                size: c.records.length
            }));
    }

    /**
     * Identify at-risk cohorts
     *
     * @param {Object} retentionMatrix - Retention matrix
     * @param {number} [threshold=50] - Retention threshold percentage
     * @returns {Array} At-risk cohorts
     */
    identifyAtRiskCohorts(retentionMatrix, threshold = 50) {
        if (!retentionMatrix.success) {
            return [];
        }

        return retentionMatrix.matrix.cohorts
            .filter(cohort => {
                const lastPeriod = cohort.retentionPercentages.filter(p => p !== null).pop();
                return lastPeriod !== undefined && lastPeriod < threshold;
            })
            .map(cohort => ({
                cohortKey: cohort.cohortKey,
                cohortSize: cohort.cohortSize,
                latestRetention: cohort.retentionPercentages.filter(p => p !== null).pop(),
                trend: this._calculateRetentionTrend(cohort.retentionPercentages),
                risk: 'high'
            }))
            .sort((a, b) => a.latestRetention - b.latestRetention);
    }

    /**
     * Generate cohort insights
     *
     * @param {Object} analysis - Any cohort analysis result
     * @returns {Array<string>} Insight strings
     */
    generateCohortInsights(analysis) {
        const insights = [];

        if (analysis.retentionMatrix) {
            insights.push(...this._generateRetentionInsights(analysis.retentionMatrix.matrix));
        }

        if (analysis.churnAnalysis) {
            insights.push(...this._generateChurnInsights(analysis.churnAnalysis));
        }

        if (analysis.ltvAnalysis) {
            insights.push(...this._generateLTVInsights(analysis.ltvAnalysis));
        }

        return insights;
    }

    // ==================== Private Methods ====================

    /**
     * Get cohort key from date
     * @private
     */
    _getCohortKey(dateValue, period) {
        const date = new Date(dateValue);

        switch (period) {
            case 'yearly':
                return `${date.getFullYear()}`;
            case 'quarterly':
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                return `${date.getFullYear()}-Q${quarter}`;
            case 'monthly':
            default:
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
    }

    /**
     * Add periods to a date
     * @private
     */
    _addPeriods(dateValue, periods, periodType) {
        const date = new Date(dateValue);

        switch (periodType) {
            case 'yearly':
                date.setFullYear(date.getFullYear() + periods);
                break;
            case 'quarterly':
                date.setMonth(date.getMonth() + periods * 3);
                break;
            case 'monthly':
            default:
                date.setMonth(date.getMonth() + periods);
        }

        return date;
    }

    /**
     * Generate period labels
     * @private
     */
    _generatePeriodLabels(periods) {
        return Array.from({ length: periods }, (_, i) => `M${i}`);
    }

    /**
     * Calculate median
     * @private
     */
    _median(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Get heatmap color based on retention percentage
     * @private
     */
    _getHeatmapColor(pct) {
        if (pct === null) return '#e5e7eb';
        if (pct >= 80) return '#22c55e';
        if (pct >= 60) return '#84cc16';
        if (pct >= 40) return '#eab308';
        if (pct >= 20) return '#f97316';
        return '#ef4444';
    }

    /**
     * Calculate retention trend
     * @private
     */
    _calculateRetentionTrend(retentionValues) {
        const valid = retentionValues.filter(v => v !== null);
        if (valid.length < 2) return 'insufficient_data';

        const firstHalf = valid.slice(0, Math.floor(valid.length / 2));
        const secondHalf = valid.slice(Math.floor(valid.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        if (secondAvg > firstAvg + 5) return 'improving';
        if (secondAvg < firstAvg - 5) return 'declining';
        return 'stable';
    }

    /**
     * Generate cohort summary
     * @private
     */
    _generateCohortSummary(cohorts) {
        const sizes = cohorts.map(c => c.records.length);
        return {
            totalCohorts: cohorts.length,
            averageSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
            minSize: Math.min(...sizes),
            maxSize: Math.max(...sizes),
            dateRange: {
                first: cohorts[0]?.key,
                last: cohorts[cohorts.length - 1]?.key
            }
        };
    }

    /**
     * Generate retention insights
     * @private
     */
    _generateRetentionInsights(matrix) {
        const insights = [];

        // Overall trend
        const avgRetention = matrix.averageRetention;
        const lastNonNull = avgRetention.filter(v => v !== null).pop();
        if (lastNonNull !== undefined) {
            if (lastNonNull >= 80) {
                insights.push('Excellent overall retention - customer base is highly loyal');
            } else if (lastNonNull >= 60) {
                insights.push('Good retention rates - focus on preventing churn in later months');
            } else if (lastNonNull >= 40) {
                insights.push('Average retention - investigate causes of customer churn');
            } else {
                insights.push('Low retention rates - urgent action needed to improve customer success');
            }
        }

        // Month 1 drop-off
        if (avgRetention[0] === 100 && avgRetention[1] && avgRetention[1] < 85) {
            insights.push(`Significant M1 drop-off (${100 - avgRetention[1]}%) - review onboarding experience`);
        }

        return insights;
    }

    /**
     * Generate churn insights
     * @private
     */
    _generateChurnInsights(churnAnalysis) {
        const insights = [];
        const { overall, bestCohort, worstCohort } = churnAnalysis;

        if (overall.churnRate > 10) {
            insights.push(`High overall churn rate (${overall.churnRate.toFixed(1)}%) - requires immediate attention`);
        } else if (overall.churnRate < 5) {
            insights.push(`Excellent churn rate (${overall.churnRate.toFixed(1)}%) - above industry average`);
        }

        if (bestCohort && worstCohort) {
            const diff = worstCohort.churnRate - bestCohort.churnRate;
            if (diff > 10) {
                insights.push(`${diff.toFixed(1)}pp churn variance between cohorts - investigate ${worstCohort.cohortKey} cohort issues`);
            }
        }

        return insights;
    }

    /**
     * Generate LTV insights
     * @private
     */
    _generateLTVInsights(ltvAnalysis) {
        const insights = [];
        const { overall, bestCohort, worstCohort } = ltvAnalysis;

        if (bestCohort && worstCohort) {
            const ratio = bestCohort.averageLTV / worstCohort.averageLTV;
            if (ratio > 2) {
                insights.push(`Best cohort (${bestCohort.cohortKey}) has ${ratio.toFixed(1)}x higher LTV than worst`);
                insights.push(`Study ${bestCohort.cohortKey} acquisition channels and customer profile`);
            }
        }

        return insights;
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Cohort Analysis Engine

Usage:
  node cohort-analysis-engine.js --data <path> [options]

Options:
  --data <path>            Path to records JSON file (required)
  --cohort-field <field>   Field to use for cohort grouping (required)
  --period <type>          Cohort period: monthly, quarterly, yearly (default: monthly)
  --retention <n>          Calculate retention matrix for n periods
  --churn <field>          Calculate churn using specified boolean field
  --ltv <field>            Calculate LTV using specified revenue field
  --format <type>          Output format: json, markdown (default: json)
  --output <path>          Output file path
  --help                   Show this help message

Data Format:
  JSON array of objects with date fields and metrics

Examples:
  node cohort-analysis-engine.js --data ./customers.json --cohort-field signupDate --period monthly --retention 12
  node cohort-analysis-engine.js --data ./customers.json --cohort-field signupDate --churn isChurned
  node cohort-analysis-engine.js --data ./customers.json --cohort-field signupDate --ltv totalRevenue
        `);
        process.exit(0);
    }

    try {
        const dataPath = args.includes('--data') ? args[args.indexOf('--data') + 1] : null;
        const cohortField = args.includes('--cohort-field') ? args[args.indexOf('--cohort-field') + 1] : null;
        const period = args.includes('--period') ? args[args.indexOf('--period') + 1] : 'monthly';
        const retentionPeriods = args.includes('--retention') ? parseInt(args[args.indexOf('--retention') + 1]) : null;
        const churnField = args.includes('--churn') ? args[args.indexOf('--churn') + 1] : null;
        const ltvField = args.includes('--ltv') ? args[args.indexOf('--ltv') + 1] : null;
        const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';
        const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : './cohort-analysis.json';

        if (!dataPath || !cohortField) {
            console.error('Error: --data and --cohort-field are required');
            process.exit(1);
        }

        const records = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`Loaded ${records.length} records from ${dataPath}`);

        const engine = new CohortAnalysisEngine();
        const results = {};

        // Create cohorts
        const cohortData = engine.createCohort(records, cohortField, period);
        console.log(`Created ${cohortData.cohortCount} cohorts`);
        results.cohorts = cohortData;

        // Retention analysis
        if (retentionPeriods) {
            console.log(`\nCalculating ${retentionPeriods}-period retention matrix...`);
            results.retention = engine.calculateRetentionMatrix(cohortData, retentionPeriods);

            if (format === 'markdown') {
                console.log('\n' + engine.generateRetentionTable(results.retention));
            }
        }

        // Churn analysis
        if (churnField) {
            console.log(`\nCalculating churn by cohort...`);
            results.churn = engine.calculateChurnByCohort(cohortData, { churnField });
            console.log(`Overall churn rate: ${results.churn.analysis.overall.churnRate.toFixed(1)}%`);
        }

        // LTV analysis
        if (ltvField) {
            console.log(`\nCalculating LTV by cohort...`);
            results.ltv = engine.calculateLTVByCohort(cohortData, { revenueField: ltvField });
            console.log(`Average LTV: $${results.ltv.analysis.overall.averageLTV.toFixed(2)}`);
        }

        // Save results
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`\nResults saved to: ${outputPath}`);

    } catch (error) {
        console.error('\nError:');
        console.error(error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { CohortAnalysisEngine };
