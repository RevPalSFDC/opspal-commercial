#!/usr/bin/env node

/**
 * Data Quality Gate System
 *
 * Comprehensive data quality validation framework:
 * - NULL handling rules per data type
 * - Improbability detection (99% orphan rates, 0 records when expecting data)
 * - Statistical outlier detection (flag >3 std dev)
 * - Cross-field consistency checks
 * - Query result validation
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: data-quality cohort (13 reflections, $28K ROI)
 */

const fs = require('fs');
const path = require('path');

class DataQualityGate {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strictMode = options.strictMode !== false;

        // Thresholds for improbability detection
        this.thresholds = {
            suspiciousPercentage: options.suspiciousPercentage || 95, // Flag rates > 95%
            minimumExpectedRecords: options.minimumExpectedRecords || 1,
            standardDeviationAlert: options.standardDeviationAlert || 3, // Flag > 3 std dev
            nullRatioThreshold: options.nullRatioThreshold || 0.9, // Flag if > 90% null
            outlierZScore: options.outlierZScore || 3 // Z-score threshold for outliers
        };

        // NULL handling rules by data type
        this.nullRules = {
            // Numeric fields - NULL in aggregates is suspicious
            number: {
                allowNull: true,
                warnOnNull: ['count', 'sum', 'avg', 'total', 'amount', 'quantity'],
                treatNullAs: 0
            },
            // Currency - usually required
            currency: {
                allowNull: false,
                warnOnNull: ['price', 'cost', 'revenue', 'discount'],
                treatNullAs: 0
            },
            // Date fields - context dependent
            date: {
                allowNull: true,
                warnOnNull: ['created', 'modified', 'start', 'end', 'due'],
                treatNullAs: null
            },
            // Boolean - usually should be explicit
            boolean: {
                allowNull: false,
                warnOnNull: ['active', 'enabled', 'primary', 'default'],
                treatNullAs: false
            },
            // String - usually OK to be null
            string: {
                allowNull: true,
                warnOnNull: ['name', 'id', 'status', 'type'],
                treatNullAs: ''
            },
            // Lookup/Reference - context dependent
            reference: {
                allowNull: true,
                warnOnNull: ['owner', 'parent', 'account', 'contact'],
                treatNullAs: null
            }
        };

        // Field name patterns for type inference
        this.typePatterns = {
            number: /^(count|sum|avg|total|quantity|amount|size|length|width|height|weight|score|rating|rank|order|level|version|num_|_count$|_total$|_sum$)/i,
            currency: /^(price|cost|revenue|discount|fee|tax|amount|value|budget|profit|margin|arr|mrr|acv|tcv|_amount$|_price$|_revenue$)/i,
            date: /^(date|created|modified|updated|start|end|due|expir|schedule|_at$|_on$|_date$)/i,
            boolean: /^(is_|has_|can_|should_|active|enabled|disabled|primary|default|archived|deleted|visible|hidden|locked|verified|approved)/i,
            reference: /^(id|_id$|owner|parent|account|contact|user|manager|assignee|created_by|modified_by|_by$)/i
        };
    }

    /**
     * Validate query result against expectations
     * @param {Object} result - Query result data
     * @param {Object} expectations - Expected characteristics
     * @returns {Object} Validation result
     */
    validateQueryResult(result, expectations = {}) {
        const validation = {
            valid: true,
            score: 100, // Data quality score (0-100)
            issues: [],
            warnings: [],
            suggestions: [],
            metrics: {}
        };

        if (!result || typeof result !== 'object') {
            validation.valid = false;
            validation.score = 0;
            validation.issues.push('Result is null or not an object');
            return validation;
        }

        // Extract records array (handle different result formats)
        let records = [];
        if (Array.isArray(result)) {
            records = result;
        } else if (result.records && Array.isArray(result.records)) {
            records = result.records;
        } else if (result.data && Array.isArray(result.data)) {
            records = result.data;
        } else if (result.rows && Array.isArray(result.rows)) {
            records = result.rows;
        }

        validation.metrics.totalRecords = records.length;
        validation.metrics.totalSize = result.totalSize || records.length;

        // Check record count expectations
        this._checkRecordCount(records, expectations, validation);

        // Check for empty results when data expected
        this._checkEmptyResults(records, expectations, validation);

        // Validate each record
        if (records.length > 0) {
            this._validateRecords(records, expectations, validation);
        }

        // Calculate final score
        validation.score = this._calculateScore(validation);

        return validation;
    }

    /**
     * Detect improbable results
     * @param {Object} data - Data to analyze
     * @param {Object} context - Context about what the data represents
     * @returns {Object} Detection result
     */
    detectImprobableResults(data, context = {}) {
        const result = {
            improbable: false,
            reasons: [],
            confidence: 0,
            analysis: {}
        };

        if (!data) {
            result.improbable = true;
            result.reasons.push('Data is null or undefined');
            result.confidence = 100;
            return result;
        }

        // Check for suspicious percentage values
        this._checkSuspiciousPercentages(data, result, '');

        // Check for suspicious ratios
        this._checkSuspiciousRatios(data, result, context);

        // Check for statistical anomalies
        if (Array.isArray(data)) {
            this._checkStatisticalAnomalies(data, result);
        }

        // Check for impossible values
        this._checkImpossibleValues(data, result);

        // Calculate confidence based on number and severity of issues
        result.confidence = Math.min(100, result.reasons.length * 25);
        result.improbable = result.reasons.length > 0;

        return result;
    }

    /**
     * Enforce NULL handling rules
     * @param {Object|Array} data - Data to validate
     * @param {Object} schema - Schema with field types
     * @returns {Object} Validation result
     */
    enforceNullHandling(data, schema = {}) {
        const result = {
            valid: true,
            violations: [],
            warnings: [],
            nullCounts: {},
            nullRatios: {}
        };

        const records = Array.isArray(data) ? data : [data];
        if (records.length === 0) return result;

        // Count nulls per field
        const fieldNulls = {};
        const fieldTotals = {};

        for (const record of records) {
            if (!record || typeof record !== 'object') continue;

            for (const [field, value] of Object.entries(record)) {
                fieldTotals[field] = (fieldTotals[field] || 0) + 1;

                if (value === null || value === undefined) {
                    fieldNulls[field] = (fieldNulls[field] || 0) + 1;
                }
            }
        }

        // Check each field
        for (const [field, nullCount] of Object.entries(fieldNulls)) {
            const total = fieldTotals[field];
            const nullRatio = nullCount / total;

            result.nullCounts[field] = nullCount;
            result.nullRatios[field] = nullRatio;

            // Infer field type
            const fieldType = schema[field] || this._inferFieldType(field);
            const rules = this.nullRules[fieldType] || this.nullRules.string;

            // Check if null is allowed
            if (!rules.allowNull && nullCount > 0) {
                result.violations.push({
                    field,
                    type: fieldType,
                    issue: `Field does not allow NULL (${nullCount}/${total} records)`,
                    severity: 'error'
                });
                result.valid = false;
            }

            // Check warn patterns
            if (rules.warnOnNull) {
                for (const pattern of rules.warnOnNull) {
                    if (field.toLowerCase().includes(pattern) && nullCount > 0) {
                        result.warnings.push({
                            field,
                            type: fieldType,
                            issue: `Important field has NULL values (${nullCount}/${total})`,
                            suggestion: `Review if ${field} should be required`
                        });
                    }
                }
            }

            // High null ratio warning
            if (nullRatio > this.thresholds.nullRatioThreshold) {
                result.warnings.push({
                    field,
                    issue: `High NULL ratio: ${(nullRatio * 100).toFixed(1)}%`,
                    suggestion: 'Consider if this field should be filtered or if there is a data issue'
                });
            }
        }

        return result;
    }

    /**
     * Check for statistical outliers
     * @param {Array} data - Array of records
     * @param {string[]} numericFields - Fields to check for outliers
     * @returns {Object} Outlier analysis
     */
    checkStatisticalOutliers(data, numericFields = []) {
        const result = {
            outliers: [],
            fieldStats: {},
            summary: {
                totalOutliers: 0,
                affectedFields: []
            }
        };

        if (!Array.isArray(data) || data.length < 10) {
            return result; // Need minimum sample size
        }

        // If no fields specified, infer numeric fields
        if (numericFields.length === 0) {
            const firstRecord = data[0];
            if (firstRecord && typeof firstRecord === 'object') {
                for (const [field, value] of Object.entries(firstRecord)) {
                    if (typeof value === 'number') {
                        numericFields.push(field);
                    }
                }
            }
        }

        // Analyze each numeric field
        for (const field of numericFields) {
            const values = data
                .map(r => r[field])
                .filter(v => v !== null && v !== undefined && typeof v === 'number');

            if (values.length < 10) continue;

            // Calculate stats
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);
            const min = Math.min(...values);
            const max = Math.max(...values);

            result.fieldStats[field] = {
                mean: mean.toFixed(2),
                stdDev: stdDev.toFixed(2),
                min,
                max,
                count: values.length
            };

            // Find outliers (z-score > threshold)
            for (let i = 0; i < data.length; i++) {
                const value = data[i][field];
                if (value === null || value === undefined) continue;

                const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0;

                if (zScore > this.thresholds.outlierZScore) {
                    result.outliers.push({
                        recordIndex: i,
                        field,
                        value,
                        zScore: zScore.toFixed(2),
                        expectedRange: `${(mean - 3 * stdDev).toFixed(2)} to ${(mean + 3 * stdDev).toFixed(2)}`
                    });
                    result.summary.totalOutliers++;

                    if (!result.summary.affectedFields.includes(field)) {
                        result.summary.affectedFields.push(field);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Cross-field consistency check
     * @param {Object|Array} data - Data to validate
     * @param {Array} rules - Consistency rules
     * @returns {Object} Consistency check result
     */
    checkCrossFieldConsistency(data, rules = []) {
        const result = {
            consistent: true,
            violations: [],
            checksPerformed: 0
        };

        const records = Array.isArray(data) ? data : [data];

        // Default rules if none provided
        const defaultRules = [
            // CreatedDate should be <= ModifiedDate
            {
                name: 'date-sequence',
                check: (r) => {
                    if (r.CreatedDate && r.LastModifiedDate) {
                        return new Date(r.CreatedDate) <= new Date(r.LastModifiedDate);
                    }
                    return true;
                },
                message: 'CreatedDate should be <= LastModifiedDate'
            },
            // CloseDate should be set if Stage = Closed Won/Lost
            {
                name: 'closed-stage-date',
                check: (r) => {
                    if (r.StageName && r.StageName.toLowerCase().includes('closed')) {
                        return r.CloseDate != null;
                    }
                    return true;
                },
                message: 'Closed opportunities should have a CloseDate'
            },
            // Amount should be >= 0 for most cases
            {
                name: 'positive-amount',
                check: (r) => {
                    if (r.Amount !== undefined && r.Amount !== null) {
                        return r.Amount >= 0;
                    }
                    return true;
                },
                message: 'Amount should be >= 0'
            },
            // Probability should be 0-100
            {
                name: 'probability-range',
                check: (r) => {
                    if (r.Probability !== undefined && r.Probability !== null) {
                        return r.Probability >= 0 && r.Probability <= 100;
                    }
                    return true;
                },
                message: 'Probability should be 0-100'
            }
        ];

        const allRules = [...defaultRules, ...rules];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            for (const rule of allRules) {
                result.checksPerformed++;

                try {
                    if (!rule.check(record)) {
                        result.violations.push({
                            recordIndex: i,
                            rule: rule.name,
                            message: rule.message,
                            record: JSON.stringify(record).substring(0, 200)
                        });
                        result.consistent = false;
                    }
                } catch (e) {
                    // Rule check failed - skip
                }
            }
        }

        return result;
    }

    // === Private Helper Methods ===

    _checkRecordCount(records, expectations, validation) {
        if (expectations.minRecords !== undefined) {
            if (records.length < expectations.minRecords) {
                validation.issues.push(
                    `Expected at least ${expectations.minRecords} records, got ${records.length}`
                );
            }
        }

        if (expectations.maxRecords !== undefined) {
            if (records.length > expectations.maxRecords) {
                validation.warnings.push(
                    `Got ${records.length} records, expected at most ${expectations.maxRecords}`
                );
            }
        }
    }

    _checkEmptyResults(records, expectations, validation) {
        if (records.length === 0) {
            if (expectations.expectData === true) {
                validation.issues.push('Query returned 0 records when data was expected');
                validation.suggestions.push('Verify query filters are correct');
            } else if (expectations.expectData !== false) {
                validation.warnings.push('Query returned 0 records - verify filters');
            }
        }
    }

    _validateRecords(records, expectations, validation) {
        const sampleSize = Math.min(records.length, 100);
        let nullCounts = {};
        let fieldTypes = {};

        // Sample records for validation
        for (let i = 0; i < sampleSize; i++) {
            const record = records[i];

            for (const [field, value] of Object.entries(record)) {
                if (!fieldTypes[field]) {
                    fieldTypes[field] = typeof value;
                }

                if (value === null || value === undefined) {
                    nullCounts[field] = (nullCounts[field] || 0) + 1;
                }
            }
        }

        // Check for fields with high null rates
        for (const [field, count] of Object.entries(nullCounts)) {
            const ratio = count / sampleSize;
            if (ratio > 0.9) {
                validation.warnings.push(
                    `Field "${field}" is ${(ratio * 100).toFixed(0)}% null in sample`
                );
            }
        }

        validation.metrics.fieldsAnalyzed = Object.keys(fieldTypes).length;
        validation.metrics.sampleSize = sampleSize;
    }

    _checkSuspiciousPercentages(data, result, path) {
        if (typeof data !== 'object' || data === null) return;

        for (const [key, value] of Object.entries(data)) {
            const currentPath = path ? `${path}.${key}` : key;

            if (typeof value === 'number') {
                // Check if this looks like a percentage field
                const isPercentageField = /rate|percent|pct|ratio|proportion|share/i.test(key);

                if (isPercentageField) {
                    if (value > this.thresholds.suspiciousPercentage) {
                        result.reasons.push(
                            `Suspiciously high ${currentPath}: ${value}% (>95% is unusual)`
                        );
                        result.analysis[currentPath] = {
                            value,
                            issue: 'Value exceeds 95% threshold',
                            suggestion: 'Verify calculation methodology'
                        };
                    }

                    if (value < 0 || value > 100) {
                        result.reasons.push(
                            `Invalid percentage ${currentPath}: ${value} (must be 0-100)`
                        );
                    }
                }
            } else if (typeof value === 'object') {
                this._checkSuspiciousPercentages(value, result, currentPath);
            }
        }
    }

    _checkSuspiciousRatios(data, result, context) {
        // Check for suspicious record counts
        if (data.totalSize !== undefined && data.records !== undefined) {
            if (data.totalSize === 0 && context.expectData === true) {
                result.reasons.push('Expected data but got 0 records');
            }

            if (data.totalSize > 50000 && !context.expectLargeDataset) {
                result.reasons.push(
                    `Large dataset (${data.totalSize} records) - verify query scope`
                );
            }
        }

        // Check for orphan ratios
        if (data.orphanRate !== undefined || data.orphanCount !== undefined) {
            const rate = data.orphanRate || (data.orphanCount / data.totalCount) || 0;
            if (rate > 0.5) {
                result.reasons.push(
                    `High orphan rate: ${(rate * 100).toFixed(1)}% (>50% is unusual)`
                );
            }
        }
    }

    _checkStatisticalAnomalies(data, result) {
        if (data.length < 10) return;

        // Find numeric fields
        const sample = data[0];
        if (!sample || typeof sample !== 'object') return;

        const numericFields = Object.entries(sample)
            .filter(([_, v]) => typeof v === 'number')
            .map(([k, _]) => k);

        for (const field of numericFields) {
            const values = data.map(r => r[field]).filter(v => typeof v === 'number');
            if (values.length < 10) continue;

            // Check for all same values (suspiciously uniform)
            const uniqueValues = new Set(values);
            if (uniqueValues.size === 1 && values.length > 10) {
                result.reasons.push(
                    `Field "${field}" has identical value in all ${values.length} records`
                );
            }

            // Check for round number patterns (may indicate fake data)
            const roundNumbers = values.filter(v => v % 10 === 0 || v % 5 === 0);
            if (roundNumbers.length / values.length > 0.9) {
                result.reasons.push(
                    `Field "${field}" has suspiciously high ratio of round numbers`
                );
            }
        }
    }

    _checkImpossibleValues(data, result) {
        const checkFields = {
            count: (v) => v >= 0,
            quantity: (v) => v >= 0,
            probability: (v) => v >= 0 && v <= 100,
            age: (v) => v >= 0 && v < 200,
            year: (v) => v >= 1900 && v <= 2100
        };

        const check = (obj, path = '') => {
            if (typeof obj !== 'object' || obj === null) return;

            for (const [key, value] of Object.entries(obj)) {
                const currentPath = path ? `${path}.${key}` : key;

                if (typeof value === 'number') {
                    for (const [pattern, validator] of Object.entries(checkFields)) {
                        if (key.toLowerCase().includes(pattern)) {
                            if (!validator(value)) {
                                result.reasons.push(
                                    `Impossible value for ${currentPath}: ${value}`
                                );
                            }
                        }
                    }
                } else if (typeof value === 'object') {
                    check(value, currentPath);
                }
            }
        };

        check(data);
    }

    _inferFieldType(fieldName) {
        const name = fieldName.toLowerCase();

        for (const [type, pattern] of Object.entries(this.typePatterns)) {
            if (pattern.test(name)) {
                return type;
            }
        }

        return 'string'; // Default
    }

    _calculateScore(validation) {
        let score = 100;

        // Deduct for issues
        score -= validation.issues.length * 20;

        // Deduct for warnings (less severe)
        score -= validation.warnings.length * 5;

        return Math.max(0, Math.min(100, score));
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const gate = new DataQualityGate({ verbose: true });

    switch (command) {
        case 'validate':
            const dataPath = args[1];
            if (!dataPath) {
                console.error('Usage: data-quality-gate validate <data.json>');
                process.exit(1);
            }
            try {
                const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
                const result = gate.validateQueryResult(data);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.valid ? 0 : 1);
            } catch (e) {
                console.error('Error:', e.message);
                process.exit(1);
            }
            break;

        case 'detect-improbable':
            const improbDataPath = args[1];
            if (!improbDataPath) {
                console.error('Usage: data-quality-gate detect-improbable <data.json>');
                process.exit(1);
            }
            try {
                const data = JSON.parse(fs.readFileSync(improbDataPath, 'utf-8'));
                const result = gate.detectImprobableResults(data);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.improbable ? 1 : 0);
            } catch (e) {
                console.error('Error:', e.message);
                process.exit(1);
            }
            break;

        case 'check-nulls':
            const nullDataPath = args[1];
            if (!nullDataPath) {
                console.error('Usage: data-quality-gate check-nulls <data.json>');
                process.exit(1);
            }
            try {
                const data = JSON.parse(fs.readFileSync(nullDataPath, 'utf-8'));
                const result = gate.enforceNullHandling(data);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.valid ? 0 : 1);
            } catch (e) {
                console.error('Error:', e.message);
                process.exit(1);
            }
            break;

        case 'check-outliers':
            const outlierDataPath = args[1];
            if (!outlierDataPath) {
                console.error('Usage: data-quality-gate check-outliers <data.json>');
                process.exit(1);
            }
            try {
                const data = JSON.parse(fs.readFileSync(outlierDataPath, 'utf-8'));
                const result = gate.checkStatisticalOutliers(data);
                console.log(JSON.stringify(result, null, 2));
                process.exit(result.summary.totalOutliers > 0 ? 1 : 0);
            } catch (e) {
                console.error('Error:', e.message);
                process.exit(1);
            }
            break;

        default:
            console.log(`
Data Quality Gate - Comprehensive data quality validation

Usage:
  data-quality-gate validate <data.json>          Validate query result
  data-quality-gate detect-improbable <data.json> Detect improbable results
  data-quality-gate check-nulls <data.json>       Check NULL handling
  data-quality-gate check-outliers <data.json>    Find statistical outliers

Features:
  - Query result validation against expectations
  - Improbability detection (99% rates, 0 records when expected)
  - NULL handling rules per data type
  - Statistical outlier detection (>3 std dev)
  - Cross-field consistency checks

Examples:
  data-quality-gate validate ./query-result.json
  data-quality-gate detect-improbable ./metrics.json
  data-quality-gate check-nulls ./records.json
  data-quality-gate check-outliers ./sales-data.json
            `);
    }
}

module.exports = { DataQualityGate };
