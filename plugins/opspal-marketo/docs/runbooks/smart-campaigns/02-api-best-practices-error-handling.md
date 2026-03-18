# API Best Practices and Error Handling

## Response Structure

All Marketo REST API responses follow this structure:

```json
{
  "requestId": "e42b#14272d07d78",
  "success": true,
  "errors": [],
  "warnings": [],
  "result": [ ... ]
}
```

> **Critical**: Always check `success` field, not HTTP status. HTTP 200 can contain `success: false`.

## Rate Limits

### Throughput Limit

| Limit | Value | Window |
|-------|-------|--------|
| Max calls | 100 | Rolling 20 seconds |
| Error code | 606 | "Max rate limit '100' exceeded within '20' secs" |

### Concurrent Request Limit

| Limit | Value | Description |
|-------|-------|-------------|
| Max parallel | 10 | Simultaneous API requests |
| Error code | 615 | "Concurrent access limit reached" |

### Daily Quota

| Limit | Value | Reset |
|-------|-------|-------|
| Default | 50,000 calls/day | 12:00 AM CST |
| Error code | 607 | "Daily quota reached" |

## Error Code Reference

### Authentication Errors (6xx)

| Code | Message | Retry? | Action |
|------|---------|--------|--------|
| 601 | Access token invalid | Yes | Re-authenticate immediately |
| 602 | Access token expired | Yes | Re-authenticate immediately |
| 603 | Access denied | No | Check API user permissions |
| 606 | Max rate limit exceeded | Yes | Wait 20 seconds, then retry |
| 607 | Daily quota reached | No | Wait until midnight CST or increase quota |
| 608 | API temporarily unavailable | Yes | Retry with exponential backoff |
| 615 | Concurrent access limit | Yes | Serialize requests |

### Data Errors (7xx)

| Code | Message | Retry? | Action |
|------|---------|--------|--------|
| 701 | '%s' cannot be blank | No | Provide required field |
| 702 | No data found | No | Query returned empty - not an error |
| 709 | Invalid asset name | No | Name conflict or invalid characters |
| 710 | Invalid folder | No | Folder ID doesn't exist |
| 711 | Name in use | No | Choose unique name |

### System Errors

| Code | Message | Retry? | Action |
|------|---------|--------|--------|
| 502 | Bad Gateway | Yes | Retry with backoff |
| 504 | Gateway Timeout | Yes | Retry with backoff |
| 610 | Requested resource not found | No | Check asset ID exists |

## Retry Strategy

### Exponential Backoff

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fn();

      // Check for retryable errors
      if (!result.success && result.errors) {
        const error = result.errors[0];
        const retryableCodes = ['601', '602', '606', '608', '615'];

        if (retryableCodes.includes(error.code)) {
          // Calculate backoff delay
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s

          // Special handling for rate limit - wait 20s
          if (error.code === '606') {
            await sleep(20000);
          } else {
            await sleep(delay);
          }

          // Re-authenticate for token errors
          if (error.code === '601' || error.code === '602') {
            await refreshToken();
          }

          continue; // Retry
        }

        // Non-retryable error
        throw new Error(`API Error ${error.code}: ${error.message}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Network errors are retryable
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
```

### Rate Limit Handling

```javascript
const RateLimiter = {
  calls: [],
  windowMs: 20000,
  maxCalls: 100,

  async waitIfNeeded() {
    const now = Date.now();
    // Remove calls outside window
    this.calls = this.calls.filter(t => now - t < this.windowMs);

    if (this.calls.length >= this.maxCalls) {
      const oldestCall = Math.min(...this.calls);
      const waitTime = this.windowMs - (now - oldestCall);
      await sleep(waitTime + 100); // Add buffer
    }

    this.calls.push(Date.now());
  }
};
```

## Best Practices

### 1. Check Response Success

```javascript
// Always check success field
const response = await mcp__marketo__campaign_get({ campaignId: 123 });

if (!response.success) {
  console.error('API Error:', response.errors);
  // Handle error
}
```

### 2. Use Request IDs for Debugging

```javascript
// Log requestId for support cases
console.log(`Request ID: ${response.requestId}`);
```

### 3. Handle Empty Results

```javascript
// 702 (no data found) is not always an error
if (!response.result || response.result.length === 0) {
  console.log('No campaigns found matching criteria');
  return [];
}
```

### 4. Implement Circuit Breaker

```javascript
const CircuitBreaker = {
  failures: 0,
  lastFailure: null,
  threshold: 5,
  resetTimeout: 60000,

  async execute(fn) {
    // Check if circuit is open
    if (this.failures >= this.threshold) {
      const elapsed = Date.now() - this.lastFailure;
      if (elapsed < this.resetTimeout) {
        throw new Error('Circuit breaker open - API unavailable');
      }
      this.failures = 0; // Reset after timeout
    }

    try {
      const result = await fn();
      this.failures = 0; // Reset on success
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      throw error;
    }
  }
};
```

### 5. Log API Usage

```javascript
// Track API usage for monitoring
async function trackApiCall(endpoint, result) {
  const usage = {
    timestamp: new Date().toISOString(),
    endpoint,
    success: result.success,
    requestId: result.requestId,
    errorCode: result.errors?.[0]?.code
  };

  await logUsage(usage);
}
```

## Idempotency Considerations

### Read Operations (GET)
- Always safe to retry
- No side effects

### Write Operations (POST)
- Create: Check if asset exists before retrying
- Update: Safe to retry (same values)
- Delete: Check if asset still exists before retrying
- Activate: Check current state before retrying

### Campaign Trigger/Schedule
- **Warning**: Retrying trigger can process leads twice
- Use campaign qualification rules ("run each person once")
- Verify campaign state before retrying

## Monitoring Checklist

- [ ] Track daily API call count
- [ ] Monitor rate limit warnings
- [ ] Log all 6xx and 7xx errors
- [ ] Alert on circuit breaker trips
- [ ] Review requestIds for failed calls
- [ ] Check token refresh patterns
