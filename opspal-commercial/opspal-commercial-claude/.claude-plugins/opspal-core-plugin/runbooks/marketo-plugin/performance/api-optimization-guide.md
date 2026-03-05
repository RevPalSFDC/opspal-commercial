# API Optimization Guide

## Purpose

Best practices for optimizing Marketo API usage and performance.

## API Limits Reference

| Limit | Value | Notes |
|-------|-------|-------|
| Rate Limit | 100 calls / 20 seconds | Rolling window |
| Daily Limit | 50,000 calls | Resets at midnight |
| Bulk Batch Size | 300 records | Per operation |
| Concurrent Requests | 10 | Sliding window |
| Export Size | 500 MB | Per export job |

## Optimization Strategies

### 1. Batch Operations

**Problem**: Making individual API calls for each record.

**Before** (Inefficient):
```javascript
// 1000 API calls for 1000 leads
for (const lead of leads) {
  await marketo.lead.createOrUpdate([lead]);
}
```

**After** (Optimized):
```javascript
// 4 API calls for 1000 leads
const batchProcessor = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/batch-operation-wrapper');
await batchProcessor.batchProcess(leads, 'createOrUpdate', {
  batchSize: 300,
  concurrency: 3
});
```

**Impact**: 99.6% reduction in API calls

### 2. Query Optimization

**Problem**: Making multiple queries for related data.

**Before** (Inefficient):
```javascript
// Query each email separately
for (const email of emails) {
  await marketo.lead.getByFilterType('email', [email]);
}
```

**After** (Optimized):
```javascript
// Single query with multiple values
const batchSize = 300;
for (let i = 0; i < emails.length; i += batchSize) {
  const batch = emails.slice(i, i + batchSize);
  await marketo.lead.getByFilterType('email', batch);
}
```

**Impact**: N calls → N/300 calls

### 3. Caching Strategies

**Problem**: Repeatedly fetching same metadata.

**Implementation**:
```javascript
const metadataCache = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/metadata-cache');

// Cache lead schema (1-hour TTL)
const schema = await metadataCache.getOrFetchLeadSchema(
  instance,
  async () => await marketo.lead.describe()
);

// Cache program channels (1-hour TTL)
const channels = await metadataCache.getOrFetchChannels(
  instance,
  async () => await marketo.channels.get()
);
```

**Cache TTL Recommendations**:
| Data Type | TTL | Reason |
|-----------|-----|--------|
| Lead Schema | 1 hour | Rarely changes |
| Channels | 1 hour | Rarely changes |
| Activity Types | 24 hours | Very stable |
| Programs | 15 minutes | May change frequently |

### 4. Parallel Processing

**Problem**: Sequential processing is slow.

**Before** (Sequential):
```javascript
// 10 batches × 2 seconds = 20 seconds
for (const batch of batches) {
  await processBatch(batch);
}
```

**After** (Parallel with rate limiting):
```javascript
// 10 batches ÷ 5 concurrent × 2 seconds = 4 seconds
const rateLimiter = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/rate-limit-manager');

async function processWithRateLimit(batches, concurrency = 5) {
  const results = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    await rateLimiter.waitIfNeeded();
    const chunk = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      chunk.map(batch => processBatch(batch))
    );
    results.push(...batchResults);
  }
  return results;
}
```

### 5. Smart Pagination

**Problem**: Fetching all records when only some needed.

**Optimized Pattern**:
```javascript
async function getLeadsWithPagination(filterType, filterValues, options = {}) {
  const { maxRecords = 1000, fields = ['id', 'email'] } = options;
  const results = [];
  let nextPageToken = null;

  do {
    const response = await marketo.lead.getByFilterType(
      filterType,
      filterValues,
      { fields, nextPageToken }
    );

    results.push(...response.result);

    // Stop if we have enough
    if (results.length >= maxRecords) {
      break;
    }

    nextPageToken = response.nextPageToken;
  } while (nextPageToken);

  return results.slice(0, maxRecords);
}
```

### 6. Webhook vs Polling

**Problem**: Polling for changes wastes API calls.

**Before** (Polling):
```javascript
// Poll every minute = 1440 calls/day
setInterval(async () => {
  const changes = await marketo.activities.getLeadChanges();
}, 60000);
```

**After** (Webhooks):
```javascript
// Configure webhook in Marketo
// 0 polling calls, real-time data
app.post('/webhook/lead-change', (req, res) => {
  processLeadChange(req.body);
  res.sendStatus(200);
});
```

### 7. Field Selection

**Problem**: Requesting all fields when only some needed.

**Before** (All fields):
```javascript
const leads = await marketo.lead.getByFilterType('email', emails);
// Returns ~100 fields per lead
```

**After** (Selected fields):
```javascript
const leads = await marketo.lead.getByFilterType('email', emails, {
  fields: ['id', 'email', 'firstName', 'lastName', 'company', 'leadScore']
});
// Returns only 6 fields per lead
```

**Impact**: Faster response, less data transfer

## Rate Limit Management

### Monitoring
```javascript
const rateLimiter = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/rate-limit-manager');

// Check before operation
const canProceed = rateLimiter.checkLimit(estimatedCalls);
if (!canProceed) {
  await rateLimiter.waitIfNeeded();
}

// After operation
const status = rateLimiter.getStatus();
console.log(`Daily: ${status.dailyUsage}%`);
console.log(`Window: ${status.windowRemaining}`);
```

### Throttling Strategy

| Usage Level | Strategy |
|-------------|----------|
| < 50% daily | Full speed |
| 50-70% daily | Reduce concurrency to 3 |
| 70-85% daily | Reduce concurrency to 2 |
| 85-95% daily | Single-threaded only |
| > 95% daily | Pause non-critical operations |

### Error Handling for Rate Limits
```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 606) { // Rate limit
        const waitTime = Math.pow(2, attempt) * 1000;
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Performance Monitoring

### Key Metrics

| Metric | Target | Alert |
|--------|--------|-------|
| Avg Response Time | < 1s | > 2s |
| Error Rate | < 2% | > 5% |
| Daily Usage | < 70% | > 85% |
| Batch Utilization | > 80% | < 50% |

### Monitoring Commands
```bash
# Check API usage
/api-usage --detail

# Performance report
/marketo-audit --focus=performance
```

## Quick Wins Checklist

- [ ] Use batch operations (300 records/call)
- [ ] Cache metadata (schema, channels)
- [ ] Select only needed fields
- [ ] Use parallel processing with rate limiting
- [ ] Implement retry with backoff
- [ ] Schedule bulk operations off-peak
- [ ] Monitor daily usage trends

## Related Resources

- **Agent**: `marketo-performance-optimizer`
- **Script**: `scripts/lib/batch-operation-wrapper.js`
- **Script**: `scripts/lib/rate-limit-manager.js`
- **Script**: `scripts/lib/metadata-cache.js`
- **Command**: `/api-usage`
