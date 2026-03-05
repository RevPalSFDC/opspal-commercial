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

    /**
     * Detect synthetic/fake data in records
     *
     * Addresses data-quality cohort: detecting when query results contain
     * synthetic, placeholder, or fabricated data that should not be used
     * for analysis or decision-making.
     *
     * @param {Array} records - Array of records to analyze
     * @param {Object} options - Detection options
     * @returns {Object} Detection result with indicators and confidence
     */
    detectSyntheticData(records, options = {}) {
        const result = {
            isSynthetic: false,
            confidence: 0,
            indicators: {
                genericNames: false,
                sequentialIds: false,
                roundPricing: false,
                missingVariance: false,
                suspiciousPatterns: false,
                placeholderValues: false
            },
            details: [],
            summary: ''
        };

        if (!Array.isArray(records) || records.length === 0) {
            return result;
        }

        const sampleSize = Math.min(records.length, 100);
        const sample = records.slice(0, sampleSize);
        let indicatorCount = 0;

        // 1. Check for generic/placeholder names
        const nameFields = ['Name', 'name', 'AccountName', 'CompanyName', 'FirstName', 'LastName', 'Title'];
        const genericPatterns = [
            /^(test|example|demo|sample|fake|placeholder|dummy|mock|temp|xxx|aaa|zzz)\s*/i,
            /^(company|account|lead|contact|opportunity)\s*\d+$/i,
            /^(john|jane)\s+(doe|smith|test)$/i,
            /^(acme|test)\s+(corp|inc|llc|company|account)/i,
            /lorem\s+ipsum/i,
            /^\[.*\]$/, // Bracketed placeholders like [Company Name]
            /^<.*>$/    // Angle bracketed like <placeholder>
        ];

        let genericNameCount = 0;
        for (const record of sample) {
            for (const field of nameFields) {
                const value = record[field];
                if (typeof value === 'string') {
                    for (const pattern of genericPatterns) {
                        if (pattern.test(value)) {
                            genericNameCount++;
                            break;
                        }
                    }
                }
            }
        }

        if (genericNameCount > sampleSize * 0.1) {
            result.indicators.genericNames = true;
            result.details.push(`${genericNameCount} records have generic/placeholder names`);
            indicatorCount++;
        }

        // 2. Check for sequential IDs (excluding Salesforce 18-char IDs)
        const idFields = ['Id', 'id', 'ExternalId', 'ExternalId__c', 'Legacy_Id__c'];
        const sequentialPatterns = [
            /^(ID|REC|TEST|DEMO|SAMPLE)[-_]?\d{3,}$/i,
            /^\d{1,6}$/, // Pure sequential numbers
            /^[A-Z]{2,4}\d{4,}$/i // Prefix + sequential like ACC0001
        ];

        let sequentialIdCount = 0;
        for (const record of sample) {
            for (const field of idFields) {
                const value = record[field];
                if (typeof value === 'string' && value.length < 18) { // Exclude SF IDs
                    for (const pattern of sequentialPatterns) {
                        if (pattern.test(value)) {
                            sequentialIdCount++;
                            break;
                        }
                    }
                }
            }
        }

        if (sequentialIdCount > sampleSize * 0.3) {
            result.indicators.sequentialIds = true;
            result.details.push(`${sequentialIdCount} records have sequential/synthetic IDs`);
            indicatorCount++;
        }

        // 3. Check for suspiciously round pricing
        const priceFields = ['Amount', 'amount', 'Price', 'price', 'TotalPrice', 'UnitPrice',
                           'AnnualRevenue', 'ExpectedRevenue', 'Value', 'value'];
        let roundPriceCount = 0;
        let totalPrices = 0;

        for (const record of sample) {
            for (const field of priceFields) {
                const value = record[field];
                if (typeof value === 'number' && value > 0) {
                    totalPrices++;
                    // Check if value is suspiciously round (divisible by 1000, 5000, 10000)
                    if (value % 1000 === 0 || value % 5000 === 0 || value % 10000 === 0) {
                        roundPriceCount++;
                    }
                }
            }
        }

        if (totalPrices > 10 && roundPriceCount / totalPrices > 0.8) {
            result.indicators.roundPricing = true;
            result.details.push(`${(roundPriceCount / totalPrices * 100).toFixed(0)}% of prices are suspiciously round numbers`);
            indicatorCount++;
        }

        // 4. Check for missing variance (all same values)
        const fieldValues = {};
        for (const record of sample) {
            for (const [field, value] of Object.entries(record)) {
                if (!fieldValues[field]) {
                    fieldValues[field] = new Set();
                }
                fieldValues[field].add(JSON.stringify(value));
            }
        }

        let uniformFields = 0;
        const uniformFieldNames = [];
        for (const [field, values] of Object.entries(fieldValues)) {
            // Skip ID fields and audit fields
            if (/^(Id|id|attributes|CreatedDate|LastModifiedDate|SystemModstamp)$/i.test(field)) {
                continue;
            }
            if (values.size === 1 && sample.length > 10) {
                uniformFields++;
                uniformFieldNames.push(field);
            }
        }

        if (uniformFields > 3) {
            result.indicators.missingVariance = true;
            result.details.push(`${uniformFields} fields have identical values across all records: ${uniformFieldNames.slice(0, 5).join(', ')}${uniformFieldNames.length > 5 ? '...' : ''}`);
            indicatorCount++;
        }

        // 5. Check for suspicious data patterns
        const emailFields = ['Email', 'email', 'PersonEmail'];
        const phoneFields = ['Phone', 'phone', 'MobilePhone', 'Fax'];
        let suspiciousEmailCount = 0;
        let suspiciousPhoneCount = 0;

        const fakeEmailPatterns = [
            /@(test|example|fake|demo|sample)\.(com|org|net)$/i,
            /@(mailinator|guerrillamail|tempmail|throwaway)/i,
            /^(test|demo|sample|fake)\d*@/i
        ];

        const fakePhonePatterns = [
            /^(555|123|000|111|999)/,
            /^(\d)\1{9}$/, // All same digit
            /^1234567890$/
        ];

        for (const record of sample) {
            for (const field of emailFields) {
                const value = record[field];
                if (typeof value === 'string') {
                    for (const pattern of fakeEmailPatterns) {
                        if (pattern.test(value)) {
                            suspiciousEmailCount++;
                            break;
                        }
                    }
                }
            }

            for (const field of phoneFields) {
                const value = record[field];
                if (typeof value === 'string') {
                    const digits = value.replace(/\D/g, '');
                    for (const pattern of fakePhonePatterns) {
                        if (pattern.test(digits)) {
                            suspiciousPhoneCount++;
                            break;
                        }
                    }
                }
            }
        }

        if (suspiciousEmailCount > sampleSize * 0.2 || suspiciousPhoneCount > sampleSize * 0.2) {
            result.indicators.suspiciousPatterns = true;
            const parts = [];
            if (suspiciousEmailCount > 0) parts.push(`${suspiciousEmailCount} fake emails`);
            if (suspiciousPhoneCount > 0) parts.push(`${suspiciousPhoneCount} fake phones`);
            result.details.push(`Found ${parts.join(' and ')}`);
            indicatorCount++;
        }

        // 6. Check for placeholder values
        const placeholderPatterns = [
            /^(N\/A|NA|TBD|TODO|FIXME|XXX|PLACEHOLDER|UNKNOWN|NONE|NULL|-)$/i,
            /^\s*$/, // Empty or whitespace only
            /^0{4,}$/, // Multiple zeros
        ];

        let placeholderCount = 0;
        for (const record of sample) {
            for (const [field, value] of Object.entries(record)) {
                if (typeof value === 'string') {
                    for (const pattern of placeholderPatterns) {
                        if (pattern.test(value)) {
                            placeholderCount++;
                            break;
                        }
                    }
                }
            }
        }

        const totalStringFields = sample.reduce((sum, r) =>
            sum + Object.values(r).filter(v => typeof v === 'string').length, 0);

        if (totalStringFields > 0 && placeholderCount / totalStringFields > 0.1) {
            result.indicators.placeholderValues = true;
            result.details.push(`${(placeholderCount / totalStringFields * 100).toFixed(0)}% of string values are placeholders`);
            indicatorCount++;
        }

        // Calculate confidence based on indicators
        const indicatorWeights = {
            genericNames: 30,
            sequentialIds: 25,
            roundPricing: 15,
            missingVariance: 15,
            suspiciousPatterns: 25,
            placeholderValues: 20
        };

        let totalWeight = 0;
        for (const [indicator, detected] of Object.entries(result.indicators)) {
            if (detected) {
                totalWeight += indicatorWeights[indicator] || 10;
            }
        }

        result.confidence = Math.min(100, totalWeight);
        result.isSynthetic = indicatorCount >= 2 || result.confidence >= 50;

        // Generate summary
        if (result.isSynthetic) {
            result.summary = `HIGH PROBABILITY of synthetic data (${result.confidence}% confidence). ` +
                `Detected ${indicatorCount} indicator(s): ${result.details.join('; ')}. ` +
                `This data should NOT be used for analysis or decision-making.`;
        } else if (indicatorCount === 1) {
            result.summary = `LOW PROBABILITY of synthetic data (${result.confidence}% confidence). ` +
                `One indicator detected: ${result.details[0]}. Review recommended.`;
        } else {
            result.summary = 'Data appears to be genuine. No synthetic data indicators detected.';
        }

        return result;
    }

    /**
     * Detect orphan relationships in data records
     *
     * Addresses data-quality cohort: detecting when records have missing or
     * invalid lookup relationships that could indicate data integrity issues.
     *
     * @param {Array} records - Array of records to analyze
     * @param {Object} schema - Schema with relationship definitions
     * @param {Object} options - Detection options
     * @returns {Object} Detection result with orphan details
     */
    detectOrphanRelationships(records, schema = {}, options = {}) {
        const result = {
            hasOrphans: false,
            orphanRate: 0,
            orphanCount: 0,
            totalRecords: 0,
            orphansByField: {},
            details: [],
            recommendations: [],
            severity: 'info'
        };

        if (!Array.isArray(records) || records.length === 0) {
            return result;
        }

        result.totalRecords = records.length;

        // Default relationship fields if none provided in schema
        const relationshipFields = schema.relationships || [
            // Standard Salesforce lookup fields
            { field: 'AccountId', parent: 'Account', required: false },
            { field: 'ContactId', parent: 'Contact', required: false },
            { field: 'OwnerId', parent: 'User', required: true },
            { field: 'ParentId', parent: null, required: false },
            { field: 'OpportunityId', parent: 'Opportunity', required: false },
            { field: 'CampaignId', parent: 'Campaign', required: false },
            { field: 'RecordTypeId', parent: 'RecordType', required: false },
            // Custom lookup pattern detection
            { field: /__c$/i, pattern: true, required: false }
        ];

        // Track orphans per field
        const fieldStats = {};

        // Analyze each record
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            if (!record || typeof record !== 'object') continue;

            for (const relDef of relationshipFields) {
                let matchingFields = [];

                if (relDef.pattern) {
                    // Pattern-based field matching (e.g., custom lookups ending in __c)
                    matchingFields = Object.keys(record).filter(f =>
                        relDef.field.test ? relDef.field.test(f) : f.match(relDef.field)
                    );
                } else if (record.hasOwnProperty(relDef.field)) {
                    matchingFields = [relDef.field];
                }

                for (const field of matchingFields) {
                    if (!fieldStats[field]) {
                        fieldStats[field] = {
                            total: 0,
                            nullCount: 0,
                            invalidCount: 0,
                            required: relDef.required || false,
                            parent: relDef.parent
                        };
                    }

                    fieldStats[field].total++;
                    const value = record[field];

                    // Check for null/undefined/empty
                    if (value === null || value === undefined || value === '') {
                        fieldStats[field].nullCount++;
                    }
                    // Check for invalid ID format (Salesforce 15 or 18 char IDs)
                    else if (typeof value === 'string') {
                        const isSalesforceId = /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(value);
                        if (!isSalesforceId && !value.includes('-')) { // Allow UUIDs
                            fieldStats[field].invalidCount++;
                        }
                    }
                }
            }
        }

        // Calculate orphan statistics
        let totalOrphans = 0;
        let criticalOrphans = 0;

        for (const [field, stats] of Object.entries(fieldStats)) {
            const orphanCount = stats.nullCount + stats.invalidCount;
            const orphanRate = stats.total > 0 ? orphanCount / stats.total : 0;

            result.orphansByField[field] = {
                orphanCount,
                orphanRate: (orphanRate * 100).toFixed(1) + '%',
                nullCount: stats.nullCount,
                invalidCount: stats.invalidCount,
                total: stats.total,
                required: stats.required
            };

            if (orphanCount > 0) {
                totalOrphans += orphanCount;

                // Determine severity
                if (stats.required && orphanRate > 0) {
                    criticalOrphans += orphanCount;
                    result.details.push(
                        `CRITICAL: Required field ${field} has ${orphanCount} orphan records (${(orphanRate * 100).toFixed(1)}%)`
                    );
                } else if (orphanRate > 0.5) {
                    result.details.push(
                        `HIGH: Field ${field} has ${orphanCount} orphan records (${(orphanRate * 100).toFixed(1)}% orphan rate)`
                    );
                } else if (orphanRate > 0.1) {
                    result.details.push(
                        `MEDIUM: Field ${field} has ${orphanCount} orphan records (${(orphanRate * 100).toFixed(1)}%)`
                    );
                }
            }
        }

        result.orphanCount = totalOrphans;
        result.orphanRate = records.length > 0 ? totalOrphans / records.length : 0;
        result.hasOrphans = totalOrphans > 0;

        // Determine overall severity
        if (criticalOrphans > 0) {
            result.severity = 'critical';
            result.recommendations.push(
                'Required relationship fields have missing values. Data import may fail.'
            );
        } else if (result.orphanRate > 0.5) {
            result.severity = 'high';
            result.recommendations.push(
                'Over 50% orphan rate detected. Verify data source and mapping.'
            );
        } else if (result.orphanRate > 0.1) {
            result.severity = 'medium';
            result.recommendations.push(
                'Significant orphan records detected. Review data relationships.'
            );
        } else if (result.hasOrphans) {
            result.severity = 'low';
            result.recommendations.push(
                'Some orphan records detected. Usually acceptable if within expected tolerance.'
            );
        }

        // Add specific recommendations based on patterns
        if (result.orphansByField['AccountId']?.orphanRate > 10) {
            result.recommendations.push(
                'High AccountId orphan rate may indicate Leads or person accounts not properly associated.'
            );
        }

        if (result.orphansByField['OwnerId']?.orphanCount > 0) {
            result.recommendations.push(
                'OwnerId orphans will cause import failures. Ensure all records have valid owner assignments.'
            );
        }

        return result;
    }

    /**
     * Detect converted/deleted lead records with null lead_detail payloads.
     * This pattern is expected from Salesforce but must be handled explicitly.
     *
     * @param {Array} records - Records to inspect
     * @returns {Object} Detection result
     */
    detectLeadDetailNullEdgeCases(records) {
        const result = {
            hasEdgeCases: false,
            affectedCount: 0,
            severity: 'none',
            details: [],
            recommendations: []
        };

        if (!Array.isArray(records) || records.length === 0) {
            return result;
        }

        for (const record of records) {
            if (!record || typeof record !== 'object') continue;

            const leadDetail = record.lead_detail ?? record.leadDetail ?? record.LeadDetail ?? null;
            const statusValue = String(record.status || record.lead_status || record.LeadStatus || '').toLowerCase();
            const isConverted = record.is_converted === true || record.IsConverted === true || statusValue.includes('converted');
            const isDeleted = record.is_deleted === true || record.IsDeleted === true || statusValue.includes('deleted');

            if ((isConverted || isDeleted) && (leadDetail === null || leadDetail === undefined)) {
                result.affectedCount++;
                result.details.push({
                    id: record.id || record.Id || 'unknown',
                    converted: isConverted,
                    deleted: isDeleted,
                    issue: 'lead_detail missing for converted/deleted lead'
                });
            }
        }

        if (result.affectedCount > 0) {
            result.hasEdgeCases = true;
            result.severity = result.affectedCount >= 5 ? 'high' : 'medium';
            result.recommendations.push(
                'Handle converted/deleted leads with null lead_detail as expected edge cases instead of hard failures.'
            );
            result.recommendations.push(
                'Apply null-safe extraction and skip downstream enrichment for leads in terminal states.'
            );
        }

        return result;
    }

    /**
     * Comprehensive data quality check combining all detection methods
     *
     * @param {Array} records - Records to validate
     * @param {Object} options - Validation options
     * @returns {Object} Combined quality assessment
     */
    comprehensiveCheck(records, options = {}) {
        const result = {
            overallScore: 100,
            passed: true,
            checks: {},
            recommendations: [],
            summary: ''
        };

        if (!Array.isArray(records) || records.length === 0) {
            result.overallScore = 0;
            result.passed = false;
            result.summary = 'No records to validate';
            return result;
        }

        // Run synthetic data detection
        const syntheticCheck = this.detectSyntheticData(records, options);
        result.checks.synthetic = syntheticCheck;
        if (syntheticCheck.isSynthetic) {
            result.overallScore -= syntheticCheck.confidence * 0.5;
            result.passed = false;
            result.recommendations.push(...syntheticCheck.details);
        }

        // Run orphan relationship detection
        const orphanCheck = this.detectOrphanRelationships(records, options.schema);
        result.checks.orphans = orphanCheck;
        if (orphanCheck.severity === 'critical') {
            result.overallScore -= 40;
            result.passed = false;
        } else if (orphanCheck.severity === 'high') {
            result.overallScore -= 25;
        } else if (orphanCheck.severity === 'medium') {
            result.overallScore -= 10;
        }
        result.recommendations.push(...orphanCheck.recommendations);

        // Run null handling check
        const nullCheck = this.enforceNullHandling(records, options.schema);
        result.checks.nullHandling = nullCheck;
        if (!nullCheck.valid) {
            result.overallScore -= 20;
            result.passed = result.passed && false;
        }

        // Detect known lead-detail null edge case (converted/deleted leads)
        const leadDetailCheck = this.detectLeadDetailNullEdgeCases(records);
        result.checks.leadDetailEdgeCases = leadDetailCheck;
        if (leadDetailCheck.hasEdgeCases) {
            result.overallScore -= Math.min(20, leadDetailCheck.affectedCount * 2);
            result.recommendations.push(...leadDetailCheck.recommendations);
        }

        // Ensure score stays in bounds
        result.overallScore = Math.max(0, Math.min(100, result.overallScore));

        // Generate summary
        if (result.overallScore >= 80) {
            result.summary = `Data quality GOOD (${result.overallScore.toFixed(0)}%). ${records.length} records passed validation.`;
        } else if (result.overallScore >= 50) {
            result.summary = `Data quality MODERATE (${result.overallScore.toFixed(0)}%). Review recommendations before proceeding.`;
        } else {
            result.summary = `Data quality POOR (${result.overallScore.toFixed(0)}%). Significant issues detected. Fix before import.`;
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

        case 'detect-synthetic':
        case 'test-synthetic':
            const syntheticDataPath = args[1];
            if (!syntheticDataPath) {
                console.error('Usage: data-quality-gate detect-synthetic <data.json>');
                console.error('');
                console.error('Detects synthetic/fake data indicators:');
                console.error('  - Generic names (test, example, demo, placeholder)');
                console.error('  - Sequential IDs (ID001, ACC0001)');
                console.error('  - Round pricing (suspiciously many values divisible by 1000)');
                console.error('  - Missing variance (all same values in a field)');
                console.error('  - Fake emails/phones (test@example.com, 555-0123)');
                console.error('  - Placeholder values (N/A, TBD, TODO)');
                process.exit(1);
            }
            try {
                const data = JSON.parse(fs.readFileSync(syntheticDataPath, 'utf-8'));
                // Extract records array from various formats
                let records = [];
                if (Array.isArray(data)) {
                    records = data;
                } else if (data.records && Array.isArray(data.records)) {
                    records = data.records;
                } else if (data.data && Array.isArray(data.data)) {
                    records = data.data;
                } else {
                    records = [data];
                }

                const result = gate.detectSyntheticData(records);

                // Pretty output for terminal
                console.log('\n=== Synthetic Data Detection Results ===\n');
                console.log(`Status: ${result.isSynthetic ? '⚠️  SYNTHETIC DATA DETECTED' : '✅ Data appears genuine'}`);
                console.log(`Confidence: ${result.confidence}%`);
                console.log(`Records analyzed: ${records.length}`);
                console.log('');

                if (result.details.length > 0) {
                    console.log('Indicators detected:');
                    for (const detail of result.details) {
                        console.log(`  - ${detail}`);
                    }
                    console.log('');
                }

                console.log('Indicator Summary:');
                for (const [indicator, detected] of Object.entries(result.indicators)) {
                    const status = detected ? '⚠️  YES' : '✅ NO';
                    console.log(`  ${indicator}: ${status}`);
                }
                console.log('');
                console.log(`Summary: ${result.summary}`);
                console.log('');

                // Also output JSON for programmatic use
                if (args.includes('--json')) {
                    console.log('\n--- JSON Output ---');
                    console.log(JSON.stringify(result, null, 2));
                }

                process.exit(result.isSynthetic ? 1 : 0);
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
  data-quality-gate detect-synthetic <data.json>  Detect synthetic/fake data

Features:
  - Query result validation against expectations
  - Improbability detection (99% rates, 0 records when expected)
  - NULL handling rules per data type
  - Statistical outlier detection (>3 std dev)
  - Cross-field consistency checks
  - Synthetic data detection (generic names, sequential IDs, fake patterns)

Examples:
  data-quality-gate validate ./query-result.json
  data-quality-gate detect-improbable ./metrics.json
  data-quality-gate check-nulls ./records.json
  data-quality-gate check-outliers ./sales-data.json
  data-quality-gate detect-synthetic ./accounts.json --json
            `);
    }
}

module.exports = { DataQualityGate };
