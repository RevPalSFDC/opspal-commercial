# 09 - Troubleshooting

Common issues, error patterns, and solutions for upsert operations.

## Quick Diagnostic Commands

```bash
# Check upsert operation status
/upsert status --org <alias>

# View error queue
/upsert status --org <alias> --errors-only

# Check specific operation
/upsert status --org <alias> --operation-id <op-id>

# Diagnose Lead conversion readiness
/lead-convert diagnose <leadId> --org <alias>

# Preview matching without changes
/upsert match ./data.csv --org <alias>
```

## Common Errors and Solutions

### REQUIRED_FIELD_MISSING

**Symptom:** Record creation fails with missing required field error.

**Error Message:**
```
REQUIRED_FIELD_MISSING: Required fields are missing: [LastName]
```

**Causes:**
1. Source data missing required fields
2. Field mapping not configured
3. Conditional required fields not met

**Solutions:**

```javascript
// Solution 1: Add field to source data
const records = sourceData.map(record => ({
    ...record,
    LastName: record.LastName || record.Name?.split(' ').pop() || 'Unknown'
}));

// Solution 2: Update field mapping
{
    "transformations": {
        "LastName": {
            "default": "Unknown",
            "fallbackField": "Name"
        }
    }
}

// Solution 3: Pre-validate before upsert
const validate = (record) => {
    const required = ['LastName', 'Company'];
    const missing = required.filter(f => !record[f]);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
};
```

---

### DUPLICATE_VALUE

**Symptom:** Insert fails because a record with the same unique value already exists.

**Error Message:**
```
DUPLICATE_VALUE: duplicate value found: Email duplicates value on record: 00QABC123
```

**Causes:**
1. Record already exists with same Email/External ID
2. Matching logic didn't find existing record
3. Race condition in batch processing

**Solutions:**

```javascript
// Solution 1: Use upsert instead of insert
const result = await upsertRecord(record, 'Lead', orgAlias);

// Solution 2: Improve matching threshold
{
    "matching": {
        "thresholds": {
            "emailExact": 1.0,  // Guaranteed match on email
            "fuzzyMatch": 0.70  // Lower threshold to catch more matches
        }
    }
}

// Solution 3: Handle in error queue
if (error.code === 'DUPLICATE_VALUE') {
    // Extract existing record ID from error
    const existingId = error.message.match(/00Q[A-Z0-9]{12,15}/)?.[0];
    if (existingId) {
        // Update existing instead
        await updateRecord('Lead', existingId, record);
    }
}
```

---

### VALIDATION_RULE_ERROR

**Symptom:** Record fails validation rule configured in Salesforce.

**Error Message:**
```
FIELD_CUSTOM_VALIDATION_EXCEPTION: Phone is required when Status is Qualified
```

**Causes:**
1. Business validation rules in org
2. Record doesn't meet required criteria
3. Conditional fields not populated

**Solutions:**

```javascript
// Solution 1: Query validation rules first
const getValidationRules = async (objectType, orgAlias) => {
    const query = `
        SELECT Id, ValidationName, ErrorConditionFormula, ErrorMessage
        FROM ValidationRule
        WHERE EntityDefinition.QualifiedApiName = '${objectType}'
          AND Active = true
    `;
    return await executeQuery(query, orgAlias, { useToolingApi: true });
};

// Solution 2: Pre-validate against known rules
const validateAgainstRules = (record, rules) => {
    for (const rule of rules) {
        // Parse and evaluate formula
        if (evaluateFormula(rule.ErrorConditionFormula, record)) {
            throw new Error(`Validation Rule "${rule.ValidationName}": ${rule.ErrorMessage}`);
        }
    }
};

// Solution 3: Add missing conditional fields
if (record.Status === 'Qualified' && !record.Phone) {
    // Enrich phone before upsert
    const enriched = await enrichRecord(record, ['Phone']);
    record.Phone = enriched.Phone;
}
```

---

### INSUFFICIENT_ACCESS

**Symptom:** User doesn't have permission to create/update records.

**Error Message:**
```
INSUFFICIENT_ACCESS: insufficient access rights on object id
```

**Causes:**
1. Profile/Permission Set missing object access
2. Field-Level Security blocking field update
3. Sharing rules preventing access
4. Record type restrictions

**Solutions:**

```javascript
// Solution 1: Check permissions before operation
const checkPermissions = async (objectType, operation, orgAlias) => {
    const describe = await describeObject(objectType, orgAlias);

    if (operation === 'CREATE' && !describe.createable) {
        throw new Error(`No create permission on ${objectType}`);
    }
    if (operation === 'UPDATE' && !describe.updateable) {
        throw new Error(`No update permission on ${objectType}`);
    }

    return describe;
};

// Solution 2: Check field-level access
const checkFieldAccess = async (objectType, fields, orgAlias) => {
    const describe = await describeObject(objectType, orgAlias);
    const inaccessible = [];

    for (const field of fields) {
        const fieldDesc = describe.fields.find(f => f.name === field);
        if (!fieldDesc?.updateable) {
            inaccessible.push(field);
        }
    }

    return inaccessible;
};

// Solution 3: Filter to accessible fields only
const filterToAccessibleFields = async (record, objectType, orgAlias) => {
    const describe = await describeObject(objectType, orgAlias);
    const accessibleFields = describe.fields
        .filter(f => f.updateable)
        .map(f => f.name);

    return Object.fromEntries(
        Object.entries(record).filter(([key]) => accessibleFields.includes(key))
    );
};
```

---

### API_LIMIT_EXCEEDED

**Symptom:** Too many API calls or records in request.

**Error Message:**
```
API_LIMIT_EXCEEDED: API request limit exceeded
REQUEST_LIMIT_EXCEEDED: TotalRequests Limit exceeded
```

**Causes:**
1. Exceeded daily API call limit
2. Too many records in single request
3. Concurrent operations exhausting limits

**Solutions:**

```javascript
// Solution 1: Check limits before operation
const checkApiLimits = async (orgAlias) => {
    const cmd = `sf org display --json --target-org ${orgAlias}`;
    const result = JSON.parse(await executeCommand(cmd));

    const limits = result.result.apiUsage;
    const remaining = limits.max - limits.used;

    if (remaining < 100) {
        throw new Error(`Low API limit: ${remaining} remaining`);
    }

    return remaining;
};

// Solution 2: Implement rate limiting
const rateLimiter = {
    queue: [],
    processing: false,
    ratePerMinute: 100,

    async add(operation) {
        return new Promise((resolve, reject) => {
            this.queue.push({ operation, resolve, reject });
            this.process();
        });
    },

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const delayMs = 60000 / this.ratePerMinute;
        const item = this.queue.shift();

        try {
            const result = await item.operation();
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }

        await new Promise(r => setTimeout(r, delayMs));
        this.processing = false;
        this.process();
    }
};

// Solution 3: Use Bulk API for large operations
const useBulkApi = async (records, objectType, orgAlias) => {
    if (records.length > 200) {
        // Switch to Bulk API
        return await bulkUpsert(records, objectType, orgAlias);
    }
    return await standardUpsert(records, objectType, orgAlias);
};
```

---

### UNABLE_TO_LOCK_ROW

**Symptom:** Record is being modified by another process.

**Error Message:**
```
UNABLE_TO_LOCK_ROW: unable to obtain exclusive access to this record
```

**Causes:**
1. Another user/process updating same record
2. Workflow/trigger modifying record
3. Batch process conflict

**Solutions:**

```javascript
// Solution 1: Implement retry with backoff
const retryOnLock = async (operation, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (error.code === 'UNABLE_TO_LOCK_ROW' && i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw error;
        }
    }
};

// Solution 2: Use FOR UPDATE in SOQL (Apex)
const lockRecordForUpdate = `
    Lead leadToUpdate = [SELECT Id FROM Lead WHERE Id = :leadId FOR UPDATE];
    // Now safe to update
`;

// Solution 3: Reduce batch size to minimize conflicts
const SAFE_BATCH_SIZE = 50; // Smaller batches = fewer conflicts
```

---

### INVALID_CROSS_REFERENCE_KEY

**Symptom:** Referenced record doesn't exist or isn't accessible.

**Error Message:**
```
INVALID_CROSS_REFERENCE_KEY: invalid cross reference id
```

**Causes:**
1. AccountId references non-existent Account
2. OwnerId references inactive User
3. RecordTypeId doesn't exist in org

**Solutions:**

```javascript
// Solution 1: Validate references before upsert
const validateReferences = async (record, orgAlias) => {
    const issues = [];

    if (record.AccountId) {
        const exists = await recordExists('Account', record.AccountId, orgAlias);
        if (!exists) {
            issues.push({ field: 'AccountId', value: record.AccountId, issue: 'Account not found' });
        }
    }

    if (record.OwnerId) {
        const user = await queryUser(record.OwnerId, orgAlias);
        if (!user || !user.IsActive) {
            issues.push({ field: 'OwnerId', value: record.OwnerId, issue: 'User not found or inactive' });
        }
    }

    return issues;
};

// Solution 2: Clear invalid references
const clearInvalidReferences = async (record, orgAlias) => {
    const issues = await validateReferences(record, orgAlias);
    const cleaned = { ...record };

    for (const issue of issues) {
        delete cleaned[issue.field];
    }

    return cleaned;
};

// Solution 3: Map to valid references
const mapReferences = async (record, mappings, orgAlias) => {
    const mapped = { ...record };

    if (record.OwnerId && mappings.owners?.[record.OwnerId]) {
        mapped.OwnerId = mappings.owners[record.OwnerId];
    }

    return mapped;
};
```

---

### STRING_TOO_LONG

**Symptom:** Text value exceeds field length limit.

**Error Message:**
```
STRING_TOO_LONG: value too long for field: Description maximum length is: 32000
```

**Causes:**
1. Long text pasted without truncation
2. Combined fields exceeding limit
3. Encoding issues increasing length

**Solutions:**

```javascript
// Solution 1: Get field lengths and truncate
const getFieldLengths = async (objectType, orgAlias) => {
    const describe = await describeObject(objectType, orgAlias);
    const lengths = {};

    for (const field of describe.fields) {
        if (field.type === 'string' || field.type === 'textarea') {
            lengths[field.name] = field.length;
        }
    }

    return lengths;
};

const truncateToFieldLengths = (record, lengths) => {
    const truncated = { ...record };

    for (const [field, value] of Object.entries(truncated)) {
        if (typeof value === 'string' && lengths[field]) {
            if (value.length > lengths[field]) {
                truncated[field] = value.substring(0, lengths[field] - 3) + '...';
            }
        }
    }

    return truncated;
};
```

---

## Matching Issues

### Records Not Matching When They Should

**Symptom:** Duplicates created because matching didn't find existing record.

**Diagnosis:**

```javascript
// Check why records didn't match
const diagnoseMatchFailure = async (inputRecord, orgAlias) => {
    const diagnosis = {
        inputRecord: redact(inputRecord),
        existingRecords: [],
        matchAttempts: []
    };

    // Query potential matches
    if (inputRecord.Email) {
        const byEmail = await queryByEmail(inputRecord.Email, orgAlias);
        diagnosis.existingRecords.push(...byEmail);
        diagnosis.matchAttempts.push({
            method: 'EMAIL_EXACT',
            query: `Email = '${inputRecord.Email}'`,
            found: byEmail.length
        });
    }

    if (inputRecord.Company) {
        const byCompany = await queryByCompany(inputRecord.Company, orgAlias);
        diagnosis.existingRecords.push(...byCompany);
        diagnosis.matchAttempts.push({
            method: 'COMPANY',
            query: `Company = '${inputRecord.Company}'`,
            found: byCompany.length
        });
    }

    // Calculate fuzzy scores
    for (const existing of diagnosis.existingRecords) {
        existing._fuzzyScore = calculateSimilarity(inputRecord, existing);
    }

    return diagnosis;
};
```

**Common Causes:**
1. Email case mismatch (fix: lowercase before matching)
2. Company name variations (fix: normalize company names)
3. Threshold too high (fix: lower fuzzy threshold)
4. Cross-object matching disabled (fix: enable in config)

---

### Records Matching When They Shouldn't

**Symptom:** Different people/companies matched as duplicates.

**Diagnosis:**

```javascript
const diagnoseWrongMatch = async (recordA, recordB) => {
    const analysis = {
        recordA: redact(recordA),
        recordB: redact(recordB),
        similarities: {},
        differences: {},
        shouldMatch: null
    };

    // Compare fields
    const fields = ['Email', 'Company', 'FirstName', 'LastName', 'Phone'];

    for (const field of fields) {
        const valA = recordA[field];
        const valB = recordB[field];

        if (valA === valB) {
            analysis.similarities[field] = valA;
        } else if (valA && valB) {
            analysis.differences[field] = {
                recordA: valA,
                recordB: valB,
                similarity: stringSimilarity(valA, valB)
            };
        }
    }

    // Determine if match is correct
    const hasEmailMatch = analysis.similarities.Email;
    const hasNameMatch = analysis.similarities.FirstName && analysis.similarities.LastName;

    analysis.shouldMatch = hasEmailMatch || hasNameMatch;
    analysis.recommendation = analysis.shouldMatch
        ? 'Match appears correct'
        : 'Match appears incorrect - raise threshold';

    return analysis;
};
```

**Common Causes:**
1. Common names matching (fix: require more fields)
2. Threshold too low (fix: raise to 0.80+)
3. Domain matching generic domains (fix: expand blocklist)

---

## Performance Issues

### Slow Upsert Operations

**Symptom:** Batch operations taking too long.

**Diagnosis:**

```javascript
const profileUpsertPerformance = async (records, objectType, orgAlias) => {
    const profile = {
        totalRecords: records.length,
        timing: {},
        bottlenecks: []
    };

    // Time each phase
    const phases = ['normalize', 'match', 'validate', 'upsert', 'postProcess'];

    for (const phase of phases) {
        const start = Date.now();
        await runPhase(phase, records, objectType, orgAlias);
        profile.timing[phase] = Date.now() - start;
    }

    // Identify bottlenecks
    const avgTimePerRecord = Object.values(profile.timing).reduce((a, b) => a + b, 0) / records.length;

    if (profile.timing.match > profile.timing.upsert) {
        profile.bottlenecks.push({
            phase: 'match',
            issue: 'Matching slower than upsert',
            recommendation: 'Add index on Email field, reduce query scope'
        });
    }

    return profile;
};
```

**Optimizations:**

```javascript
// 1. Batch queries instead of N+1
const batchMatch = async (records, orgAlias) => {
    const emails = records.map(r => r.Email).filter(Boolean);

    // Single query for all emails
    const query = `SELECT Id, Email FROM Lead WHERE Email IN ('${emails.join("','")}')`;
    const existing = await executeQuery(query, orgAlias);

    // Build lookup map
    const emailMap = new Map(existing.map(r => [r.Email.toLowerCase(), r]));

    return records.map(r => ({
        record: r,
        match: r.Email ? emailMap.get(r.Email.toLowerCase()) : null
    }));
};

// 2. Use parallel processing for independent operations
const parallelProcess = async (records, concurrency = 5) => {
    const results = [];
    const chunks = chunkArray(records, concurrency);

    for (const chunk of chunks) {
        const chunkResults = await Promise.all(
            chunk.map(r => processRecord(r))
        );
        results.push(...chunkResults);
    }

    return results;
};

// 3. Cache frequently accessed data
const CACHE = new Map();
const getCachedDescribe = async (objectType, orgAlias) => {
    const key = `${orgAlias}:${objectType}`;
    if (!CACHE.has(key)) {
        CACHE.set(key, await describeObject(objectType, orgAlias));
    }
    return CACHE.get(key);
};
```

---

## Diagnostic Tools

### Health Check Script

```javascript
const runUpsertHealthCheck = async (orgAlias) => {
    const health = {
        timestamp: new Date().toISOString(),
        orgAlias,
        status: 'HEALTHY',
        checks: []
    };

    // Check 1: API connectivity
    try {
        await checkApiLimits(orgAlias);
        health.checks.push({ name: 'API_CONNECTIVITY', status: 'PASS' });
    } catch (error) {
        health.checks.push({ name: 'API_CONNECTIVITY', status: 'FAIL', error: error.message });
        health.status = 'UNHEALTHY';
    }

    // Check 2: Object permissions
    for (const obj of ['Lead', 'Contact', 'Account']) {
        try {
            await checkPermissions(obj, 'UPDATE', orgAlias);
            health.checks.push({ name: `${obj}_PERMISSIONS`, status: 'PASS' });
        } catch (error) {
            health.checks.push({ name: `${obj}_PERMISSIONS`, status: 'FAIL', error: error.message });
            health.status = 'DEGRADED';
        }
    }

    // Check 3: Error queue size
    const queueStatus = await getErrorQueueStatus(orgAlias);
    if (queueStatus.totalInQueue > 100) {
        health.checks.push({
            name: 'ERROR_QUEUE',
            status: 'WARN',
            message: `${queueStatus.totalInQueue} items in queue`
        });
        health.status = health.status === 'HEALTHY' ? 'DEGRADED' : health.status;
    } else {
        health.checks.push({ name: 'ERROR_QUEUE', status: 'PASS' });
    }

    // Check 4: Configuration validity
    try {
        await validateUpsertConfig(orgAlias);
        health.checks.push({ name: 'CONFIG_VALID', status: 'PASS' });
    } catch (error) {
        health.checks.push({ name: 'CONFIG_VALID', status: 'FAIL', error: error.message });
        health.status = 'UNHEALTHY';
    }

    return health;
};
```

### Debug Mode

```javascript
// Enable debug logging
process.env.UPSERT_DEBUG = 'true';

const debugLog = (...args) => {
    if (process.env.UPSERT_DEBUG === 'true') {
        console.log('[UPSERT_DEBUG]', new Date().toISOString(), ...args);
    }
};

// Use in operations
const upsertWithDebug = async (record, objectType, orgAlias) => {
    debugLog('Starting upsert', { record: redact(record), objectType });

    debugLog('Normalizing record...');
    const normalized = normalizeRecord(record);
    debugLog('Normalized:', normalized);

    debugLog('Matching...');
    const match = await findMatch(normalized, objectType, orgAlias);
    debugLog('Match result:', match);

    debugLog('Executing DML...');
    const result = await executeDml(normalized, match, objectType, orgAlias);
    debugLog('DML result:', result);

    return result;
};
```

## Related Sections

- [07 - Error Handling](07-error-handling.md)
- [08 - Audit Logging](08-audit-logging.md)
- [02 - Matching Strategies](02-matching-strategies.md)

---
End of Runbook
