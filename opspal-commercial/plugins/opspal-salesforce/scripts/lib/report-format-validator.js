#!/usr/bin/env node

/**
 * Report Format Validator
 *
 * Validates Salesforce report definitions for format-specific constraints,
 * field availability, and potential issues before deployment.
 *
 * Usage:
 *   node report-format-validator.js <report-file> [--org <alias>]
 *   node report-format-validator.js --batch <directory> [--org <alias>]
 *
 * @see ../docs/runbooks/report-api-development/08-validation-and-deployment.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// VALIDATION RULES
// ============================================================================

const FORMAT_CONSTRAINTS = {
    TABULAR: {
        maxGroupingsDown: 0,
        maxGroupingsAcross: 0,
        supportsAggregates: false,
        supportsSubtotals: false,
        rowLimit: 50000
    },
    SUMMARY: {
        maxGroupingsDown: 3,
        maxGroupingsAcross: 0,
        supportsAggregates: true,
        supportsSubtotals: true,
        rowLimit: 2000,
        rowLimitSeverity: 'critical'
    },
    MATRIX: {
        maxGroupingsDown: 3,
        maxGroupingsAcross: 2,
        supportsAggregates: true,
        supportsSubtotals: true,
        rowLimit: 2000,
        rowLimitSeverity: 'critical'
    },
    MULTI_BLOCK: {
        maxGroupingsDown: 3,
        maxGroupingsAcross: 0,
        supportsAggregates: true,
        supportsSubtotals: true,
        maxBlocks: 5,
        rowLimit: 2000,
        rowLimitPerBlock: true
    }
};

const VALID_OPERATORS = [
    'equals', 'notEqual', 'lessThan', 'greaterThan',
    'lessOrEqual', 'greaterOrEqual', 'contains',
    'notContain', 'startsWith', 'includes', 'excludes', 'within'
];

const VALID_DATE_GRANULARITIES = [
    'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR',
    'FISCAL_QUARTER', 'FISCAL_YEAR'
];

const VALID_AGGREGATE_TYPES = ['SUM', 'AVG', 'MIN', 'MAX', 'UNIQUE', 'RowCount'];

// ============================================================================
// VALIDATOR CLASS
// ============================================================================

class ReportFormatValidator {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias;
        this.verbose = options.verbose !== false;
        this.errors = [];
        this.warnings = [];
        this.info = [];
        this.reportTypeCache = {};
    }

    /**
     * Validate a report definition
     * @param {Object|string} report Report definition (object or file path)
     * @returns {Object} Validation result
     */
    async validate(report) {
        this.errors = [];
        this.warnings = [];
        this.info = [];

        // Load report if path provided
        if (typeof report === 'string') {
            const content = fs.readFileSync(report, 'utf-8');
            report = content.trim().startsWith('{')
                ? JSON.parse(content)
                : this.parseXmlReport(content);
        }

        const rm = report.reportMetadata || report;

        if (this.verbose) {
            console.log(`\nValidating: ${rm.name || 'Unknown Report'}`);
            console.log('='.repeat(50));
        }

        // Run all validation checks
        this.validateRequiredFields(rm);
        this.validateFormat(rm);
        this.validateGroupings(rm);
        this.validateFilters(rm);
        this.validateAggregates(rm);
        this.validateDateFilter(rm);

        if (this.orgAlias) {
            await this.validateReportType(rm);
            await this.validateFields(rm);
        }

        this.checkPerformance(rm);

        return this.generateResult(rm);
    }

    /**
     * Validate required fields
     */
    validateRequiredFields(rm) {
        if (!rm.name) {
            this.errors.push({
                code: 'MISSING_NAME',
                message: 'Report name is required',
                field: 'name'
            });
        } else if (rm.name.length > 40) {
            this.errors.push({
                code: 'NAME_TOO_LONG',
                message: `Report name exceeds 40 characters (${rm.name.length})`,
                field: 'name'
            });
        }

        if (!rm.reportFormat) {
            this.errors.push({
                code: 'MISSING_FORMAT',
                message: 'Report format is required',
                field: 'reportFormat'
            });
        } else if (!FORMAT_CONSTRAINTS[rm.reportFormat]) {
            this.errors.push({
                code: 'INVALID_FORMAT',
                message: `Invalid report format: ${rm.reportFormat}`,
                field: 'reportFormat',
                validValues: Object.keys(FORMAT_CONSTRAINTS)
            });
        }

        const reportType = rm.reportType?.type || rm.reportType;
        if (!reportType) {
            this.errors.push({
                code: 'MISSING_REPORT_TYPE',
                message: 'Report type is required',
                field: 'reportType'
            });
        }
    }

    /**
     * Validate format-specific constraints
     */
    validateFormat(rm) {
        const format = rm.reportFormat;
        const constraints = FORMAT_CONSTRAINTS[format];

        if (!constraints) return;

        // Check TABULAR doesn't have groupings
        if (format === 'TABULAR') {
            if ((rm.groupingsDown || []).length > 0) {
                this.warnings.push({
                    code: 'TABULAR_GROUPINGS_IGNORED',
                    message: 'TABULAR format does not support groupings - they will be ignored',
                    field: 'groupingsDown'
                });
            }
            if ((rm.groupingsAcross || []).length > 0) {
                this.warnings.push({
                    code: 'TABULAR_GROUPINGS_IGNORED',
                    message: 'TABULAR format does not support column groupings - they will be ignored',
                    field: 'groupingsAcross'
                });
            }
            if ((rm.aggregates || []).length > 0) {
                this.warnings.push({
                    code: 'TABULAR_AGGREGATES_IGNORED',
                    message: 'TABULAR format does not display aggregates - they will be ignored',
                    field: 'aggregates'
                });
            }
        }

        // Check SUMMARY row limit warning
        if (format === 'SUMMARY') {
            this.warnings.push({
                code: 'SUMMARY_ROW_LIMIT',
                message: 'CRITICAL: SUMMARY format has a 2,000-row HARD LIMIT via REST API - data is silently truncated!',
                severity: 'critical',
                suggestion: 'Add filters to ensure row count is under 2,000'
            });
        }

        // Check MATRIX column groupings on SUMMARY
        if (format === 'SUMMARY' && (rm.groupingsAcross || []).length > 0) {
            this.errors.push({
                code: 'SUMMARY_NO_COLUMN_GROUPINGS',
                message: 'SUMMARY format does not support column groupings - use MATRIX instead',
                field: 'groupingsAcross'
            });
        }
    }

    /**
     * Validate groupings
     */
    validateGroupings(rm) {
        const format = rm.reportFormat;
        const constraints = FORMAT_CONSTRAINTS[format];

        if (!constraints) return;

        const groupingsDown = rm.groupingsDown || [];
        const groupingsAcross = rm.groupingsAcross || [];

        // Check grouping counts
        if (groupingsDown.length > constraints.maxGroupingsDown) {
            this.errors.push({
                code: 'TOO_MANY_ROW_GROUPINGS',
                message: `${format} format allows max ${constraints.maxGroupingsDown} row groupings, found ${groupingsDown.length}`,
                field: 'groupingsDown',
                limit: constraints.maxGroupingsDown,
                actual: groupingsDown.length
            });
        }

        if (groupingsAcross.length > constraints.maxGroupingsAcross) {
            this.errors.push({
                code: 'TOO_MANY_COLUMN_GROUPINGS',
                message: `${format} format allows max ${constraints.maxGroupingsAcross} column groupings, found ${groupingsAcross.length}`,
                field: 'groupingsAcross',
                limit: constraints.maxGroupingsAcross,
                actual: groupingsAcross.length
            });
        }

        // Validate each grouping
        for (const grouping of [...groupingsDown, ...groupingsAcross]) {
            if (!grouping.name) {
                this.errors.push({
                    code: 'GROUPING_MISSING_NAME',
                    message: 'Grouping is missing field name',
                    field: 'groupingsDown/groupingsAcross'
                });
            }

            if (grouping.dateGranularity &&
                !VALID_DATE_GRANULARITIES.includes(grouping.dateGranularity)) {
                this.errors.push({
                    code: 'INVALID_DATE_GRANULARITY',
                    message: `Invalid date granularity: ${grouping.dateGranularity}`,
                    field: grouping.name,
                    validValues: VALID_DATE_GRANULARITIES
                });
            }

            if (grouping.sortOrder && !['Asc', 'Desc'].includes(grouping.sortOrder)) {
                this.errors.push({
                    code: 'INVALID_SORT_ORDER',
                    message: `Invalid sort order: ${grouping.sortOrder}`,
                    field: grouping.name,
                    validValues: ['Asc', 'Desc']
                });
            }
        }
    }

    /**
     * Validate filters
     */
    validateFilters(rm) {
        const filters = rm.reportFilters || [];

        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i];

            if (!filter.column) {
                this.errors.push({
                    code: 'FILTER_MISSING_COLUMN',
                    message: `Filter ${i + 1} is missing column`,
                    field: `reportFilters[${i}]`
                });
            }

            if (!filter.operator) {
                this.errors.push({
                    code: 'FILTER_MISSING_OPERATOR',
                    message: `Filter ${i + 1} is missing operator`,
                    field: `reportFilters[${i}]`
                });
            } else if (!VALID_OPERATORS.includes(filter.operator)) {
                this.errors.push({
                    code: 'INVALID_OPERATOR',
                    message: `Filter ${i + 1} has invalid operator: ${filter.operator}`,
                    field: `reportFilters[${i}]`,
                    validValues: VALID_OPERATORS
                });
            }

            // Check for common mistakes
            if (filter.operator === 'contains' || filter.operator === 'startsWith') {
                // These only work on string fields
                this.info.push({
                    code: 'STRING_OPERATOR',
                    message: `Filter "${filter.column}" uses ${filter.operator} - ensure field is a text type`,
                    field: `reportFilters[${i}]`
                });
            }
        }

        // Validate boolean filter logic
        if (rm.reportBooleanFilter) {
            this.validateBooleanFilter(rm.reportBooleanFilter, filters.length);
        }
    }

    /**
     * Validate boolean filter expression
     */
    validateBooleanFilter(expression, filterCount) {
        // Check for valid filter references
        const refs = expression.match(/\d+/g) || [];
        const maxRef = Math.max(...refs.map(Number));

        if (maxRef > filterCount) {
            this.errors.push({
                code: 'INVALID_FILTER_REFERENCE',
                message: `Boolean filter references filter ${maxRef}, but only ${filterCount} filters exist`,
                field: 'reportBooleanFilter'
            });
        }

        // Check for balanced parentheses
        let depth = 0;
        for (const char of expression) {
            if (char === '(') depth++;
            if (char === ')') depth--;
            if (depth < 0) {
                this.errors.push({
                    code: 'UNBALANCED_PARENTHESES',
                    message: 'Boolean filter has unbalanced parentheses',
                    field: 'reportBooleanFilter'
                });
                break;
            }
        }

        if (depth !== 0) {
            this.errors.push({
                code: 'UNBALANCED_PARENTHESES',
                message: 'Boolean filter has unbalanced parentheses',
                field: 'reportBooleanFilter'
            });
        }
    }

    /**
     * Validate aggregates
     */
    validateAggregates(rm) {
        const aggregates = rm.aggregates || [];
        const format = rm.reportFormat;
        const constraints = FORMAT_CONSTRAINTS[format];

        if (!constraints?.supportsAggregates && aggregates.length > 0) {
            this.warnings.push({
                code: 'AGGREGATES_NOT_SUPPORTED',
                message: `${format} format does not support aggregates - they will be ignored`,
                field: 'aggregates'
            });
            return;
        }

        for (let i = 0; i < aggregates.length; i++) {
            const agg = aggregates[i];

            if (!agg.name) {
                this.errors.push({
                    code: 'AGGREGATE_MISSING_NAME',
                    message: `Aggregate ${i + 1} is missing name`,
                    field: `aggregates[${i}]`
                });
            }

            if (!agg.calculatedFormula) {
                this.errors.push({
                    code: 'AGGREGATE_MISSING_FORMULA',
                    message: `Aggregate ${i + 1} is missing calculatedFormula`,
                    field: `aggregates[${i}]`
                });
            } else {
                // Validate aggregate type
                const aggType = agg.calculatedFormula.split('!')[0];
                if (!VALID_AGGREGATE_TYPES.includes(aggType) && !agg.calculatedFormula.includes('!')) {
                    // Custom formula - check syntax
                    this.validateFormulaSyntax(agg.calculatedFormula, `aggregates[${i}]`);
                }
            }
        }
    }

    /**
     * Validate formula syntax
     */
    validateFormulaSyntax(formula, field) {
        // Check for balanced parentheses
        let depth = 0;
        for (const char of formula) {
            if (char === '(') depth++;
            if (char === ')') depth--;
            if (depth < 0) break;
        }

        if (depth !== 0) {
            this.errors.push({
                code: 'FORMULA_UNBALANCED_PARENS',
                message: `Formula has unbalanced parentheses: ${formula}`,
                field
            });
        }

        // Check for division by zero potential
        if (/\/\s*0(?!\d)/.test(formula)) {
            this.warnings.push({
                code: 'FORMULA_DIVISION_BY_ZERO',
                message: `Formula may have division by zero: ${formula}`,
                field,
                suggestion: 'Use IF() to check denominator before dividing'
            });
        }
    }

    /**
     * Validate date filter
     */
    validateDateFilter(rm) {
        const dateFilter = rm.standardDateFilter;

        if (!dateFilter) {
            this.info.push({
                code: 'NO_DATE_FILTER',
                message: 'No standardDateFilter defined - consider adding for performance',
                suggestion: 'Add a date filter to bound result set'
            });
            return;
        }

        if (!dateFilter.column) {
            this.warnings.push({
                code: 'DATE_FILTER_MISSING_COLUMN',
                message: 'Date filter is missing column',
                field: 'standardDateFilter.column'
            });
        }

        if (!dateFilter.durationValue && !dateFilter.startDate) {
            this.warnings.push({
                code: 'DATE_FILTER_MISSING_DURATION',
                message: 'Date filter is missing durationValue or date range',
                field: 'standardDateFilter'
            });
        }
    }

    /**
     * Validate report type exists in org
     */
    async validateReportType(rm) {
        const reportType = rm.reportType?.type || rm.reportType;

        if (!reportType || !this.orgAlias) return;

        try {
            const result = execSync(
                `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportType} --target-org ${this.orgAlias}`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );

            this.reportTypeCache[reportType] = JSON.parse(result);

            this.info.push({
                code: 'REPORT_TYPE_EXISTS',
                message: `Report type "${reportType}" exists in org`
            });
        } catch {
            this.errors.push({
                code: 'REPORT_TYPE_NOT_FOUND',
                message: `Report type "${reportType}" not found in org ${this.orgAlias}`,
                field: 'reportType',
                suggestion: 'Deploy custom report type or check API name'
            });
        }
    }

    /**
     * Validate fields exist in report type
     */
    async validateFields(rm) {
        const reportType = rm.reportType?.type || rm.reportType;
        const typeInfo = this.reportTypeCache[reportType];

        if (!typeInfo) return;

        const availableFields = new Set(
            Object.keys(typeInfo.reportExtendedMetadata?.detailColumnInfo || {})
        );

        const usedFields = new Set();

        // Collect all field references
        (rm.detailColumns || []).forEach(f => usedFields.add(f));
        (rm.groupingsDown || []).forEach(g => usedFields.add(g.name));
        (rm.groupingsAcross || []).forEach(g => usedFields.add(g.name));
        (rm.reportFilters || []).forEach(f => usedFields.add(f.column));

        // Check each field
        for (const field of usedFields) {
            if (!availableFields.has(field)) {
                this.errors.push({
                    code: 'FIELD_NOT_FOUND',
                    message: `Field "${field}" not found in report type "${reportType}"`,
                    field,
                    suggestion: 'Check field API name using report type describe'
                });
            }
        }
    }

    /**
     * Check performance concerns
     */
    checkPerformance(rm) {
        // Check column count
        const columnCount = (rm.detailColumns || []).length;
        if (columnCount > 15) {
            this.warnings.push({
                code: 'HIGH_COLUMN_COUNT',
                message: `${columnCount} columns defined - high column counts affect performance`,
                suggestion: 'Consider reducing to essential columns'
            });
        }

        // Check for missing date filter
        const hasDateFilter = rm.standardDateFilter?.column ||
            (rm.reportFilters || []).some(f =>
                f.column?.toLowerCase().includes('date') ||
                f.column?.toLowerCase().includes('created')
            );

        if (!hasDateFilter && rm.scope === 'organization') {
            this.warnings.push({
                code: 'NO_DATE_FILTER_ORG_SCOPE',
                message: 'Organization scope without date filter may return large data sets',
                suggestion: 'Add date filter or reduce scope'
            });
        }

        // Check for potential row limit issues
        const format = rm.reportFormat;
        if ((format === 'SUMMARY' || format === 'MATRIX') && !hasDateFilter) {
            this.warnings.push({
                code: 'ROW_LIMIT_RISK',
                message: `${format} format has 2,000-row limit - no date filter increases truncation risk`,
                severity: 'high',
                suggestion: 'Add date filter to control row count'
            });
        }
    }

    /**
     * Parse XML report (basic)
     */
    parseXmlReport(xml) {
        // Basic XML parsing - extract key fields
        const extractValue = (tag) => {
            const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
            return match ? match[1] : null;
        };

        return {
            name: extractValue('name'),
            reportFormat: extractValue('format'),
            reportType: extractValue('reportType'),
            // Note: Full XML parsing would need proper parser
        };
    }

    /**
     * Generate validation result
     */
    generateResult(rm) {
        const result = {
            valid: this.errors.length === 0,
            reportName: rm.name,
            reportFormat: rm.reportFormat,
            errorCount: this.errors.length,
            warningCount: this.warnings.length,
            infoCount: this.info.length,
            errors: this.errors,
            warnings: this.warnings,
            info: this.info
        };

        if (this.verbose) {
            this.printResult(result);
        }

        return result;
    }

    /**
     * Print validation result
     */
    printResult(result) {
        console.log('\n--- VALIDATION RESULT ---\n');

        if (result.valid) {
            console.log('✅ VALIDATION PASSED\n');
        } else {
            console.log('❌ VALIDATION FAILED\n');
        }

        if (this.errors.length > 0) {
            console.log('ERRORS:');
            for (const error of this.errors) {
                console.log(`  ❌ [${error.code}] ${error.message}`);
                if (error.suggestion) {
                    console.log(`     → ${error.suggestion}`);
                }
                if (error.validValues) {
                    console.log(`     Valid values: ${error.validValues.join(', ')}`);
                }
            }
            console.log('');
        }

        if (this.warnings.length > 0) {
            console.log('WARNINGS:');
            for (const warning of this.warnings) {
                const icon = warning.severity === 'critical' ? '🔴' : '⚠️';
                console.log(`  ${icon} [${warning.code}] ${warning.message}`);
                if (warning.suggestion) {
                    console.log(`     → ${warning.suggestion}`);
                }
            }
            console.log('');
        }

        if (this.info.length > 0 && this.verbose) {
            console.log('INFO:');
            for (const info of this.info) {
                console.log(`  ℹ️  [${info.code}] ${info.message}`);
            }
            console.log('');
        }

        console.log(`Summary: ${result.errorCount} errors, ${result.warningCount} warnings`);
    }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Report Format Validator
=======================

Validates Salesforce report definitions for format-specific constraints.

Usage:
  node report-format-validator.js <report-file> [--org <alias>]
  node report-format-validator.js --batch <directory> [--org <alias>]

Options:
  --org <alias>    Salesforce org alias for field/type validation
  --batch          Validate all reports in directory
  --json           Output results as JSON
  --quiet          Suppress verbose output

Examples:
  node report-format-validator.js my-report.json
  node report-format-validator.js my-report.json --org sandbox
  node report-format-validator.js --batch ./reports --org sandbox
`);
        return;
    }

    const options = {
        verbose: !args.includes('--quiet'),
        orgAlias: args.includes('--org') ? args[args.indexOf('--org') + 1] : null,
        json: args.includes('--json')
    };

    const validator = new ReportFormatValidator(options);

    if (args[0] === '--batch') {
        const directory = args[1];

        if (!directory || !fs.existsSync(directory)) {
            console.error('Error: Please provide a valid directory');
            process.exit(1);
        }

        const files = fs.readdirSync(directory)
            .filter(f => f.endsWith('.json') || f.endsWith('.report-meta.xml'));

        const results = [];

        for (const file of files) {
            const result = await validator.validate(path.join(directory, file));
            results.push({ file, ...result });
        }

        if (options.json) {
            console.log(JSON.stringify(results, null, 2));
        } else {
            console.log('\n=== BATCH VALIDATION SUMMARY ===\n');
            const passed = results.filter(r => r.valid).length;
            console.log(`Passed: ${passed}/${results.length}`);

            const failed = results.filter(r => !r.valid);
            if (failed.length > 0) {
                console.log('\nFailed reports:');
                for (const r of failed) {
                    console.log(`  ❌ ${r.file}: ${r.errorCount} errors`);
                }
            }
        }

        process.exit(results.every(r => r.valid) ? 0 : 1);
    } else {
        const reportFile = args[0];

        if (!fs.existsSync(reportFile)) {
            console.error(`Error: File not found: ${reportFile}`);
            process.exit(1);
        }

        const result = await validator.validate(reportFile);

        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        }

        process.exit(result.valid ? 0 : 1);
    }
}

// Export for programmatic use
module.exports = { ReportFormatValidator, FORMAT_CONSTRAINTS };

// Run if called directly
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
