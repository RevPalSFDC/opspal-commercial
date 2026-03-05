# Implementing Error Handling in n8n Workflows

A solution-agnostic guide for adding robust error handling to n8n workflows.

## Purpose

This runbook provides patterns and procedures for implementing comprehensive error handling in n8n workflows. Proper error handling prevents data loss, enables debugging, and maintains system reliability.

## Prerequisites

- [ ] Existing n8n workflow to enhance
- [ ] Notification channel configured (Slack, Email, etc.)
- [ ] Understanding of expected failure modes
- [ ] Access to logging/monitoring system (optional)

## Procedure

### Step 1: Identify Error Scenarios

**Actions:**
1. List all external API calls in the workflow
2. Identify potential failure points:
   - Authentication failures
   - Rate limiting
   - Network timeouts
   - Invalid data formats
   - Missing required fields
   - Duplicate records
3. Classify errors by severity (critical, warning, info)

**Expected Result:** Error scenario matrix with categorized failures.

### Step 2: Add Error Trigger Node

**Actions:**
1. Add "Error Trigger" node to workflow
2. Configure to catch errors from all nodes
3. Connect to error handling branch

**Node Configuration:**
```json
{
  "type": "n8n-nodes-base.errorTrigger",
  "name": "On Error",
  "position": [250, 300]
}
```

**Expected Result:** Error trigger captures all workflow failures.

### Step 3: Implement Error Classification

**Actions:**
1. Add Code node after Error Trigger
2. Classify error by type:

```javascript
const error = $json.error || {};
const errorMessage = error.message || '';
const errorCode = error.code || '';

let errorType = 'UNKNOWN';
let severity = 'HIGH';

// Classification logic
if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
  errorType = 'AUTH_FAILURE';
  severity = 'CRITICAL';
} else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
  errorType = 'RATE_LIMIT';
  severity = 'MEDIUM';
} else if (errorMessage.includes('timeout')) {
  errorType = 'TIMEOUT';
  severity = 'MEDIUM';
} else if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
  errorType = 'VALIDATION';
  severity = 'LOW';
} else if (errorMessage.includes('404')) {
  errorType = 'NOT_FOUND';
  severity = 'LOW';
} else if (errorMessage.includes('500')) {
  errorType = 'SERVER_ERROR';
  severity = 'HIGH';
}

return {
  errorType,
  severity,
  originalError: error,
  timestamp: new Date().toISOString(),
  workflowName: $workflow.name,
  executionId: $execution.id
};
```

**Expected Result:** Errors classified with type and severity.

### Step 4: Add Retry Logic

**Actions:**
1. For retryable errors (rate limit, timeout), add retry mechanism
2. Use IF node to check if retry is appropriate
3. Implement exponential backoff:

```javascript
// In Code node
const maxRetries = 3;
const currentRetry = $json.retryCount || 0;
const baseDelay = 1000; // 1 second

if (currentRetry < maxRetries && ['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR'].includes($json.errorType)) {
  const delay = baseDelay * Math.pow(2, currentRetry);
  return {
    shouldRetry: true,
    retryCount: currentRetry + 1,
    delayMs: delay,
    ...$json
  };
}

return {
  shouldRetry: false,
  ...$json
};
```

4. Add Wait node with expression: `={{ $json.delayMs }}`
5. Loop back to failed node

**Expected Result:** Transient errors retry automatically with backoff.

### Step 5: Configure Notifications

**Actions:**
1. Add Switch node to route by severity
2. Configure notification channels:

**Critical (Slack + Email):**
```json
{
  "channel": "#alerts-critical",
  "text": "🚨 CRITICAL: Workflow {{$json.workflowName}} failed\nError: {{$json.errorType}}\nExecution: {{$json.executionId}}"
}
```

**Medium (Slack only):**
```json
{
  "channel": "#alerts-workflow",
  "text": "⚠️ WARNING: {{$json.workflowName}} - {{$json.errorType}}"
}
```

**Low (Log only):**
- Store in database or logging system

**Expected Result:** Appropriate notifications sent based on severity.

### Step 6: Implement Dead Letter Queue

**Actions:**
1. For non-retryable errors, store failed items
2. Add HTTP Request or database node to store:

```javascript
// Dead letter record structure
{
  "id": $execution.id,
  "workflow": $workflow.name,
  "timestamp": new Date().toISOString(),
  "errorType": $json.errorType,
  "errorMessage": $json.originalError.message,
  "inputData": $json.originalInput,
  "retryCount": $json.retryCount
}
```

3. Create recovery workflow to process dead letter items

**Expected Result:** Failed items preserved for manual review/retry.

### Step 7: Add Circuit Breaker (Advanced)

**Actions:**
1. Track consecutive failures in workflow static data
2. If threshold exceeded, pause workflow

```javascript
// Check circuit breaker
const staticData = $getWorkflowStaticData('global');
const failureCount = staticData.failureCount || 0;
const circuitOpen = staticData.circuitOpen || false;
const threshold = 5;
const cooldownMs = 300000; // 5 minutes

if (circuitOpen) {
  const cooldownEnd = staticData.cooldownEnd || 0;
  if (Date.now() < cooldownEnd) {
    throw new Error('Circuit breaker open - workflow paused');
  }
  staticData.circuitOpen = false;
  staticData.failureCount = 0;
}

staticData.failureCount = failureCount + 1;

if (staticData.failureCount >= threshold) {
  staticData.circuitOpen = true;
  staticData.cooldownEnd = Date.now() + cooldownMs;
  // Send critical alert
}

return $json;
```

**Expected Result:** Workflow self-protects from cascading failures.

### Step 8: Add Success Tracking

**Actions:**
1. On successful execution, reset failure counters
2. Add completion logging

```javascript
// On success
const staticData = $getWorkflowStaticData('global');
staticData.failureCount = 0;
staticData.circuitOpen = false;
staticData.lastSuccess = Date.now();

return {
  status: 'success',
  processedAt: new Date().toISOString(),
  recordCount: items.length
};
```

**Expected Result:** Success metrics tracked for monitoring.

## Validation

### Success Criteria
- [ ] All error types captured and classified
- [ ] Retryable errors retry with backoff
- [ ] Critical errors trigger immediate notifications
- [ ] Failed items stored in dead letter queue
- [ ] Circuit breaker prevents cascade failures
- [ ] Success/failure metrics available

### Test Scenarios
1. **Auth Failure**: Revoke credentials, verify CRITICAL alert
2. **Rate Limit**: Trigger rapid requests, verify retry
3. **Invalid Data**: Send malformed payload, verify classification
4. **Network Timeout**: Test with slow endpoint
5. **Circuit Breaker**: Trigger 5+ consecutive failures

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Errors not caught | Error Trigger not connected | Verify all nodes connect to error branch |
| Infinite retry loop | No max retry limit | Add retry counter with max limit |
| Notifications spam | No severity filtering | Add severity-based routing |
| Dead letter queue growing | Root cause not fixed | Address underlying issue, then replay |
| Circuit breaker stuck open | Cooldown too long | Reduce cooldown or add manual reset |
| Missing error details | Error not serialized | Use `JSON.stringify(error)` for details |

## Rollback

### If Error Handling Causes Issues:
1. Disable error handling branch (don't delete)
2. Keep Error Trigger but disconnect notification nodes
3. Review error logs to identify issue
4. Fix and reconnect incrementally

### Reset Circuit Breaker Manually:
1. Access workflow static data
2. Set `circuitOpen = false`
3. Set `failureCount = 0`

## Error Handling Templates

### Basic Error Handler
```
[Error Trigger] → [Classify Error] → [Notify Slack]
```

### Full Error Handler
```
[Error Trigger] → [Classify Error] → [IF Retryable]
                                          ↓ Yes          ↓ No
                                    [Wait Backoff]   [Dead Letter]
                                          ↓                ↓
                                    [Retry Node]    [Notify by Severity]
```

### Circuit Breaker Pattern
```
[Trigger] → [Check Circuit] → [IF Open]
                                  ↓ Yes      ↓ No
                              [Reject]   [Process]
                                              ↓
                                        [On Error] → [Update Counter] → [Check Threshold]
```

## Related Resources

- **Agents:**
  - `n8n-execution-monitor` - Monitor and debug executions
  - `n8n-error-analyzer` - Analyze error patterns

- **Scripts:**
  - `n8n-error-analyzer.js` - Categorize and diagnose errors
  - `n8n-execution-reporter.js` - Generate error reports

- **Other Runbooks:**
  - `data-sync-workflow.md` - Apply to sync workflows
  - `incident-response.md` - Handle critical failures

---

**Version:** 1.0.0
**Last Updated:** 2025-12-03
