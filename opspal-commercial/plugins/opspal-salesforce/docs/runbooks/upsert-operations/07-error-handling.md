# 07 - Error Handling

Error queue management, retry strategies, and escalation procedures for upsert operations.

## Error Classification

| Error Type | Severity | Retryable? | Action |
|------------|----------|------------|--------|
| `DUPLICATE_VALUE` | Medium | No | Flag for dedup review |
| `REQUIRED_FIELD_MISSING` | High | Yes | Enrich then retry |
| `VALIDATION_RULE_ERROR` | Medium | No | Escalate to admin |
| `FIELD_CUSTOM_VALIDATION_EXCEPTION` | Medium | No | Log and skip |
| `INSUFFICIENT_ACCESS` | Critical | No | Escalate immediately |
| `API_LIMIT_EXCEEDED` | High | Yes | Backoff and retry |
| `REQUEST_RUNNING_TOO_LONG` | Medium | Yes | Split batch, retry |
| `MALFORMED_QUERY` | Critical | No | Fix query, log |
| `INVALID_CROSS_REFERENCE_KEY` | High | Yes | Validate refs, retry |
| `UNKNOWN_EXCEPTION` | High | Yes | Retry with logging |
| `UNABLE_TO_LOCK_ROW` | Medium | Yes | Wait and retry |
| `STRING_TOO_LONG` | Medium | No | Truncate and retry |
| `NUMBER_OUTSIDE_VALID_RANGE` | Medium | No | Log and skip |

## Error Queue Structure

**Location:** `instances/{org}/error-queue/`

### Error Entry Format

```json
{
  "errorId": "err_1706012345_abc123def",
  "operationId": "op_1706012300_xyz789",
  "timestamp": "2026-01-23T10:30:00Z",
  "objectType": "Lead",
  "record": {
    "Email": "john@example.com",
    "Company": "Example Inc",
    "LastName": "Doe"
  },
  "error": {
    "code": "REQUIRED_FIELD_MISSING",
    "message": "Required fields are missing: [FirstName]",
    "fields": ["FirstName"],
    "statusCode": 400
  },
  "retryCount": 2,
  "maxRetries": 3,
  "nextRetryAt": "2026-01-23T10:45:00Z",
  "status": "PENDING_RETRY",
  "resolution": null,
  "history": [
    {
      "timestamp": "2026-01-23T10:30:00Z",
      "action": "CREATED",
      "status": "PENDING_RETRY"
    },
    {
      "timestamp": "2026-01-23T10:35:00Z",
      "action": "RETRY_ATTEMPT",
      "result": "FAILED",
      "error": "REQUIRED_FIELD_MISSING"
    }
  ]
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `PENDING` | Newly added, awaiting processing |
| `PENDING_RETRY` | Scheduled for retry |
| `PROCESSING` | Currently being retried |
| `RESOLVED` | Successfully resolved |
| `ESCALATED` | Sent to manual review |
| `ABANDONED` | Max retries exceeded, no escalation |

## Retry Strategy

### Exponential Backoff

```javascript
const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 60000,      // 1 minute
    maxDelayMs: 3600000,        // 1 hour
    backoffMultiplier: 4,       // 1min → 4min → 16min
    jitterPercent: 20           // Add randomness
};

const calculateNextRetry = (retryCount, config = RETRY_CONFIG) => {
    if (retryCount >= config.maxRetries) {
        return null; // No more retries
    }

    let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, retryCount);
    delay = Math.min(delay, config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = delay * (config.jitterPercent / 100) * (Math.random() - 0.5);
    delay += jitter;

    return new Date(Date.now() + delay).toISOString();
};

// Retry schedule example:
// Attempt 1: Immediate
// Attempt 2: ~1 minute later
// Attempt 3: ~4 minutes later
// Attempt 4: ~16 minutes later (if maxRetries > 3)
```

### Retry Decision Logic

```javascript
const NON_RETRYABLE_ERRORS = [
    'DUPLICATE_VALUE',
    'VALIDATION_RULE_ERROR',
    'FIELD_CUSTOM_VALIDATION_EXCEPTION',
    'INSUFFICIENT_ACCESS',
    'MALFORMED_QUERY',
    'INVALID_FIELD',
    'ENTITY_IS_DELETED'
];

const RETRYABLE_ERRORS = [
    'API_LIMIT_EXCEEDED',
    'REQUEST_RUNNING_TOO_LONG',
    'UNABLE_TO_LOCK_ROW',
    'INVALID_CROSS_REFERENCE_KEY',
    'UNKNOWN_EXCEPTION',
    'SERVER_UNAVAILABLE',
    'REQUEST_LIMIT_EXCEEDED'
];

const shouldRetry = (error, retryCount, config) => {
    // Check retry count limit
    if (retryCount >= config.maxRetries) {
        return {
            retry: false,
            reason: 'MAX_RETRIES_EXCEEDED',
            action: 'ESCALATE'
        };
    }

    // Non-retryable errors
    if (NON_RETRYABLE_ERRORS.includes(error.code)) {
        return {
            retry: false,
            reason: 'NON_RETRYABLE_ERROR',
            action: error.code === 'INSUFFICIENT_ACCESS' ? 'ESCALATE_CRITICAL' : 'ESCALATE'
        };
    }

    // Retryable errors
    if (RETRYABLE_ERRORS.includes(error.code)) {
        return {
            retry: true,
            nextRetryAt: calculateNextRetry(retryCount, config)
        };
    }

    // Unknown errors: retry once
    return {
        retry: retryCount < 1,
        reason: retryCount >= 1 ? 'UNKNOWN_ERROR_RETRY_EXHAUSTED' : 'UNKNOWN_ERROR_RETRY',
        nextRetryAt: retryCount < 1 ? calculateNextRetry(retryCount, config) : null
    };
};
```

## Error Queue Operations

### Add to Error Queue

```javascript
const addToErrorQueue = async (orgAlias, errorEntry) => {
    const queuePath = `instances/${orgAlias}/error-queue`;

    // Ensure directory exists
    await fs.mkdir(queuePath, { recursive: true });

    // Generate unique error ID
    const errorId = `err_${Date.now()}_${generateShortId()}`;

    const entry = {
        errorId,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        retryCount: 0,
        maxRetries: RETRY_CONFIG.maxRetries,
        history: [{
            timestamp: new Date().toISOString(),
            action: 'CREATED',
            status: 'PENDING'
        }],
        ...errorEntry
    };

    // Determine if should retry
    const retryDecision = shouldRetry(entry.error, 0, RETRY_CONFIG);

    if (retryDecision.retry) {
        entry.status = 'PENDING_RETRY';
        entry.nextRetryAt = retryDecision.nextRetryAt;
    } else {
        entry.status = 'ESCALATED';
        entry.escalationReason = retryDecision.reason;
        entry.escalationAction = retryDecision.action;
    }

    // Write to file
    await fs.writeFile(
        `${queuePath}/${errorId}.json`,
        JSON.stringify(entry, null, 2)
    );

    // If critical, escalate immediately
    if (retryDecision.action === 'ESCALATE_CRITICAL') {
        await escalateCritical(entry, orgAlias);
    }

    return entry;
};
```

### Process Error Queue

```javascript
const processErrorQueue = async (orgAlias, options = {}) => {
    const queuePath = `instances/${orgAlias}/error-queue`;
    const files = await fs.readdir(queuePath);

    const results = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        escalated: 0,
        skipped: 0
    };

    const now = new Date();

    for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const entry = JSON.parse(await fs.readFile(`${queuePath}/${file}`, 'utf8'));

        // Skip if not ready for retry
        if (entry.status === 'PENDING_RETRY') {
            if (new Date(entry.nextRetryAt) > now) {
                results.skipped++;
                continue;
            }
        }

        // Skip resolved/escalated/abandoned entries
        if (['RESOLVED', 'ESCALATED', 'ABANDONED'].includes(entry.status)) {
            continue;
        }

        // Filter by error types if specified
        if (options.errorTypes && !options.errorTypes.includes(entry.error.code)) {
            continue;
        }

        results.processed++;

        // Update status to processing
        entry.status = 'PROCESSING';
        entry.history.push({
            timestamp: now.toISOString(),
            action: 'RETRY_ATTEMPT',
            retryCount: entry.retryCount + 1
        });

        try {
            // Attempt retry
            const retryResult = await retryUpsert(entry, orgAlias);

            if (retryResult.success) {
                entry.status = 'RESOLVED';
                entry.resolution = {
                    resolvedAt: new Date().toISOString(),
                    recordId: retryResult.recordId,
                    method: 'AUTO_RETRY'
                };
                entry.history.push({
                    timestamp: new Date().toISOString(),
                    action: 'RESOLVED',
                    recordId: retryResult.recordId
                });
                results.succeeded++;
            } else {
                // Update retry count
                entry.retryCount++;

                const retryDecision = shouldRetry(entry.error, entry.retryCount, RETRY_CONFIG);

                if (retryDecision.retry) {
                    entry.status = 'PENDING_RETRY';
                    entry.nextRetryAt = retryDecision.nextRetryAt;
                } else {
                    entry.status = 'ESCALATED';
                    entry.escalationReason = retryDecision.reason;

                    results.escalated++;

                    if (options.escalate !== false) {
                        await escalateError(entry, orgAlias, options);
                    }
                }

                entry.history.push({
                    timestamp: new Date().toISOString(),
                    action: 'RETRY_FAILED',
                    error: retryResult.error,
                    newStatus: entry.status
                });

                results.failed++;
            }
        } catch (error) {
            entry.lastError = error.message;
            entry.retryCount++;
            entry.status = 'PENDING_RETRY';
            entry.nextRetryAt = calculateNextRetry(entry.retryCount, RETRY_CONFIG);

            entry.history.push({
                timestamp: new Date().toISOString(),
                action: 'RETRY_ERROR',
                error: error.message
            });

            results.failed++;
        }

        // Save updated entry
        await fs.writeFile(`${queuePath}/${file}`, JSON.stringify(entry, null, 2));
    }

    return results;
};
```

### Retry Single Record

```javascript
const retryUpsert = async (errorEntry, orgAlias) => {
    try {
        // Re-apply any enrichment that might help
        let record = errorEntry.record;

        if (errorEntry.error.code === 'REQUIRED_FIELD_MISSING') {
            // Try to enrich missing fields
            const enriched = await enrichRecord(record, errorEntry.error.fields);
            record = { ...record, ...enriched };
        }

        // Retry the upsert
        const result = await upsertRecord(record, errorEntry.objectType, orgAlias);

        return {
            success: true,
            recordId: result.id
        };

    } catch (error) {
        return {
            success: false,
            error: parseError(error)
        };
    }
};
```

## Escalation Procedures

### Create Salesforce Task for Admin

```javascript
const escalateToSalesforceTask = async (entry, orgAlias, adminUserId) => {
    const taskData = {
        OwnerId: adminUserId,
        Subject: `[Upsert Error] ${entry.error.code} - Manual Review Required`,
        Description: `
Error Details:
═══════════════════════════════════════════════════════
Error ID: ${entry.errorId}
Operation ID: ${entry.operationId || 'N/A'}
Object Type: ${entry.objectType}
Timestamp: ${entry.timestamp}

Error Code: ${entry.error.code}
Error Message: ${entry.error.message}
${entry.error.fields ? `Fields Affected: ${entry.error.fields.join(', ')}` : ''}

Retry History:
${entry.history.map(h => `  - ${h.timestamp}: ${h.action}`).join('\n')}

Original Record:
${JSON.stringify(entry.record, null, 2)}

═══════════════════════════════════════════════════════
Please review and resolve manually.
        `.trim(),
        Priority: entry.escalationAction === 'ESCALATE_CRITICAL' ? 'High' : 'Normal',
        Status: 'Not Started',
        ActivityDate: new Date().toISOString().split('T')[0],
        Type: 'Data Quality Review'
    };

    await createSalesforceRecord('Task', taskData, orgAlias);

    return { method: 'SALESFORCE_TASK', taskCreated: true };
};
```

### Slack Notification

```javascript
const escalateToSlack = async (entry, webhookUrl) => {
    const message = {
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '⚠️ Upsert Error Escalated',
                    emoji: true
                }
            },
            {
                type: 'section',
                fields: [
                    { type: 'mrkdwn', text: `*Error Code:*\n${entry.error.code}` },
                    { type: 'mrkdwn', text: `*Object:*\n${entry.objectType}` },
                    { type: 'mrkdwn', text: `*Retries:*\n${entry.retryCount}` },
                    { type: 'mrkdwn', text: `*Reason:*\n${entry.escalationReason}` }
                ]
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Message:*\n${entry.error.message}`
                }
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `Error ID: ${entry.errorId} | ${entry.timestamp}`
                    }
                ]
            }
        ]
    };

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
    });

    return { method: 'SLACK', notificationSent: true };
};
```

### Email Alert

```javascript
const escalateViaEmail = async (entry, recipients, config) => {
    const subject = `[${entry.error.code}] Upsert Error Requires Manual Review`;

    const body = `
A Salesforce upsert operation has failed and requires manual review.

ERROR DETAILS
═══════════════════════════════════════════════════════
Error ID: ${entry.errorId}
Object Type: ${entry.objectType}
Error Code: ${entry.error.code}
Message: ${entry.error.message}
Retry Count: ${entry.retryCount}
Escalation Reason: ${entry.escalationReason}

RECORD DATA
═══════════════════════════════════════════════════════
${JSON.stringify(entry.record, null, 2)}

RESOLUTION OPTIONS
═══════════════════════════════════════════════════════
1. Fix the data issue and re-import
2. Manually create the record in Salesforce
3. Mark as abandoned if no longer needed

Please review and take appropriate action.
    `;

    await sendEmail({
        to: recipients,
        subject,
        body,
        priority: entry.escalationAction === 'ESCALATE_CRITICAL' ? 'high' : 'normal'
    });

    return { method: 'EMAIL', recipients };
};
```

## Partial Failure Handling

Continue processing successful records when some fail:

```javascript
const processWithPartialFailure = async (records, objectType, orgAlias, options = {}) => {
    const results = {
        succeeded: [],
        failed: [],
        continueOnError: options.continueOnError !== false
    };

    for (const record of records) {
        try {
            const result = await upsertRecord(record, objectType, orgAlias);
            results.succeeded.push({
                record,
                result,
                recordId: result.id
            });

        } catch (error) {
            const parsedError = parseError(error);

            results.failed.push({
                record,
                error: parsedError
            });

            // Add to error queue for retry
            await addToErrorQueue(orgAlias, {
                operationId: options.operationId,
                objectType,
                record,
                error: parsedError
            });

            // Stop if not configured to continue
            if (!results.continueOnError) {
                break;
            }
        }
    }

    return results;
};
```

## Graceful Degradation

Skip optional steps on failure:

```javascript
const upsertWithDegradation = async (record, objectType, orgAlias, options) => {
    let enrichedRecord = record;
    const degradations = {};

    // Step 1: Enrichment (optional)
    try {
        if (options.enableEnrichment) {
            enrichedRecord = await enrichRecord(record);
            degradations.enrichment = 'applied';
        }
    } catch (error) {
        console.warn('Enrichment failed, continuing without:', error.message);
        degradations.enrichment = 'skipped';
        // Continue with original record
    }

    // Step 2: Upsert (required)
    const upsertResult = await createSalesforceRecord(objectType, enrichedRecord, orgAlias);

    // Step 3: Ownership assignment (optional)
    try {
        if (options.assignOwnership) {
            await assignOwnership(upsertResult.id, options);
            degradations.ownership = 'applied';
        }
    } catch (error) {
        console.warn('Ownership assignment failed:', error.message);
        degradations.ownership = 'skipped';
        // Continue - record is created
    }

    // Step 4: Notification (optional)
    try {
        if (options.notify) {
            await sendNotification(upsertResult.id, options);
            degradations.notification = 'sent';
        }
    } catch (error) {
        console.warn('Notification failed:', error.message);
        degradations.notification = 'skipped';
        // Continue - record is created
    }

    return {
        success: true,
        recordId: upsertResult.id,
        degradations
    };
};
```

## Error Queue Status

```javascript
const getErrorQueueStatus = async (orgAlias, options = {}) => {
    const queuePath = `instances/${orgAlias}/error-queue`;
    const files = await fs.readdir(queuePath);

    const status = {
        totalInQueue: 0,
        byStatus: {},
        byErrorType: {},
        upcomingRetries: [],
        oldestError: null,
        newestError: null
    };

    for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const entry = JSON.parse(await fs.readFile(`${queuePath}/${file}`, 'utf8'));

        status.totalInQueue++;

        // Count by status
        status.byStatus[entry.status] = (status.byStatus[entry.status] || 0) + 1;

        // Count by error type
        status.byErrorType[entry.error.code] = (status.byErrorType[entry.error.code] || 0) + 1;

        // Track upcoming retries
        if (entry.status === 'PENDING_RETRY' && entry.nextRetryAt) {
            status.upcomingRetries.push({
                errorId: entry.errorId,
                nextRetryAt: entry.nextRetryAt,
                errorCode: entry.error.code
            });
        }

        // Track oldest/newest
        const timestamp = new Date(entry.timestamp);
        if (!status.oldestError || timestamp < new Date(status.oldestError)) {
            status.oldestError = entry.timestamp;
        }
        if (!status.newestError || timestamp > new Date(status.newestError)) {
            status.newestError = entry.timestamp;
        }
    }

    // Sort upcoming retries
    status.upcomingRetries.sort((a, b) =>
        new Date(a.nextRetryAt) - new Date(b.nextRetryAt)
    );

    return status;
};
```

## Output Format

```json
{
  "errorQueueStatus": {
    "summary": {
      "totalInQueue": 25,
      "pendingRetry": 15,
      "escalated": 8,
      "resolved": 2
    },
    "byErrorType": {
      "REQUIRED_FIELD_MISSING": 10,
      "VALIDATION_RULE_ERROR": 8,
      "API_LIMIT_EXCEEDED": 5,
      "DUPLICATE_VALUE": 2
    },
    "recentProcessing": {
      "processedAt": "2026-01-23T10:30:00Z",
      "processed": 15,
      "succeeded": 8,
      "failed": 5,
      "escalated": 2
    },
    "upcomingRetries": [
      { "errorId": "err_123", "nextRetryAt": "2026-01-23T10:45:00Z", "errorCode": "API_LIMIT_EXCEEDED" },
      { "errorId": "err_456", "nextRetryAt": "2026-01-23T11:00:00Z", "errorCode": "UNABLE_TO_LOCK_ROW" }
    ],
    "escalationsSent": {
      "salesforceTasks": 5,
      "slackNotifications": 8,
      "emailAlerts": 3
    }
  }
}
```

## Best Practices

1. **Classify Errors Correctly** - Know which errors are retryable
2. **Use Exponential Backoff** - Don't hammer failing systems
3. **Add Jitter** - Prevent thundering herd on retries
4. **Escalate Timely** - Don't let errors sit in queue forever
5. **Track History** - Maintain audit trail of all retry attempts
6. **Monitor Queue Size** - Alert if queue grows unexpectedly

## Related Sections

- [01 - Upsert Fundamentals](01-upsert-fundamentals.md)
- [05 - Enrichment Waterfall](05-enrichment-waterfall.md)
- [08 - Audit Logging](08-audit-logging.md)

---
Next: [08 - Audit Logging](08-audit-logging.md)
