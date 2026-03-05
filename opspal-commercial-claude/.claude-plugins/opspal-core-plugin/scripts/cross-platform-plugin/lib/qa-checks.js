/**
 * QA Checks for Report Outputs
 *
 * Implements data quality validation checks for RevOps reports.
 * Based on patterns from reporting_starter_kit with RevOps-specific additions.
 *
 * Patterns:
 * - row_count: Sanity vs expectations
 * - null_rate: Thresholds on critical fields
 * - duplicates: Duplicate key detection
 * - amount_negative: Negative/zero amounts where shouldn't exist
 * - drift_vs_previous: Changes vs previous run
 * - percentage_bounds: Values within 0-100% range
 * - currency_consistency: Consistent currency formats
 * - date_validity: Valid date ranges
 *
 * These checks feed the Appendix QA Results table.
 *
 * @module qa-checks
 * @version 1.0.0
 */

'use strict';

/**
 * QA Result structure
 * @typedef {Object} QAResult
 * @property {string} check - Name of the check
 * @property {'pass'|'warn'|'fail'} status - Check result status
 * @property {string} details - Human-readable details
 * @property {Object} [metadata] - Additional metadata for debugging
 */

/**
 * QA Check configuration
 * @typedef {Object} QACheckConfig
 * @property {number} [minRows=1] - Minimum expected rows
 * @property {number} [maxNullRate=0.05] - Maximum allowed null rate (0-1)
 * @property {string[]} [keyColumns] - Columns that should be unique
 * @property {string[]} [criticalFields] - Fields that must not be null
 * @property {string[]} [amountFields] - Fields containing monetary amounts
 * @property {string[]} [percentageFields] - Fields containing percentages
 * @property {string[]} [dateFields] - Fields containing dates
 * @property {Object} [previousSnapshot] - Previous run data for drift detection
 * @property {number} [driftThreshold=0.1] - Max acceptable drift (0-1)
 */

/**
 * Create a QA result object
 * @param {string} check - Check name
 * @param {'pass'|'warn'|'fail'} status - Check status
 * @param {string} details - Details message
 * @param {Object} [metadata] - Additional metadata
 * @returns {QAResult}
 */
function createResult(check, status, details, metadata = null) {
    const result = { check, status, details };
    if (metadata) {
        result.metadata = metadata;
    }
    return result;
}

/**
 * Check row count against minimum expectation
 * @param {Array<Object>} data - Data rows
 * @param {number} [minRows=1] - Minimum expected rows
 * @returns {QAResult}
 */
function rowCount(data, minRows = 1) {
    const n = Array.isArray(data) ? data.length : 0;

    if (n >= minRows) {
        return createResult('row_count', 'pass', `rows=${n}`, { count: n, minimum: minRows });
    }

    return createResult(
        'row_count',
        'fail',
        `rows=${n} < min_rows=${minRows}`,
        { count: n, minimum: minRows }
    );
}

/**
 * Check null rate on specified columns
 * @param {Array<Object>} data - Data rows
 * @param {string[]} cols - Columns to check
 * @param {number} [maxNullRate=0.05] - Maximum allowed null rate (5% default)
 * @returns {QAResult}
 */
function nullRate(data, cols, maxNullRate = 0.05) {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('null_rate', 'warn', 'No data to check');
    }

    const issues = [];
    const rates = {};

    for (const col of cols) {
        // Check if column exists in data
        const hasColumn = data.some(row => col in row);
        if (!hasColumn) {
            issues.push(`${col}: missing column`);
            continue;
        }

        // Calculate null rate
        const nullCount = data.filter(row => {
            const val = row[col];
            return val === null || val === undefined || val === '' ||
                   (typeof val === 'number' && isNaN(val));
        }).length;

        const rate = nullCount / data.length;
        rates[col] = rate;

        if (rate > maxNullRate) {
            issues.push(`${col}: null_rate=${(rate * 100).toFixed(1)}%`);
        }
    }

    if (issues.length === 0) {
        return createResult('null_rate', 'pass', `cols=${JSON.stringify(cols)}`, { rates });
    }

    return createResult('null_rate', 'warn', issues.join('; '), { rates, issues });
}

/**
 * Check for duplicate rows based on key columns
 * @param {Array<Object>} data - Data rows
 * @param {string[]} keyCols - Columns that should form unique key
 * @returns {QAResult}
 */
function duplicates(data, keyCols) {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('duplicates', 'warn', 'No data to check');
    }

    // Check if key columns exist
    for (const col of keyCols) {
        const hasColumn = data.some(row => col in row);
        if (!hasColumn) {
            return createResult('duplicates', 'warn', `missing key col: ${col}`);
        }
    }

    // Build composite keys and check for duplicates
    const seen = new Map();
    const duplicateKeys = [];

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const key = keyCols.map(col => String(row[col] ?? '')).join('|');

        if (seen.has(key)) {
            duplicateKeys.push({ key, rows: [seen.get(key), i] });
        } else {
            seen.set(key, i);
        }
    }

    if (duplicateKeys.length === 0) {
        return createResult('duplicates', 'pass', `keys=${JSON.stringify(keyCols)}`, { keyColumns: keyCols });
    }

    return createResult(
        'duplicates',
        'warn',
        `duplicate_rows=${duplicateKeys.length} keys=${JSON.stringify(keyCols)}`,
        { keyColumns: keyCols, duplicateCount: duplicateKeys.length, samples: duplicateKeys.slice(0, 5) }
    );
}

/**
 * Check for negative amounts where they shouldn't exist
 * @param {Array<Object>} data - Data rows
 * @param {string} [amountCol='Amount'] - Column containing amounts
 * @returns {QAResult}
 */
function amountNegative(data, amountCol = 'Amount') {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('amount_negative', 'warn', 'No data to check');
    }

    // Check if column exists
    const hasColumn = data.some(row => amountCol in row);
    if (!hasColumn) {
        return createResult('amount_negative', 'warn', `missing col ${amountCol}`);
    }

    // Count negative values
    const negativeRows = data.filter(row => {
        const val = parseFloat(row[amountCol]);
        return !isNaN(val) && val < 0;
    });

    if (negativeRows.length === 0) {
        return createResult('amount_negative', 'pass', '', { column: amountCol });
    }

    return createResult(
        'amount_negative',
        'warn',
        `negative_amount_rows=${negativeRows.length}`,
        { column: amountCol, count: negativeRows.length, samples: negativeRows.slice(0, 3) }
    );
}

/**
 * Check for zero amounts that might indicate data issues
 * @param {Array<Object>} data - Data rows
 * @param {string} [amountCol='Amount'] - Column containing amounts
 * @param {number} [maxZeroRate=0.5] - Maximum acceptable rate of zeros
 * @returns {QAResult}
 */
function amountZero(data, amountCol = 'Amount', maxZeroRate = 0.5) {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('amount_zero', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => amountCol in row);
    if (!hasColumn) {
        return createResult('amount_zero', 'warn', `missing col ${amountCol}`);
    }

    const zeroCount = data.filter(row => {
        const val = parseFloat(row[amountCol]);
        return !isNaN(val) && val === 0;
    }).length;

    const zeroRate = zeroCount / data.length;

    if (zeroRate <= maxZeroRate) {
        return createResult('amount_zero', 'pass', `zero_rate=${(zeroRate * 100).toFixed(1)}%`, {
            column: amountCol,
            zeroCount,
            zeroRate
        });
    }

    return createResult(
        'amount_zero',
        'warn',
        `zero_rate=${(zeroRate * 100).toFixed(1)}% exceeds threshold ${(maxZeroRate * 100).toFixed(0)}%`,
        { column: amountCol, zeroCount, zeroRate, threshold: maxZeroRate }
    );
}

/**
 * Check percentage values are within bounds (0-100 or 0-1 depending on format)
 * @param {Array<Object>} data - Data rows
 * @param {string} percentCol - Column containing percentage
 * @param {boolean} [isDecimal=false] - True if percentage is 0-1, false if 0-100
 * @returns {QAResult}
 */
function percentageBounds(data, percentCol, isDecimal = false) {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('percentage_bounds', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => percentCol in row);
    if (!hasColumn) {
        return createResult('percentage_bounds', 'warn', `missing col ${percentCol}`);
    }

    const maxVal = isDecimal ? 1 : 100;
    const outOfBounds = data.filter(row => {
        const val = parseFloat(row[percentCol]);
        return !isNaN(val) && (val < 0 || val > maxVal);
    });

    if (outOfBounds.length === 0) {
        return createResult('percentage_bounds', 'pass', `${percentCol} all within bounds`, {
            column: percentCol,
            bounds: [0, maxVal]
        });
    }

    return createResult(
        'percentage_bounds',
        'warn',
        `${outOfBounds.length} rows with ${percentCol} out of bounds [0-${maxVal}]`,
        { column: percentCol, count: outOfBounds.length, samples: outOfBounds.slice(0, 3) }
    );
}

/**
 * Check date field validity
 * @param {Array<Object>} data - Data rows
 * @param {string} dateCol - Column containing dates
 * @param {Object} [options] - Options
 * @param {Date} [options.minDate] - Minimum valid date
 * @param {Date} [options.maxDate] - Maximum valid date
 * @returns {QAResult}
 */
function dateValidity(data, dateCol, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('date_validity', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => dateCol in row);
    if (!hasColumn) {
        return createResult('date_validity', 'warn', `missing col ${dateCol}`);
    }

    const { minDate, maxDate } = options;
    const issues = [];
    let invalidCount = 0;
    let outOfRangeCount = 0;

    for (const row of data) {
        const val = row[dateCol];
        if (!val) continue;

        const date = new Date(val);
        if (isNaN(date.getTime())) {
            invalidCount++;
            continue;
        }

        if (minDate && date < minDate) {
            outOfRangeCount++;
        } else if (maxDate && date > maxDate) {
            outOfRangeCount++;
        }
    }

    if (invalidCount > 0) {
        issues.push(`${invalidCount} invalid dates`);
    }
    if (outOfRangeCount > 0) {
        issues.push(`${outOfRangeCount} out of range`);
    }

    if (issues.length === 0) {
        return createResult('date_validity', 'pass', `${dateCol} dates valid`, { column: dateCol });
    }

    return createResult(
        'date_validity',
        'warn',
        issues.join('; '),
        { column: dateCol, invalidCount, outOfRangeCount }
    );
}

/**
 * Check for drift vs previous snapshot
 * @param {Array<Object>} currentData - Current data
 * @param {Array<Object>} previousData - Previous snapshot
 * @param {string} metricCol - Column to compare
 * @param {number} [threshold=0.1] - Maximum acceptable drift (10% default)
 * @returns {QAResult}
 */
function driftVsPrevious(currentData, previousData, metricCol, threshold = 0.1) {
    if (!Array.isArray(currentData) || currentData.length === 0) {
        return createResult('drift_vs_previous', 'warn', 'No current data');
    }

    if (!Array.isArray(previousData) || previousData.length === 0) {
        return createResult('drift_vs_previous', 'pass', 'No previous snapshot to compare');
    }

    // Calculate sums for comparison
    const currentSum = currentData.reduce((sum, row) => {
        const val = parseFloat(row[metricCol]);
        return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const previousSum = previousData.reduce((sum, row) => {
        const val = parseFloat(row[metricCol]);
        return sum + (isNaN(val) ? 0 : val);
    }, 0);

    if (previousSum === 0) {
        return createResult('drift_vs_previous', 'warn', 'Previous sum is zero, cannot calculate drift');
    }

    const drift = Math.abs(currentSum - previousSum) / previousSum;

    if (drift <= threshold) {
        return createResult(
            'drift_vs_previous',
            'pass',
            `drift=${(drift * 100).toFixed(1)}% within threshold`,
            { column: metricCol, currentSum, previousSum, drift, threshold }
        );
    }

    return createResult(
        'drift_vs_previous',
        'warn',
        `drift=${(drift * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(0)}%`,
        { column: metricCol, currentSum, previousSum, drift, threshold }
    );
}

/**
 * Check row count changes vs previous snapshot
 * @param {Array<Object>} currentData - Current data
 * @param {Array<Object>} previousData - Previous snapshot
 * @param {number} [threshold=0.2] - Maximum acceptable change (20% default)
 * @returns {QAResult}
 */
function rowCountDrift(currentData, previousData, threshold = 0.2) {
    const currentCount = Array.isArray(currentData) ? currentData.length : 0;
    const previousCount = Array.isArray(previousData) ? previousData.length : 0;

    if (previousCount === 0) {
        return createResult('row_count_drift', 'pass', 'No previous snapshot');
    }

    const change = Math.abs(currentCount - previousCount) / previousCount;

    if (change <= threshold) {
        return createResult(
            'row_count_drift',
            'pass',
            `row_change=${(change * 100).toFixed(1)}% within threshold`,
            { currentCount, previousCount, change, threshold }
        );
    }

    return createResult(
        'row_count_drift',
        'warn',
        `row_change=${(change * 100).toFixed(1)}% (${previousCount} → ${currentCount}) exceeds threshold`,
        { currentCount, previousCount, change, threshold }
    );
}

// ============================================================================
// RevOps-Specific Checks
// ============================================================================

/**
 * Check win rate is within reasonable bounds
 * @param {Array<Object>} data - Data rows
 * @param {string} [winRateCol='WinRate'] - Column containing win rate
 * @returns {QAResult}
 */
function winRateSanity(data, winRateCol = 'WinRate') {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('win_rate_sanity', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => winRateCol in row);
    if (!hasColumn) {
        return createResult('win_rate_sanity', 'warn', `missing col ${winRateCol}`);
    }

    // Win rates over 80% are suspicious, under 5% may indicate issues
    const suspicious = data.filter(row => {
        const val = parseFloat(row[winRateCol]);
        if (isNaN(val)) return false;
        // Handle both decimal (0-1) and percentage (0-100)
        const normalized = val > 1 ? val / 100 : val;
        return normalized > 0.8 || (normalized > 0 && normalized < 0.05);
    });

    if (suspicious.length === 0) {
        return createResult('win_rate_sanity', 'pass', 'Win rates within normal range');
    }

    return createResult(
        'win_rate_sanity',
        'warn',
        `${suspicious.length} rows with unusual win rates (>80% or <5%)`,
        { count: suspicious.length, samples: suspicious.slice(0, 3) }
    );
}

/**
 * Check pipeline coverage is within reasonable bounds
 * @param {Array<Object>} data - Data rows
 * @param {string} [coverageCol='PipelineCoverage'] - Column containing coverage ratio
 * @returns {QAResult}
 */
function pipelineCoverageSanity(data, coverageCol = 'PipelineCoverage') {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('pipeline_coverage_sanity', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => coverageCol in row);
    if (!hasColumn) {
        return createResult('pipeline_coverage_sanity', 'warn', `missing col ${coverageCol}`);
    }

    // Coverage under 2x or over 10x is unusual
    const suspicious = data.filter(row => {
        const val = parseFloat(row[coverageCol]);
        return !isNaN(val) && (val < 2 || val > 10);
    });

    if (suspicious.length === 0) {
        return createResult('pipeline_coverage_sanity', 'pass', 'Coverage ratios within normal range (2x-10x)');
    }

    return createResult(
        'pipeline_coverage_sanity',
        'warn',
        `${suspicious.length} rows with unusual coverage (<2x or >10x)`,
        { count: suspicious.length, samples: suspicious.slice(0, 3) }
    );
}

/**
 * Check sales cycle length is within reasonable bounds
 * @param {Array<Object>} data - Data rows
 * @param {string} [cycleCol='SalesCycleDays'] - Column containing cycle length
 * @returns {QAResult}
 */
function salesCycleSanity(data, cycleCol = 'SalesCycleDays') {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('sales_cycle_sanity', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => cycleCol in row);
    if (!hasColumn) {
        return createResult('sales_cycle_sanity', 'warn', `missing col ${cycleCol}`);
    }

    // Cycles under 1 day or over 365 days are suspicious
    const suspicious = data.filter(row => {
        const val = parseFloat(row[cycleCol]);
        return !isNaN(val) && (val < 1 || val > 365);
    });

    if (suspicious.length === 0) {
        return createResult('sales_cycle_sanity', 'pass', 'Sales cycles within normal range (1-365 days)');
    }

    return createResult(
        'sales_cycle_sanity',
        'warn',
        `${suspicious.length} rows with unusual sales cycle (<1 or >365 days)`,
        { count: suspicious.length, samples: suspicious.slice(0, 3) }
    );
}

/**
 * Check NRR is within reasonable bounds
 * @param {Array<Object>} data - Data rows
 * @param {string} [nrrCol='NRR'] - Column containing NRR
 * @returns {QAResult}
 */
function nrrSanity(data, nrrCol = 'NRR') {
    if (!Array.isArray(data) || data.length === 0) {
        return createResult('nrr_sanity', 'warn', 'No data to check');
    }

    const hasColumn = data.some(row => nrrCol in row);
    if (!hasColumn) {
        return createResult('nrr_sanity', 'warn', `missing col ${nrrCol}`);
    }

    // NRR under 60% is concerning, over 150% is unusual
    const suspicious = data.filter(row => {
        const val = parseFloat(row[nrrCol]);
        if (isNaN(val)) return false;
        const normalized = val > 5 ? val : val * 100; // Handle decimal vs percentage
        return normalized < 60 || normalized > 150;
    });

    if (suspicious.length === 0) {
        return createResult('nrr_sanity', 'pass', 'NRR values within normal range (60%-150%)');
    }

    return createResult(
        'nrr_sanity',
        'warn',
        `${suspicious.length} rows with unusual NRR (<60% or >150%)`,
        { count: suspicious.length, samples: suspicious.slice(0, 3) }
    );
}

// ============================================================================
// QA Check Runner
// ============================================================================

/**
 * Default check configuration by report type
 */
const DEFAULT_CONFIGS = {
    pipeline: {
        keyColumns: ['Id'],
        criticalFields: ['Amount', 'StageName', 'CloseDate'],
        amountFields: ['Amount', 'ExpectedRevenue'],
        percentageFields: ['Probability'],
        dateFields: ['CloseDate', 'CreatedDate']
    },
    revenue: {
        keyColumns: ['Id'],
        criticalFields: ['Amount', 'Type'],
        amountFields: ['Amount', 'ARR', 'MRR'],
        percentageFields: ['NRR', 'GRR'],
        dateFields: ['CloseDate']
    },
    funnel: {
        keyColumns: ['Stage'],
        criticalFields: ['Count', 'ConversionRate'],
        amountFields: ['Value'],
        percentageFields: ['ConversionRate', 'WinRate'],
        dateFields: []
    },
    velocity: {
        keyColumns: ['Id'],
        criticalFields: ['Amount', 'SalesCycleDays'],
        amountFields: ['Amount', 'DealSize'],
        percentageFields: ['WinRate'],
        dateFields: ['CloseDate', 'CreatedDate']
    }
};

/**
 * Run all applicable QA checks on a dataset
 * @param {Array<Object>} data - Data to check
 * @param {QACheckConfig} config - Check configuration
 * @param {Array<Object>} [previousSnapshot] - Previous data for drift checks
 * @returns {QAResult[]} Array of check results
 */
function runChecks(data, config = {}, previousSnapshot = null) {
    const results = [];

    // Always run row count
    results.push(rowCount(data, config.minRows || 1));

    // Null rate on critical fields
    if (config.criticalFields && config.criticalFields.length > 0) {
        results.push(nullRate(data, config.criticalFields, config.maxNullRate || 0.05));
    }

    // Duplicate check on key columns
    if (config.keyColumns && config.keyColumns.length > 0) {
        results.push(duplicates(data, config.keyColumns));
    }

    // Amount checks
    if (config.amountFields) {
        for (const field of config.amountFields) {
            results.push(amountNegative(data, field));
            results.push(amountZero(data, field, config.maxZeroRate || 0.5));
        }
    }

    // Percentage bounds checks
    if (config.percentageFields) {
        for (const field of config.percentageFields) {
            results.push(percentageBounds(data, field, config.percentagesAsDecimal || false));
        }
    }

    // Date validity checks
    if (config.dateFields) {
        for (const field of config.dateFields) {
            results.push(dateValidity(data, field, {
                minDate: config.minDate,
                maxDate: config.maxDate
            }));
        }
    }

    // Drift checks if previous snapshot provided
    if (previousSnapshot) {
        results.push(rowCountDrift(data, previousSnapshot, config.driftThreshold || 0.2));

        if (config.amountFields && config.amountFields.length > 0) {
            results.push(driftVsPrevious(data, previousSnapshot, config.amountFields[0], config.driftThreshold || 0.1));
        }
    }

    return results;
}

/**
 * Run RevOps-specific checks
 * @param {Array<Object>} data - Data to check
 * @param {string} reportType - Type of report (pipeline, revenue, funnel, velocity)
 * @returns {QAResult[]} Array of check results
 */
function runRevOpsChecks(data, reportType = 'pipeline') {
    const results = [];

    // Always check win rate if present
    results.push(winRateSanity(data));

    // Report-type specific checks
    switch (reportType) {
        case 'pipeline':
            results.push(pipelineCoverageSanity(data));
            break;
        case 'velocity':
            results.push(salesCycleSanity(data));
            break;
        case 'revenue':
        case 'retention':
            results.push(nrrSanity(data));
            break;
    }

    return results.filter(r => r.status !== 'warn' || !r.details.includes('missing col'));
}

/**
 * Format QA results for appendix
 * @param {QAResult[]} results - Check results
 * @returns {Array<{check: string, status: string, details: string}>}
 */
function formatForAppendix(results) {
    return results.map(r => ({
        check: r.check,
        status: r.status,
        details: r.details
    }));
}

/**
 * Get summary of QA results
 * @param {QAResult[]} results - Check results
 * @returns {{passed: number, warnings: number, failures: number, summary: string}}
 */
function summarize(results) {
    const passed = results.filter(r => r.status === 'pass').length;
    const warnings = results.filter(r => r.status === 'warn').length;
    const failures = results.filter(r => r.status === 'fail').length;

    let summary;
    if (failures > 0) {
        summary = `❌ ${failures} check(s) failed`;
    } else if (warnings > 0) {
        summary = `⚠️ ${warnings} warning(s)`;
    } else {
        summary = `✅ All ${passed} checks passed`;
    }

    return { passed, warnings, failures, summary };
}

/**
 * Create QA checker instance with config
 * @param {QACheckConfig} config - Configuration
 * @returns {Object} QA checker interface
 */
function createChecker(config = {}) {
    let previousSnapshot = config.previousSnapshot || null;

    return {
        /**
         * Run all checks on data
         * @param {Array<Object>} data - Data to check
         * @returns {QAResult[]}
         */
        check(data) {
            const standard = runChecks(data, config, previousSnapshot);
            const revops = runRevOpsChecks(data, config.reportType);
            return [...standard, ...revops];
        },

        /**
         * Update snapshot for drift comparison
         * @param {Array<Object>} data - Data to store
         */
        updateSnapshot(data) {
            previousSnapshot = data;
        },

        /**
         * Get formatted results for appendix
         * @param {Array<Object>} data - Data to check
         * @returns {Array<{check: string, status: string, details: string}>}
         */
        getAppendixResults(data) {
            return formatForAppendix(this.check(data));
        },

        /**
         * Get summary of results
         * @param {Array<Object>} data - Data to check
         * @returns {{passed: number, warnings: number, failures: number, summary: string}}
         */
        getSummary(data) {
            return summarize(this.check(data));
        }
    };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
    // Core checks
    rowCount,
    nullRate,
    duplicates,
    amountNegative,
    amountZero,
    percentageBounds,
    dateValidity,
    driftVsPrevious,
    rowCountDrift,

    // RevOps-specific checks
    winRateSanity,
    pipelineCoverageSanity,
    salesCycleSanity,
    nrrSanity,

    // Runners and utilities
    runChecks,
    runRevOpsChecks,
    formatForAppendix,
    summarize,
    createChecker,

    // Configuration
    DEFAULT_CONFIGS,
    createResult
};
