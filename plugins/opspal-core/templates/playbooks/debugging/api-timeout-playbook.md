# API Timeout Debugging Playbook

## Overview

Use this playbook when encountering API timeout errors in Salesforce, HubSpot, or other external API calls.

## Symptoms

- Error messages containing "timeout", "ETIMEDOUT", "ESOCKETTIMEDOUT"
- Operations that hang indefinitely
- Partial data responses
- Rate limit exceeded (429) errors preceding timeouts

## Diagnostic Steps

### Step 1: Check Recent Traces

```bash
# View recent span summary
node scripts/lib/debugging-context-extractor.js extract --window=30

# Look for spans with status ERROR and duration > expected
node scripts/lib/trace-context.js summary
```

**What to look for:**
- Spans with `status: "ERROR"` and high `duration` values
- Critical path operations that are taking longer than usual
- Patterns of multiple timeouts in sequence

### Step 2: Check API Rate Limits

```bash
# For Salesforce
sf api limits --target-org <org-alias>

# For HubSpot - check rate limit headers in recent responses
grep -r "X-HubSpot-RateLimit" ~/.claude/logs/
```

**What to look for:**
- API calls approaching rate limits
- 429 responses in logs before timeout
- Burst patterns that may trigger throttling

### Step 3: Analyze Request Pattern

```bash
# Check unified log for recent API calls
tail -100 ~/.claude/logs/unified.jsonl | grep -i "api\|request"

# Look for correlation IDs to trace full request flow
```

**What to look for:**
- Large batch sizes (>200 records in single call)
- Sequential calls that could be parallelized
- Redundant duplicate calls

### Step 4: Check Network Connectivity

```bash
# Test basic connectivity
curl -w "@curl-format.txt" -o /dev/null -s https://login.salesforce.com

# Check DNS resolution time
dig login.salesforce.com +stats
```

## Common Root Causes

| Root Cause | Indicators | Fix |
|------------|------------|-----|
| Large batch size | Timeout on bulk operations | Reduce batch size to 50-100 |
| Rate limiting | 429 errors before timeout | Add exponential backoff |
| Slow query | SOQL timeout | Add selective filters, use indexed fields |
| Network latency | DNS/connect time high | Check VPN, use regional endpoints |
| Missing indexes | Query on non-indexed field | Request index from SF admin |

## Quick Fixes

### 1. Increase Timeout (Temporary)

```javascript
// In API client configuration
const timeout = 120000; // 2 minutes
```

### 2. Add Retry with Backoff

```javascript
const retry = require('./error-recovery-manager');
const result = await retry.executeRecovery(snapshotId, error, {
  strategy: 'exponential_backoff_retry',
  maxRetries: 3
});
```

### 3. Reduce Batch Size

```javascript
// Instead of processing all records
const BATCH_SIZE = 50;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  await processBatch(batch);
}
```

## Prevention Checklist

- [ ] Add timeout configuration to all API clients
- [ ] Implement exponential backoff for retries
- [ ] Monitor API rate limits proactively
- [ ] Use correlation IDs for all API calls
- [ ] Set up alerts for timeout patterns

## Related Playbooks

- [Rate Limit Playbook](./rate-limit-playbook.md)
- [Network Error Playbook](./network-error-playbook.md)

## Trace ID Lookup

If you have a trace ID from the reflection:

```bash
# Search for specific trace in logs
grep "<trace-id>" ~/.claude/logs/traces.jsonl

# Get full span details
node scripts/lib/trace-context.js summary | grep -A 5 "<trace-id>"
```

---

**Version**: 1.0.0
**Last Updated**: 2026-01-31
