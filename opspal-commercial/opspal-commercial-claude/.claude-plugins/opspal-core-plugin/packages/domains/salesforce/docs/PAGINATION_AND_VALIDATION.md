# Salesforce Pagination & Data Validation

**Version:** 1.0.0
**Created:** 2025-10-14
**Fixes:** Reflection Cohort fp-001-data-quality-validation

## Overview

This document describes the cursor-based pagination library and pre-batch validation framework implemented to resolve SOQL OFFSET limitations and prevent stale/incomplete data from driving critical business decisions.

## Problem Statement

**SOQL OFFSET Limitation:**
- Salesforce SOQL queries using OFFSET pagination have a hard limit of 2,000 rows
- Beyond this limit, queries silently return incomplete results without errors
- This caused critical failures in merge operations where high-value accounts appeared merge-ineligible due to incomplete child relationship counts

**Data Validation Gap:**
- Analysis JSON files were treated as immutable truth without freshness checks
- Batch operations executed on stale data without validation
- No mechanism to detect data quality issues before execution

## Solution Components

### 1. Salesforce Pagination Library

**Location:** `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/salesforce-pagination.js`

**Three Pagination Strategies:**

#### Strategy 1: Keyset Pagination (Recommended)
- **Best for:** Most queries, any dataset size
- **How it works:** Uses `WHERE Id > lastId` pattern
- **Pros:** Simple, efficient, handles changing data
- **Cons:** Requires Id field, sequential only

#### Strategy 2: QueryMore API
- **Best for:** 2K-50K records
- **How it works:** Uses Salesforce queryMore() API
- **Pros:** Preserves exact query results
- **Cons:** 15-minute locator expiration, not suitable for >50K

#### Strategy 3: Bulk API 2.0
- **Best for:** Very large datasets (>50K records)
- **How it works:** Asynchronous bulk query
- **Pros:** Handles millions of records
- **Cons:** Higher latency, requires polling

**Automatic Strategy Selection:**
```javascript
const { paginateQuery } = require('./lib/salesforce-pagination');

await paginateQuery({
  query: 'SELECT Id, Name FROM Account',
  targetUsername: 'myOrg',
  estimatedCount: 5000,  // Auto-selects best strategy
  onBatch: async (records, batchNum) => {
    console.log(`Batch ${batchNum}: ${records.length} records`);
    // Process records
  }
});
```

### 2. Pre-Batch Validation Framework

**Location:** `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validate-analysis-freshness.js`

**Features:**
- Configurable sampling (default: 10 random accounts)
- Comparison logic: query actual SF data vs analysis JSON
- Staleness detection (warn if >24 hours old)
- Automated pre-batch hook integration
- Detailed error reporting with remediation steps

**Usage:**
```javascript
const { validateAnalysisFreshness } = require('./lib/validate-analysis-freshness');

const result = await validateAnalysisFreshness({
  analysisFilePath: './merge-analysis.json',
  targetUsername: 'myOrg',
  objectType: 'Account',
  fieldsToValidate: ['Id', 'Name', 'NumberOfEmployees'],
  sampleSize: 10
});

if (!result.passed) {
  console.error(result.toString());
  process.exit(1);
}
```

### 3. Pre-Batch Validation Hook

**Location:** `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks/pre-batch-validation.sh`

**Automatically runs before batch operations:**
```bash
./hooks/pre-batch-validation.sh ./merge-analysis.json myOrg
```

**Exit Codes:**
- `0` - Validation passed, safe to proceed
- `1` - Validation failed, abort batch execution

## Integration Guide

### Migrating Existing Scripts

**Before (OFFSET pagination):**
```javascript
// ❌ OLD: Limited to 2,000 records
const query = 'SELECT Id, Name FROM Account LIMIT 2000 OFFSET 0';
const result = await execQuery(query);
```

**After (Keyset pagination):**
```javascript
// ✅ NEW: Handles unlimited records
const { paginateQuery } = require('./lib/salesforce-pagination');

await paginateQuery({
  query: 'SELECT Id, Name FROM Account',
  targetUsername: 'myOrg',
  estimatedCount: await estimateRecordCount('Account', 'myOrg'),
  onBatch: async (records) => {
    // Process records
  }
});
```

### Adding Pre-Batch Validation

**Add to beginning of batch scripts:**
```javascript
const { validateAnalysisFreshness } = require('./lib/validate-analysis-freshness');

// Validate before batch execution
const validation = await validateAnalysisFreshness({
  analysisFilePath: './merge-analysis.json',
  targetUsername: targetOrg
});

if (!validation.passed) {
  console.error('❌ Validation failed - aborting batch execution');
  console.error(validation.toString());
  process.exit(1);
}

console.log('✅ Validation passed - proceeding with batch execution');
```

## Success Criteria

### 1. Zero OFFSET Pagination Failures (90-day validation period)
**Measurement:** Monitor query logs for OFFSET-related errors
**Target:** 0 incidents in 90 days across all orgs
**Validation:** Automated log analysis script runs weekly

### 2. Pre-Batch Validation Catches 100% of Stale Data
**Measurement:** Track validation runs, failures detected, false positives
**Target:** >95% detection rate with <5% false positives
**Validation:** Inject synthetic stale data in test, verify detection

### 3. Query Performance Maintains or Improves
**Measurement:** Compare execution time (OFFSET vs cursor-based)
**Target:** ≤10% performance regression, ideally 20%+ improvement
**Validation:** Performance benchmarking suite in CI/CD pipeline

### 4. Developer Adoption (100% within 6 months)
**Measurement:** Grep codebase for OFFSET usage in new scripts
**Target:** 0 new OFFSET queries, all use salesforce-pagination.js
**Validation:** Automated pre-commit hook warns if OFFSET detected

## Examples

### Example 1: Basic Pagination

```javascript
const { paginateQuery } = require('./lib/salesforce-pagination');

// Query all accounts with keyset pagination
await paginateQuery({
  query: 'SELECT Id, Name, NumberOfEmployees FROM Account',
  targetUsername: 'production',
  estimatedCount: 3000,  // Auto-selects keyset strategy
  onBatch: async (records, batchNum) => {
    console.log(`Processing batch ${batchNum}: ${records.length} records`);

    for (const record of records) {
      // Process each record
      console.log(`${record.Name} has ${record.NumberOfEmployees} employees`);
    }
  }
});
```

### Example 2: Validation Before Batch Operation

```javascript
const { validateAnalysisFreshness } = require('./lib/validate-analysis-freshness');
const { paginateQuery } = require('./lib/salesforce-pagination');

async function runBatchMerge() {
  // Step 1: Validate analysis data
  const validation = await validateAnalysisFreshness({
    analysisFilePath: './merge-candidates-analysis.json',
    targetUsername: 'production',
    objectType: 'Account',
    sampleSize: 10,
    stalenessThresholdHours: 24,
    mismatchThresholdPercent: 10
  });

  if (!validation.passed) {
    console.error('❌ Validation failed:');
    console.error(validation.toString());
    console.error('\nRemediation: Re-run analysis query before batch execution');
    process.exit(1);
  }

  console.log('✅ Validation passed - data is fresh and complete');

  // Step 2: Execute batch merge operation
  // ... (batch merge logic)
}
```

### Example 3: Force Specific Strategy

```javascript
const { paginateQuery, STRATEGY } = require('./lib/salesforce-pagination');

// Force bulk API for very large dataset
await paginateQuery({
  query: 'SELECT Id, Name FROM Account',
  targetUsername: 'production',
  strategy: STRATEGY.BULK,  // Force Bulk API
  onBatch: async (records) => {
    // Process records
  }
});
```

## Monitoring & Alerting

### Recommended Metrics to Track

1. **Pagination Strategy Usage**
   - Count of queries by strategy (keyset/querymore/bulk)
   - Average query execution time by strategy
   - Failure rates by strategy

2. **Validation Execution**
   - Total validation runs per week
   - Pass/fail ratio
   - Average mismatch percentage
   - Staleness warnings count

3. **Data Quality**
   - Incidents prevented by validation
   - False positives rate
   - Time saved from early detection

4. **Performance**
   - Query execution time trend (keyset vs OFFSET baseline)
   - Records processed per second
   - Memory usage during pagination

### Alert Thresholds

- **Critical:** Validation failure rate >10% (investigate data quality)
- **Warning:** Average mismatch percentage >5% (staleness increasing)
- **Info:** Pagination strategy switches >50% (review estimatedCount accuracy)

## Troubleshooting

### Issue: "Keyset pagination requires Id field in SELECT clause"
**Solution:** Ensure your query includes `Id` in the SELECT:
```javascript
// ❌ Bad
query: 'SELECT Name FROM Account'

// ✅ Good
query: 'SELECT Id, Name FROM Account'
```

### Issue: Validation fails with "Record not found in Salesforce"
**Cause:** Records were deleted between analysis and validation
**Solution:** Re-run analysis to get current data

### Issue: High mismatch percentage in validation
**Cause:** Analysis data is stale or records are being actively modified
**Solution:**
1. Re-run analysis query immediately before batch execution
2. Consider locking records during batch operation
3. Reduce time between analysis and execution

### Issue: Performance regression with pagination
**Cause:** Wrong strategy selected, or inefficient query
**Solution:**
1. Check `estimatedCount` accuracy
2. Review query for inefficient WHERE clauses
3. Consider indexing on Salesforce side
4. Try forcing a different strategy

## Version History

### v1.0.0 (2025-10-14)
- Initial release
- Keyset, QueryMore, and Bulk pagination strategies
- Pre-batch validation framework
- Automated validation hook
- Comprehensive documentation

## References

- **Reflection Cohort:** fp-001-data-quality-validation
- **Asana Task:** https://app.asana.com/0/1211617834659194/1211640562611977
- **Fix Plan:** `reports/fix-plans-2025-10-14-15-45-00.json`
- **ROI:** $54,000/year | **Effort:** 12 hours | **Payback:** 0.8 months

## Support

For questions or issues:
1. Review this documentation
2. Check examples in `/examples/` directory
3. Review Asana task for additional context
4. Submit a reflection via `/reflect` for recurring issues
