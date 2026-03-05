# Dedup V2.0 Production Improvements

**Date**: 2025-10-16
**Based On**: Cross-sandbox testing (epsilon-corp2021 + delta-corp)
**Purpose**: Actionable improvements for production deployment

---

## Executive Summary

Testing across two sandboxes (12 accounts vs 10,922 accounts) revealed **8 specific improvements** we should implement before or shortly after production deployment.

**Priority Breakdown**:
- **P0 (Before Production)**: 2 improvements - Resource handling, backup optimization
- **P1 (First Week)**: 3 improvements - Progress visibility, caching, error recovery
- **P2 (First Month)**: 3 improvements - Incremental backup, parallel processing, industry templates

**Estimated Implementation**: 16-24 hours total

---

## P0: Critical Improvements (Before Production)

### 1. Handle ENOBUFS Errors Gracefully

**Problem Discovered**: delta-corp sandbox hit `spawnSync /bin/sh ENOBUFS` error when running importance-field-detector.js
- **Cause**: System resource limit (too many spawned processes)
- **Impact**: Blocks prepare workflow, poor user experience
- **Frequency**: Will occur on any large org (>5,000 accounts)

**Current Behavior**:
```
❌ Detection failed: Failed to get fields: spawnSync /bin/sh ENOBUFS
```

**Proposed Solution**: Add retry logic with exponential backoff + process pooling

**Implementation**:
```javascript
// importance-field-detector.js

class ImportanceFieldDetector {
    constructor(sobject, orgAlias, options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000; // 5 seconds
        this.processPool = options.processPool || 5; // Max concurrent processes
    }

    async getFieldsWithRetry(attempt = 1) {
        try {
            return await this.getFields();
        } catch (error) {
            if (error.message.includes('ENOBUFS') && attempt < this.maxRetries) {
                this.log(`Resource limit hit, retrying in ${this.retryDelay}ms (attempt ${attempt}/${this.maxRetries})`, 'WARN');
                await this.sleep(this.retryDelay * attempt); // Exponential backoff
                return await this.getFieldsWithRetry(attempt + 1);
            }
            throw error;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

**Alternative**: Use existing field describe from backup manifest
```javascript
// If field describe fails, extract field names from backup
const backupFile = path.join(backupDir, 'account_all_fields_active.json');
const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
const fieldNames = Object.keys(backup.records[0]);
// Continue with limited metadata
```

**Estimated Effort**: 2 hours
**ROI**: Prevents workflow failures on large orgs

---

### 2. Add Progress Indicators for Long-Running Operations

**Problem Discovered**: 15-minute backup on delta-corp had no progress visibility
- **Impact**: User doesn't know if process is hung or progressing
- **Comparison**: Small org (12 accounts) = instant, Large org (10,922) = 15 minutes

**Current Behavior**: Silent execution, no progress updates

**Proposed Solution**: Add progress bars and ETAs

**Implementation**:
```javascript
// sfdc-full-backup-generator.js

class ProgressTracker {
    constructor(totalRecords) {
        this.total = totalRecords;
        this.current = 0;
        this.startTime = Date.now();
    }

    update(batchSize) {
        this.current += batchSize;
        const percent = ((this.current / this.total) * 100).toFixed(1);
        const elapsed = Date.now() - this.startTime;
        const rate = this.current / (elapsed / 1000); // records per second
        const remaining = (this.total - this.current) / rate;

        console.log(`  Progress: ${this.current}/${this.total} (${percent}%) | ${rate.toFixed(1)} rec/sec | ETA: ${this.formatTime(remaining)}`);
    }

    formatTime(seconds) {
        if (seconds < 60) return `${seconds.toFixed(0)}s`;
        if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
    }
}

// Usage in backup loop:
const totalCount = await this.getRecordCount(orgAlias, sobject);
const progress = new ProgressTracker(totalCount);

for (let offset = 0; offset < totalCount; offset += batchSize) {
    const batch = await this.queryBatch(offset, batchSize);
    // ... save batch
    progress.update(batch.length);
}
```

**Example Output**:
```
📦 Step 1: Extracting active records (FIELDS(ALL))...
  Progress: 2000/10922 (18.3%) | 18.2 rec/sec | ETA: 8.2m
  Progress: 4000/10922 (36.6%) | 18.1 rec/sec | ETA: 6.4m
  Progress: 6000/10922 (54.9%) | 18.3 rec/sec | ETA: 4.5m
```

**Estimated Effort**: 2 hours
**ROI**: Better user experience, reduces support requests

---

## P1: High Priority Improvements (First Week)

### 3. Implement Importance Field Report Caching

**Problem Discovered**: importance-field-detector.js runs every time, even if object hasn't changed
- **Time Cost**: 3-5 minutes per run on medium orgs
- **Unnecessary**: Field metadata changes infrequently

**Proposed Solution**: Cache importance reports with TTL

**Implementation**:
```javascript
// importance-field-detector.js

class ImportanceFieldDetector {
    getCacheKey() {
        return `${this.sobject}_${this.orgAlias}`;
    }

    getCachePath() {
        const cacheDir = path.join(__dirname, '../../.cache/importance-reports');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        return path.join(cacheDir, `${this.getCacheKey()}.json`);
    }

    isCacheValid(maxAgeHours = 24) {
        const cachePath = this.getCachePath();
        if (!fs.existsSync(cachePath)) return false;

        const stats = fs.statSync(cachePath);
        const ageMs = Date.now() - stats.mtimeMs;
        const ageHours = ageMs / (1000 * 60 * 60);

        return ageHours < maxAgeHours;
    }

    async detectWithCache(options = {}) {
        const maxAge = options.maxAge || 24; // 24 hours default
        const forceRefresh = options.forceRefresh || false;

        if (!forceRefresh && this.isCacheValid(maxAge)) {
            this.log(`Using cached importance report (age: ${this.getCacheAge()}h)`, 'INFO');
            return this.loadFromCache();
        }

        this.log('Cache miss or expired, generating new report', 'INFO');
        const report = await this.detect();
        this.saveToCache(report);
        return report;
    }
}
```

**CLI Usage**:
```bash
# Use cache if available
node importance-field-detector.js Account delta-sandbox

# Force refresh
node importance-field-detector.js Account delta-sandbox --force-refresh

# Custom cache age
node importance-field-detector.js Account delta-sandbox --cache-age 48
```

**Estimated Effort**: 3 hours
**ROI**: 3-5 minutes saved per prepare workflow run

---

### 4. Add Backup Resumption on Failure

**Problem Discovered**: If backup fails at batch 40/55, entire process restarts from scratch
- **Impact**: 15 minutes wasted, user frustration
- **Cause**: No checkpoint/resume mechanism

**Proposed Solution**: Write batch checkpoints to manifest

**Implementation**:
```javascript
// sfdc-full-backup-generator.js

class BackupCheckpoint {
    constructor(backupDir) {
        this.checkpointFile = path.join(backupDir, '.checkpoint.json');
    }

    save(state) {
        fs.writeFileSync(this.checkpointFile, JSON.stringify({
            timestamp: new Date().toISOString(),
            ...state
        }, null, 2));
    }

    load() {
        if (!fs.existsSync(this.checkpointFile)) return null;
        return JSON.parse(fs.readFileSync(this.checkpointFile, 'utf8'));
    }

    clear() {
        if (fs.existsSync(this.checkpointFile)) {
            fs.unlinkSync(this.checkpointFile);
        }
    }
}

// Usage in backup loop:
const checkpoint = new BackupCheckpoint(backupDir);
const savedState = checkpoint.load();
const startOffset = savedState?.lastOffset || 0;

if (startOffset > 0) {
    this.log(`Resuming from batch ${startOffset / batchSize + 1}`, 'INFO');
}

for (let offset = startOffset; offset < totalCount; offset += batchSize) {
    const batch = await this.queryBatch(offset, batchSize);
    await this.saveBatch(batch, offset);
    checkpoint.save({ lastOffset: offset + batchSize });
}

checkpoint.clear(); // Success - remove checkpoint
```

**Estimated Effort**: 3 hours
**ROI**: Prevents wasted time on backup failures

---

### 5. Add Batch Size Auto-Tuning

**Problem Discovered**: 200 records/batch works for both orgs, but may not be optimal
- **Observation**: Small org could handle 500+, large org stable at 200
- **Opportunity**: Auto-tune based on org size and performance

**Proposed Solution**: Adaptive batch sizing

**Implementation**:
```javascript
// sfdc-full-backup-generator.js

class AdaptiveBatchSizer {
    constructor(totalRecords) {
        this.totalRecords = totalRecords;
        this.currentBatchSize = this.calculateInitialSize();
        this.performanceHistory = [];
    }

    calculateInitialSize() {
        // Start conservative based on org size
        if (this.totalRecords < 100) return 50;
        if (this.totalRecords < 1000) return 100;
        if (this.totalRecords < 10000) return 200;
        return 200; // Max safe size
    }

    recordPerformance(batchSize, timeMs, success) {
        this.performanceHistory.push({
            batchSize,
            timeMs,
            success,
            throughput: success ? batchSize / (timeMs / 1000) : 0
        });

        // Keep last 10 batches
        if (this.performanceHistory.length > 10) {
            this.performanceHistory.shift();
        }
    }

    getNextBatchSize() {
        if (this.performanceHistory.length < 3) {
            return this.currentBatchSize; // Not enough data
        }

        const avgThroughput = this.performanceHistory
            .slice(-5)
            .reduce((sum, h) => sum + h.throughput, 0) / 5;

        // If throughput high and no failures, increase batch size
        if (avgThroughput > 50 && this.currentBatchSize < 500) {
            this.currentBatchSize = Math.min(this.currentBatchSize * 1.5, 500);
        }

        // If throughput low, decrease batch size
        if (avgThroughput < 10 && this.currentBatchSize > 50) {
            this.currentBatchSize = Math.max(this.currentBatchSize * 0.75, 50);
        }

        return Math.round(this.currentBatchSize);
    }
}
```

**Estimated Effort**: 4 hours
**ROI**: 10-30% performance improvement on small/medium orgs

---

## P2: Medium Priority Improvements (First Month)

### 6. Implement Incremental Backup Mode

**Problem Discovered**: Full FIELDS(ALL) backup takes 15 minutes for 10k accounts
- **Use Case**: User wants to re-analyze pairs after fixing data issues
- **Unnecessary**: Re-extracting unchanged records

**Proposed Solution**: Incremental backup based on LastModifiedDate

**Implementation**:
```javascript
// sfdc-full-backup-generator.js

async extractIncrementalRecords(sobject, orgAlias, sinceDate) {
    const query = `
        SELECT FIELDS(ALL)
        FROM ${sobject}
        WHERE LastModifiedDate >= ${sinceDate}
        AND IsDeleted = false
        LIMIT 200
    `;

    // Query only modified records
    const modifiedRecords = await this.query(query);

    // Merge with existing backup
    const existingBackup = this.loadExistingBackup();
    const mergedRecords = this.mergeRecords(existingBackup, modifiedRecords);

    return mergedRecords;
}

mergeRecords(existing, modified) {
    const recordMap = new Map();

    // Load existing
    for (const record of existing.records) {
        recordMap.set(record.Id, record);
    }

    // Overlay modified (newer data)
    for (const record of modified) {
        recordMap.set(record.Id, record);
    }

    return { records: Array.from(recordMap.values()) };
}
```

**CLI Usage**:
```bash
# Full backup
node sfdc-full-backup-generator.js Account delta-sandbox

# Incremental (last 7 days)
node sfdc-full-backup-generator.js Account delta-sandbox --incremental --since 7d

# Incremental (since specific date)
node sfdc-full-backup-generator.js Account delta-sandbox --incremental --since 2025-10-01
```

**Estimated Effort**: 6 hours
**ROI**: 90% time savings for re-analysis workflows

---

### 7. Add Parallel Batch Processing

**Problem Discovered**: Batches processed sequentially (batch 1 → batch 2 → batch 3)
- **Opportunity**: Salesforce API allows 25+ concurrent requests
- **Potential**: 5-10x speedup with parallelization

**Proposed Solution**: Process batches in parallel with concurrency limit

**Implementation**:
```javascript
// sfdc-full-backup-generator.js

async extractRecordsParallel(sobject, orgAlias, options = {}) {
    const totalCount = await this.getRecordCount(orgAlias, sobject);
    const batchSize = options.batchSize || 200;
    const concurrency = options.concurrency || 5; // 5 parallel batches

    const batches = [];
    for (let offset = 0; offset < totalCount; offset += batchSize) {
        batches.push({ offset, limit: batchSize });
    }

    // Process batches in parallel with concurrency limit
    const results = await this.processConcurrent(batches, concurrency, async (batch) => {
        return await this.queryBatch(batch.offset, batch.limit);
    });

    return results.flat();
}

async processConcurrent(items, concurrency, processFn) {
    const results = [];
    const executing = [];

    for (const item of items) {
        const promise = processFn(item).then(result => {
            executing.splice(executing.indexOf(promise), 1);
            return result;
        });

        results.push(promise);
        executing.push(promise);

        if (executing.length >= concurrency) {
            await Promise.race(executing);
        }
    }

    return await Promise.all(results);
}
```

**CLI Usage**:
```bash
# Default (sequential)
node sfdc-full-backup-generator.js Account delta-sandbox

# Parallel with 5 concurrent batches
node sfdc-full-backup-generator.js Account delta-sandbox --parallel --concurrency 5

# Aggressive (10 concurrent)
node sfdc-full-backup-generator.js Account delta-sandbox --parallel --concurrency 10
```

**Estimated Effort**: 5 hours
**ROI**: 5-10x speedup (15 min → 2-3 min for 10k accounts)

---

### 8. Create Industry-Specific Config Templates

**Problem Discovered**: Same guardrails may not work for all industries
- **Example**: PropTech (delta-corp) may have multi-location businesses
- **Example**: B2G may have generic entity names ("City of...")

**Proposed Solution**: Pre-configured templates for common industries

**Implementation**:
```javascript
// config-templates/b2g.json
{
  "industry": "B2G",
  "description": "Business-to-Government (City agencies, housing authorities)",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.2,  // Lower threshold (generic .gov domains)
      "severity": "REVIEW"
    },
    "address_mismatch": {
      "enabled": true,
      "generic_entity_patterns": [
        "City of", "County", "Housing Authority", "Department of",
        "Office of", "District", "Municipality", "Township"
      ],
      "severity": "BLOCK"
    },
    "state_domain_mismatch": {
      "enabled": true,
      "severity": "BLOCK"  // Critical for government entities
    }
  }
}

// config-templates/proptech.json
{
  "industry": "PropTech",
  "description": "Property management, real estate",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.1,  // Strict (multi-location businesses)
      "severity": "BLOCK"
    },
    "address_mismatch": {
      "enabled": true,
      "generic_entity_patterns": [
        "Property Management", "Apartments", "Residences"
      ],
      "severity": "REVIEW"  // May be same company, different location
    }
  },
  "field_importance_overrides": {
    "Property_Address__c": 100,  // Critical for PropTech
    "Unit_Count__c": 95,
    "Management_Company__c": 90
  }
}

// config-templates/saas.json
{
  "industry": "SaaS",
  "description": "Software-as-a-Service companies",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.5,  // Higher tolerance (shared email domains)
      "severity": "REVIEW"
    },
    "integration_id_conflict": {
      "enabled": true,
      "severity": "BLOCK",  // Critical for subscription tracking
      "required_ids": ["Stripe_Customer_Id__c", "Chargebee_Id__c"]
    }
  }
}
```

**CLI Usage**:
```bash
# List available templates
node dedup-safety-engine.js templates

# Use template
node dedup-safety-engine.js analyze delta-sandbox pairs.csv --template proptech

# Generate custom config from template
node dedup-safety-engine.js generate-config --template b2g --output my-config.json
```

**Estimated Effort**: 4 hours
**ROI**: Better accuracy for industry-specific patterns

---

## Summary of Improvements

### Implementation Priority

**Before Production** (P0):
1. ✅ Handle ENOBUFS errors (2h) - **Critical for large orgs**
2. ✅ Add progress indicators (2h) - **Better UX**

**First Week** (P1):
3. Cache importance reports (3h) - **3-5 min savings per run**
4. Backup resumption (3h) - **Prevents wasted time**
5. Adaptive batch sizing (4h) - **10-30% performance gain**

**First Month** (P2):
6. Incremental backup (6h) - **90% time savings for re-analysis**
7. Parallel processing (5h) - **5-10x speedup**
8. Industry templates (4h) - **Better accuracy**

### Estimated Total Effort

- **P0**: 4 hours (before production)
- **P1**: 10 hours (first week)
- **P2**: 15 hours (first month)
- **Total**: 29 hours

### Expected ROI

| Improvement | Time Saved | User Impact |
|-------------|------------|-------------|
| ENOBUFS handling | Prevents failures | High |
| Progress indicators | N/A | High (UX) |
| Caching | 3-5 min/run | Medium |
| Backup resumption | 5-15 min/failure | High |
| Adaptive batching | 10-30% | Medium |
| Incremental backup | 90% on re-runs | High |
| Parallel processing | 5-10x speedup | Very High |
| Industry templates | N/A | Medium (accuracy) |

---

## Recommendations

### Phased Rollout

**Week 1: Deploy with P0**
- Implement ENOBUFS handling and progress indicators
- Deploy to beta customers
- Monitor for issues

**Week 2: Add P1**
- Implement caching, resumption, adaptive batching
- Deploy to expanded beta
- Collect performance metrics

**Month 1: Add P2**
- Implement incremental backup and parallel processing
- Deploy to all customers
- Add industry templates based on feedback

### Monitoring Points

After deploying each improvement, monitor:
1. **Backup times**: Track avg/p95/p99 backup duration
2. **Failure rates**: Track ENOBUFS errors, timeout errors
3. **Cache hit rates**: Track how often cached reports are used
4. **Resumption frequency**: Track how often backups need resuming
5. **Performance gains**: Compare before/after for each improvement

---

**Document Version**: 1.0
**Last Updated**: 2025-10-16
**Status**: Ready for Implementation
