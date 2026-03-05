# 07 - API Governance & Rate Limits

## Overview

Effective API governance is critical for reliable Marketo automation. This document covers rate limits, quota management, error handling, and best practices for maintaining healthy API usage.

## Rate Limits

### REST API Limits

| Limit Type | Value | Scope | Recovery |
|------------|-------|-------|----------|
| Rate Limit | 100 calls / 20 seconds | Per API user | Auto-resets after 20s |
| Daily Quota | 50,000 calls / day | Per instance | Resets midnight UTC |
| Concurrent Requests | 10 simultaneous | Per API user | Serialize requests |

### Bulk API Limits

| Limit Type | Value | Notes |
|------------|-------|-------|
| Concurrent Exports | 2 running | Additional jobs queue (max 10) |
| Concurrent Imports | 10 running | |
| Daily Export Volume | 500 MB | Resets midnight UTC |
| Date Range Max | 31 days | Per export job |
| File Retention | 7 days | Download before expiration |

### Asset API Limits

| Operation | Limit | Notes |
|-----------|-------|-------|
| Batch lead sync | 300 leads/call | Per request |
| Query filter values | 300 values | Per filterValues array |
| Merge losers | 3 leads/call | Per merge operation |
| Token name length | 50 characters | Max length |

## Error Codes Reference

### Authentication Errors (600s)

| Code | Name | Cause | Action |
|------|------|-------|--------|
| 600 | Access token invalid | Malformed token | Re-authenticate |
| 601 | Access token expired | Token lifetime exceeded | Auto-refresh, retry |
| 602 | Access token invalid | Token revoked | Re-authenticate |
| 603 | Access denied | Insufficient permissions | Check API user permissions |
| 604 | Request timeout | Server-side timeout | Retry with backoff |
| 605 | HTTP method unsupported | Wrong HTTP verb | Fix request method |
| 606 | Max rate limit exceeded | Too many calls | Wait 20s, retry |
| 607 | Daily quota exceeded | 50K calls reached | Wait for midnight UTC |
| 608 | API temporarily unavailable | Service degradation | Retry with backoff |
| 609 | Invalid JSON | Malformed request body | Fix JSON syntax |
| 610 | Requested resource not found | Invalid endpoint | Check API URL |
| 611 | System error | Server error | Retry with backoff |
| 612 | Invalid content type | Wrong Content-Type | Fix headers |
| 613 | Invalid multipart request | Bad file upload | Fix multipart format |
| 614 | Invalid subscription | API not enabled | Contact Marketo admin |
| 615 | Concurrent access limit | 10 concurrent requests | Serialize requests |

### Lead Database Errors (1000s)

| Code | Name | Cause | Action |
|------|------|-------|--------|
| 1001 | Invalid value | Bad field value | Fix data |
| 1002 | Missing required field | Required field null | Provide value |
| 1003 | Invalid data | Data validation failed | Check field types |
| 1004 | Lead not found | Invalid lead ID | Verify lead exists |
| 1005 | Lead already exists | Duplicate on insert | Use createOrUpdate |
| 1006 | Lead not found for merge | Merge target missing | Verify lead IDs |
| 1007 | Ambiguous merge | Multiple matches | Use more specific lookup |
| 1008 | Partition not found | Invalid partition | Check partition name |
| 1009 | Failed to update | CRM sync conflict | Retry or skip |
| 1010 | Activities blocked | Sync disabled | Enable sync |

### Bulk API Errors (1029+)

| Code | Name | Cause | Action |
|------|------|-------|--------|
| 1029 | Bulk queue full | Export queue at capacity | Wait 5 min, retry |
| 1035 | Date range exceeded | > 31 days | Reduce range |
| 1036 | Invalid activity type | Bad type ID | Check activity_types_list |
| 1037 | Missing filter | Required filter absent | Add createdAt filter |

## Rate Limit Management

### Proactive Throttling
```javascript
class RateLimitManager {
  constructor(options = {}) {
    this.callsPerWindow = options.callsPerWindow || 100;
    this.windowMs = options.windowMs || 20000;
    this.callHistory = [];
    this.dailyCallCount = 0;
    this.dailyLimit = options.dailyLimit || 50000;
  }

  async throttle() {
    // Check daily limit
    if (this.dailyCallCount >= this.dailyLimit) {
      throw new Error('Daily quota exceeded (607). Wait for midnight UTC.');
    }

    // Clean old entries
    const now = Date.now();
    this.callHistory = this.callHistory.filter(t => now - t < this.windowMs);

    // Check rate limit
    if (this.callHistory.length >= this.callsPerWindow) {
      const oldestCall = this.callHistory[0];
      const waitTime = this.windowMs - (now - oldestCall);
      await new Promise(resolve => setTimeout(resolve, waitTime + 100));
    }

    // Record this call
    this.callHistory.push(now);
    this.dailyCallCount++;
  }

  getRemainingCalls() {
    const now = Date.now();
    this.callHistory = this.callHistory.filter(t => now - t < this.windowMs);
    return {
      windowRemaining: this.callsPerWindow - this.callHistory.length,
      dailyRemaining: this.dailyLimit - this.dailyCallCount
    };
  }

  resetDaily() {
    this.dailyCallCount = 0;
  }
}

// Usage
const limiter = new RateLimitManager();

async function makeApiCall(fn) {
  await limiter.throttle();
  return await fn();
}
```

### Retry with Backoff
```javascript
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 60000,
    backoffMultiplier = 2
  } = options;

  const retryableErrors = new Set([604, 606, 608, 611, 615, 1029]);
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const errorCode = extractErrorCode(error);

      // Daily quota - no retry
      if (errorCode === 607) {
        throw new Error('Daily quota exceeded. Cannot retry until midnight UTC.');
      }

      // Non-retryable error
      if (!retryableErrors.has(errorCode)) {
        throw error;
      }

      // Max retries reached
      if (attempt === maxRetries) {
        throw error;
      }

      // Log and wait
      console.log(`Attempt ${attempt}/${maxRetries} failed with error ${errorCode}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }
}

function extractErrorCode(error) {
  const match = error.message.match(/\[(\d+)\]/);
  return match ? parseInt(match[1]) : 0;
}
```

## Quota Monitoring

### Track API Usage
```javascript
class QuotaMonitor {
  constructor() {
    this.metrics = {
      totalCalls: 0,
      callsByEndpoint: {},
      errorsByCode: {},
      bulkExportBytes: 0,
      lastReset: new Date().toISOString()
    };
  }

  recordCall(endpoint, bytesExported = 0) {
    this.metrics.totalCalls++;
    this.metrics.callsByEndpoint[endpoint] =
      (this.metrics.callsByEndpoint[endpoint] || 0) + 1;
    this.metrics.bulkExportBytes += bytesExported;
  }

  recordError(errorCode) {
    this.metrics.errorsByCode[errorCode] =
      (this.metrics.errorsByCode[errorCode] || 0) + 1;
  }

  getStatus() {
    const dailyLimit = 50000;
    const bulkLimit = 500 * 1024 * 1024;  // 500 MB

    return {
      apiUsage: {
        used: this.metrics.totalCalls,
        limit: dailyLimit,
        remaining: dailyLimit - this.metrics.totalCalls,
        percentUsed: ((this.metrics.totalCalls / dailyLimit) * 100).toFixed(2)
      },
      bulkExport: {
        used: this.metrics.bulkExportBytes,
        limit: bulkLimit,
        remaining: bulkLimit - this.metrics.bulkExportBytes,
        percentUsed: ((this.metrics.bulkExportBytes / bulkLimit) * 100).toFixed(2)
      },
      topEndpoints: Object.entries(this.metrics.callsByEndpoint)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      errors: this.metrics.errorsByCode,
      lastReset: this.metrics.lastReset
    };
  }

  reset() {
    this.metrics = {
      totalCalls: 0,
      callsByEndpoint: {},
      errorsByCode: {},
      bulkExportBytes: 0,
      lastReset: new Date().toISOString()
    };
  }
}
```

### Pre-Operation Quota Check
```javascript
async function checkQuotaBeforeOperation(operation, estimatedCalls) {
  const quotaStatus = quotaMonitor.getStatus();

  // Check API calls
  if (quotaStatus.apiUsage.remaining < estimatedCalls) {
    throw new Error(
      `Insufficient API quota. Need ${estimatedCalls} calls, only ${quotaStatus.apiUsage.remaining} remaining.`
    );
  }

  // Check bulk export quota (if applicable)
  if (operation.type === 'bulkExport') {
    const estimatedBytes = operation.estimatedBytes || 10 * 1024 * 1024;  // Default 10MB
    if (quotaStatus.bulkExport.remaining < estimatedBytes) {
      throw new Error(
        `Insufficient bulk export quota. Need ~${(estimatedBytes / 1024 / 1024).toFixed(0)}MB, only ${(quotaStatus.bulkExport.remaining / 1024 / 1024).toFixed(0)}MB remaining.`
      );
    }
  }

  return true;
}
```

## Best Practices

### DO: Implement Proactive Throttling
```javascript
// Good: Pre-emptive rate limiting
async function batchProcess(items) {
  for (const item of items) {
    await rateLimiter.throttle();  // Check before call
    await processItem(item);
  }
}
```

### DON'T: Ignore Rate Limit Errors
```javascript
// Bad: No error handling
for (const lead of leads) {
  await mcp__marketo__lead_create({ leads: [lead] });  // Will fail at scale
}

// Good: Handle rate limits
for (const lead of leads) {
  await retryWithBackoff(() =>
    mcp__marketo__lead_create({ leads: [lead] })
  );
}
```

### DO: Batch Operations
```javascript
// Good: Batch leads (up to 300)
await mcp__marketo__lead_create({
  leads: leadsArray.slice(0, 300),
  action: 'createOrUpdate'
});

// Bad: Individual calls
for (const lead of leadsArray) {
  await mcp__marketo__lead_create({ leads: [lead] });  // 300 calls vs 1
}
```

### DO: Use Bulk API for Large Datasets
```javascript
// Good: Bulk export for large data
await mcp__marketo__bulk_lead_export_create({
  fields: ['email', 'score'],
  filter: { createdAt: { startAt, endAt } }
});

// Bad: Paginated REST queries for large data
let offset = 0;
while (true) {
  const batch = await mcp__marketo__lead_query({ offset, maxReturn: 300 });
  // This uses API calls, bulk uses 1 job
}
```

### DO: Monitor and Alert
```javascript
// Check quota periodically
setInterval(() => {
  const status = quotaMonitor.getStatus();

  if (status.apiUsage.percentUsed > 80) {
    console.warn(`API quota at ${status.apiUsage.percentUsed}%`);
  }

  if (status.bulkExport.percentUsed > 80) {
    console.warn(`Bulk export quota at ${status.bulkExport.percentUsed}%`);
  }
}, 300000);  // Every 5 minutes
```

## Governance Checklist

### Pre-Operation
- [ ] Estimate total API calls required
- [ ] Check current quota status
- [ ] Verify bulk export quota if applicable
- [ ] Plan for date range limits (31 days max)
- [ ] Identify retry strategy

### During Operation
- [ ] Implement throttling between calls
- [ ] Handle 606 (rate limit) with 20s wait
- [ ] Handle 615 (concurrent limit) with serialization
- [ ] Log all operations for audit
- [ ] Track actual vs estimated calls

### Post-Operation
- [ ] Record final metrics
- [ ] Review error rates
- [ ] Update quota projections
- [ ] Document lessons learned

## Recovery Procedures

### Rate Limit Recovery (606)
1. Stop all API calls immediately
2. Wait 20 seconds
3. Resume with reduced call rate
4. Implement throttling if not present

### Daily Quota Recovery (607)
1. Stop all non-critical operations
2. Log time of quota exhaustion
3. Schedule retry after midnight UTC
4. Review operations to reduce future usage

### Concurrent Limit Recovery (615)
1. Serialize all pending requests
2. Add queuing mechanism
3. Reduce parallelism to < 10
4. Monitor for continued issues

### Bulk Queue Full Recovery (1029)
1. Wait 5 minutes
2. Check existing job status
3. Cancel stale jobs if possible
4. Retry with single job

## Agent Routing

All agents should implement API governance. The `marketo-automation-orchestrator` is responsible for coordinating operations within quota limits.

| Concern | Responsibility |
|---------|---------------|
| Rate limiting | All agents (built-in) |
| Quota monitoring | `marketo-automation-orchestrator` |
| Error recovery | All agents (built-in) |
| Bulk job management | `marketo-data-operations` |

