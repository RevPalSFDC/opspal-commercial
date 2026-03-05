# 08 - Audit Logging

Comprehensive logging, compliance requirements, and user transparency for upsert operations.

## Logging Overview

Every upsert operation must be logged with sufficient detail to:
1. **Trace** - Understand what happened to any record
2. **Audit** - Meet compliance requirements
3. **Debug** - Troubleshoot issues
4. **Optimize** - Identify performance bottlenecks

## Audit Log Structure

### Operation Log Entry

```json
{
  "operationId": "op_1706012345_xyz789",
  "timestamp": "2026-01-23T10:30:00.000Z",
  "duration_ms": 2345,
  "type": "UPSERT",
  "subType": "BATCH_IMPORT",
  "user": {
    "id": "claude-automation",
    "type": "system",
    "ip": null
  },
  "context": {
    "orgAlias": "acme-prod",
    "objectType": "Lead",
    "source": "csv_import",
    "sourceFile": "leads-2026-01-23.csv"
  },
  "summary": {
    "total": 100,
    "created": 12,
    "updated": 85,
    "skipped": 2,
    "failed": 1
  },
  "matchingStats": {
    "emailExact": 65,
    "domainMatch": 12,
    "fuzzyMatch": 8,
    "noMatch": 15
  },
  "records": [
    {
      "recordId": "00QABC123",
      "action": "UPDATE",
      "matchType": "EMAIL_EXACT",
      "matchConfidence": 0.95,
      "fieldsUpdated": ["Phone", "Title"],
      "previousValues": {
        "Phone": "(555) 111-1111",
        "Title": "Manager"
      },
      "newValues": {
        "Phone": "(555) 222-2222",
        "Title": "Director"
      }
    }
  ],
  "errors": [],
  "warnings": []
}
```

### Field-Level Change Log

```json
{
  "changeId": "chg_1706012345_abc123",
  "operationId": "op_1706012345_xyz789",
  "timestamp": "2026-01-23T10:30:00.000Z",
  "recordId": "00QABC123",
  "objectType": "Lead",
  "changeType": "UPDATE",
  "fields": [
    {
      "name": "Phone",
      "oldValue": "(555) 111-1111",
      "newValue": "(555) 222-2222",
      "source": "csv_import"
    },
    {
      "name": "Title",
      "oldValue": "Manager",
      "newValue": "Director",
      "source": "csv_import"
    }
  ],
  "metadata": {
    "matchType": "EMAIL_EXACT",
    "confidence": 0.95,
    "sourceRow": 42
  }
}
```

## Logging Implementation

### Audit Logger Class

```javascript
class AuditLogger {
    constructor(config) {
        this.config = config;
        this.logPath = config.logPath || 'instances/{org}/audit-logs';
        this.retentionDays = config.retentionDays || 90;
    }

    async logOperation(operation) {
        const logEntry = {
            operationId: operation.operationId || this.generateOperationId(),
            timestamp: new Date().toISOString(),
            ...operation
        };

        // Write to file
        const logFile = this.getLogFilePath(operation.orgAlias, logEntry.timestamp);
        await this.appendToLog(logFile, logEntry);

        // Index for quick lookup
        await this.indexOperation(operation.orgAlias, logEntry);

        return logEntry.operationId;
    }

    async logRecordChange(change) {
        const changeEntry = {
            changeId: this.generateChangeId(),
            timestamp: new Date().toISOString(),
            ...change
        };

        const logFile = this.getChangeLogPath(change.orgAlias, changeEntry.timestamp);
        await this.appendToLog(logFile, changeEntry);

        return changeEntry.changeId;
    }

    generateOperationId() {
        return `op_${Date.now()}_${this.shortId()}`;
    }

    generateChangeId() {
        return `chg_${Date.now()}_${this.shortId()}`;
    }

    shortId() {
        return Math.random().toString(36).substring(2, 8);
    }

    getLogFilePath(orgAlias, timestamp) {
        const date = timestamp.split('T')[0];
        return `${this.logPath.replace('{org}', orgAlias)}/operations-${date}.jsonl`;
    }

    getChangeLogPath(orgAlias, timestamp) {
        const date = timestamp.split('T')[0];
        return `${this.logPath.replace('{org}', orgAlias)}/changes-${date}.jsonl`;
    }

    async appendToLog(filePath, entry) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, JSON.stringify(entry) + '\n');
    }

    async indexOperation(orgAlias, operation) {
        // Create/update index for fast lookups
        const indexPath = `${this.logPath.replace('{org}', orgAlias)}/index.json`;

        let index = { operations: [], recordMap: {} };
        try {
            index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
        } catch (e) {
            // Index doesn't exist yet
        }

        // Add to operations list (keep last 1000)
        index.operations.unshift({
            operationId: operation.operationId,
            timestamp: operation.timestamp,
            type: operation.type,
            recordCount: operation.summary?.total || 0
        });
        index.operations = index.operations.slice(0, 1000);

        // Update record map
        if (operation.records) {
            for (const record of operation.records) {
                if (record.recordId) {
                    if (!index.recordMap[record.recordId]) {
                        index.recordMap[record.recordId] = [];
                    }
                    index.recordMap[record.recordId].push(operation.operationId);
                }
            }
        }

        await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    }
}
```

### Usage in Upsert Operations

```javascript
const auditLogger = new AuditLogger({ logPath: 'instances/{org}/audit-logs' });

const executeUpsertWithLogging = async (records, objectType, orgAlias, options) => {
    const operationId = auditLogger.generateOperationId();
    const startTime = Date.now();

    const results = {
        created: [],
        updated: [],
        skipped: [],
        failed: []
    };

    const recordLogs = [];

    for (const record of records) {
        const recordStart = Date.now();
        let recordLog = {
            sourceRecord: redactSensitiveFields(record),
            action: null,
            recordId: null,
            matchType: null,
            fieldsUpdated: [],
            previousValues: {},
            newValues: {},
            duration_ms: 0
        };

        try {
            // Execute upsert
            const upsertResult = await upsertSingleRecord(record, objectType, orgAlias);

            recordLog.action = upsertResult.action;
            recordLog.recordId = upsertResult.recordId;
            recordLog.matchType = upsertResult.matchType;
            recordLog.matchConfidence = upsertResult.confidence;

            if (upsertResult.action === 'UPDATE') {
                recordLog.fieldsUpdated = upsertResult.fieldsUpdated;
                recordLog.previousValues = upsertResult.previousValues;
                recordLog.newValues = upsertResult.newValues;

                // Log field-level changes
                await auditLogger.logRecordChange({
                    operationId,
                    orgAlias,
                    recordId: upsertResult.recordId,
                    objectType,
                    changeType: 'UPDATE',
                    fields: Object.keys(upsertResult.fieldsUpdated).map(field => ({
                        name: field,
                        oldValue: upsertResult.previousValues[field],
                        newValue: upsertResult.newValues[field],
                        source: options.source || 'api'
                    }))
                });

                results.updated.push(upsertResult);
            } else if (upsertResult.action === 'CREATE') {
                results.created.push(upsertResult);
            }

        } catch (error) {
            recordLog.action = 'FAILED';
            recordLog.error = {
                code: error.code,
                message: error.message
            };
            results.failed.push({ record, error });
        }

        recordLog.duration_ms = Date.now() - recordStart;
        recordLogs.push(recordLog);
    }

    // Log the operation
    await auditLogger.logOperation({
        operationId,
        type: 'UPSERT',
        subType: options.subType || 'SINGLE',
        orgAlias,
        context: {
            objectType,
            source: options.source,
            sourceFile: options.sourceFile
        },
        summary: {
            total: records.length,
            created: results.created.length,
            updated: results.updated.length,
            skipped: results.skipped.length,
            failed: results.failed.length
        },
        duration_ms: Date.now() - startTime,
        records: recordLogs
    });

    return { operationId, results };
};
```

## Sensitive Data Handling

### Field Redaction

```javascript
const SENSITIVE_FIELDS = [
    'SSN', 'SocialSecurityNumber', 'SSN__c',
    'TaxId', 'Tax_ID__c',
    'CreditCard', 'Credit_Card__c',
    'BankAccount', 'Bank_Account__c',
    'Password', 'Secret'
];

const redactSensitiveFields = (record) => {
    const redacted = { ...record };

    for (const field of SENSITIVE_FIELDS) {
        if (redacted[field]) {
            redacted[field] = '***REDACTED***';
        }
    }

    // Partial redaction for email in logs (keep domain)
    if (redacted.Email) {
        const [local, domain] = redacted.Email.split('@');
        redacted.Email = `${local.substring(0, 2)}***@${domain}`;
    }

    return redacted;
};
```

### PII Compliance

```javascript
const PII_FIELDS = [
    'Email', 'Phone', 'MobilePhone', 'HomePhone',
    'MailingStreet', 'OtherStreet', 'BillingStreet', 'ShippingStreet',
    'Birthdate', 'Date_of_Birth__c'
];

const getPIIComplianceLog = (record, action) => {
    const piiFields = [];

    for (const field of PII_FIELDS) {
        if (record[field]) {
            piiFields.push({
                field,
                action,
                hasValue: true,
                // Don't log actual values
            });
        }
    }

    return {
        containsPII: piiFields.length > 0,
        piiFieldCount: piiFields.length,
        piiFields: piiFields.map(f => f.field)
    };
};
```

## User Transparency

### Operation Summary for Users

```javascript
const generateUserSummary = (operationLog) => {
    return `
Upsert Operation Summary
═══════════════════════════════════════════════════════
Operation ID: ${operationLog.operationId}
Time: ${operationLog.timestamp}
Duration: ${(operationLog.duration_ms / 1000).toFixed(2)} seconds

Results:
  • Records Processed: ${operationLog.summary.total}
  • Created: ${operationLog.summary.created}
  • Updated: ${operationLog.summary.updated}
  • Skipped: ${operationLog.summary.skipped}
  • Failed: ${operationLog.summary.failed}

${operationLog.summary.failed > 0 ? `
Failures:
${operationLog.errors?.map(e => `  • ${e.record?.Email || 'Unknown'}: ${e.error.message}`).join('\n') || '  See error queue for details'}
` : ''}
Next Steps:
${operationLog.summary.failed > 0 ? `  • Review failed records: /upsert status --operation-id ${operationLog.operationId}` : '  • No action required'}
  • View full details: /upsert status --operation-id ${operationLog.operationId} --detailed
    `.trim();
};
```

### Change Notification

```javascript
const notifyRecordOwners = async (changes, orgAlias) => {
    // Group changes by owner
    const changesByOwner = {};

    for (const change of changes) {
        const ownerId = change.ownerId;
        if (!changesByOwner[ownerId]) {
            changesByOwner[ownerId] = [];
        }
        changesByOwner[ownerId].push(change);
    }

    // Create notification for each owner
    for (const [ownerId, ownerChanges] of Object.entries(changesByOwner)) {
        const summary = ownerChanges.map(c =>
            `• ${c.objectType} ${c.recordId}: ${c.fieldsUpdated.join(', ')} updated`
        ).join('\n');

        await createSalesforceTask(orgAlias, {
            OwnerId: ownerId,
            Subject: `Records Updated by Automated Process`,
            Description: `The following records owned by you were updated:\n\n${summary}`,
            Priority: 'Low',
            Status: 'Not Started'
        });
    }
};
```

## Compliance Requirements

### GDPR Compliance

```javascript
const GDPR_LOG_REQUIREMENTS = {
    dataSubjectAccess: true,
    rightToErasure: true,
    processingBasis: 'legitimate_interest',
    retentionPeriod: 90 // days
};

const logGDPRCompliance = async (operation, record) => {
    return {
        processingActivity: 'UPSERT',
        dataSubjectId: record.Email || record.Id,
        processingBasis: GDPR_LOG_REQUIREMENTS.processingBasis,
        dataCategories: getPIIComplianceLog(record, operation.action).piiFields,
        retentionPeriod: `${GDPR_LOG_REQUIREMENTS.retentionPeriod} days`,
        timestamp: new Date().toISOString(),
        automatedDecision: operation.matchType ? true : false,
        humanReview: operation.action === 'REVIEW'
    };
};
```

### SOC 2 Compliance

```javascript
const SOC2_LOG_REQUIREMENTS = {
    accessLogging: true,
    changeLogging: true,
    errorLogging: true,
    retentionDays: 365
};

const logSOC2Compliance = async (operation) => {
    return {
        controlObjective: 'CC6.1', // Logical and Physical Access Controls
        activity: 'DATA_MODIFICATION',
        user: operation.user,
        resource: `${operation.context.orgAlias}:${operation.context.objectType}`,
        action: operation.type,
        result: operation.summary.failed > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        timestamp: operation.timestamp,
        evidence: {
            operationId: operation.operationId,
            recordCount: operation.summary.total,
            logLocation: `audit-logs/${operation.timestamp.split('T')[0]}`
        }
    };
};
```

## Log Retention and Cleanup

### Retention Policy

```javascript
const RETENTION_POLICY = {
    operationLogs: 90,      // days
    changeLogs: 365,        // days
    errorLogs: 180,         // days
    complianceLogs: 2555    // 7 years
};

const cleanupOldLogs = async (orgAlias, config = RETENTION_POLICY) => {
    const basePath = `instances/${orgAlias}/audit-logs`;
    const now = new Date();

    const results = {
        deleted: 0,
        retained: 0,
        errors: []
    };

    const files = await fs.readdir(basePath);

    for (const file of files) {
        const filePath = `${basePath}/${file}`;
        const stats = await fs.stat(filePath);
        const ageInDays = (now - stats.mtime) / (1000 * 60 * 60 * 24);

        let retentionDays;
        if (file.startsWith('operations-')) {
            retentionDays = config.operationLogs;
        } else if (file.startsWith('changes-')) {
            retentionDays = config.changeLogs;
        } else if (file.startsWith('errors-')) {
            retentionDays = config.errorLogs;
        } else if (file.startsWith('compliance-')) {
            retentionDays = config.complianceLogs;
        } else {
            retentionDays = config.operationLogs; // default
        }

        if (ageInDays > retentionDays) {
            try {
                // Archive before deletion (optional)
                if (config.archiveBeforeDelete) {
                    await archiveLog(filePath, orgAlias);
                }
                await fs.unlink(filePath);
                results.deleted++;
            } catch (error) {
                results.errors.push({ file, error: error.message });
            }
        } else {
            results.retained++;
        }
    }

    return results;
};
```

## Log Search and Retrieval

### Search Operations

```javascript
const searchAuditLogs = async (orgAlias, criteria) => {
    const results = [];
    const basePath = `instances/${orgAlias}/audit-logs`;

    // Determine date range
    const startDate = criteria.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = criteria.endDate || new Date();

    // Iterate through log files in date range
    const current = new Date(startDate);
    while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];
        const logFile = `${basePath}/operations-${dateStr}.jsonl`;

        try {
            const content = await fs.readFile(logFile, 'utf8');
            const lines = content.trim().split('\n');

            for (const line of lines) {
                const entry = JSON.parse(line);

                // Apply filters
                if (criteria.operationId && entry.operationId !== criteria.operationId) continue;
                if (criteria.recordId && !entry.records?.some(r => r.recordId === criteria.recordId)) continue;
                if (criteria.objectType && entry.context?.objectType !== criteria.objectType) continue;
                if (criteria.action && !entry.records?.some(r => r.action === criteria.action)) continue;

                results.push(entry);
            }
        } catch (error) {
            // File doesn't exist for this date
        }

        current.setDate(current.getDate() + 1);
    }

    return results;
};
```

### Get Record History

```javascript
const getRecordHistory = async (recordId, orgAlias) => {
    const basePath = `instances/${orgAlias}/audit-logs`;
    const indexPath = `${basePath}/index.json`;

    try {
        const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
        const operationIds = index.recordMap[recordId] || [];

        const history = [];

        for (const opId of operationIds) {
            const results = await searchAuditLogs(orgAlias, { operationId: opId });
            if (results.length > 0) {
                const op = results[0];
                const recordEntry = op.records?.find(r => r.recordId === recordId);
                if (recordEntry) {
                    history.push({
                        timestamp: op.timestamp,
                        operationId: op.operationId,
                        action: recordEntry.action,
                        fieldsUpdated: recordEntry.fieldsUpdated,
                        previousValues: recordEntry.previousValues,
                        newValues: recordEntry.newValues
                    });
                }
            }
        }

        return history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    } catch (error) {
        return [];
    }
};
```

## Best Practices

1. **Log Everything** - Better to have too much data than too little
2. **Redact Sensitive Data** - Never log passwords, SSNs, or credit cards
3. **Use Structured Logs** - JSON format for easy parsing
4. **Include Context** - Operation ID, user, source, timestamp
5. **Retain Appropriately** - Follow compliance requirements
6. **Index for Performance** - Create indexes for common queries
7. **Alert on Anomalies** - Monitor for unusual patterns

## Related Sections

- [01 - Upsert Fundamentals](01-upsert-fundamentals.md)
- [07 - Error Handling](07-error-handling.md)
- [09 - Troubleshooting](09-troubleshooting.md)

---
Next: [09 - Troubleshooting](09-troubleshooting.md)
