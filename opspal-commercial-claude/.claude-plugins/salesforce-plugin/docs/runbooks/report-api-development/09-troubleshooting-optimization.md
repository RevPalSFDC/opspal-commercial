# Runbook 09: Troubleshooting and Optimization

> **Series**: Report API Development Runbooks
> **Document**: 09 of 09
> **Focus**: Error Resolution, Performance Optimization, Debug Techniques
> **Complexity**: All Levels
> **Prerequisites**: Runbooks 01-08 (Complete Report Development Knowledge)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Common Errors and Solutions](#2-common-errors-and-solutions)
3. [API-Specific Errors](#3-api-specific-errors)
4. [Performance Optimization](#4-performance-optimization)
5. [Row Count and Data Volume](#5-row-count-and-data-volume)
6. [Debug Techniques](#6-debug-techniques)
7. [API Limits and Quotas](#7-api-limits-and-quotas)
8. [Format-Specific Issues](#8-format-specific-issues)
9. [Joined Report Troubleshooting](#9-joined-report-troubleshooting)
10. [Security and Access Issues](#10-security-and-access-issues)
11. [Diagnostic Scripts](#11-diagnostic-scripts)
12. [Quick Reference](#12-quick-reference)

---

## 1. Overview

### Troubleshooting Philosophy

```
DIAGNOSTIC APPROACH
===================

1. IDENTIFY → What error message or symptom?
2. ISOLATE  → Which component is failing?
3. DIAGNOSE → What is the root cause?
4. FIX      → Apply targeted solution
5. VERIFY   → Confirm fix works
6. DOCUMENT → Update runbook if new issue
```

### Error Categories

| Category | Examples | Typical Causes |
|----------|----------|----------------|
| Schema | Field not found, Invalid report type | Missing metadata, wrong API names |
| Syntax | Invalid JSON, Malformed XML | Typos, encoding issues |
| Logic | No data returned, Wrong aggregates | Filter issues, formula errors |
| Security | Insufficient privileges, FLS block | Permission gaps |
| Performance | Timeout, Too many rows | Data volume, missing indexes |
| Limits | API quota exceeded, Row limit | System constraints |

---

## 2. Common Errors and Solutions

### Error Reference Table

| Error | Cause | Solution |
|-------|-------|----------|
| `INVALID_FIELD` | Field doesn't exist or wrong API name | Verify field name with `sf sobject describe` |
| `INVALID_TYPE` | Report type not found | Check report type API name, deploy if custom |
| `MALFORMED_QUERY` | Invalid filter/grouping syntax | Review filter operators, check field types |
| `INSUFFICIENT_ACCESS` | FLS or sharing block | Check profile/permission set |
| `REQUEST_LIMIT_EXCEEDED` | API quota exhausted | Implement caching, reduce calls |
| `QUERY_TIMEOUT` | Report takes too long | Add filters, reduce scope |
| `TOO_MANY_ROWS` | Exceeds row limit | Add filters, use async |

### Field-Related Errors

**Error: `INVALID_FIELD: ACCOUNT_ID`**

```javascript
// ❌ WRONG: Using label or wrong case
{
    "detailColumns": ["Account_ID", "account_id", "AccountId"]
}

// ✅ CORRECT: Use exact API name from report type describe
{
    "detailColumns": ["ACCOUNT_ID"]
}

// How to find correct field name:
async function getCorrectFieldName(orgAlias, reportType, searchTerm) {
    const { execSync } = require('child_process');

    const result = JSON.parse(execSync(
        `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportType} --target-org ${orgAlias}`,
        { encoding: 'utf-8' }
    ));

    const columns = result.reportExtendedMetadata?.detailColumnInfo || {};

    // Search by partial match
    const matches = Object.entries(columns)
        .filter(([key, info]) =>
            key.toLowerCase().includes(searchTerm.toLowerCase()) ||
            info.label.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .map(([key, info]) => ({ apiName: key, label: info.label }));

    return matches;
}
```

**Error: `Field "CustomField__c" not found`**

```bash
# Step 1: Verify field exists on object
sf sobject describe Account --target-org sandbox | grep -i "customfield"

# Step 2: Check field visibility in report type
sf api request rest /services/data/v62.0/analytics/reportTypes/AccountOpportunity --target-org sandbox | jq '.reportExtendedMetadata.detailColumnInfo | keys[]' | grep -i "custom"

# Step 3: If field exists but not in report type, it may need:
# - Adding to the custom report type layout
# - FLS permissions for running user
```

### Report Type Errors

**Error: `Report type "CustomReportType" not found`**

```javascript
// Diagnostic script
async function diagnoseReportType(orgAlias, reportTypeName) {
    const { execSync } = require('child_process');

    console.log(`Diagnosing report type: ${reportTypeName}\n`);

    // Check 1: Does it exist in Tooling API?
    try {
        const query = `SELECT DeveloperName, MasterLabel, IsActive FROM ReportType WHERE DeveloperName = '${reportTypeName}'`;
        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --use-tooling-api --target-org ${orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        if (result.result.records.length > 0) {
            const rt = result.result.records[0];
            console.log('✓ Report type exists in Tooling API');
            console.log(`  Label: ${rt.MasterLabel}`);
            console.log(`  Active: ${rt.IsActive}`);

            if (!rt.IsActive) {
                console.log('\n⚠ Report type is INACTIVE!');
                console.log('  Solution: Set <deployed>true</deployed> in metadata');
            }
        } else {
            console.log('✗ Report type NOT found in Tooling API');
            console.log('  Solution: Deploy the report type first');
        }
    } catch (error) {
        console.log(`✗ Query failed: ${error.message}`);
    }

    // Check 2: Can we describe via REST?
    try {
        execSync(
            `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${orgAlias}`,
            { encoding: 'utf-8', stdio: 'pipe' }
        );
        console.log('✓ Report type accessible via REST API');
    } catch {
        console.log('✗ Report type NOT accessible via REST API');
        console.log('  May need to be deployed or user lacks access');
    }

    // Check 3: Search for similar names
    try {
        const searchQuery = `SELECT DeveloperName, MasterLabel FROM ReportType WHERE DeveloperName LIKE '%${reportTypeName.substring(0, 10)}%'`;
        const searchResult = JSON.parse(execSync(
            `sf data query --query "${searchQuery}" --use-tooling-api --target-org ${orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        if (searchResult.result.records.length > 0) {
            console.log('\nSimilar report types found:');
            for (const rt of searchResult.result.records) {
                console.log(`  - ${rt.DeveloperName} (${rt.MasterLabel})`);
            }
        }
    } catch {
        // Ignore search errors
    }
}
```

### Filter Errors

**Error: `Invalid operator for field type`**

```javascript
// Operator compatibility matrix
const OPERATOR_FIELD_COMPATIBILITY = {
    // String operators
    'contains': ['string', 'textarea', 'email', 'url', 'phone', 'picklist'],
    'notContain': ['string', 'textarea', 'email', 'url', 'phone', 'picklist'],
    'startsWith': ['string', 'textarea', 'email', 'url', 'phone'],

    // Comparison operators (numeric/date)
    'lessThan': ['currency', 'double', 'int', 'percent', 'date', 'datetime'],
    'greaterThan': ['currency', 'double', 'int', 'percent', 'date', 'datetime'],
    'lessOrEqual': ['currency', 'double', 'int', 'percent', 'date', 'datetime'],
    'greaterOrEqual': ['currency', 'double', 'int', 'percent', 'date', 'datetime'],

    // Universal operators
    'equals': ['all'],
    'notEqual': ['all'],

    // Multi-value operators
    'includes': ['multipicklist'],
    'excludes': ['multipicklist']
};

function validateOperatorForField(operator, fieldType) {
    const allowedTypes = OPERATOR_FIELD_COMPATIBILITY[operator];

    if (!allowedTypes) {
        return { valid: false, error: `Unknown operator: ${operator}` };
    }

    if (allowedTypes.includes('all') || allowedTypes.includes(fieldType)) {
        return { valid: true };
    }

    return {
        valid: false,
        error: `Operator '${operator}' not compatible with field type '${fieldType}'`,
        suggestion: `Use: ${Object.keys(OPERATOR_FIELD_COMPATIBILITY)
            .filter(op => {
                const types = OPERATOR_FIELD_COMPATIBILITY[op];
                return types.includes('all') || types.includes(fieldType);
            })
            .join(', ')}`
    };
}
```

**Error: `Invalid date literal`**

```javascript
// Valid date literals reference
const VALID_DATE_LITERALS = {
    // Exact
    'TODAY': 'Current date',
    'YESTERDAY': 'Previous day',
    'TOMORROW': 'Next day',

    // This period
    'THIS_WEEK': 'Current week',
    'THIS_MONTH': 'Current month',
    'THIS_QUARTER': 'Current quarter',
    'THIS_YEAR': 'Current year',
    'THIS_FISCAL_QUARTER': 'Current fiscal quarter',
    'THIS_FISCAL_YEAR': 'Current fiscal year',

    // Last period
    'LAST_WEEK': 'Previous week',
    'LAST_MONTH': 'Previous month',
    'LAST_QUARTER': 'Previous quarter',
    'LAST_YEAR': 'Previous year',
    'LAST_FISCAL_QUARTER': 'Previous fiscal quarter',
    'LAST_FISCAL_YEAR': 'Previous fiscal year',

    // Next period
    'NEXT_WEEK': 'Next week',
    'NEXT_MONTH': 'Next month',
    'NEXT_QUARTER': 'Next quarter',
    'NEXT_YEAR': 'Next year',
    'NEXT_FISCAL_QUARTER': 'Next fiscal quarter',
    'NEXT_FISCAL_YEAR': 'Next fiscal year',

    // Rolling
    'LAST_90_DAYS': 'Past 90 days',
    'NEXT_90_DAYS': 'Next 90 days',

    // N-based (require :N suffix)
    'LAST_N_DAYS:N': 'Past N days (e.g., LAST_N_DAYS:30)',
    'NEXT_N_DAYS:N': 'Next N days',
    'LAST_N_WEEKS:N': 'Past N weeks',
    'NEXT_N_WEEKS:N': 'Next N weeks',
    'LAST_N_MONTHS:N': 'Past N months',
    'NEXT_N_MONTHS:N': 'Next N months',
    'LAST_N_QUARTERS:N': 'Past N quarters',
    'NEXT_N_QUARTERS:N': 'Next N quarters',
    'LAST_N_YEARS:N': 'Past N years',
    'NEXT_N_YEARS:N': 'Next N years'
};

function validateDateLiteral(value) {
    // Check exact match
    if (VALID_DATE_LITERALS[value]) {
        return { valid: true };
    }

    // Check N-based patterns
    const nPatterns = [
        /^LAST_N_DAYS:\d+$/,
        /^NEXT_N_DAYS:\d+$/,
        /^LAST_N_WEEKS:\d+$/,
        /^NEXT_N_WEEKS:\d+$/,
        /^LAST_N_MONTHS:\d+$/,
        /^NEXT_N_MONTHS:\d+$/,
        /^LAST_N_QUARTERS:\d+$/,
        /^NEXT_N_QUARTERS:\d+$/,
        /^LAST_N_YEARS:\d+$/,
        /^NEXT_N_YEARS:\d+$/
    ];

    if (nPatterns.some(p => p.test(value))) {
        return { valid: true };
    }

    // Check ISO date format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { valid: true };
    }

    return {
        valid: false,
        error: `Invalid date literal: ${value}`,
        suggestion: 'Use YYYY-MM-DD format or a relative literal like TODAY, LAST_30_DAYS, etc.'
    };
}
```

---

## 3. API-Specific Errors

### REST API Errors

**Error: `{"errorCode":"NOT_FOUND","message":"The requested resource does not exist"}`**

```javascript
// Common causes and solutions
const REST_API_NOT_FOUND_CAUSES = {
    '/analytics/reports/{id}': {
        cause: 'Report ID does not exist or user lacks access',
        solutions: [
            'Verify report ID is correct (18-character)',
            'Check user has access to report folder',
            'Report may have been deleted'
        ]
    },
    '/analytics/reportTypes/{name}': {
        cause: 'Report type does not exist or is not deployed',
        solutions: [
            'Check DeveloperName spelling',
            'Verify report type is deployed (not just saved)',
            'Custom report types need metadata deployment'
        ]
    },
    '/analytics/reports/{id}/instances': {
        cause: 'Report execution instance not found',
        solutions: [
            'Instance ID may have expired',
            'Report may have been modified since instance created'
        ]
    }
};
```

**Error: `{"errorCode":"INVALID_REPORT_TYPE"}`**

```bash
# Diagnostic steps
# 1. List all report types to find correct name
sf api request rest /services/data/v62.0/analytics/reportTypes --target-org sandbox | jq '.reportTypes[] | .name' | head -20

# 2. Search for specific report type
sf data query --query "SELECT DeveloperName, MasterLabel FROM ReportType WHERE DeveloperName LIKE '%Account%'" --use-tooling-api --target-org sandbox
```

**Error: `{"errorCode":"EXCEEDED_ID_LIMIT"}`**

```javascript
// This occurs when filtering with too many IDs
// Solution: Batch the IDs or use different filter approach

// ❌ WRONG: Too many IDs in filter
{
    "reportFilters": [{
        "column": "ACCOUNT_ID",
        "operator": "equals",
        "value": "001xxx,001yyy,001zzz..." // 2000+ IDs
    }]
}

// ✅ CORRECT: Use a different approach
// Option 1: Use report type that joins to a filtered object
// Option 2: Create multiple reports for ID batches
// Option 3: Use async report execution with chunking

async function runReportWithManyIds(orgAlias, reportId, ids, chunkSize = 200) {
    const results = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);

        const reportPayload = {
            reportMetadata: {
                reportFilters: [{
                    column: 'ACCOUNT_ID',
                    operator: 'equals',
                    value: chunk.join(',')
                }]
            }
        };

        const result = await executeReport(orgAlias, reportId, reportPayload);
        results.push(...(result.factMap?.['T!T']?.rows || []));
    }

    return results;
}
```

### Metadata API Errors

**Error: `Cannot find entity 'Report'`**

```bash
# Ensure correct API version supports Report metadata
# Reports are supported from API v20.0+

# Check your Salesforce project config
cat sfdx-project.json | jq '.sourceApiVersion'

# Should be at least 20.0, recommend 58.0+
```

**Error: `Required field is missing: name`**

```xml
<!-- Common missing required fields in report XML -->

<!-- ❌ MISSING name -->
<Report>
    <format>Summary</format>
</Report>

<!-- ✅ CORRECT -->
<Report>
    <name>My Report Name</name>
    <format>Summary</format>
</Report>

<!-- Required fields for Report metadata:
     - name (string, max 40 chars)
     - format (Tabular, Summary, Matrix, MultiBlock)
     - reportType (API name of report type)
-->
```

**Error: `Invalid cross reference id`**

```bash
# This usually means the referenced folder doesn't exist

# List available report folders
sf data query --query "SELECT DeveloperName, Name FROM Folder WHERE Type = 'Report'" --target-org sandbox

# Common issue: Folder must exist before deploying report to it
# Solution: Deploy folder first, then report
```

---

## 4. Performance Optimization

### Query Optimization

```javascript
/**
 * Report performance optimization guide
 */
const PERFORMANCE_OPTIMIZATIONS = {
    // Add indexed field filters
    indexedFilters: {
        description: 'Filter on indexed fields for faster queries',
        fields: ['Id', 'Name', 'OwnerId', 'CreatedDate', 'LastModifiedDate', 'RecordTypeId'],
        example: {
            reportFilters: [{
                column: 'CREATED_DATE',
                operator: 'greaterOrEqual',
                value: 'LAST_90_DAYS'
            }]
        }
    },

    // Reduce column count
    columnReduction: {
        description: 'Fewer columns = faster execution',
        recommendation: 'Only include columns needed for report output',
        maxRecommended: 15
    },

    // Limit scope
    scopeReduction: {
        description: 'Narrower scope = faster query',
        options: {
            'user': 'My records only',
            'team': 'My team records',
            'organization': 'All records (slowest)'
        }
    },

    // Use standard date filter
    standardDateFilter: {
        description: 'Pre-built date filter is optimized',
        example: {
            standardDateFilter: {
                column: 'CREATED_DATE',
                durationValue: 'LAST_N_DAYS:30'
            }
        }
    }
};

/**
 * Analyze report for performance issues
 */
function analyzeReportPerformance(reportDefinition) {
    const issues = [];
    const suggestions = [];
    const rm = reportDefinition.reportMetadata;

    // Check 1: No date filter
    const hasDateFilter = rm.reportFilters?.some(f =>
        f.column?.toLowerCase().includes('date') ||
        f.column?.toLowerCase().includes('created') ||
        f.column?.toLowerCase().includes('modified')
    ) || rm.standardDateFilter;

    if (!hasDateFilter) {
        issues.push({
            severity: 'high',
            issue: 'No date filter',
            impact: 'May scan entire table',
            suggestion: 'Add standardDateFilter or filter on CREATED_DATE'
        });
    }

    // Check 2: Too many columns
    const columnCount = (rm.detailColumns || []).length;
    if (columnCount > 15) {
        issues.push({
            severity: 'medium',
            issue: `${columnCount} columns defined`,
            impact: 'More data to transfer and process',
            suggestion: 'Reduce to essential columns only'
        });
    }

    // Check 3: Organization scope without filters
    if (rm.scope === 'organization' && !hasDateFilter) {
        issues.push({
            severity: 'high',
            issue: 'Organization scope without date filter',
            impact: 'Full table scan likely',
            suggestion: 'Add date filter or reduce scope'
        });
    }

    // Check 4: Summary format (2000-row risk)
    if (rm.reportFormat === 'SUMMARY') {
        issues.push({
            severity: 'critical',
            issue: 'SUMMARY format has 2,000-row HARD LIMIT',
            impact: 'Data will be silently truncated',
            suggestion: 'Estimate row count and add filters if needed'
        });
    }

    // Check 5: Multiple OR filters
    const orFilters = rm.reportBooleanFilter?.toLowerCase().match(/or/g);
    if (orFilters && orFilters.length > 3) {
        issues.push({
            severity: 'medium',
            issue: `Complex filter logic with ${orFilters.length} OR conditions`,
            impact: 'May not use indexes efficiently',
            suggestion: 'Consider restructuring filter logic'
        });
    }

    // Generate performance score
    const score = 100 - (issues.length * 20);

    return {
        score: Math.max(0, score),
        grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
        issues,
        recommendations: generateRecommendations(issues)
    };
}

function generateRecommendations(issues) {
    const recommendations = [];

    if (issues.some(i => i.issue.includes('date filter'))) {
        recommendations.push({
            priority: 1,
            action: 'Add date-based filter',
            code: `"standardDateFilter": {
    "column": "CREATED_DATE",
    "durationValue": "LAST_N_DAYS:90"
}`
        });
    }

    if (issues.some(i => i.issue.includes('columns'))) {
        recommendations.push({
            priority: 2,
            action: 'Audit and reduce columns',
            code: 'Review each column - remove unused fields'
        });
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
}
```

### Caching Strategies

```javascript
/**
 * Report execution caching
 */
class ReportCache {
    constructor(ttlMinutes = 15) {
        this.cache = new Map();
        this.ttl = ttlMinutes * 60 * 1000;
    }

    generateKey(reportId, filters) {
        const filterKey = JSON.stringify(filters || {});
        return `${reportId}:${filterKey}`;
    }

    get(reportId, filters) {
        const key = this.generateKey(reportId, filters);
        const cached = this.cache.get(key);

        if (!cached) return null;

        if (Date.now() > cached.expiry) {
            this.cache.delete(key);
            return null;
        }

        console.log(`Cache HIT for ${reportId}`);
        return cached.data;
    }

    set(reportId, filters, data) {
        const key = this.generateKey(reportId, filters);
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
        console.log(`Cache SET for ${reportId}`);
    }

    invalidate(reportId) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${reportId}:`)) {
                this.cache.delete(key);
            }
        }
    }

    clear() {
        this.cache.clear();
    }
}

// Usage
const reportCache = new ReportCache(15); // 15 minute TTL

async function executeReportWithCache(orgAlias, reportId, filters = null) {
    // Check cache first
    const cached = reportCache.get(reportId, filters);
    if (cached) {
        return cached;
    }

    // Execute report
    const result = await executeReport(orgAlias, reportId, filters);

    // Cache successful results
    if (result.factMap) {
        reportCache.set(reportId, filters, result);
    }

    return result;
}
```

### Async Execution for Large Reports

```javascript
/**
 * Async report execution for large data sets
 */
async function executeReportAsync(orgAlias, reportId, includeDetails = true) {
    const { execSync } = require('child_process');

    // Step 1: Start async execution
    console.log('Starting async report execution...');

    const startPayload = {
        reportMetadata: {
            includeDetails
        }
    };

    const startResult = JSON.parse(execSync(
        `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/instances --method POST --body '${JSON.stringify(startPayload)}' --target-org ${orgAlias}`,
        { encoding: 'utf-8' }
    ));

    const instanceId = startResult.id;
    console.log(`Instance created: ${instanceId}`);

    // Step 2: Poll for completion
    let status = 'Running';
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes max

    while (status === 'Running' && pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals

        const statusResult = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/instances/${instanceId} --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        status = statusResult.status;
        pollCount++;
        console.log(`Poll ${pollCount}: ${status}`);
    }

    // Step 3: Get results
    if (status === 'Success') {
        const results = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/instances/${instanceId} --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        console.log('Report execution complete');
        return results;
    }

    throw new Error(`Report execution failed with status: ${status}`);
}
```

---

## 5. Row Count and Data Volume

### 2,000-Row SUMMARY Limit - Critical Issue

```javascript
/**
 * CRITICAL: Detect and handle Summary format 2,000-row truncation
 */
class RowCountMonitor {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
    }

    /**
     * Check if report results are likely truncated
     */
    async checkForTruncation(reportResult) {
        const format = reportResult.reportMetadata?.reportFormat;

        if (format !== 'SUMMARY') {
            return { truncated: false };
        }

        // Count actual rows
        const rowCount = this.countRows(reportResult);

        // SUMMARY format truncates at exactly 2000
        if (rowCount === 2000) {
            return {
                truncated: true,
                rowCount,
                message: 'CRITICAL: Data likely truncated at 2,000 rows!',
                solution: 'Add filters or use TABULAR format'
            };
        }

        // Check if close to limit
        if (rowCount >= 1800) {
            return {
                truncated: false,
                atRisk: true,
                rowCount,
                message: `Warning: ${rowCount} rows - approaching 2,000 limit`,
                solution: 'Add filters to ensure complete data'
            };
        }

        return { truncated: false, rowCount };
    }

    countRows(reportResult) {
        // Count rows in factMap
        let rowCount = 0;

        if (reportResult.factMap) {
            for (const [key, data] of Object.entries(reportResult.factMap)) {
                if (data.rows) {
                    rowCount += data.rows.length;
                }
            }
        }

        return rowCount;
    }

    /**
     * Estimate row count BEFORE running report
     */
    async estimateRowCount(reportType, filters = []) {
        const { execSync } = require('child_process');

        // Build SOQL to estimate count
        const baseObject = await this.getBaseObject(reportType);

        let countQuery = `SELECT COUNT() FROM ${baseObject}`;

        if (filters.length > 0) {
            const whereClause = this.buildWhereClause(filters);
            if (whereClause) {
                countQuery += ` WHERE ${whereClause}`;
            }
        }

        try {
            const result = JSON.parse(execSync(
                `sf data query --query "${countQuery}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            ));

            const count = result.result.totalSize;

            return {
                estimatedRows: count,
                exceedsLimit: count > 2000,
                recommendation: count > 2000
                    ? 'Add filters to reduce row count below 2,000 for SUMMARY format'
                    : 'Row count within limits'
            };
        } catch (error) {
            return {
                estimatedRows: null,
                error: error.message,
                recommendation: 'Could not estimate - add conservative filters'
            };
        }
    }

    async getBaseObject(reportType) {
        const { execSync } = require('child_process');

        const query = `SELECT SobjectType FROM ReportType WHERE DeveloperName = '${reportType}'`;
        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --use-tooling-api --target-org ${this.orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        return result.result.records[0]?.SobjectType;
    }

    buildWhereClause(filters) {
        // Convert report filters to SOQL WHERE clause
        const clauses = filters.map(f => {
            const op = this.translateOperator(f.operator);
            return `${f.column} ${op} '${f.value}'`;
        });

        return clauses.join(' AND ');
    }

    translateOperator(reportOp) {
        const opMap = {
            'equals': '=',
            'notEqual': '!=',
            'lessThan': '<',
            'greaterThan': '>',
            'lessOrEqual': '<=',
            'greaterOrEqual': '>=',
            'contains': 'LIKE', // Note: needs % wrapping
            'startsWith': 'LIKE'
        };
        return opMap[reportOp] || '=';
    }
}

// Pre-flight check
async function preFlightRowCountCheck(orgAlias, reportDefinition) {
    const monitor = new RowCountMonitor(orgAlias);
    const rm = reportDefinition.reportMetadata;

    console.log('\n=== ROW COUNT PRE-FLIGHT CHECK ===\n');

    if (rm.reportFormat !== 'SUMMARY') {
        console.log(`Format: ${rm.reportFormat} - No 2,000-row limit concerns`);
        return { safe: true };
    }

    console.log('⚠️  SUMMARY format detected - checking row count...\n');

    const estimate = await monitor.estimateRowCount(
        rm.reportType?.type,
        rm.reportFilters || []
    );

    console.log(`Estimated rows: ${estimate.estimatedRows || 'Unknown'}`);
    console.log(`Exceeds 2,000 limit: ${estimate.exceedsLimit ? 'YES - DANGER!' : 'No'}`);
    console.log(`Recommendation: ${estimate.recommendation}`);

    if (estimate.exceedsLimit) {
        console.log('\n🚨 ACTION REQUIRED:');
        console.log('1. Add date filter (e.g., LAST_90_DAYS)');
        console.log('2. Add status filter (e.g., Active only)');
        console.log('3. Or switch to TABULAR format');
    }

    return {
        safe: !estimate.exceedsLimit,
        estimate
    };
}
```

### Row Limits by Format

```javascript
const REPORT_ROW_LIMITS = {
    TABULAR: {
        detailRows: 50000,
        note: 'Large capacity for detail data'
    },
    SUMMARY: {
        detailRows: 2000,  // HARD LIMIT!
        groupingRows: 3000,
        note: 'CRITICAL: Silent truncation at 2,000 detail rows via REST API'
    },
    MATRIX: {
        detailRows: 2000,
        cellLimit: 4000000, // cells = rows × columns
        note: 'Large sparse grids can exceed limits'
    },
    JOINED: {
        perBlock: 2000,
        totalBlocks: 5,
        note: 'Each block has its own row limit'
    }
};
```

---

## 6. Debug Techniques

### Enable Debug Logging

```javascript
/**
 * Debug wrapper for report API calls
 */
class ReportDebugger {
    constructor(orgAlias, verbose = true) {
        this.orgAlias = orgAlias;
        this.verbose = verbose;
        this.logs = [];
    }

    log(level, message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };

        this.logs.push(entry);

        if (this.verbose) {
            const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
            console.log(`${prefix} [${level.toUpperCase()}] ${message}`);
            if (data) {
                console.log('   ', JSON.stringify(data, null, 2).substring(0, 500));
            }
        }
    }

    async debugReportExecution(reportId, payload = null) {
        this.log('info', `Starting debug execution for report: ${reportId}`);

        const { execSync } = require('child_process');

        // Step 1: Describe report
        this.log('info', 'Step 1: Describing report...');
        try {
            const describe = JSON.parse(execSync(
                `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/describe --target-org ${this.orgAlias}`,
                { encoding: 'utf-8' }
            ));

            this.log('info', 'Report metadata:', {
                name: describe.reportMetadata?.name,
                format: describe.reportMetadata?.reportFormat,
                reportType: describe.reportMetadata?.reportType?.type,
                filterCount: (describe.reportMetadata?.reportFilters || []).length,
                columnCount: (describe.reportMetadata?.detailColumns || []).length
            });
        } catch (error) {
            this.log('error', `Describe failed: ${error.message}`);
            return;
        }

        // Step 2: Execute with timing
        this.log('info', 'Step 2: Executing report...');
        const startTime = Date.now();

        try {
            const endpoint = payload
                ? `/services/data/v62.0/analytics/reports/${reportId}`
                : `/services/data/v62.0/analytics/reports/${reportId}`;

            const method = payload ? 'POST' : 'GET';
            let cmd = `sf api request rest ${endpoint} --method ${method} --target-org ${this.orgAlias}`;

            if (payload) {
                cmd += ` --body '${JSON.stringify(payload)}'`;
            }

            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            const duration = Date.now() - startTime;

            this.log('info', `Execution complete in ${duration}ms`);
            this.log('info', 'Result summary:', {
                hasErrors: result.hasDetailRows === false && result.reportMetadata?.detailColumns?.length > 0,
                allData: result.allData,
                factMapKeys: Object.keys(result.factMap || {}),
                rowCount: this.countRows(result)
            });

            // Check for issues
            this.analyzeResult(result);

            return result;
        } catch (error) {
            this.log('error', `Execution failed: ${error.message}`);
            throw error;
        }
    }

    countRows(result) {
        let count = 0;
        if (result.factMap) {
            for (const data of Object.values(result.factMap)) {
                count += (data.rows || []).length;
            }
        }
        return count;
    }

    analyzeResult(result) {
        const issues = [];

        // Check for truncation
        const rowCount = this.countRows(result);
        if (rowCount === 2000 && result.reportMetadata?.reportFormat === 'SUMMARY') {
            issues.push({
                level: 'error',
                message: 'Likely data truncation at 2,000 rows!'
            });
        }

        // Check for empty results
        if (rowCount === 0) {
            issues.push({
                level: 'warn',
                message: 'Report returned 0 rows - check filters'
            });
        }

        // Check for allData flag
        if (result.allData === false) {
            issues.push({
                level: 'warn',
                message: 'Not all data returned - may need pagination'
            });
        }

        for (const issue of issues) {
            this.log(issue.level, issue.message);
        }

        return issues;
    }

    exportLogs() {
        return this.logs;
    }

    saveLogs(filePath) {
        const fs = require('fs');
        fs.writeFileSync(filePath, JSON.stringify(this.logs, null, 2));
        console.log(`Logs saved to: ${filePath}`);
    }
}

// Usage
async function debugReport(orgAlias, reportId) {
    const debugger = new ReportDebugger(orgAlias, true);
    await debugger.debugReportExecution(reportId);
    debugger.saveLogs(`debug-${reportId}-${Date.now()}.json`);
}
```

### Request/Response Inspection

```javascript
/**
 * Inspect raw API request and response
 */
async function inspectReportAPI(orgAlias, reportId) {
    const { execSync } = require('child_process');

    console.log('\n=== RAW API INSPECTION ===\n');

    // Get access token for manual inspection
    const authResult = JSON.parse(execSync(
        `sf org display --target-org ${orgAlias} --json`,
        { encoding: 'utf-8' }
    ));

    const instanceUrl = authResult.result.instanceUrl;
    const accessToken = authResult.result.accessToken;

    console.log('Instance URL:', instanceUrl);
    console.log('Report URL:', `${instanceUrl}/services/data/v62.0/analytics/reports/${reportId}`);
    console.log('\nCurl command for manual testing:');
    console.log(`curl -X POST "${instanceUrl}/services/data/v62.0/analytics/reports/${reportId}" \\
  -H "Authorization: Bearer ${accessToken}" \\
  -H "Content-Type: application/json" \\
  -d '{}' | jq .`);

    console.log('\n=== EXECUTING REQUEST ===\n');

    try {
        const result = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId} --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        console.log('Response Structure:');
        console.log('  - reportMetadata:', result.reportMetadata ? 'present' : 'missing');
        console.log('  - reportExtendedMetadata:', result.reportExtendedMetadata ? 'present' : 'missing');
        console.log('  - factMap:', result.factMap ? `${Object.keys(result.factMap).length} keys` : 'missing');
        console.log('  - groupingsDown:', result.groupingsDown ? 'present' : 'missing');
        console.log('  - groupingsAcross:', result.groupingsAcross ? 'present' : 'missing');

        // Sample factMap keys
        if (result.factMap) {
            console.log('\nFactMap Keys (first 5):');
            Object.keys(result.factMap).slice(0, 5).forEach(key => {
                const data = result.factMap[key];
                console.log(`  ${key}: ${(data.rows || []).length} rows, ${(data.aggregates || []).length} aggregates`);
            });
        }

        return result;
    } catch (error) {
        console.error('Request failed:', error.message);
        throw error;
    }
}
```

---

## 7. API Limits and Quotas

### Analytics API Limits

```javascript
const ANALYTICS_API_LIMITS = {
    // REST API limits
    rest: {
        reportsPerHour: 500,          // Per user
        reportsPerDay: 5000,          // Per org
        asyncInstancesPerHour: 200,   // Async report runs
        dashboardRefreshesPerHour: 200
    },

    // Report-specific limits
    reports: {
        maxColumnsPerReport: 100,
        maxFiltersPerReport: 20,
        maxGroupingsDown: 3,
        maxGroupingsAcross: 2,
        maxJoinedBlocks: 5,
        maxFormulaLength: 3900,
        maxCrossFilters: 3
    },

    // Row limits by format
    rowLimits: {
        TABULAR: 50000,
        SUMMARY: 2000,        // HARD LIMIT!
        MATRIX: 2000,
        JOINED_PER_BLOCK: 2000
    },

    // Response size
    response: {
        maxResultSize: '50MB',
        maxExportRows: 50000
    }
};

/**
 * Check current API usage
 */
async function checkAPIUsage(orgAlias) {
    const { execSync } = require('child_process');

    // Query API usage limits
    const result = JSON.parse(execSync(
        `sf limits api display --target-org ${orgAlias} --json`,
        { encoding: 'utf-8' }
    ));

    // Find analytics-related limits
    const analyticsLimits = result.result.filter(l =>
        l.name.toLowerCase().includes('report') ||
        l.name.toLowerCase().includes('analytics') ||
        l.name.toLowerCase().includes('dashboard')
    );

    console.log('\n=== Analytics API Usage ===\n');

    for (const limit of analyticsLimits) {
        const used = limit.remaining != null
            ? limit.max - limit.remaining
            : 'N/A';
        const percent = limit.max
            ? Math.round((used / limit.max) * 100)
            : 0;

        const status = percent > 80 ? '🔴' : percent > 50 ? '🟡' : '🟢';

        console.log(`${status} ${limit.name}`);
        console.log(`   Used: ${used} / ${limit.max} (${percent}%)`);
    }

    return analyticsLimits;
}
```

### Rate Limit Handling

```javascript
/**
 * Handle API rate limits gracefully
 */
class RateLimitedClient {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.requestCount = 0;
        this.lastReset = Date.now();
        this.maxRequestsPerMinute = 20; // Conservative limit
    }

    async executeWithRateLimit(apiCall) {
        // Reset counter every minute
        if (Date.now() - this.lastReset > 60000) {
            this.requestCount = 0;
            this.lastReset = Date.now();
        }

        // Check if at limit
        if (this.requestCount >= this.maxRequestsPerMinute) {
            const waitTime = 60000 - (Date.now() - this.lastReset);
            console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.requestCount = 0;
            this.lastReset = Date.now();
        }

        this.requestCount++;

        try {
            return await apiCall();
        } catch (error) {
            // Handle 429 Too Many Requests
            if (error.message?.includes('REQUEST_LIMIT_EXCEEDED')) {
                console.log('API limit exceeded. Backing off...');
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30s backoff
                return await this.executeWithRateLimit(apiCall); // Retry
            }
            throw error;
        }
    }
}
```

---

## 8. Format-Specific Issues

### TABULAR Issues

```javascript
const TABULAR_ISSUES = {
    'No groupings supported': {
        error: 'TABULAR format ignores groupingsDown and groupingsAcross',
        solution: 'Remove groupings or switch to SUMMARY format'
    },
    'No aggregates': {
        error: 'TABULAR format cannot display aggregate rows',
        solution: 'Use SUMMARY or MATRIX for aggregated data'
    },
    'Column limit': {
        error: 'Too many columns affects performance',
        solution: 'Limit to essential columns, max ~20 recommended'
    }
};
```

### SUMMARY Issues

```javascript
const SUMMARY_ISSUES = {
    '2000_ROW_TRUNCATION': {
        symptom: 'Report shows exactly 2000 rows',
        cause: 'HARD LIMIT in Analytics REST API',
        detection: 'Check if row count === 2000',
        solutions: [
            'Add date filter to reduce data',
            'Add status filter',
            'Use TABULAR format (50K limit)',
            'Use Metadata API for full export'
        ]
    },
    'MISSING_AGGREGATES': {
        symptom: 'Subtotals/grand totals not showing',
        cause: 'Aggregates not defined or field type incompatible',
        detection: 'Check reportMetadata.aggregates',
        solutions: [
            'Define aggregates array',
            'Use numeric fields for SUM/AVG',
            'RowCount works for any field'
        ]
    },
    'GROUPING_OVERFLOW': {
        symptom: 'Error: Maximum 3 groupings exceeded',
        cause: 'More than 3 levels in groupingsDown',
        solution: 'Reduce to 3 or fewer groupings'
    }
};
```

### MATRIX Issues

```javascript
const MATRIX_ISSUES = {
    'SPARSE_GRID': {
        symptom: 'Many empty cells, slow performance',
        cause: 'Grouping combinations create large grid',
        solutions: [
            'Reduce unique values in groupings',
            'Add filters to limit data',
            'Consider SUMMARY instead'
        ]
    },
    'CELL_LIMIT': {
        symptom: 'Error or truncation',
        cause: 'Total cells (rows × columns) too high',
        detection: 'rows * columns > 4,000,000',
        solution: 'Reduce grouping cardinality'
    },
    'COLUMN_GROUPING_LIMIT': {
        symptom: 'Error: Maximum 2 column groupings',
        cause: 'More than 2 items in groupingsAcross',
        solution: 'Reduce to 2 or fewer column groupings'
    }
};
```

### JOINED Issues

See dedicated section below.

---

## 9. Joined Report Troubleshooting

### Common Joined Report Errors

```javascript
const JOINED_REPORT_ERRORS = {
    'REST_API_CREATION_BLOCKED': {
        symptom: 'Cannot create joined report via REST API',
        cause: 'REST API does not support joined report creation',
        solution: 'Use Metadata API (sf project deploy) for joined reports'
    },

    'CROSS_BLOCK_FORMULA_ERROR': {
        symptom: 'Formula calculation shows error',
        cause: 'Wrong block ID or aggregate reference',
        detection: 'Check B{blockId}#{aggregateName} syntax',
        solutions: [
            'Verify block IDs match actual block definitions',
            'Ensure aggregates exist in referenced blocks',
            'Check formula syntax for typos'
        ]
    },

    'BLOCK_COUNT_EXCEEDED': {
        symptom: 'Error: Maximum 5 blocks allowed',
        cause: 'Attempting to add more than 5 blocks',
        solution: 'Consolidate or split into multiple reports'
    },

    'COMMON_GROUPING_MISMATCH': {
        symptom: 'Data alignment issues between blocks',
        cause: 'Common grouping field not in all report types',
        detection: 'Check each block report type has the common field',
        solution: 'Choose grouping field that exists in all report types'
    },

    'FIELD_PATH_ERROR': {
        symptom: 'Field not found in joined report',
        cause: 'Using standard field path instead of joined syntax',
        detection: 'Check field uses Object$FieldName format',
        solutions: [
            'Use Object$FieldName instead of OBJECT_FIELDNAME',
            'Include block identifier if needed'
        ]
    }
};

/**
 * Diagnose joined report issues
 */
async function diagnoseJoinedReport(orgAlias, reportPath) {
    const fs = require('fs');

    console.log('\n=== JOINED REPORT DIAGNOSIS ===\n');

    const content = fs.readFileSync(reportPath, 'utf-8');

    // Check 1: Block count
    const blockMatches = content.match(/<block>/g);
    const blockCount = blockMatches ? blockMatches.length : 0;
    console.log(`Blocks defined: ${blockCount}`);
    if (blockCount > 5) {
        console.log('❌ ERROR: Maximum 5 blocks allowed');
    } else if (blockCount < 2) {
        console.log('⚠️ WARNING: Joined reports should have at least 2 blocks');
    } else {
        console.log('✓ Block count OK');
    }

    // Check 2: Report types
    const reportTypeMatches = content.matchAll(/<reportType>([^<]+)<\/reportType>/g);
    const reportTypes = [...reportTypeMatches].map(m => m[1]);
    console.log(`\nReport types used: ${reportTypes.join(', ')}`);

    // Check 3: Common grouping
    const commonGroupingMatch = content.match(/<groupingsDown>[\s\S]*?<name>([^<]+)<\/name>/);
    if (commonGroupingMatch) {
        console.log(`\nCommon grouping: ${commonGroupingMatch[1]}`);
    } else {
        console.log('\n⚠️ No common grouping detected');
    }

    // Check 4: Cross-block formulas
    const formulaMatches = content.matchAll(/B(\d+|_[A-Z]+)#([A-Za-z_]+)/g);
    const formulas = [...formulaMatches];
    if (formulas.length > 0) {
        console.log(`\nCross-block formulas found: ${formulas.length}`);
        for (const f of formulas) {
            console.log(`  B${f[1]}#${f[2]}`);
        }
    }

    // Validation
    console.log('\n=== RECOMMENDATIONS ===\n');

    if (blockCount < 2) {
        console.log('• Add at least 2 blocks to create a joined report');
    }

    if (reportTypes.length > 0) {
        console.log('• Verify all report types exist in target org');
        console.log('• Ensure common grouping field exists in all report types');
    }

    if (formulas.length > 0) {
        console.log('• Verify cross-block formula block IDs match block definitions');
        console.log('• Ensure referenced aggregates exist in source blocks');
    }
}
```

### Cross-Block Formula Debugging

```javascript
/**
 * Debug cross-block formulas
 */
function debugCrossBlockFormula(formula, blocks) {
    console.log(`\nDebugging formula: ${formula}\n`);

    // Parse formula references
    const refPattern = /B([^#]+)#([A-Za-z_]+)/g;
    let match;
    const references = [];

    while ((match = refPattern.exec(formula)) !== null) {
        references.push({
            blockId: match[1],
            aggregate: match[2]
        });
    }

    if (references.length === 0) {
        console.log('❌ No block references found in formula');
        console.log('   Expected format: B{blockId}#{aggregateName}');
        return false;
    }

    console.log('References found:');
    let allValid = true;

    for (const ref of references) {
        console.log(`\n  Block: B${ref.blockId}`);
        console.log(`  Aggregate: ${ref.aggregate}`);

        // Check if block exists
        const block = blocks.find(b => b.id === ref.blockId);
        if (!block) {
            console.log(`  ❌ Block B${ref.blockId} not found!`);
            console.log(`     Available blocks: ${blocks.map(b => `B${b.id}`).join(', ')}`);
            allValid = false;
        } else {
            console.log(`  ✓ Block found`);

            // Check if aggregate exists
            const aggregate = block.aggregates?.find(a => a.name === ref.aggregate);
            if (!aggregate) {
                console.log(`  ❌ Aggregate "${ref.aggregate}" not found in block!`);
                console.log(`     Available: ${(block.aggregates || []).map(a => a.name).join(', ') || 'none'}`);
                allValid = false;
            } else {
                console.log(`  ✓ Aggregate found`);
            }
        }
    }

    return allValid;
}
```

---

## 10. Security and Access Issues

### Field-Level Security (FLS)

```javascript
/**
 * Diagnose FLS issues
 */
async function diagnoseFLSIssues(orgAlias, objectName, fields, userId = null) {
    const { execSync } = require('child_process');

    console.log(`\n=== FLS DIAGNOSIS: ${objectName} ===\n`);

    // Get field permissions
    const fieldsForQuery = fields.map(f => `'${objectName}.${f}'`).join(',');

    const query = `
        SELECT Field, Parent.Profile.Name, Parent.Label, PermissionsRead, PermissionsEdit
        FROM FieldPermissions
        WHERE SobjectType = '${objectName}'
        AND Field IN (${fieldsForQuery})
        ORDER BY Field, Parent.Profile.Name
    `;

    try {
        const result = JSON.parse(execSync(
            `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        // Group by field
        const byField = {};
        for (const record of result.result.records) {
            const fieldName = record.Field.replace(`${objectName}.`, '');
            if (!byField[fieldName]) {
                byField[fieldName] = [];
            }
            byField[fieldName].push({
                profile: record.Parent?.Profile?.Name,
                permissionSet: record.Parent?.Label,
                canRead: record.PermissionsRead,
                canEdit: record.PermissionsEdit
            });
        }

        // Report
        for (const field of fields) {
            console.log(`Field: ${field}`);
            const perms = byField[field] || [];

            if (perms.length === 0) {
                console.log('  ⚠️ No explicit permissions found (may use profile defaults)');
            } else {
                const readable = perms.filter(p => p.canRead);
                const restricted = perms.filter(p => !p.canRead);

                console.log(`  ✓ Readable by ${readable.length} profiles/permission sets`);
                if (restricted.length > 0) {
                    console.log(`  ⚠️ Restricted for ${restricted.length} profiles/permission sets`);
                }
            }
            console.log('');
        }

        return byField;
    } catch (error) {
        console.error(`FLS query failed: ${error.message}`);
        return null;
    }
}
```

### Sharing Rules

```javascript
/**
 * Check sharing rules impact
 */
async function checkSharingRules(orgAlias, objectName) {
    const { execSync } = require('child_process');

    console.log(`\n=== SHARING ANALYSIS: ${objectName} ===\n`);

    // Get org-wide defaults
    const owdQuery = `
        SELECT SobjectType, InternalAccessLevel, ExternalAccessLevel
        FROM ObjectPermissions
        WHERE SobjectType = '${objectName}'
        LIMIT 1
    `;

    try {
        // This is simplified - actual sharing analysis is complex
        console.log('Sharing considerations:');
        console.log('1. Check Org-Wide Defaults in Setup → Sharing Settings');
        console.log('2. Review Sharing Rules for the object');
        console.log('3. Check Role Hierarchy if scope is not "organization"');
        console.log('4. Territory rules may also apply');

        console.log('\nReport scope options:');
        console.log('  "user"          - Only records owned by user');
        console.log('  "team"          - Records shared with user');
        console.log('  "organization"  - All records user can access via sharing');

        console.log('\nIf report returns fewer records than expected:');
        console.log('1. Try scope: "organization" first');
        console.log('2. If still limited, check sharing rules in Setup');
        console.log('3. Consider running as admin for full data');
    } catch (error) {
        console.error(`Sharing check failed: ${error.message}`);
    }
}
```

### Permission Checklist

```javascript
/**
 * Complete permission check for report access
 */
async function fullPermissionCheck(orgAlias, reportId) {
    console.log('\n=== COMPLETE PERMISSION CHECK ===\n');

    const checks = [
        { name: 'Report exists', status: 'pending' },
        { name: 'Report folder access', status: 'pending' },
        { name: 'Report type access', status: 'pending' },
        { name: 'Field-level security', status: 'pending' },
        { name: 'Object access', status: 'pending' },
        { name: 'Sharing rules', status: 'pending' }
    ];

    const { execSync } = require('child_process');

    // Check 1: Report exists
    try {
        execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/describe --target-org ${orgAlias}`,
            { encoding: 'utf-8', stdio: 'pipe' }
        );
        checks[0].status = 'pass';
    } catch {
        checks[0].status = 'fail';
        checks[0].note = 'Report not found or no access';
    }

    // Check 2: Folder access
    try {
        const reportResult = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/describe --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        if (reportResult.reportMetadata?.folderId) {
            checks[1].status = 'pass';
            checks[1].note = `Folder: ${reportResult.reportMetadata.folderId}`;
        } else {
            checks[1].status = 'unknown';
        }
    } catch {
        checks[1].status = 'unknown';
    }

    // Print results
    console.log('Permission Check Results:');
    console.log('-'.repeat(50));

    for (const check of checks) {
        const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '?';
        console.log(`${icon} ${check.name}: ${check.status.toUpperCase()}`);
        if (check.note) {
            console.log(`   ${check.note}`);
        }
    }

    return checks;
}
```

---

## 11. Diagnostic Scripts

### Comprehensive Diagnostic Script

```javascript
#!/usr/bin/env node

/**
 * Report Diagnostic CLI
 * Usage: node diagnose-report.js <org-alias> <report-id-or-path>
 */

const { execSync } = require('child_process');
const fs = require('fs');

async function diagnoseReport(orgAlias, target) {
    console.log('\n' + '='.repeat(60));
    console.log('          SALESFORCE REPORT DIAGNOSTIC TOOL');
    console.log('='.repeat(60) + '\n');

    const isFile = fs.existsSync(target);

    if (isFile) {
        await diagnoseReportFile(orgAlias, target);
    } else {
        await diagnoseDeployedReport(orgAlias, target);
    }
}

async function diagnoseReportFile(orgAlias, filePath) {
    console.log(`Diagnosing file: ${filePath}\n`);

    const content = fs.readFileSync(filePath, 'utf-8');

    // Detect format (JSON vs XML)
    const isJson = content.trim().startsWith('{');

    if (isJson) {
        const report = JSON.parse(content);
        await diagnoseJsonReport(orgAlias, report);
    } else {
        await diagnoseXmlReport(orgAlias, content);
    }
}

async function diagnoseJsonReport(orgAlias, report) {
    const rm = report.reportMetadata;

    console.log('=== REPORT METADATA ===\n');
    console.log(`Name: ${rm.name || 'NOT SET'}`);
    console.log(`Format: ${rm.reportFormat || 'NOT SET'}`);
    console.log(`Report Type: ${rm.reportType?.type || 'NOT SET'}`);
    console.log(`Columns: ${(rm.detailColumns || []).length}`);
    console.log(`Filters: ${(rm.reportFilters || []).length}`);
    console.log(`Row Groupings: ${(rm.groupingsDown || []).length}`);
    console.log(`Column Groupings: ${(rm.groupingsAcross || []).length}`);
    console.log(`Aggregates: ${(rm.aggregates || []).length}`);

    // Validation
    console.log('\n=== VALIDATION ===\n');

    const issues = [];

    // Check required fields
    if (!rm.name) issues.push({ level: 'error', msg: 'Missing: name' });
    if (!rm.reportFormat) issues.push({ level: 'error', msg: 'Missing: reportFormat' });
    if (!rm.reportType?.type) issues.push({ level: 'error', msg: 'Missing: reportType.type' });

    // Check format-specific issues
    if (rm.reportFormat === 'TABULAR') {
        if ((rm.groupingsDown || []).length > 0) {
            issues.push({ level: 'warn', msg: 'TABULAR format ignores groupings' });
        }
    }

    if (rm.reportFormat === 'SUMMARY') {
        issues.push({ level: 'critical', msg: 'SUMMARY format has 2,000-row HARD LIMIT via REST API' });

        if ((rm.groupingsDown || []).length > 3) {
            issues.push({ level: 'error', msg: 'Max 3 row groupings for SUMMARY' });
        }
    }

    if (rm.reportFormat === 'MATRIX') {
        if ((rm.groupingsDown || []).length > 3) {
            issues.push({ level: 'error', msg: 'Max 3 row groupings for MATRIX' });
        }
        if ((rm.groupingsAcross || []).length > 2) {
            issues.push({ level: 'error', msg: 'Max 2 column groupings for MATRIX' });
        }
    }

    // Check report type exists
    if (rm.reportType?.type) {
        try {
            execSync(
                `sf api request rest /services/data/v62.0/analytics/reportTypes/${rm.reportType.type} --target-org ${orgAlias}`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
            console.log(`✓ Report type '${rm.reportType.type}' exists`);
        } catch {
            issues.push({ level: 'error', msg: `Report type '${rm.reportType.type}' not found` });
        }
    }

    // Print issues
    if (issues.length === 0) {
        console.log('✓ No issues found');
    } else {
        for (const issue of issues) {
            const icon = issue.level === 'error' ? '❌' :
                         issue.level === 'critical' ? '🔴' :
                         issue.level === 'warn' ? '⚠️' : 'ℹ️';
            console.log(`${icon} [${issue.level.toUpperCase()}] ${issue.msg}`);
        }
    }

    // Performance analysis
    console.log('\n=== PERFORMANCE ANALYSIS ===\n');

    const hasDateFilter = (rm.reportFilters || []).some(f =>
        f.column?.toLowerCase().includes('date')
    ) || rm.standardDateFilter;

    console.log(`Date filter: ${hasDateFilter ? '✓ Present' : '⚠️ Missing - consider adding'}`);
    console.log(`Column count: ${(rm.detailColumns || []).length} ${(rm.detailColumns || []).length > 15 ? '⚠️ High' : '✓ OK'}`);
    console.log(`Scope: ${rm.scope || 'default (organization)'}`);
}

async function diagnoseXmlReport(orgAlias, content) {
    console.log('XML report detected\n');

    // Extract key elements
    const name = content.match(/<name>([^<]+)<\/name>/)?.[1];
    const format = content.match(/<format>([^<]+)<\/format>/)?.[1];
    const reportType = content.match(/<reportType>([^<]+)<\/reportType>/)?.[1];

    console.log('=== REPORT METADATA ===\n');
    console.log(`Name: ${name || 'NOT FOUND'}`);
    console.log(`Format: ${format || 'NOT FOUND'}`);
    console.log(`Report Type: ${reportType || 'NOT FOUND'}`);

    // Check for joined report
    const isJoined = content.includes('<block>') || format === 'MultiBlock';
    if (isJoined) {
        console.log('\n=== JOINED REPORT ANALYSIS ===\n');

        const blockCount = (content.match(/<block>/g) || []).length;
        console.log(`Blocks: ${blockCount}`);

        if (blockCount > 5) {
            console.log('❌ ERROR: Maximum 5 blocks allowed');
        }

        // Check cross-block formulas
        const formulas = content.match(/B[^#]+#[A-Za-z_]+/g) || [];
        if (formulas.length > 0) {
            console.log(`\nCross-block formulas: ${formulas.length}`);
            formulas.forEach(f => console.log(`  - ${f}`));
        }
    }
}

async function diagnoseDeployedReport(orgAlias, reportId) {
    console.log(`Diagnosing deployed report: ${reportId}\n`);

    try {
        // Get report describe
        const describe = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId}/describe --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        await diagnoseJsonReport(orgAlias, describe);

        // Try to execute
        console.log('\n=== EXECUTION TEST ===\n');

        const startTime = Date.now();
        const result = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports/${reportId} --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));
        const duration = Date.now() - startTime;

        console.log(`Execution time: ${duration}ms ${duration > 10000 ? '⚠️ Slow' : '✓ OK'}`);

        // Count rows
        let rowCount = 0;
        if (result.factMap) {
            for (const data of Object.values(result.factMap)) {
                rowCount += (data.rows || []).length;
            }
        }

        console.log(`Rows returned: ${rowCount}`);

        // Check for truncation
        if (rowCount === 2000 && describe.reportMetadata?.reportFormat === 'SUMMARY') {
            console.log('🔴 CRITICAL: Exactly 2000 rows returned - likely truncated!');
        }

        console.log(`All data: ${result.allData ? '✓ Yes' : '⚠️ No (may need pagination)'}`);

    } catch (error) {
        console.error(`Failed to diagnose: ${error.message}`);
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node diagnose-report.js <org-alias> <report-id-or-path>');
        process.exit(1);
    }

    diagnoseReport(args[0], args[1]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { diagnoseReport };
```

### Quick Health Check

```bash
#!/bin/bash
# quick-report-health.sh - Quick health check for report API

ORG_ALIAS=${1:-sandbox}

echo "=== Quick Report Health Check ==="
echo "Org: $ORG_ALIAS"
echo ""

# Check API limits
echo "Checking API limits..."
sf limits api display --target-org "$ORG_ALIAS" | grep -i report

echo ""

# List recent reports
echo "Recent reports (last 5):"
sf data query --query "SELECT Id, Name, Format, LastModifiedDate FROM Report ORDER BY LastModifiedDate DESC LIMIT 5" --target-org "$ORG_ALIAS"

echo ""

# Check report types
echo "Custom report types:"
sf data query --query "SELECT DeveloperName, MasterLabel FROM ReportType WHERE DeveloperName NOT LIKE 'Account%' AND DeveloperName NOT LIKE 'Opportunity%' LIMIT 10" --use-tooling-api --target-org "$ORG_ALIAS"

echo ""
echo "Health check complete!"
```

---

## 12. Quick Reference

### Error Resolution Cheatsheet

| Error Message | Quick Fix |
|---------------|-----------|
| `INVALID_FIELD` | Use exact API name from report type describe |
| `INVALID_TYPE` | Check/deploy report type first |
| `INSUFFICIENT_ACCESS` | Verify FLS and sharing rules |
| `REQUEST_LIMIT_EXCEEDED` | Reduce API calls, implement caching |
| `QUERY_TIMEOUT` | Add filters, reduce scope |
| `2000 rows exactly` | CRITICAL: Data truncated, add filters |

### Performance Quick Wins

1. **Add date filter** - Always include CREATED_DATE or similar
2. **Reduce columns** - Only include needed fields
3. **Use scope** - `user` or `team` instead of `organization`
4. **Enable caching** - Cache results for 15+ minutes
5. **Async for large** - Use async execution for 10K+ records

### Debug Commands

```bash
# Describe report type
sf api request rest /services/data/v62.0/analytics/reportTypes/AccountOpportunity --target-org ORG

# Describe report
sf api request rest /services/data/v62.0/analytics/reports/REPORT_ID/describe --target-org ORG

# Execute report
sf api request rest /services/data/v62.0/analytics/reports/REPORT_ID --target-org ORG

# List all report types
sf data query --query "SELECT DeveloperName, MasterLabel FROM ReportType" --use-tooling-api --target-org ORG

# Check API limits
sf limits api display --target-org ORG | grep -i report
```

### Critical Limits to Remember

| Limit | Value | Impact |
|-------|-------|--------|
| SUMMARY rows | 2,000 | **SILENT TRUNCATION** |
| TABULAR rows | 50,000 | Hard limit |
| Groupings down | 3 | Error if exceeded |
| Groupings across | 2 | Error if exceeded |
| Joined blocks | 5 | Error if exceeded |
| Filters | 20 | Error if exceeded |
| Columns | 100 | Performance degrades |

### Diagnostic Script Locations

```
scripts/
├── diagnose-report.js       # Full diagnostic tool
├── quick-validate.js        # Quick pre-flight checks
├── debug-execution.js       # Debug API calls
├── check-fls.js            # Field-level security check
├── estimate-rows.js        # Row count estimation
└── report-health.sh        # Bash health check
```

---

## Related Runbooks

- **[01-report-formats-fundamentals.md](./01-report-formats-fundamentals.md)** - Format selection
- **[03-summary-reports.md](./03-summary-reports.md)** - 2,000-row limit details
- **[05-joined-reports-basics.md](./05-joined-reports-basics.md)** - Joined report fundamentals
- **[06-joined-reports-advanced.md](./06-joined-reports-advanced.md)** - Cross-block formulas
- **[07-custom-report-types.md](./07-custom-report-types.md)** - Report type management
- **[08-validation-and-deployment.md](./08-validation-and-deployment.md)** - Deployment workflows

---

**Version**: 1.0.0
**Last Updated**: 2025-11-26
**Maintainer**: Salesforce Plugin Team
**Feedback**: Submit issues via reflection system
