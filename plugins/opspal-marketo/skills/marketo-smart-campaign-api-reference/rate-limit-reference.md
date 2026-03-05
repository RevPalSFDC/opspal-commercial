# Smart Campaign API Rate Limit Reference

## Rate Limit Overview

Marketo imposes three types of rate limits on REST API usage:

| Limit Type | Value | Reset |
|------------|-------|-------|
| Rate Limit | 100 calls / 20 seconds | Sliding window |
| Concurrent Limit | 10 simultaneous requests | Immediate |
| Daily Quota | 50,000 calls / day | Midnight UTC |

---

## Rate Limit (100 calls / 20 seconds)

### How It Works

- Sliding window of 20 seconds
- Maximum 100 API calls within any 20-second period
- Exceeding triggers error code 606

### Detection

**HTTP Response**:
```json
{
  "success": false,
  "errors": [{ "code": "606", "message": "Rate limit exceeded" }]
}
```

### Recovery Strategy

```javascript
async function handleRateLimit(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.code === 606) {
      // Wait for rate limit window to reset
      await sleep(20000);
      return await operation();
    }
    throw error;
  }
}
```

### Proactive Management

```javascript
class RateLimiter {
  constructor() {
    this.calls = [];
    this.windowMs = 20000;
    this.maxCalls = 100;
  }

  async waitIfNeeded() {
    const now = Date.now();
    // Remove calls outside window
    this.calls = this.calls.filter(t => now - t < this.windowMs);

    if (this.calls.length >= this.maxCalls) {
      const oldestCall = this.calls[0];
      const waitTime = this.windowMs - (now - oldestCall);
      await sleep(waitTime + 100); // Buffer
    }
  }

  recordCall() {
    this.calls.push(Date.now());
  }
}
```

---

## Concurrent Request Limit (10 requests)

### How It Works

- Maximum 10 requests being processed simultaneously
- New requests blocked while 10 are in progress
- Exceeding triggers error code 615

### Detection

```json
{
  "success": false,
  "errors": [{ "code": "615", "message": "Concurrent request limit reached" }]
}
```

### Recovery Strategy

```javascript
class ConcurrencyLimiter {
  constructor(maxConcurrent = 10) {
    this.inProgress = 0;
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
  }

  async acquire() {
    if (this.inProgress >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.inProgress++;
  }

  release() {
    this.inProgress--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }

  async execute(operation) {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }
}

// Usage
const limiter = new ConcurrencyLimiter(10);
const results = await Promise.all(
  campaignIds.map(id => limiter.execute(() => getCampaign(id)))
);
```

---

## Daily Quota (50,000 calls/day)

### How It Works

- 50,000 total API calls per 24-hour period
- Resets at midnight UTC
- Exceeding triggers error code 607

### Detection

```json
{
  "success": false,
  "errors": [{ "code": "607", "message": "Daily quota exceeded" }]
}
```

### Recovery Strategy

```javascript
if (error.code === 607) {
  // Cannot recover until quota resets
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  const waitMs = midnight - now;

  throw new QuotaExceededError(
    `Daily quota exceeded. Resets in ${Math.ceil(waitMs / 3600000)} hours.`
  );
}
```

### Monitoring

```javascript
class QuotaTracker {
  constructor(dailyLimit = 50000) {
    this.dailyLimit = dailyLimit;
    this.todaysCalls = 0;
    this.lastReset = this.getUTCMidnight();
  }

  getUTCMidnight() {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return now.getTime();
  }

  checkAndReset() {
    const currentMidnight = this.getUTCMidnight();
    if (currentMidnight > this.lastReset) {
      this.todaysCalls = 0;
      this.lastReset = currentMidnight;
    }
  }

  recordCall() {
    this.checkAndReset();
    this.todaysCalls++;
  }

  getRemaining() {
    this.checkAndReset();
    return this.dailyLimit - this.todaysCalls;
  }

  canProceed(neededCalls = 1) {
    return this.getRemaining() >= neededCalls;
  }
}
```

---

## Best Practices

### 1. Batch Operations

Instead of individual calls, use batch endpoints:

```javascript
// BAD: 100 individual calls
for (const id of campaignIds) {
  await getCampaign(id);  // 100 API calls
}

// GOOD: Single list call with filtering
const campaigns = await listCampaigns({
  programName: 'My Program',
  maxReturn: 200
});  // 1 API call
```

### 2. Implement Request Queuing

```javascript
class RequestQueue {
  constructor() {
    this.rateLimiter = new RateLimiter();
    this.concurrencyLimiter = new ConcurrencyLimiter(10);
    this.quotaTracker = new QuotaTracker();
  }

  async execute(operation) {
    // Check quota
    if (!this.quotaTracker.canProceed()) {
      throw new Error('Daily quota exhausted');
    }

    // Respect rate limits
    await this.rateLimiter.waitIfNeeded();

    // Respect concurrency limits
    return await this.concurrencyLimiter.execute(async () => {
      const result = await operation();
      this.rateLimiter.recordCall();
      this.quotaTracker.recordCall();
      return result;
    });
  }
}
```

### 3. Add Delays Between Batches

```javascript
async function processBatches(items, operation, batchSize = 100) {
  const batches = chunk(items, batchSize);

  for (const batch of batches) {
    await Promise.all(batch.map(operation));
    await sleep(200); // 200ms between batches
  }
}
```

### 4. Monitor and Alert

```javascript
const usage = {
  rateWindow: [],
  dailyCount: 0,

  checkThresholds() {
    const remaining = 50000 - this.dailyCount;

    if (remaining < 5000) {
      console.warn(`Low quota warning: ${remaining} calls remaining`);
    }

    if (remaining < 1000) {
      console.error(`Critical: Only ${remaining} calls remaining`);
    }
  }
};
```

---

## Campaign-Specific Considerations

### High-Volume Operations

| Operation | Calls Used | Optimization |
|-----------|------------|--------------|
| Clone 100 campaigns | 100 | Batch with delays |
| Delete 50 campaigns | 50 | Pre-validate, batch |
| Activate 25 campaigns | 25 | Validate first |
| List all campaigns | 1-5 | Use pagination |

### Recommended Concurrency by Operation

| Operation | Recommended Concurrency |
|-----------|-------------------------|
| Read (GET) | 10 (max) |
| Create/Clone | 3-5 |
| Update | 5-8 |
| Delete | 3 |
| Activate | 3 |

---

## Error Recovery Summary

| Error | Wait Time | Strategy |
|-------|-----------|----------|
| 606 (Rate Limit) | 20 seconds | Wait and retry |
| 607 (Quota) | Until midnight UTC | Stop operations |
| 615 (Concurrent) | 1-5 seconds | Serialize requests |
