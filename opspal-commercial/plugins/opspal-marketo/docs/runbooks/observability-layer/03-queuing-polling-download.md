# Queuing, Polling & Download Strategies

## Overview

Marketo's Bulk Extract API operates asynchronously with strict concurrency and quota limits. This runbook covers strategies for managing job queues, efficient polling, and reliable file downloads while respecting these constraints.

## Queue Management

### Concurrency Limits

| Limit | Value | Scope |
|-------|-------|-------|
| Running jobs | 2 | Per subscription |
| Queued jobs | 10 | Per subscription (including running) |
| Daily export quota | 500 MB | Per subscription |

### Queue State Machine

```
Created → Queued → Processing → Completed
                ↘           ↘
                  Cancelled   Failed
```

**State Descriptions**:
- `Created` - Job defined but not yet enqueued
- `Queued` - Waiting for processing slot
- `Processing` - Actively extracting data
- `Completed` - Data ready for download
- `Cancelled` - Job cancelled before completion
- `Failed` - Job failed during processing

### Intelligent Queue Management

```javascript
/**
 * Queue manager that respects Marketo limits
 */
class BulkExportQueueManager {
  constructor() {
    this.maxConcurrent = 2;
    this.maxQueued = 10;
    this.pendingJobs = [];
    this.activeJobs = [];
  }

  async enqueueJob(jobConfig) {
    // Check if we can enqueue
    const currentStatus = await this.getQueueStatus();

    if (currentStatus.total >= this.maxQueued) {
      // Queue full - add to local pending queue
      this.pendingJobs.push(jobConfig);
      return { status: 'pending_local', position: this.pendingJobs.length };
    }

    // Safe to enqueue
    const exportId = await this.createAndEnqueue(jobConfig);
    this.activeJobs.push(exportId);
    return { status: 'enqueued', exportId };
  }

  async processCompletedJob(exportId) {
    // Remove from active
    this.activeJobs = this.activeJobs.filter(id => id !== exportId);

    // Check if we can enqueue pending
    if (this.pendingJobs.length > 0) {
      const nextJob = this.pendingJobs.shift();
      await this.enqueueJob(nextJob);
    }
  }
}
```

### Priority Queuing

When queue is constrained, prioritize by business value:

```javascript
const priorityOrder = [
  { type: 'activities', weight: 100 },  // Most time-sensitive
  { type: 'leads', weight: 80 },        // Core data
  { type: 'programMembers', weight: 60 } // Can be derived from activities
];

function sortJobsByPriority(jobs) {
  return jobs.sort((a, b) => {
    const weightA = priorityOrder.find(p => p.type === a.type)?.weight || 0;
    const weightB = priorityOrder.find(p => p.type === b.type)?.weight || 0;
    return weightB - weightA;
  });
}
```

## Polling Strategies

### Basic Polling

Marketo updates job status at most every 60 seconds. Polling faster wastes API calls.

```javascript
async function pollUntilComplete(exportId, maxWait = 3600000) {
  const startTime = Date.now();
  const pollInterval = 60000; // 60 seconds

  while (Date.now() - startTime < maxWait) {
    const status = await mcp__marketo__bulk_lead_export_status({ exportId });

    if (status.status === 'Completed') {
      return { success: true, ...status };
    }

    if (status.status === 'Failed' || status.status === 'Cancelled') {
      return { success: false, ...status };
    }

    // Wait before next poll
    await sleep(pollInterval);
  }

  throw new Error(`Export ${exportId} timed out after ${maxWait}ms`);
}
```

### Exponential Backoff Polling

For large exports that take longer:

```javascript
async function pollWithBackoff(exportId, options = {}) {
  const {
    initialInterval = 60000,   // Start at 60s
    maxInterval = 300000,      // Cap at 5 minutes
    multiplier = 1.5,
    maxWait = 7200000          // 2 hour max
  } = options;

  let interval = initialInterval;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await mcp__marketo__bulk_lead_export_status({ exportId });

    // Log progress
    console.log(`[${exportId}] Status: ${status.status}, Poll interval: ${interval}ms`);

    if (['Completed', 'Failed', 'Cancelled'].includes(status.status)) {
      return status;
    }

    await sleep(interval);
    interval = Math.min(interval * multiplier, maxInterval);
  }

  throw new Error(`Export ${exportId} exceeded max wait time`);
}
```

### Parallel Job Polling

When managing multiple exports:

```javascript
async function pollMultipleJobs(exportIds) {
  const results = new Map();
  const pending = new Set(exportIds);

  while (pending.size > 0) {
    // Poll all pending jobs in parallel
    const statusPromises = Array.from(pending).map(async (id) => {
      const status = await mcp__marketo__bulk_lead_export_status({ exportId: id });
      return { id, status };
    });

    const statuses = await Promise.all(statusPromises);

    for (const { id, status } of statuses) {
      if (['Completed', 'Failed', 'Cancelled'].includes(status.status)) {
        results.set(id, status);
        pending.delete(id);
      }
    }

    if (pending.size > 0) {
      await sleep(60000);
    }
  }

  return results;
}
```

## Download Strategies

### Basic Download

```javascript
async function downloadExport(exportId, outputPath) {
  const content = await mcp__marketo__bulk_lead_export_file({ exportId });

  // Write to file
  await fs.writeFile(outputPath, content, 'utf8');

  return {
    path: outputPath,
    size: content.length
  };
}
```

### Chunked Download for Large Files

For files exceeding memory limits, use HTTP range requests:

```javascript
async function downloadLargeExport(exportId, outputPath, chunkSize = 10 * 1024 * 1024) {
  // Get file info first
  const status = await mcp__marketo__bulk_lead_export_status({ exportId });
  const fileSize = status.fileSize;

  const writeStream = fs.createWriteStream(outputPath);
  let downloaded = 0;

  while (downloaded < fileSize) {
    const rangeEnd = Math.min(downloaded + chunkSize - 1, fileSize - 1);

    const chunk = await downloadWithRange(exportId, downloaded, rangeEnd);
    writeStream.write(chunk);

    downloaded = rangeEnd + 1;
    console.log(`Downloaded ${downloaded}/${fileSize} bytes (${Math.round(downloaded/fileSize*100)}%)`);
  }

  writeStream.end();
  return { path: outputPath, size: fileSize };
}
```

### Download with Retry

Handle transient failures:

```javascript
async function downloadWithRetry(exportId, outputPath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const content = await mcp__marketo__bulk_lead_export_file({ exportId });
      await fs.writeFile(outputPath, content, 'utf8');
      return { success: true, path: outputPath };
    } catch (error) {
      console.error(`Download attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}
```

## Quota Management

### Tracking Daily Usage

```javascript
class QuotaTracker {
  constructor(dailyLimit = 500 * 1024 * 1024) { // 500 MB
    this.dailyLimit = dailyLimit;
    this.usedToday = 0;
    this.lastReset = this.getTodayUTC();
  }

  getTodayUTC() {
    return new Date().toISOString().split('T')[0];
  }

  checkReset() {
    const today = this.getTodayUTC();
    if (today !== this.lastReset) {
      this.usedToday = 0;
      this.lastReset = today;
    }
  }

  recordUsage(bytes) {
    this.checkReset();
    this.usedToday += bytes;
  }

  getRemaining() {
    this.checkReset();
    return this.dailyLimit - this.usedToday;
  }

  canExport(estimatedSize) {
    return this.getRemaining() >= estimatedSize;
  }

  getUsagePercent() {
    this.checkReset();
    return (this.usedToday / this.dailyLimit) * 100;
  }
}
```

### Pre-Export Quota Check

```javascript
async function preExportQuotaCheck(estimatedSize, tracker) {
  const remaining = tracker.getRemaining();
  const usagePercent = tracker.getUsagePercent();

  if (!tracker.canExport(estimatedSize)) {
    return {
      allowed: false,
      reason: `Insufficient quota. Remaining: ${formatBytes(remaining)}, Required: ${formatBytes(estimatedSize)}`,
      suggestion: 'Wait for quota reset at midnight UTC or reduce export scope'
    };
  }

  if (usagePercent >= 80) {
    return {
      allowed: true,
      warning: `Quota at ${usagePercent.toFixed(1)}%. Consider prioritizing critical exports.`
    };
  }

  return { allowed: true };
}
```

## Rate Limit Handling

### Sliding Window Tracker

```javascript
class RateLimitTracker {
  constructor() {
    this.calls = [];
    this.windowMs = 20000; // 20 seconds
    this.maxCalls = 100;
  }

  recordCall() {
    const now = Date.now();
    this.calls.push(now);
    this.pruneOldCalls(now);
  }

  pruneOldCalls(now) {
    const cutoff = now - this.windowMs;
    this.calls = this.calls.filter(t => t > cutoff);
  }

  getCallsInWindow() {
    this.pruneOldCalls(Date.now());
    return this.calls.length;
  }

  canMakeCall() {
    return this.getCallsInWindow() < this.maxCalls;
  }

  getWaitTime() {
    if (this.canMakeCall()) return 0;

    const oldest = Math.min(...this.calls);
    return (oldest + this.windowMs) - Date.now();
  }
}
```

### Rate-Limited API Wrapper

```javascript
async function rateLimitedCall(fn, rateLimiter) {
  while (!rateLimiter.canMakeCall()) {
    const waitTime = rateLimiter.getWaitTime();
    console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
    await sleep(waitTime);
  }

  rateLimiter.recordCall();
  return fn();
}
```

## Error Recovery

### Job Failure Recovery

```javascript
async function handleJobFailure(exportId, originalConfig) {
  const status = await mcp__marketo__bulk_lead_export_status({ exportId });

  if (status.status === 'Failed') {
    // Log failure details
    console.error(`Export ${exportId} failed:`, status.errorMsg);

    // Check if retryable
    if (isRetryableError(status.errorMsg)) {
      console.log('Retrying export with same configuration...');
      return await createAndEnqueueExport(originalConfig);
    }

    // Check if date range too large
    if (status.errorMsg.includes('date range')) {
      console.log('Splitting date range and retrying...');
      return await splitAndRetryExport(originalConfig);
    }

    throw new Error(`Non-retryable export failure: ${status.errorMsg}`);
  }
}

function isRetryableError(errorMsg) {
  const retryablePatterns = [
    'timeout',
    'temporary',
    'service unavailable',
    'try again'
  ];
  return retryablePatterns.some(p => errorMsg.toLowerCase().includes(p));
}
```

### Splitting Large Date Ranges

```javascript
function splitDateRange(startAt, endAt, maxDays = 31) {
  const ranges = [];
  let current = new Date(startAt);
  const end = new Date(endAt);

  while (current < end) {
    const rangeEnd = new Date(current);
    rangeEnd.setDate(rangeEnd.getDate() + maxDays - 1);

    if (rangeEnd > end) {
      rangeEnd.setTime(end.getTime());
    }

    ranges.push({
      startAt: current.toISOString(),
      endAt: rangeEnd.toISOString()
    });

    current = new Date(rangeEnd);
    current.setDate(current.getDate() + 1);
  }

  return ranges;
}
```

## File Retention

Marketo retains export files for **7 days only**. After that, the file is deleted and cannot be recovered.

### Best Practices

1. **Download immediately** after job completes
2. **Store locally** in observability directory
3. **Verify downloads** by checking file size matches expected
4. **Log download timestamps** for audit trail

```javascript
async function downloadAndVerify(exportId, outputPath) {
  const status = await mcp__marketo__bulk_lead_export_status({ exportId });

  // Download
  const content = await mcp__marketo__bulk_lead_export_file({ exportId });
  await fs.writeFile(outputPath, content, 'utf8');

  // Verify
  const stats = await fs.stat(outputPath);
  if (stats.size !== status.fileSize) {
    throw new Error(`Download size mismatch. Expected ${status.fileSize}, got ${stats.size}`);
  }

  return {
    path: outputPath,
    size: stats.size,
    downloadedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
}
```

## Related

- [02-bulk-export-automation.md](./02-bulk-export-automation.md) - Export configuration
- [04-data-normalization.md](./04-data-normalization.md) - Processing downloaded files
