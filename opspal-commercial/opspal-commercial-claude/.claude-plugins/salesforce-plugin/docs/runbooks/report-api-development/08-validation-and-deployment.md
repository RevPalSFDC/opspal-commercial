# Runbook 08: Validation and Deployment

> **Series**: Report API Development Runbooks
> **Document**: 08 of 09
> **Focus**: Pre-deployment Validation, Deployment Workflows, CI/CD Integration
> **Complexity**: Advanced
> **Prerequisites**: Runbooks 01-07 (All Report Formats and Custom Report Types)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Pre-Deployment Validation Framework](#2-pre-deployment-validation-framework)
3. [Field Validation](#3-field-validation)
4. [Report Type Validation](#4-report-type-validation)
5. [Report Definition Validation](#5-report-definition-validation)
6. [Deployment Workflows](#6-deployment-workflows)
7. [CI/CD Integration](#7-cicd-integration)
8. [Rollback Strategies](#8-rollback-strategies)
9. [Version Control Best Practices](#9-version-control-best-practices)
10. [Environment Management](#10-environment-management)
11. [Deployment Automation Scripts](#11-deployment-automation-scripts)
12. [Quick Reference](#12-quick-reference)

---

## 1. Overview

### Why Validation Matters

Report deployments can fail silently or cause production issues:

| Risk | Impact | Prevention |
|------|--------|------------|
| Missing fields | Report shows "Error in formula" | Pre-validate field existence |
| Wrong field types | Aggregations fail | Validate field data types |
| Report type mismatch | Report doesn't create | Validate report type exists |
| Permission gaps | Users can't run reports | Pre-check field-level security |
| Filter syntax errors | Reports return no data | Validate filter operators |
| 2,000-row truncation | Silent data loss | Row count estimation |

### Validation Philosophy

```
Deployment Pipeline:
    ┌─────────────────┐
    │ Schema Check    │ ← Fields, objects, relationships exist?
    ├─────────────────┤
    │ Syntax Check    │ ← Valid JSON/XML structure?
    ├─────────────────┤
    │ Logic Check     │ ← Filters, formulas, aggregations valid?
    ├─────────────────┤
    │ Security Check  │ ← FLS, sharing rules allow access?
    ├─────────────────┤
    │ Performance     │ ← Row count, query complexity OK?
    ├─────────────────┤
    │ Dry Run         │ ← Deploy to sandbox first
    ├─────────────────┤
    │ Production      │ ← Deploy with verification
    └─────────────────┘
```

---

## 2. Pre-Deployment Validation Framework

### Comprehensive Validator Class

```javascript
/**
 * Report Pre-Deployment Validator
 * Validates all aspects of a report before deployment
 */
class ReportPreDeploymentValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.errors = [];
        this.warnings = [];
        this.objectCache = {};
        this.reportTypeCache = {};
    }

    /**
     * Run all validations
     */
    async validate(reportDefinition) {
        this.errors = [];
        this.warnings = [];

        const report = typeof reportDefinition === 'string'
            ? JSON.parse(reportDefinition)
            : reportDefinition;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`Validating: ${report.reportMetadata?.name || 'Unknown Report'}`);
        console.log(`${'='.repeat(60)}\n`);

        // Run all validation phases
        await this.validateReportType(report);
        await this.validateFields(report);
        await this.validateFilters(report);
        await this.validateGroupings(report);
        await this.validateAggregates(report);
        await this.validateFormulas(report);
        await this.validateSecurity(report);
        await this.estimatePerformance(report);

        return this.generateReport();
    }

    /**
     * Phase 1: Validate report type exists and is accessible
     */
    async validateReportType(report) {
        console.log('Phase 1: Report Type Validation...');

        const reportType = report.reportMetadata?.reportType?.type;

        if (!reportType) {
            this.errors.push({
                phase: 'reportType',
                message: 'No report type specified',
                severity: 'error'
            });
            return;
        }

        try {
            const typeInfo = await this.getReportType(reportType);

            if (!typeInfo) {
                this.errors.push({
                    phase: 'reportType',
                    message: `Report type '${reportType}' not found in org`,
                    severity: 'error',
                    suggestion: 'Verify the report type API name or deploy the custom report type first'
                });
            } else {
                console.log(`  ✓ Report type '${reportType}' exists`);
            }
        } catch (error) {
            this.errors.push({
                phase: 'reportType',
                message: `Failed to validate report type: ${error.message}`,
                severity: 'error'
            });
        }
    }

    /**
     * Phase 2: Validate all fields exist and are accessible
     */
    async validateFields(report) {
        console.log('Phase 2: Field Validation...');

        const fields = this.extractAllFields(report);
        const reportType = report.reportMetadata?.reportType?.type;

        if (!reportType || fields.length === 0) return;

        // Get available fields for this report type
        const availableFields = await this.getReportTypeFields(reportType);

        for (const field of fields) {
            if (!availableFields.has(field)) {
                this.errors.push({
                    phase: 'fields',
                    message: `Field '${field}' not available in report type '${reportType}'`,
                    severity: 'error',
                    suggestion: `Check field API name or verify it's included in the report type`
                });
            }
        }

        if (this.errors.filter(e => e.phase === 'fields').length === 0) {
            console.log(`  ✓ All ${fields.length} fields validated`);
        }
    }

    /**
     * Phase 3: Validate filter syntax and values
     */
    async validateFilters(report) {
        console.log('Phase 3: Filter Validation...');

        const filters = report.reportMetadata?.reportBooleanFilter
            ? this.parseFilterLogic(report)
            : report.reportMetadata?.reportFilters || [];

        if (!filters || filters.length === 0) {
            console.log('  ℹ No filters defined');
            return;
        }

        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i];

            // Validate operator
            if (!this.isValidOperator(filter.operator)) {
                this.errors.push({
                    phase: 'filters',
                    message: `Invalid operator '${filter.operator}' in filter ${i + 1}`,
                    severity: 'error',
                    suggestion: `Valid operators: equals, notEqual, lessThan, greaterThan, lessOrEqual, greaterOrEqual, contains, notContain, startsWith, includes, excludes`
                });
            }

            // Validate field type compatibility with operator
            const fieldType = await this.getFieldType(report.reportMetadata?.reportType?.type, filter.column);

            if (fieldType) {
                const compatibility = this.checkOperatorFieldCompatibility(filter.operator, fieldType);
                if (!compatibility.valid) {
                    this.warnings.push({
                        phase: 'filters',
                        message: `Operator '${filter.operator}' may not work correctly with ${fieldType} field '${filter.column}'`,
                        severity: 'warning',
                        suggestion: compatibility.suggestion
                    });
                }
            }

            // Validate date literals
            if (this.isDateField(fieldType) && filter.value) {
                if (!this.isValidDateLiteral(filter.value) && !this.isValidDateFormat(filter.value)) {
                    this.warnings.push({
                        phase: 'filters',
                        message: `Date value '${filter.value}' may not be in correct format`,
                        severity: 'warning',
                        suggestion: 'Use YYYY-MM-DD format or relative date literals (TODAY, LAST_N_DAYS:30, etc.)'
                    });
                }
            }
        }

        if (this.errors.filter(e => e.phase === 'filters').length === 0) {
            console.log(`  ✓ ${filters.length} filters validated`);
        }
    }

    /**
     * Phase 4: Validate groupings
     */
    async validateGroupings(report) {
        console.log('Phase 4: Grouping Validation...');

        const format = report.reportMetadata?.reportFormat;
        const groupingsDown = report.reportMetadata?.groupingsDown || [];
        const groupingsAcross = report.reportMetadata?.groupingsAcross || [];

        // Check format-specific limits
        if (format === 'TABULAR' && (groupingsDown.length > 0 || groupingsAcross.length > 0)) {
            this.warnings.push({
                phase: 'groupings',
                message: 'Tabular reports do not support groupings; they will be ignored',
                severity: 'warning'
            });
        }

        if (format === 'SUMMARY' && groupingsDown.length > 3) {
            this.errors.push({
                phase: 'groupings',
                message: `Summary reports support max 3 row groupings, found ${groupingsDown.length}`,
                severity: 'error'
            });
        }

        if (format === 'MATRIX') {
            if (groupingsDown.length > 3) {
                this.errors.push({
                    phase: 'groupings',
                    message: `Matrix reports support max 3 row groupings, found ${groupingsDown.length}`,
                    severity: 'error'
                });
            }
            if (groupingsAcross.length > 2) {
                this.errors.push({
                    phase: 'groupings',
                    message: `Matrix reports support max 2 column groupings, found ${groupingsAcross.length}`,
                    severity: 'error'
                });
            }
        }

        // Validate date granularity
        for (const grouping of [...groupingsDown, ...groupingsAcross]) {
            if (grouping.dateGranularity) {
                const validGranularities = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'FISCAL_QUARTER', 'FISCAL_YEAR'];
                if (!validGranularities.includes(grouping.dateGranularity)) {
                    this.errors.push({
                        phase: 'groupings',
                        message: `Invalid date granularity '${grouping.dateGranularity}'`,
                        severity: 'error',
                        suggestion: `Valid values: ${validGranularities.join(', ')}`
                    });
                }
            }
        }

        if (this.errors.filter(e => e.phase === 'groupings').length === 0) {
            console.log(`  ✓ Groupings validated (${groupingsDown.length} rows, ${groupingsAcross.length} columns)`);
        }
    }

    /**
     * Phase 5: Validate aggregates
     */
    async validateAggregates(report) {
        console.log('Phase 5: Aggregate Validation...');

        const aggregates = report.reportMetadata?.aggregates || [];
        const reportType = report.reportMetadata?.reportType?.type;

        const validAggregateTypes = ['SUM', 'AVG', 'MIN', 'MAX', 'UNIQUE', 'RowCount'];

        for (const aggregate of aggregates) {
            // Validate aggregate type
            if (!validAggregateTypes.includes(aggregate.calculatedFormula?.split('!')[0])) {
                // Custom formula - will be validated in formulas phase
                continue;
            }

            const aggType = aggregate.calculatedFormula?.split('!')[0];
            const field = aggregate.calculatedFormula?.split('!')[1];

            if (field && aggType !== 'RowCount') {
                const fieldType = await this.getFieldType(reportType, field);

                // SUM and AVG only work on numeric fields
                if (['SUM', 'AVG'].includes(aggType) && !this.isNumericField(fieldType)) {
                    this.errors.push({
                        phase: 'aggregates',
                        message: `Aggregate '${aggType}' requires numeric field, but '${field}' is ${fieldType}`,
                        severity: 'error'
                    });
                }
            }
        }

        if (this.errors.filter(e => e.phase === 'aggregates').length === 0) {
            console.log(`  ✓ ${aggregates.length} aggregates validated`);
        }
    }

    /**
     * Phase 6: Validate formulas (custom summary formulas)
     */
    async validateFormulas(report) {
        console.log('Phase 6: Formula Validation...');

        const customSummaryFormulas = report.reportMetadata?.customSummaryFormulas || [];

        for (const formula of customSummaryFormulas) {
            // Check formula syntax
            const syntaxResult = this.validateFormulaSyntax(formula.formulaDefinition);
            if (!syntaxResult.valid) {
                this.errors.push({
                    phase: 'formulas',
                    message: `Formula '${formula.label}' has syntax error: ${syntaxResult.error}`,
                    severity: 'error'
                });
            }

            // Check aggregate references
            const aggregateRefs = this.extractAggregateReferences(formula.formulaDefinition);
            const availableAggregates = new Set(
                (report.reportMetadata?.aggregates || []).map(a => a.name)
            );

            for (const ref of aggregateRefs) {
                if (!availableAggregates.has(ref)) {
                    this.errors.push({
                        phase: 'formulas',
                        message: `Formula '${formula.label}' references undefined aggregate '${ref}'`,
                        severity: 'error'
                    });
                }
            }
        }

        if (this.errors.filter(e => e.phase === 'formulas').length === 0) {
            console.log(`  ✓ ${customSummaryFormulas.length} formulas validated`);
        }
    }

    /**
     * Phase 7: Validate security (FLS)
     */
    async validateSecurity(report) {
        console.log('Phase 7: Security Validation...');

        // This would require querying FieldPermissions
        // For now, add a reminder
        this.warnings.push({
            phase: 'security',
            message: 'Remember to verify field-level security for target users',
            severity: 'info'
        });

        console.log('  ℹ Security check requires manual verification of FLS');
    }

    /**
     * Phase 8: Estimate performance and row counts
     */
    async estimatePerformance(report) {
        console.log('Phase 8: Performance Estimation...');

        const format = report.reportMetadata?.reportFormat;

        // Check for SUMMARY format with potential high row counts
        if (format === 'SUMMARY') {
            this.warnings.push({
                phase: 'performance',
                message: 'SUMMARY format has a 2,000-row HARD LIMIT via Analytics API',
                severity: 'critical',
                suggestion: 'Add filters to reduce row count, or use Metadata API for full data'
            });
        }

        // Check for missing filters on large objects
        const filters = report.reportMetadata?.reportFilters || [];
        if (filters.length === 0) {
            this.warnings.push({
                phase: 'performance',
                message: 'No filters defined - report may return large data sets',
                severity: 'warning',
                suggestion: 'Add date range or status filters to improve performance'
            });
        }

        // Check for date range filter
        const hasDateFilter = filters.some(f =>
            f.column?.toLowerCase().includes('date') ||
            f.column?.toLowerCase().includes('created') ||
            f.column?.toLowerCase().includes('modified')
        );

        if (!hasDateFilter) {
            this.warnings.push({
                phase: 'performance',
                message: 'No date filter found - consider adding to bound result set',
                severity: 'info'
            });
        }

        console.log('  ℹ Performance analysis complete');
    }

    // ===== Helper Methods =====

    async getReportType(reportTypeName) {
        if (this.reportTypeCache[reportTypeName]) {
            return this.reportTypeCache[reportTypeName];
        }

        const { execSync } = require('child_process');

        try {
            const result = JSON.parse(execSync(
                `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${this.orgAlias}`,
                { encoding: 'utf-8', stdio: 'pipe' }
            ));

            this.reportTypeCache[reportTypeName] = result;
            return result;
        } catch {
            return null;
        }
    }

    async getReportTypeFields(reportTypeName) {
        const typeInfo = await this.getReportType(reportTypeName);

        if (!typeInfo?.reportExtendedMetadata?.detailColumnInfo) {
            return new Set();
        }

        return new Set(Object.keys(typeInfo.reportExtendedMetadata.detailColumnInfo));
    }

    async getFieldType(reportTypeName, fieldName) {
        const typeInfo = await this.getReportType(reportTypeName);
        return typeInfo?.reportExtendedMetadata?.detailColumnInfo?.[fieldName]?.dataType;
    }

    extractAllFields(report) {
        const fields = new Set();

        // Detail columns
        for (const col of report.reportMetadata?.detailColumns || []) {
            fields.add(col);
        }

        // Groupings
        for (const g of report.reportMetadata?.groupingsDown || []) {
            fields.add(g.name);
        }
        for (const g of report.reportMetadata?.groupingsAcross || []) {
            fields.add(g.name);
        }

        // Filters
        for (const f of report.reportMetadata?.reportFilters || []) {
            fields.add(f.column);
        }

        // Aggregates
        for (const a of report.reportMetadata?.aggregates || []) {
            if (a.calculatedFormula?.includes('!')) {
                fields.add(a.calculatedFormula.split('!')[1]);
            }
        }

        return Array.from(fields);
    }

    isValidOperator(operator) {
        const validOperators = [
            'equals', 'notEqual', 'lessThan', 'greaterThan',
            'lessOrEqual', 'greaterOrEqual', 'contains', 'notContain',
            'startsWith', 'includes', 'excludes', 'within'
        ];
        return validOperators.includes(operator);
    }

    checkOperatorFieldCompatibility(operator, fieldType) {
        const stringOnlyOperators = ['contains', 'notContain', 'startsWith'];
        const numericTypes = ['currency', 'double', 'int', 'percent'];

        if (stringOnlyOperators.includes(operator) && numericTypes.includes(fieldType)) {
            return {
                valid: false,
                suggestion: `Use equals, notEqual, lessThan, greaterThan for ${fieldType} fields`
            };
        }

        return { valid: true };
    }

    isDateField(fieldType) {
        return ['date', 'datetime'].includes(fieldType);
    }

    isNumericField(fieldType) {
        return ['currency', 'double', 'int', 'percent'].includes(fieldType);
    }

    isValidDateLiteral(value) {
        const dateLiterals = [
            'TODAY', 'YESTERDAY', 'TOMORROW',
            'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
            'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
            'LAST_QUARTER', 'THIS_QUARTER', 'NEXT_QUARTER',
            'LAST_YEAR', 'THIS_YEAR', 'NEXT_YEAR',
            'LAST_90_DAYS', 'NEXT_90_DAYS',
            'LAST_N_DAYS', 'NEXT_N_DAYS',
            'LAST_N_WEEKS', 'NEXT_N_WEEKS',
            'LAST_N_MONTHS', 'NEXT_N_MONTHS',
            'LAST_N_QUARTERS', 'NEXT_N_QUARTERS',
            'LAST_N_YEARS', 'NEXT_N_YEARS'
        ];

        // Check exact match or pattern match (LAST_N_DAYS:30)
        return dateLiterals.some(literal =>
            value === literal || value.startsWith(literal + ':')
        );
    }

    isValidDateFormat(value) {
        // YYYY-MM-DD format
        return /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    validateFormulaSyntax(formula) {
        // Basic syntax validation
        try {
            // Check for balanced parentheses
            let depth = 0;
            for (const char of formula) {
                if (char === '(') depth++;
                if (char === ')') depth--;
                if (depth < 0) {
                    return { valid: false, error: 'Unbalanced parentheses' };
                }
            }
            if (depth !== 0) {
                return { valid: false, error: 'Unbalanced parentheses' };
            }

            // Check for division by zero patterns
            if (/\/\s*0[^.]/.test(formula)) {
                return { valid: false, error: 'Potential division by zero' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    extractAggregateReferences(formula) {
        // Extract aggregate references like SUM_Amount, AVG_Quantity
        const references = [];
        const pattern = /\b([A-Z]+_[A-Za-z_]+)\b/g;
        let match;
        while ((match = pattern.exec(formula)) !== null) {
            references.push(match[1]);
        }
        return references;
    }

    parseFilterLogic(report) {
        // Parse custom filter logic
        return report.reportMetadata?.reportFilters || [];
    }

    generateReport() {
        const result = {
            valid: this.errors.length === 0,
            errorCount: this.errors.length,
            warningCount: this.warnings.length,
            errors: this.errors,
            warnings: this.warnings
        };

        console.log(`\n${'='.repeat(60)}`);
        console.log('VALIDATION SUMMARY');
        console.log(`${'='.repeat(60)}`);

        if (result.valid) {
            console.log('\n✓ VALIDATION PASSED\n');
        } else {
            console.log('\n✗ VALIDATION FAILED\n');

            console.log('ERRORS:');
            for (const error of this.errors) {
                console.log(`  [${error.phase}] ${error.message}`);
                if (error.suggestion) {
                    console.log(`    → ${error.suggestion}`);
                }
            }
        }

        if (this.warnings.length > 0) {
            console.log('\nWARNINGS:');
            for (const warning of this.warnings) {
                const icon = warning.severity === 'critical' ? '⚠️' : 'ℹ';
                console.log(`  ${icon} [${warning.phase}] ${warning.message}`);
                if (warning.suggestion) {
                    console.log(`    → ${warning.suggestion}`);
                }
            }
        }

        console.log(`\n${'='.repeat(60)}\n`);

        return result;
    }
}

module.exports = { ReportPreDeploymentValidator };
```

### Quick Validation Script

```javascript
/**
 * Quick validation for common report issues
 */
async function quickValidate(orgAlias, reportPath) {
    const fs = require('fs');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

    const checks = [];

    // Check 1: Report has name
    checks.push({
        name: 'Report Name',
        passed: !!report.reportMetadata?.name,
        message: report.reportMetadata?.name || 'Missing report name'
    });

    // Check 2: Report type specified
    checks.push({
        name: 'Report Type',
        passed: !!report.reportMetadata?.reportType?.type,
        message: report.reportMetadata?.reportType?.type || 'Missing report type'
    });

    // Check 3: Valid format
    const validFormats = ['TABULAR', 'SUMMARY', 'MATRIX', 'MULTI_BLOCK'];
    checks.push({
        name: 'Report Format',
        passed: validFormats.includes(report.reportMetadata?.reportFormat),
        message: report.reportMetadata?.reportFormat || 'Missing format'
    });

    // Check 4: Has columns
    const columnCount = (report.reportMetadata?.detailColumns || []).length;
    checks.push({
        name: 'Detail Columns',
        passed: columnCount > 0,
        message: `${columnCount} columns defined`
    });

    // Check 5: Groupings match format
    const hasGroupings = (report.reportMetadata?.groupingsDown || []).length > 0;
    const isTabular = report.reportMetadata?.reportFormat === 'TABULAR';
    checks.push({
        name: 'Groupings/Format Match',
        passed: isTabular ? !hasGroupings : true,
        message: isTabular && hasGroupings ? 'Tabular format should not have groupings' : 'OK'
    });

    // Print results
    console.log('\nQuick Validation Results:');
    console.log('-'.repeat(40));

    let allPassed = true;
    for (const check of checks) {
        const icon = check.passed ? '✓' : '✗';
        console.log(`${icon} ${check.name}: ${check.message}`);
        if (!check.passed) allPassed = false;
    }

    console.log('-'.repeat(40));
    console.log(allPassed ? 'All checks passed!' : 'Some checks failed!');

    return { passed: allPassed, checks };
}

module.exports = { quickValidate };
```

---

## 3. Field Validation

### Field Existence Checker

```javascript
/**
 * Validate that all fields in a report exist and are accessible
 */
class FieldValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.fieldCache = {};
    }

    /**
     * Get all available fields for a report type
     */
    async getAvailableFields(reportTypeName) {
        if (this.fieldCache[reportTypeName]) {
            return this.fieldCache[reportTypeName];
        }

        const { execSync } = require('child_process');

        try {
            const result = JSON.parse(execSync(
                `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${this.orgAlias}`,
                { encoding: 'utf-8' }
            ));

            const fields = {};

            // Detail columns
            if (result.reportExtendedMetadata?.detailColumnInfo) {
                for (const [key, info] of Object.entries(result.reportExtendedMetadata.detailColumnInfo)) {
                    fields[key] = {
                        apiName: key,
                        label: info.label,
                        dataType: info.dataType,
                        filterable: info.filterable,
                        sortable: info.sortable,
                        type: 'detail'
                    };
                }
            }

            // Grouping columns
            if (result.reportExtendedMetadata?.groupingColumnInfo) {
                for (const [key, info] of Object.entries(result.reportExtendedMetadata.groupingColumnInfo)) {
                    if (!fields[key]) {
                        fields[key] = {
                            apiName: key,
                            label: info.label,
                            dataType: info.dataType,
                            type: 'grouping'
                        };
                    }
                    fields[key].groupable = true;
                    fields[key].bucketable = info.bucketable;
                }
            }

            // Aggregate columns
            if (result.reportExtendedMetadata?.aggregateColumnInfo) {
                for (const [key, info] of Object.entries(result.reportExtendedMetadata.aggregateColumnInfo)) {
                    if (!fields[key]) {
                        fields[key] = {
                            apiName: key,
                            label: info.label,
                            dataType: info.dataType,
                            type: 'aggregate'
                        };
                    }
                    fields[key].aggregatable = true;
                }
            }

            this.fieldCache[reportTypeName] = fields;
            return fields;
        } catch (error) {
            throw new Error(`Failed to get fields for report type: ${error.message}`);
        }
    }

    /**
     * Validate a list of fields against available fields
     */
    async validateFields(reportTypeName, fieldList) {
        const available = await this.getAvailableFields(reportTypeName);
        const results = {
            valid: [],
            invalid: [],
            suggestions: {}
        };

        for (const field of fieldList) {
            if (available[field]) {
                results.valid.push({
                    field,
                    info: available[field]
                });
            } else {
                results.invalid.push(field);

                // Find suggestions (similar field names)
                const suggestions = this.findSimilarFields(field, Object.keys(available));
                if (suggestions.length > 0) {
                    results.suggestions[field] = suggestions;
                }
            }
        }

        return results;
    }

    /**
     * Find similar field names (for suggestions)
     */
    findSimilarFields(target, candidates) {
        const targetLower = target.toLowerCase();
        const suggestions = [];

        for (const candidate of candidates) {
            const candidateLower = candidate.toLowerCase();

            // Check if contains target or vice versa
            if (candidateLower.includes(targetLower) || targetLower.includes(candidateLower)) {
                suggestions.push(candidate);
                continue;
            }

            // Check Levenshtein distance for short strings
            if (target.length < 20 && candidate.length < 20) {
                const distance = this.levenshteinDistance(targetLower, candidateLower);
                if (distance <= 3) {
                    suggestions.push(candidate);
                }
            }
        }

        return suggestions.slice(0, 5); // Return top 5 suggestions
    }

    levenshteinDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Check field-level security for running user
     */
    async checkFLS(objectName, fieldNames) {
        const { execSync } = require('child_process');

        try {
            const fields = fieldNames.join(',');
            const query = `
                SELECT Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE SobjectType = '${objectName}'
                AND Field IN (${fieldNames.map(f => `'${objectName}.${f}'`).join(',')})
                AND Parent.IsOwnedByProfile = false
            `;

            const result = JSON.parse(execSync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            ));

            return result.result.records.map(r => ({
                field: r.Field.replace(`${objectName}.`, ''),
                canRead: r.PermissionsRead,
                canEdit: r.PermissionsEdit
            }));
        } catch (error) {
            console.warn(`Could not check FLS: ${error.message}`);
            return [];
        }
    }
}

module.exports = { FieldValidator };
```

### Field Type Validation

```javascript
/**
 * Validate field types for specific operations
 */
const FIELD_TYPE_CONSTRAINTS = {
    // Aggregations
    SUM: ['currency', 'double', 'int', 'percent'],
    AVG: ['currency', 'double', 'int', 'percent'],
    MIN: ['currency', 'double', 'int', 'percent', 'date', 'datetime'],
    MAX: ['currency', 'double', 'int', 'percent', 'date', 'datetime'],
    UNIQUE: ['id', 'string', 'reference', 'email', 'phone'],

    // Filter operators
    contains: ['string', 'textarea', 'email', 'url', 'phone'],
    startsWith: ['string', 'textarea', 'email', 'url', 'phone'],
    lessThan: ['currency', 'double', 'int', 'percent', 'date', 'datetime'],
    greaterThan: ['currency', 'double', 'int', 'percent', 'date', 'datetime'],

    // Grouping
    dateGranularity: ['date', 'datetime']
};

function validateFieldTypeForOperation(fieldType, operation) {
    const allowedTypes = FIELD_TYPE_CONSTRAINTS[operation];

    if (!allowedTypes) {
        return { valid: true }; // No constraint defined
    }

    if (allowedTypes.includes(fieldType)) {
        return { valid: true };
    }

    return {
        valid: false,
        error: `Operation '${operation}' not supported for field type '${fieldType}'`,
        allowedTypes
    };
}

module.exports = { FIELD_TYPE_CONSTRAINTS, validateFieldTypeForOperation };
```

---

## 4. Report Type Validation

### Report Type Validator

```javascript
/**
 * Validate report type exists and has required fields
 */
class ReportTypeValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
    }

    /**
     * Check if report type exists
     */
    async exists(reportTypeName) {
        const { execSync } = require('child_process');

        try {
            execSync(
                `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${this.orgAlias}`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get full report type details
     */
    async describe(reportTypeName) {
        const { execSync } = require('child_process');

        try {
            return JSON.parse(execSync(
                `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${this.orgAlias}`,
                { encoding: 'utf-8' }
            ));
        } catch (error) {
            throw new Error(`Report type '${reportTypeName}' not found: ${error.message}`);
        }
    }

    /**
     * List all available report types
     */
    async listAll() {
        const { execSync } = require('child_process');

        const query = `
            SELECT DeveloperName, MasterLabel, SobjectType, IsActive
            FROM ReportType
            WHERE IsActive = true
            ORDER BY MasterLabel
        `;

        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        return result.result.records;
    }

    /**
     * Find report type by object
     */
    async findByObject(objectName) {
        const allTypes = await this.listAll();
        return allTypes.filter(rt =>
            rt.SobjectType === objectName ||
            rt.DeveloperName?.includes(objectName)
        );
    }

    /**
     * Validate report type for specific format
     */
    async validateForFormat(reportTypeName, format) {
        const typeInfo = await this.describe(reportTypeName);
        const issues = [];

        // Check for groupable fields if format requires groupings
        if (['SUMMARY', 'MATRIX'].includes(format)) {
            const groupableCount = Object.keys(
                typeInfo.reportExtendedMetadata?.groupingColumnInfo || {}
            ).length;

            if (groupableCount === 0) {
                issues.push({
                    type: 'warning',
                    message: 'No groupable fields available for this report type',
                    suggestion: 'Use TABULAR format or choose a different report type'
                });
            }
        }

        // Check for aggregatable fields if format uses aggregates
        if (['SUMMARY', 'MATRIX'].includes(format)) {
            const aggregatableFields = Object.entries(
                typeInfo.reportExtendedMetadata?.detailColumnInfo || {}
            ).filter(([_, info]) => ['currency', 'double', 'int', 'percent'].includes(info.dataType));

            if (aggregatableFields.length === 0) {
                issues.push({
                    type: 'info',
                    message: 'No numeric fields available for aggregation',
                    suggestion: 'Can only use RowCount aggregate'
                });
            }
        }

        return {
            valid: issues.filter(i => i.type === 'error').length === 0,
            issues
        };
    }
}

module.exports = { ReportTypeValidator };
```

---

## 5. Report Definition Validation

### JSON Schema for Report Metadata

```javascript
/**
 * JSON Schema for Salesforce Report Metadata (REST API)
 */
const REPORT_METADATA_SCHEMA = {
    type: 'object',
    required: ['reportMetadata'],
    properties: {
        reportMetadata: {
            type: 'object',
            required: ['name', 'reportType', 'reportFormat'],
            properties: {
                name: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 40,
                    pattern: '^[^/\\\\:*?"<>|]+$'
                },
                description: {
                    type: 'string',
                    maxLength: 255
                },
                reportType: {
                    type: 'object',
                    required: ['type'],
                    properties: {
                        type: { type: 'string' }
                    }
                },
                reportFormat: {
                    type: 'string',
                    enum: ['TABULAR', 'SUMMARY', 'MATRIX', 'MULTI_BLOCK']
                },
                detailColumns: {
                    type: 'array',
                    items: { type: 'string' }
                },
                groupingsDown: {
                    type: 'array',
                    maxItems: 3,
                    items: {
                        type: 'object',
                        required: ['name', 'sortOrder'],
                        properties: {
                            name: { type: 'string' },
                            sortOrder: { enum: ['Asc', 'Desc'] },
                            dateGranularity: {
                                enum: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'FISCAL_QUARTER', 'FISCAL_YEAR']
                            }
                        }
                    }
                },
                groupingsAcross: {
                    type: 'array',
                    maxItems: 2,
                    items: {
                        type: 'object',
                        required: ['name', 'sortOrder'],
                        properties: {
                            name: { type: 'string' },
                            sortOrder: { enum: ['Asc', 'Desc'] },
                            dateGranularity: {
                                enum: ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'FISCAL_QUARTER', 'FISCAL_YEAR']
                            }
                        }
                    }
                },
                aggregates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name', 'calculatedFormula'],
                        properties: {
                            name: { type: 'string' },
                            calculatedFormula: { type: 'string' }
                        }
                    }
                },
                reportFilters: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['column', 'operator', 'value'],
                        properties: {
                            column: { type: 'string' },
                            operator: {
                                enum: [
                                    'equals', 'notEqual', 'lessThan', 'greaterThan',
                                    'lessOrEqual', 'greaterOrEqual', 'contains',
                                    'notContain', 'startsWith', 'includes', 'excludes'
                                ]
                            },
                            value: { type: 'string' }
                        }
                    }
                },
                scope: {
                    type: 'string',
                    enum: ['user', 'organization', 'team', 'role', 'roleSubordinates', 'territory', 'territorySubordinates']
                },
                standardDateFilter: {
                    type: 'object',
                    properties: {
                        column: { type: 'string' },
                        durationValue: { type: 'string' },
                        startDate: { type: 'string' },
                        endDate: { type: 'string' }
                    }
                }
            }
        }
    }
};

/**
 * Validate report definition against schema
 */
function validateReportSchema(reportDefinition) {
    const errors = [];

    const report = typeof reportDefinition === 'string'
        ? JSON.parse(reportDefinition)
        : reportDefinition;

    // Required: reportMetadata
    if (!report.reportMetadata) {
        errors.push('Missing required property: reportMetadata');
        return { valid: false, errors };
    }

    const rm = report.reportMetadata;

    // Required: name
    if (!rm.name) {
        errors.push('Missing required property: reportMetadata.name');
    } else if (rm.name.length > 40) {
        errors.push(`Report name exceeds 40 characters: ${rm.name.length}`);
    }

    // Required: reportType
    if (!rm.reportType?.type) {
        errors.push('Missing required property: reportMetadata.reportType.type');
    }

    // Required: reportFormat
    if (!rm.reportFormat) {
        errors.push('Missing required property: reportMetadata.reportFormat');
    } else if (!['TABULAR', 'SUMMARY', 'MATRIX', 'MULTI_BLOCK'].includes(rm.reportFormat)) {
        errors.push(`Invalid reportFormat: ${rm.reportFormat}`);
    }

    // Validate groupings based on format
    if (rm.reportFormat === 'TABULAR') {
        if (rm.groupingsDown?.length > 0 || rm.groupingsAcross?.length > 0) {
            errors.push('TABULAR format does not support groupings');
        }
    }

    if (rm.reportFormat === 'SUMMARY' && rm.groupingsAcross?.length > 0) {
        errors.push('SUMMARY format does not support column groupings (groupingsAcross)');
    }

    if (rm.groupingsDown?.length > 3) {
        errors.push(`Maximum 3 row groupings allowed, found ${rm.groupingsDown.length}`);
    }

    if (rm.groupingsAcross?.length > 2) {
        errors.push(`Maximum 2 column groupings allowed, found ${rm.groupingsAcross.length}`);
    }

    // Validate filter operators
    const validOperators = [
        'equals', 'notEqual', 'lessThan', 'greaterThan',
        'lessOrEqual', 'greaterOrEqual', 'contains',
        'notContain', 'startsWith', 'includes', 'excludes'
    ];

    for (const filter of rm.reportFilters || []) {
        if (!validOperators.includes(filter.operator)) {
            errors.push(`Invalid filter operator: ${filter.operator}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = { REPORT_METADATA_SCHEMA, validateReportSchema };
```

---

## 6. Deployment Workflows

### Standard Deployment Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PIPELINE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. LOCAL DEVELOPMENT                                        │
│     └── Create/modify report definition                      │
│     └── Run local validation (schema, syntax)                │
│                                                              │
│  2. SANDBOX VALIDATION                                       │
│     └── Deploy to sandbox (--dry-run first)                  │
│     └── Run full validation against sandbox                  │
│     └── Execute report and verify results                    │
│                                                              │
│  3. UAT TESTING                                              │
│     └── Deploy to UAT environment                            │
│     └── User acceptance testing                              │
│     └── Performance testing with production-like data        │
│                                                              │
│  4. PRODUCTION DEPLOYMENT                                    │
│     └── Change management approval                           │
│     └── Deploy to production                                 │
│     └── Post-deployment verification                         │
│     └── Monitor for issues                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Commands

```bash
# === SANDBOX DEPLOYMENT ===

# Step 1: Dry run (validate without deploying)
sf project deploy start \
    --source-dir force-app/main/default/reports \
    --target-org sandbox \
    --dry-run

# Step 2: Deploy to sandbox
sf project deploy start \
    --source-dir force-app/main/default/reports \
    --target-org sandbox

# Step 3: Verify deployment
sf project deploy report --target-org sandbox

# === PRODUCTION DEPLOYMENT ===

# Step 1: Deploy with test execution (required for production)
sf project deploy start \
    --source-dir force-app/main/default/reports \
    --target-org production \
    --test-level RunLocalTests

# Step 2: Quick deploy if validation passed
sf project deploy quick \
    --job-id <job-id-from-validation> \
    --target-org production
```

### Deployment Manager Script

```javascript
/**
 * Automated Report Deployment Manager
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ReportDeploymentManager {
    constructor(config) {
        this.sandboxOrg = config.sandboxOrg;
        this.productionOrg = config.productionOrg;
        this.sourcePath = config.sourcePath || 'force-app/main/default/reports';
        this.validator = config.validator;
    }

    /**
     * Full deployment workflow
     */
    async deploy(options = {}) {
        const {
            environment = 'sandbox',
            skipValidation = false,
            dryRun = false
        } = options;

        const orgAlias = environment === 'production'
            ? this.productionOrg
            : this.sandboxOrg;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`DEPLOYING TO: ${environment.toUpperCase()}`);
        console.log(`Target Org: ${orgAlias}`);
        console.log(`${'='.repeat(60)}\n`);

        // Step 1: Pre-deployment validation
        if (!skipValidation) {
            console.log('Step 1: Running pre-deployment validation...\n');
            const validationResult = await this.runValidation(orgAlias);

            if (!validationResult.valid) {
                console.error('\n✗ Validation failed. Aborting deployment.');
                return { success: false, stage: 'validation', errors: validationResult.errors };
            }
            console.log('\n✓ Validation passed\n');
        }

        // Step 2: Dry run
        if (!dryRun) {
            console.log('Step 2: Running dry-run deployment...\n');
            const dryRunResult = await this.dryRun(orgAlias);

            if (!dryRunResult.success) {
                console.error('\n✗ Dry run failed. Aborting deployment.');
                return { success: false, stage: 'dryRun', errors: dryRunResult.errors };
            }
            console.log('\n✓ Dry run passed\n');
        }

        // Step 3: Actual deployment
        if (!dryRun) {
            console.log('Step 3: Deploying...\n');
            const deployResult = await this.executeDeploy(orgAlias, environment === 'production');

            if (!deployResult.success) {
                console.error('\n✗ Deployment failed.');
                return { success: false, stage: 'deploy', errors: deployResult.errors };
            }
            console.log('\n✓ Deployment successful\n');
        }

        // Step 4: Post-deployment verification
        if (!dryRun) {
            console.log('Step 4: Running post-deployment verification...\n');
            const verifyResult = await this.verify(orgAlias);

            if (!verifyResult.success) {
                console.warn('\n⚠ Verification warnings detected');
            } else {
                console.log('\n✓ Verification passed\n');
            }
        }

        console.log(`${'='.repeat(60)}`);
        console.log(dryRun ? 'DRY RUN COMPLETE' : 'DEPLOYMENT COMPLETE');
        console.log(`${'='.repeat(60)}\n`);

        return { success: true };
    }

    async runValidation(orgAlias) {
        if (!this.validator) {
            console.log('  ℹ No validator configured, skipping');
            return { valid: true };
        }

        // Find all report definitions
        const reportFiles = this.findReportFiles();
        const errors = [];

        for (const file of reportFiles) {
            console.log(`  Validating: ${path.basename(file)}`);
            try {
                const content = fs.readFileSync(file, 'utf-8');

                // For JSON reports (REST API format)
                if (file.endsWith('.json')) {
                    const result = await this.validator.validate(JSON.parse(content));
                    if (!result.valid) {
                        errors.push({ file, errors: result.errors });
                    }
                }

                // For XML reports (Metadata API format)
                if (file.endsWith('.report-meta.xml')) {
                    // Basic XML validation
                    if (!content.includes('</Report>')) {
                        errors.push({ file, errors: ['Invalid XML structure'] });
                    }
                }
            } catch (error) {
                errors.push({ file, errors: [error.message] });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    async dryRun(orgAlias) {
        try {
            const result = execSync(
                `sf project deploy start --source-dir "${this.sourcePath}" --target-org ${orgAlias} --dry-run --json`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );

            const deployResult = JSON.parse(result);
            return {
                success: deployResult.status === 0,
                result: deployResult
            };
        } catch (error) {
            let errorDetails;
            try {
                errorDetails = JSON.parse(error.stdout || error.message);
            } catch {
                errorDetails = { message: error.message };
            }

            return {
                success: false,
                errors: [errorDetails.message || 'Dry run failed']
            };
        }
    }

    async executeDeploy(orgAlias, isProduction) {
        try {
            let command = `sf project deploy start --source-dir "${this.sourcePath}" --target-org ${orgAlias}`;

            // Production requires test execution
            if (isProduction) {
                command += ' --test-level RunLocalTests';
            }

            command += ' --json';

            const result = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
            const deployResult = JSON.parse(result);

            return {
                success: deployResult.status === 0,
                result: deployResult,
                jobId: deployResult.result?.id
            };
        } catch (error) {
            let errorDetails;
            try {
                errorDetails = JSON.parse(error.stdout || error.message);
            } catch {
                errorDetails = { message: error.message };
            }

            return {
                success: false,
                errors: [errorDetails.message || 'Deployment failed']
            };
        }
    }

    async verify(orgAlias) {
        const warnings = [];

        // Verify reports are accessible
        const reportFiles = this.findReportFiles();

        for (const file of reportFiles) {
            // Extract report name from file
            const reportName = this.extractReportName(file);

            if (reportName) {
                console.log(`  Verifying: ${reportName}`);

                try {
                    // Try to describe the report
                    execSync(
                        `sf api request rest /services/data/v62.0/analytics/reports?q=${encodeURIComponent(reportName)} --target-org ${orgAlias}`,
                        { encoding: 'utf-8', stdio: 'pipe' }
                    );
                } catch {
                    warnings.push(`Could not verify report: ${reportName}`);
                }
            }
        }

        return {
            success: warnings.length === 0,
            warnings
        };
    }

    findReportFiles() {
        const files = [];

        function walk(dir) {
            if (!fs.existsSync(dir)) return;

            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    walk(fullPath);
                } else if (
                    item.endsWith('.report-meta.xml') ||
                    item.endsWith('.json')
                ) {
                    files.push(fullPath);
                }
            }
        }

        walk(this.sourcePath);
        return files;
    }

    extractReportName(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // JSON format
        try {
            const json = JSON.parse(content);
            return json.reportMetadata?.name;
        } catch {
            // XML format
            const match = content.match(/<name>([^<]+)<\/name>/);
            return match ? match[1] : null;
        }
    }
}

module.exports = { ReportDeploymentManager };
```

---

## 7. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy-reports.yml
name: Deploy Reports

on:
  push:
    branches: [main]
    paths:
      - 'force-app/main/default/reports/**'
      - 'force-app/main/default/reportTypes/**'
  pull_request:
    branches: [main]
    paths:
      - 'force-app/main/default/reports/**'
      - 'force-app/main/default/reportTypes/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli

      - name: Authenticate to Sandbox
        run: |
          echo "${{ secrets.SF_JWT_KEY_SANDBOX }}" > server.key
          sf org login jwt \
            --client-id "${{ secrets.SF_CLIENT_ID_SANDBOX }}" \
            --jwt-key-file server.key \
            --username "${{ secrets.SF_USERNAME_SANDBOX }}" \
            --instance-url https://test.salesforce.com \
            --alias sandbox

      - name: Validate Report Definitions
        run: |
          node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-reports.js --org sandbox

      - name: Dry Run Deployment
        run: |
          sf project deploy start \
            --source-dir force-app/main/default/reports \
            --target-org sandbox \
            --dry-run

  deploy-sandbox:
    needs: validate
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli

      - name: Authenticate to Sandbox
        run: |
          echo "${{ secrets.SF_JWT_KEY_SANDBOX }}" > server.key
          sf org login jwt \
            --client-id "${{ secrets.SF_CLIENT_ID_SANDBOX }}" \
            --jwt-key-file server.key \
            --username "${{ secrets.SF_USERNAME_SANDBOX }}" \
            --instance-url https://test.salesforce.com \
            --alias sandbox

      - name: Deploy to Sandbox
        run: |
          sf project deploy start \
            --source-dir force-app/main/default/reports \
            --source-dir force-app/main/default/reportTypes \
            --target-org sandbox

      - name: Verify Deployment
        run: |
          sf project deploy report --target-org sandbox

  deploy-production:
    needs: deploy-sandbox
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli

      - name: Authenticate to Production
        run: |
          echo "${{ secrets.SF_JWT_KEY_PROD }}" > server.key
          sf org login jwt \
            --client-id "${{ secrets.SF_CLIENT_ID_PROD }}" \
            --jwt-key-file server.key \
            --username "${{ secrets.SF_USERNAME_PROD }}" \
            --instance-url https://login.salesforce.com \
            --alias production

      - name: Deploy to Production
        run: |
          sf project deploy start \
            --source-dir force-app/main/default/reports \
            --source-dir force-app/main/default/reportTypes \
            --target-org production \
            --test-level RunLocalTests

      - name: Verify Deployment
        run: |
          sf project deploy report --target-org production
```

### Jenkins Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any

    environment {
        SF_CLIENT_ID_SANDBOX = credentials('sf-client-id-sandbox')
        SF_JWT_KEY_SANDBOX = credentials('sf-jwt-key-sandbox')
        SF_USERNAME_SANDBOX = credentials('sf-username-sandbox')
        SF_CLIENT_ID_PROD = credentials('sf-client-id-prod')
        SF_JWT_KEY_PROD = credentials('sf-jwt-key-prod')
        SF_USERNAME_PROD = credentials('sf-username-prod')
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g @salesforce/cli'
            }
        }

        stage('Validate') {
            steps {
                script {
                    // Authenticate to sandbox
                    writeFile file: 'server.key', text: env.SF_JWT_KEY_SANDBOX
                    sh '''
                        sf org login jwt \
                            --client-id "${SF_CLIENT_ID_SANDBOX}" \
                            --jwt-key-file server.key \
                            --username "${SF_USERNAME_SANDBOX}" \
                            --instance-url https://test.salesforce.com \
                            --alias sandbox
                    '''

                    // Run validation
                    sh 'node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validate-reports.js --org sandbox'

                    // Dry run
                    sh '''
                        sf project deploy start \
                            --source-dir force-app/main/default/reports \
                            --target-org sandbox \
                            --dry-run
                    '''
                }
            }
        }

        stage('Deploy to Sandbox') {
            when {
                branch 'develop'
            }
            steps {
                sh '''
                    sf project deploy start \
                        --source-dir force-app/main/default/reports \
                        --source-dir force-app/main/default/reportTypes \
                        --target-org sandbox
                '''
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                input message: 'Deploy to production?', ok: 'Deploy'

                script {
                    writeFile file: 'server.key', text: env.SF_JWT_KEY_PROD
                    sh '''
                        sf org login jwt \
                            --client-id "${SF_CLIENT_ID_PROD}" \
                            --jwt-key-file server.key \
                            --username "${SF_USERNAME_PROD}" \
                            --instance-url https://login.salesforce.com \
                            --alias production
                    '''

                    sh '''
                        sf project deploy start \
                            --source-dir force-app/main/default/reports \
                            --source-dir force-app/main/default/reportTypes \
                            --target-org production \
                            --test-level RunLocalTests
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        failure {
            slackSend channel: '#deployments',
                      color: 'danger',
                      message: "Report deployment failed: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        }
        success {
            slackSend channel: '#deployments',
                      color: 'good',
                      message: "Report deployment successful: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
        }
    }
}
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Validate report definitions before commit
echo "Running report validation..."

# Find modified report files
REPORT_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(report-meta\.xml|json)$')

if [ -z "$REPORT_FILES" ]; then
    echo "No report files to validate"
    exit 0
fi

# Run validation
for file in $REPORT_FILES; do
    echo "Validating: $file"

    if [[ $file == *.json ]]; then
        # JSON validation
        node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/quick-validate-report.js "$file"
        if [ $? -ne 0 ]; then
            echo "Validation failed for: $file"
            exit 1
        fi
    fi

    if [[ $file == *.report-meta.xml ]]; then
        # XML validation
        xmllint --noout "$file" 2>/dev/null
        if [ $? -ne 0 ]; then
            echo "Invalid XML in: $file"
            exit 1
        fi
    fi
done

echo "All reports validated successfully"
exit 0
```

---

## 8. Rollback Strategies

### Rollback Options

| Scenario | Rollback Method | Command |
|----------|-----------------|---------|
| Deploy failed | Automatic (no change applied) | N/A |
| Report has bugs | Deploy previous version | `sf project deploy` with old version |
| Performance issues | Delete and recreate | Delete via API, redeploy |
| Need quick revert | Disable report folder access | Change folder permissions |

### Rollback Script

```javascript
/**
 * Report Rollback Manager
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ReportRollbackManager {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.backupDir = '.report-backups';
    }

    /**
     * Create backup before deployment
     */
    async createBackup(reportName) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.backupDir, `${reportName}_${timestamp}.json`);

        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        try {
            // Get current report definition
            const query = `SELECT Id FROM Report WHERE DeveloperName = '${reportName}'`;
            const result = JSON.parse(execSync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            ));

            if (result.result.records.length > 0) {
                const reportId = result.result.records[0].Id;

                // Get full report metadata
                const reportData = JSON.parse(execSync(
                    `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/describe --target-org ${this.orgAlias}`,
                    { encoding: 'utf-8' }
                ));

                // Save backup
                fs.writeFileSync(backupPath, JSON.stringify(reportData, null, 2));
                console.log(`Backup created: ${backupPath}`);

                return backupPath;
            }

            console.log('No existing report to backup');
            return null;
        } catch (error) {
            console.warn(`Could not create backup: ${error.message}`);
            return null;
        }
    }

    /**
     * Rollback to previous version
     */
    async rollback(reportName, backupPath = null) {
        // Find backup file
        if (!backupPath) {
            backupPath = this.findLatestBackup(reportName);
        }

        if (!backupPath || !fs.existsSync(backupPath)) {
            throw new Error(`No backup found for report: ${reportName}`);
        }

        console.log(`Rolling back ${reportName} from: ${backupPath}`);

        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

        // Get current report ID
        const query = `SELECT Id FROM Report WHERE DeveloperName = '${reportName}'`;
        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        if (result.result.records.length > 0) {
            const reportId = result.result.records[0].Id;

            // Update report with backup data
            const updatePayload = {
                reportMetadata: backupData.reportMetadata
            };

            execSync(
                `sf api request rest /services/data/v62.0/analytics/reports/${reportId} --method PATCH --body '${JSON.stringify(updatePayload)}' --target-org ${this.orgAlias}`,
                { encoding: 'utf-8' }
            );

            console.log(`Successfully rolled back: ${reportName}`);
            return true;
        }

        throw new Error(`Report not found: ${reportName}`);
    }

    /**
     * Find latest backup for a report
     */
    findLatestBackup(reportName) {
        if (!fs.existsSync(this.backupDir)) {
            return null;
        }

        const backups = fs.readdirSync(this.backupDir)
            .filter(f => f.startsWith(`${reportName}_`))
            .sort()
            .reverse();

        if (backups.length > 0) {
            return path.join(this.backupDir, backups[0]);
        }

        return null;
    }

    /**
     * List all available backups
     */
    listBackups() {
        if (!fs.existsSync(this.backupDir)) {
            return [];
        }

        return fs.readdirSync(this.backupDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const parts = f.replace('.json', '').split('_');
                const timestamp = parts.pop();
                const reportName = parts.join('_');

                return {
                    file: f,
                    path: path.join(this.backupDir, f),
                    reportName,
                    timestamp
                };
            })
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    /**
     * Delete a report (for complete rollback)
     */
    async deleteReport(reportName) {
        const query = `SELECT Id FROM Report WHERE DeveloperName = '${reportName}'`;
        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        if (result.result.records.length > 0) {
            const reportId = result.result.records[0].Id;

            execSync(
                `sf api request rest /services/data/v62.0/analytics/reports/${reportId} --method DELETE --target-org ${this.orgAlias}`,
                { encoding: 'utf-8' }
            );

            console.log(`Deleted report: ${reportName}`);
            return true;
        }

        throw new Error(`Report not found: ${reportName}`);
    }

    /**
     * Clean old backups (keep last N)
     */
    cleanOldBackups(keepCount = 10) {
        const backups = this.listBackups();

        // Group by report name
        const byReport = {};
        for (const backup of backups) {
            if (!byReport[backup.reportName]) {
                byReport[backup.reportName] = [];
            }
            byReport[backup.reportName].push(backup);
        }

        // Delete old backups
        let deleted = 0;
        for (const [reportName, reportBackups] of Object.entries(byReport)) {
            const toDelete = reportBackups.slice(keepCount);
            for (const backup of toDelete) {
                fs.unlinkSync(backup.path);
                deleted++;
            }
        }

        console.log(`Cleaned ${deleted} old backups`);
        return deleted;
    }
}

module.exports = { ReportRollbackManager };
```

---

## 9. Version Control Best Practices

### Directory Structure

```
force-app/
└── main/
    └── default/
        ├── reports/
        │   ├── Public_Reports/
        │   │   ├── Sales_Reports/
        │   │   │   ├── Pipeline_Overview.report-meta.xml
        │   │   │   └── Win_Rate_Analysis.report-meta.xml
        │   │   └── Marketing_Reports/
        │   │       └── Campaign_Performance.report-meta.xml
        │   └── Private_Reports/
        │       └── .gitkeep
        └── reportTypes/
            ├── Accounts_with_Subscriptions.reportType-meta.xml
            └── Opportunities_with_Products.reportType-meta.xml
```

### .gitignore for Reports

```gitignore
# Ignore private reports (user-specific)
force-app/main/default/reports/unfiled$public/

# Ignore auto-generated report metadata
*.report-meta.xml.bak

# Ignore local backup directory
.report-backups/

# Ignore temporary validation files
.report-validation/
```

### Commit Message Convention

```bash
# Format: [type](scope): description

# Types for reports:
# - feat: New report or report type
# - fix: Report bug fix
# - refactor: Report restructure (no behavior change)
# - perf: Performance optimization
# - docs: Documentation only

# Examples:
git commit -m "feat(reports): Add Pipeline by Stage report"
git commit -m "fix(reports): Correct filter logic in Win Rate report"
git commit -m "refactor(reportTypes): Reorganize Subscription report type fields"
git commit -m "perf(reports): Add date filter to reduce data volume"
```

### Branch Strategy

```
main                    # Production-deployed reports
├── develop             # Integration branch
│   ├── feature/report-x  # New report development
│   ├── fix/report-y      # Report fixes
│   └── refactor/reports  # Report restructuring
```

### Pull Request Template

```markdown
## Report Changes

### Reports Modified/Created
- [ ] Report Name: `_______________`
- [ ] Report Type: `_______________`
- [ ] Report Format: `TABULAR / SUMMARY / MATRIX / JOINED`

### Checklist
- [ ] Pre-deployment validation passed
- [ ] Tested in sandbox
- [ ] No sensitive data exposure
- [ ] Performance tested (row counts acceptable)
- [ ] FLS/sharing verified for target users
- [ ] Backup created of existing report (if modifying)

### Row Count Estimate
- Expected rows: `_______________`
- Date filter applied: Yes / No
- Format-specific limit checked: Yes / No

### Testing Evidence
- [ ] Screenshot of report execution
- [ ] Row count confirmation
- [ ] Performance acceptable (< 30 seconds)

### Rollback Plan
If issues occur:
1. `_______________`
2. `_______________`
```

---

## 10. Environment Management

### Environment Configuration

```javascript
/**
 * Environment configuration for report deployments
 */
const ENVIRONMENTS = {
    development: {
        orgAlias: 'dev-sandbox',
        type: 'sandbox',
        validationLevel: 'basic',
        autoBackup: false
    },
    qa: {
        orgAlias: 'qa-sandbox',
        type: 'sandbox',
        validationLevel: 'full',
        autoBackup: true
    },
    uat: {
        orgAlias: 'uat-sandbox',
        type: 'sandbox',
        validationLevel: 'full',
        autoBackup: true,
        requireApproval: true
    },
    production: {
        orgAlias: 'production',
        type: 'production',
        validationLevel: 'strict',
        autoBackup: true,
        requireApproval: true,
        testLevel: 'RunLocalTests'
    }
};

/**
 * Get deployment configuration for environment
 */
function getDeployConfig(environment) {
    const config = ENVIRONMENTS[environment];

    if (!config) {
        throw new Error(`Unknown environment: ${environment}`);
    }

    return {
        ...config,
        deployCommand: buildDeployCommand(config)
    };
}

function buildDeployCommand(config) {
    let cmd = `sf project deploy start --target-org ${config.orgAlias}`;

    if (config.type === 'production') {
        cmd += ` --test-level ${config.testLevel || 'RunLocalTests'}`;
    }

    return cmd;
}

module.exports = { ENVIRONMENTS, getDeployConfig };
```

### Cross-Environment Report Promotion

```javascript
/**
 * Promote reports across environments
 */
class ReportPromoter {
    constructor() {
        this.environments = ['development', 'qa', 'uat', 'production'];
    }

    /**
     * Promote report to next environment
     */
    async promote(reportPath, currentEnv) {
        const currentIndex = this.environments.indexOf(currentEnv);

        if (currentIndex === -1) {
            throw new Error(`Invalid environment: ${currentEnv}`);
        }

        if (currentIndex === this.environments.length - 1) {
            throw new Error('Already in production, cannot promote further');
        }

        const nextEnv = this.environments[currentIndex + 1];
        console.log(`Promoting from ${currentEnv} to ${nextEnv}`);

        const { getDeployConfig } = require('./env-config');
        const config = getDeployConfig(nextEnv);

        // Check if approval required
        if (config.requireApproval) {
            console.log('This promotion requires approval.');
            const approved = await this.requestApproval(reportPath, nextEnv);
            if (!approved) {
                throw new Error('Promotion not approved');
            }
        }

        // Create backup in target environment
        if (config.autoBackup) {
            const { ReportRollbackManager } = require('./rollback');
            const rollback = new ReportRollbackManager(config.orgAlias);
            await rollback.createBackup(this.extractReportName(reportPath));
        }

        // Deploy
        const { execSync } = require('child_process');
        execSync(
            `${config.deployCommand} --source-dir "${reportPath}"`,
            { stdio: 'inherit' }
        );

        console.log(`Successfully promoted to ${nextEnv}`);
        return true;
    }

    async requestApproval(reportPath, targetEnv) {
        // In production, this would integrate with an approval system
        console.log(`Approval requested for deploying to ${targetEnv}`);
        return true; // Placeholder
    }

    extractReportName(reportPath) {
        const fs = require('fs');
        const content = fs.readFileSync(reportPath, 'utf-8');

        try {
            const json = JSON.parse(content);
            return json.reportMetadata?.name;
        } catch {
            const match = content.match(/<name>([^<]+)<\/name>/);
            return match ? match[1] : 'unknown';
        }
    }
}

module.exports = { ReportPromoter };
```

---

## 11. Deployment Automation Scripts

### Complete Deployment Script

```javascript
#!/usr/bin/env node

/**
 * Report Deployment CLI
 * Usage: node deploy-reports.js [options]
 */

const { program } = require('commander');
const { ReportPreDeploymentValidator } = require('./validation/pre-deployment');
const { ReportDeploymentManager } = require('./deployment/manager');
const { ReportRollbackManager } = require('./deployment/rollback');
const { getDeployConfig } = require('./env-config');

program
    .name('deploy-reports')
    .description('Deploy Salesforce reports with validation')
    .version('1.0.0');

program
    .command('validate')
    .description('Validate report definitions')
    .option('-o, --org <alias>', 'Org alias for validation', 'sandbox')
    .option('-p, --path <path>', 'Path to reports', 'force-app/main/default/reports')
    .action(async (options) => {
        const validator = new ReportPreDeploymentValidator(options.org);

        const fs = require('fs');
        const path = require('path');

        function findReports(dir) {
            const files = [];
            for (const item of fs.readdirSync(dir)) {
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    files.push(...findReports(fullPath));
                } else if (item.endsWith('.json')) {
                    files.push(fullPath);
                }
            }
            return files;
        }

        const reports = findReports(options.path);
        let allValid = true;

        for (const reportPath of reports) {
            console.log(`\nValidating: ${reportPath}`);
            const content = fs.readFileSync(reportPath, 'utf-8');
            const result = await validator.validate(JSON.parse(content));

            if (!result.valid) {
                allValid = false;
            }
        }

        process.exit(allValid ? 0 : 1);
    });

program
    .command('deploy')
    .description('Deploy reports to target org')
    .requiredOption('-e, --env <environment>', 'Target environment (development, qa, uat, production)')
    .option('-p, --path <path>', 'Path to reports', 'force-app/main/default/reports')
    .option('--skip-validation', 'Skip pre-deployment validation')
    .option('--dry-run', 'Perform dry run only')
    .action(async (options) => {
        const config = getDeployConfig(options.env);

        const validator = options.skipValidation
            ? null
            : new ReportPreDeploymentValidator(config.orgAlias);

        const deployer = new ReportDeploymentManager({
            sandboxOrg: config.type === 'sandbox' ? config.orgAlias : null,
            productionOrg: config.type === 'production' ? config.orgAlias : null,
            sourcePath: options.path,
            validator
        });

        const result = await deployer.deploy({
            environment: options.env,
            skipValidation: options.skipValidation,
            dryRun: options.dryRun
        });

        process.exit(result.success ? 0 : 1);
    });

program
    .command('rollback')
    .description('Rollback a report to previous version')
    .requiredOption('-n, --name <name>', 'Report developer name')
    .requiredOption('-o, --org <alias>', 'Org alias')
    .option('-b, --backup <path>', 'Specific backup file to use')
    .action(async (options) => {
        const rollback = new ReportRollbackManager(options.org);

        try {
            await rollback.rollback(options.name, options.backup);
            console.log('Rollback successful');
            process.exit(0);
        } catch (error) {
            console.error(`Rollback failed: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('backup')
    .description('Create backup of a report')
    .requiredOption('-n, --name <name>', 'Report developer name')
    .requiredOption('-o, --org <alias>', 'Org alias')
    .action(async (options) => {
        const rollback = new ReportRollbackManager(options.org);

        try {
            const backupPath = await rollback.createBackup(options.name);
            if (backupPath) {
                console.log(`Backup created: ${backupPath}`);
            }
            process.exit(0);
        } catch (error) {
            console.error(`Backup failed: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('list-backups')
    .description('List available backups')
    .action(() => {
        const rollback = new ReportRollbackManager('');
        const backups = rollback.listBackups();

        if (backups.length === 0) {
            console.log('No backups found');
            return;
        }

        console.log('\nAvailable Backups:');
        console.log('-'.repeat(60));

        for (const backup of backups) {
            console.log(`${backup.reportName} - ${backup.timestamp}`);
            console.log(`  Path: ${backup.path}`);
        }
    });

program.parse();
```

### MCP Integration Script

```javascript
/**
 * Deploy reports using MCP tools
 */
async function deployReportWithMCP(reportDefinition, orgAlias) {
    const report = typeof reportDefinition === 'string'
        ? JSON.parse(reportDefinition)
        : reportDefinition;

    console.log(`Deploying report: ${report.reportMetadata.name}`);

    // Use MCP tool for report creation
    // mcp_salesforce_report_create

    const { execSync } = require('child_process');

    // Prepare the report metadata
    const payload = JSON.stringify(report);

    // Create the report via REST API
    const result = execSync(
        `sf api request rest /services/data/v62.0/analytics/reports --method POST --body '${payload.replace(/'/g, "\\'")}' --target-org ${orgAlias}`,
        { encoding: 'utf-8' }
    );

    const response = JSON.parse(result);

    if (response.reportMetadata?.id) {
        console.log(`Report created: ${response.reportMetadata.id}`);
        return {
            success: true,
            reportId: response.reportMetadata.id
        };
    }

    return { success: false, error: 'Unknown error' };
}

module.exports = { deployReportWithMCP };
```

---

## 12. Quick Reference

### Validation Checklist

```
PRE-DEPLOYMENT CHECKLIST
========================

□ Schema Validation
  □ Report type exists in target org
  □ All fields exist and are accessible
  □ All filter columns exist
  □ All grouping fields exist

□ Syntax Validation
  □ Valid JSON/XML structure
  □ Report format is valid (TABULAR/SUMMARY/MATRIX/MULTI_BLOCK)
  □ Filter operators are valid
  □ Date literals are correct

□ Logic Validation
  □ Groupings match format (no groupings for TABULAR)
  □ Grouping counts within limits (3 row, 2 column)
  □ Aggregates use correct field types
  □ Formulas have balanced parentheses

□ Security Validation
  □ FLS allows access to all fields
  □ Sharing rules allow access to records
  □ Report folder permissions set

□ Performance Validation
  □ Date filter present (or justified absence)
  □ Row count estimated and acceptable
  □ SUMMARY format 2,000-row limit considered
```

### Deployment Commands

```bash
# Validate before deploy
sf project deploy start --source-dir ./reports --target-org sandbox --dry-run

# Deploy to sandbox
sf project deploy start --source-dir ./reports --target-org sandbox

# Deploy to production
sf project deploy start --source-dir ./reports --target-org production --test-level RunLocalTests

# Check deployment status
sf project deploy report --target-org sandbox

# Retrieve existing reports
sf project retrieve start --metadata "Report:My_Report" --target-org sandbox
```

### Error Recovery

| Error | Quick Fix |
|-------|-----------|
| Field not found | Verify field API name with `sf sobject describe` |
| Report type not found | Deploy report type first, or check API name |
| Invalid filter operator | Use: equals, notEqual, lessThan, greaterThan, contains |
| Grouping limit exceeded | Reduce to max 3 rows, 2 columns |
| Deployment failed | Check `sf project deploy report` for details |

### Key Files

```
scripts/
├── validate-reports.js       # Pre-deployment validation
├── deploy-reports.js         # Deployment CLI
├── rollback.js              # Rollback management
└── env-config.js            # Environment configuration

force-app/main/default/
├── reports/                 # Report definitions
└── reportTypes/             # Custom report types
```

---

## Related Runbooks

- **[01-report-formats-fundamentals.md](./01-report-formats-fundamentals.md)** - Format selection
- **[07-custom-report-types.md](./07-custom-report-types.md)** - Creating report types
- **[09-troubleshooting-optimization.md](./09-troubleshooting-optimization.md)** - Error resolution

---

**Version**: 1.0.0
**Last Updated**: 2025-11-26
**Maintainer**: Salesforce Plugin Team
**Feedback**: Submit issues via reflection system
