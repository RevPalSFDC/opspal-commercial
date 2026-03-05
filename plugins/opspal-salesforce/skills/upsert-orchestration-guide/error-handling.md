# Error Handling

Error recovery procedures for upsert operations.

## Error Categories

### Transient Errors (Retry)

| Error Code | Description | Retry Strategy |
|------------|-------------|----------------|
| `UNABLE_TO_LOCK_ROW` | Row lock contention | Exponential backoff |
| `REQUEST_RUNNING_TOO_LONG` | Timeout | Reduce batch size, retry |
| `SERVER_UNAVAILABLE` | Salesforce downtime | Wait and retry |
| `API_CURRENTLY_DISABLED` | Maintenance window | Scheduled retry |

### Data Errors (Fix Required)

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `DUPLICATE_VALUE` | External ID exists | Query existing, update instead |
| `REQUIRED_FIELD_MISSING` | Missing required field | Enrich or reject |
| `INVALID_CROSS_REFERENCE_KEY` | Bad lookup ID | Validate references |
| `STRING_TOO_LONG` | Field value too long | Truncate or reject |
| `INVALID_EMAIL_ADDRESS` | Bad email format | Validate before upsert |

### Permission Errors (Escalate)

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY` | No access to related record | Check sharing rules |
| `INSUFFICIENT_ACCESS_OR_READONLY` | No write access | Check profile/permission set |
| `ENTITY_IS_DELETED` | Record deleted | Remove from batch |

---

## Retry Policy

### Default Backoff Schedule

```javascript
const RETRY_CONFIG = {
    maxRetries: 3,
    backoffMinutes: [1, 5, 15],
    retryableErrors: [
        'UNABLE_TO_LOCK_ROW',
        'REQUEST_RUNNING_TOO_LONG',
        'SERVER_UNAVAILABLE'
    ]
};
```

### Retry Implementation

```javascript
async function executeWithRetry(operation, config = RETRY_CONFIG) {
    let lastError;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (!config.retryableErrors.includes(error.code)) {
                throw error; // Non-retryable
            }

            if (attempt < config.maxRetries) {
                const waitMs = config.backoffMinutes[attempt] * 60 * 1000;
                await sleep(waitMs);
            }
        }
    }

    throw lastError;
}
```

---

## Error Queue Management

### Queue Structure

```json
{
  "queueId": "upsert-queue-2026-02-04",
  "orgAlias": "production",
  "entries": [
    {
      "id": "entry-001",
      "record": { "Email": "john@acme.com", "Company": "Acme" },
      "error": {
        "code": "DUPLICATE_VALUE",
        "message": "External ID already exists",
        "field": "External_ID__c"
      },
      "attempts": 1,
      "lastAttempt": "2026-02-04T10:00:00Z",
      "nextRetry": "2026-02-04T10:05:00Z",
      "status": "pending_retry"
    }
  ]
}
```

### Queue Operations

```bash
# View error queue
/upsert status --org production

# Retry all pending
/upsert retry --org production

# Retry specific entry
/upsert retry --org production --id entry-001

# Export failures for manual review
/upsert export-failures --org production --output ./failures.csv
```

---

## Common Error Resolutions

### DUPLICATE_VALUE

**Cause:** Record with same External ID exists.

**Resolution:**
```javascript
async function handleDuplicateValue(record, error) {
    // Extract the conflicting External ID
    const externalId = record.External_ID__c;

    // Query existing record
    const existing = await query(`
        SELECT Id, Name, Email
        FROM Lead
        WHERE External_ID__c = '${externalId}'
    `);

    if (existing.length > 0) {
        // Update instead of create
        return await update({
            object: 'Lead',
            id: existing[0].Id,
            values: record
        });
    }
}
```

### REQUIRED_FIELD_MISSING

**Cause:** Required field has no value.

**Resolution:**
```javascript
async function handleMissingField(record, error) {
    const missingField = error.fields[0];

    // Option 1: Enrich from external source
    if (canEnrich(missingField)) {
        const enriched = await enrichRecord(record);
        return await retry(enriched);
    }

    // Option 2: Use default value
    if (hasDefault(missingField)) {
        record[missingField] = getDefault(missingField);
        return await retry(record);
    }

    // Option 3: Queue for manual entry
    return await queueForManualReview(record, error);
}
```

### INVALID_CROSS_REFERENCE_KEY

**Cause:** Referenced record (Account, Owner) doesn't exist or no access.

**Resolution:**
```javascript
async function handleInvalidReference(record, error) {
    const field = error.fields[0]; // e.g., 'AccountId', 'OwnerId'

    // Validate the reference exists
    if (field === 'AccountId') {
        const account = await query(`
            SELECT Id FROM Account WHERE Id = '${record.AccountId}'
        `);
        if (account.length === 0) {
            // Remove invalid reference, create without
            delete record.AccountId;
            return await retry(record);
        }
    }

    if (field === 'OwnerId') {
        // Assign to default owner
        record.OwnerId = DEFAULT_OWNER_ID;
        return await retry(record);
    }
}
```

### STRING_TOO_LONG

**Cause:** Field value exceeds maximum length.

**Resolution:**
```javascript
async function handleStringTooLong(record, error) {
    const field = error.fields[0];
    const maxLength = getFieldMaxLength(field);

    // Truncate with ellipsis
    if (record[field]?.length > maxLength) {
        record[field] = record[field].substring(0, maxLength - 3) + '...';
        return await retry(record);
    }
}
```

---

## Partial Failure Handling

### Batch with Mixed Results

```javascript
const results = await bulkUpsert(records);

const successful = results.filter(r => r.success);
const failed = results.filter(r => !r.success);

// Process successful immediately
await logSuccess(successful);

// Queue failures for retry/review
for (const failure of failed) {
    if (isRetryable(failure.error)) {
        await addToRetryQueue(failure);
    } else {
        await addToManualReviewQueue(failure);
    }
}
```

### Rollback Strategy

For transactional consistency:

```javascript
async function upsertWithRollback(records) {
    const createdIds = [];

    try {
        for (const record of records) {
            const result = await create(record);
            createdIds.push(result.id);
        }
        return { success: true, ids: createdIds };
    } catch (error) {
        // Rollback: delete all created records
        if (createdIds.length > 0) {
            await bulkDelete(createdIds);
        }
        throw error;
    }
}
```

---

## Escalation Procedures

### When to Escalate

| Condition | Action |
|-----------|--------|
| 3+ consecutive failures same error | Escalate to admin |
| Permission errors | Escalate to SF admin |
| >10% batch failure rate | Pause and review |
| Data quality issues | Escalate to data owner |

### Escalation Notification

```javascript
async function escalate(entries, reason) {
    await sendNotification({
        channel: 'ops-alerts',
        message: `Upsert escalation: ${reason}`,
        details: {
            failedCount: entries.length,
            sampleErrors: entries.slice(0, 5).map(e => e.error),
            orgAlias: entries[0]?.orgAlias
        },
        priority: 'high'
    });
}
```

---

## Monitoring & Metrics

### Key Metrics

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Success rate | < 95% | Warning |
| Success rate | < 90% | Critical |
| Queue depth | > 100 | Warning |
| Queue age | > 24 hours | Critical |
| Retry exhaustion | > 10/hour | Warning |

### Audit Log

All operations logged to `~/.claude/logs/upsert-audit.jsonl`:

```json
{
  "timestamp": "2026-02-04T10:00:00Z",
  "operation": "upsert",
  "orgAlias": "production",
  "recordCount": 50,
  "successCount": 48,
  "failureCount": 2,
  "errors": [
    { "code": "DUPLICATE_VALUE", "count": 2 }
  ],
  "durationMs": 5230
}
```
