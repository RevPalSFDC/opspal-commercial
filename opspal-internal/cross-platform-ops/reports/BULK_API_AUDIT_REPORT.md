# Salesforce Bulk API 2.0 Audit Report

**Repository**: cross-platform-ops
**Date**: 2025-09-21
**Auditor**: Platform/RevOps Engineering Team

## AUDIT SUMMARY

| Finding | Severity | Files Affected | Status |
|---------|----------|----------------|--------|
| Mixed API Usage | **P0** | 31+ files | ❌ CRITICAL |
| No True Bulk API 2.0 | **P0** | All bulk scripts | ❌ CRITICAL |
| Memory Issues | **P0** | CSV handlers | ❌ CRITICAL |
| Missing Error Handling | **P1** | Multiple files | ⚠️ HIGH |
| No Concurrency Control | **P1** | All bulk operations | ⚠️ HIGH |
| No Resume Capability | **P2** | All scripts | ⚠️ MEDIUM |

## Critical Findings (P0)

### 1. ❌ NOT Using Bulk API 2.0 Properly
**Files**: `bulk-process-contacts.js`, `bulk-api-marking.js`, `bulk-process-all-contacts.js`

**Issue**: Scripts use `sf data upsert bulk` CLI command, which is a wrapper, NOT direct Bulk API 2.0
```javascript
// CURRENT - Not true Bulk API 2.0
const command = `sf data upsert bulk --sobject Contact --file "${filename}" --external-id Id --target-org ${ORG_ALIAS} --wait 120`;
```

**Impact**:
- Cannot handle >2M records reliably
- No job lifecycle control
- No partial failure handling
- No result reconciliation

### 2. ❌ Memory-Unsafe CSV Handling
**Files**: All bulk processing scripts

**Issue**: Loading entire CSV files into memory
```javascript
// DANGEROUS for large files
const fileContent = await fs.readFile(INPUT_FILE, 'utf-8');
const lines = fileContent.split('\n');  // LOADS ENTIRE FILE!
```

**Impact**: Out of memory crashes at ~500K records

### 3. ❌ No File Size/Split Management
**Issue**: No enforcement of 150MB CSV limit, no automatic splitting

**Impact**: Jobs fail silently when files exceed limits

## High Priority Findings (P1)

### 4. ⚠️ Insufficient Error Handling
**Pattern Found**:
```javascript
try {
    // bulk operation
} catch (error) {
    console.error('Failed:', error.message);
    // No retry, no categorization, no dead-letter
}
```

### 5. ⚠️ No Concurrency Control
- No respect for 25 concurrent job limit
- No queue management
- No backpressure

### 6. ⚠️ Missing Result Downloads
- Not downloading failedResults CSV
- Not downloading successfulResults CSV
- No reconciliation logic

## Medium Priority Findings (P2)

### 7. ⚠️ No Checkpointing/Resume
- Cannot resume interrupted jobs
- Re-processes everything on failure

### 8. ⚠️ Basic Retry Logic
```javascript
// Found pattern - too simplistic
if (retryCount < MAX_RETRIES) {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    return querySalesforce(query, retryCount + 1);
}
```
- No exponential backoff
- No jitter
- No error categorization

## PR PLAN

| PR # | Description | Owner | ETA | Risk |
|------|-------------|-------|-----|------|
| 1 | Implement BulkApiClient with proper lifecycle | TBD | 3 days | High |
| 2 | Add CsvSplitter with streaming | TBD | 2 days | Medium |
| 3 | Create JobOrchestrator with queue | TBD | 3 days | High |
| 4 | Add ResultReconciler | TBD | 2 days | Low |
| 5 | Implement retry with backoff | TBD | 1 day | Low |
| 6 | Add checkpoint/resume | TBD | 2 days | Medium |

## IMPLEMENTATION DIFFS

### PR 1: BulkApiClient Implementation
**New File**: `lib/salesforce-bulk-client.js`
```javascript
class SalesforceBulkClient {
    async createJob(object, operation) {
        // Direct API call to /services/data/vXX.0/jobs/ingest
    }

    async uploadCSV(jobId, csvStream, options = {}) {
        // Stream upload with gzip
        // Enforce 150MB limit
        // Handle chunking
    }

    async closeJob(jobId) {
        // Set state to UploadComplete
    }

    async pollJobStatus(jobId) {
        // Poll with exponential backoff
    }

    async downloadResults(jobId, type = 'all') {
        // Download success/failed/unprocessed CSVs
    }
}
```

### PR 2: CsvSplitter Implementation
**New File**: `lib/csv-splitter.js`
```javascript
class CsvSplitter {
    async *splitBySize(inputPath, maxSizeMB = 150) {
        // Stream-based splitting
        // Yield file paths
    }

    async *splitByRows(inputPath, maxRows = 10000) {
        // Row-based splitting with streaming
    }
}
```

### PR 3: JobOrchestrator
**New File**: `lib/job-orchestrator.js`
```javascript
class JobOrchestrator {
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent || 10;
        this.queue = new PQueue({concurrency: this.maxConcurrent});
    }

    async processFiles(files, operation) {
        // Queue management
        // Progress tracking
        // Result aggregation
    }
}
```

### PR 4: Enhanced Retry Logic
**New File**: `lib/retry-handler.js`
```javascript
class RetryHandler {
    async executeWithRetry(fn, options = {}) {
        const {
            maxRetries = 3,
            backoffBase = 1000,
            jitter = true,
            retryableErrors = ['UNABLE_TO_LOCK_ROW', 'REQUEST_TIMEOUT']
        } = options;

        // Categorized retry logic
        // Exponential backoff with jitter
    }
}
```

## RUNBOOK

### How to Run Bulk Operations (After Fixes)

```bash
# 1. Validate environment
node scripts/preflight-validator.js --org production

# 2. Dry run to estimate
node bin/bulk-processor.js \
  --operation upsert \
  --object Contact \
  --file data.csv \
  --dry-run

# 3. Execute with monitoring
node bin/bulk-processor.js \
  --operation upsert \
  --object Contact \
  --file data.csv \
  --max-concurrent 10 \
  --checkpoint-dir ./checkpoints \
  --monitor

# 4. Resume if interrupted
node bin/bulk-processor.js --resume checkpoint-xyz.json

# 5. Reconcile results
node bin/reconcile-results.js --job-dir ./jobs/job-123
```

### Monitoring
```bash
# Watch job progress
tail -f logs/bulk-jobs.log | grep JOB_STATUS

# Check metrics
curl http://localhost:3000/metrics | grep bulk_

# View dashboard
open http://localhost:3000/dashboard
```

### Rollback
```bash
# 1. Stop all jobs
node bin/bulk-processor.js --stop-all

# 2. Export rollback data
node bin/export-rollback.js --job-id xyz

# 3. Apply rollback
node bin/apply-rollback.js --file rollback-xyz.csv
```

## Red Flags to Fix Immediately

1. **Loading full CSVs into memory** - Will crash on large datasets
2. **No job lifecycle management** - Cannot control or monitor jobs
3. **No result download** - Cannot identify failures
4. **No concurrency limits** - Will hit API limits
5. **No gzip compression** - 10x slower uploads

## Recommendations

### Immediate Actions (Week 1)
1. Implement streaming CSV reader
2. Add proper Bulk API 2.0 client
3. Implement result download and parsing

### Short Term (Week 2-3)
1. Add job orchestration with queue
2. Implement retry with exponential backoff
3. Add checkpoint/resume capability

### Long Term (Month 1-2)
1. Build monitoring dashboard
2. Implement ML-based duplicate detection
3. Add predictive scaling for job concurrency

## Compliance Checklist

Current state vs requirements:

- [ ] ❌ Bulk API v2.0 endpoints and lifecycle
- [ ] ❌ File splitting (<150MB)
- [ ] ❌ Streaming I/O
- [ ] ❌ Gzip compression
- [ ] ✅ Single auth session (partial)
- [ ] ❌ Keep-alive connections
- [ ] ❌ Sorting/grouping for lock reduction
- [ ] ❌ Categorized retries with backoff
- [ ] ❌ Results download and reconciliation
- [ ] ❌ Resume capability
- [ ] ❌ Concurrent job limits
- [ ] ❌ Metrics and monitoring
- [ ] ❌ Configurable concurrency
- [ ] ❌ Comprehensive tests

**Overall Score**: 1/14 (7%) - **CRITICAL IMPROVEMENTS NEEDED**

## Conclusion

The current implementation is **not production-ready** for >2M record operations. Critical infrastructure components are missing, and the codebase shows patterns that will fail at scale. Immediate refactoring is required before attempting large-scale data operations.

**Estimated effort**: 15-20 engineering days
**Risk if not addressed**: Production outages, data loss, API limit violations