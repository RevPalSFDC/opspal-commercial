# Error Recovery Patterns

## Error Classification

### Error Codes and Actions

| Error | Cause | Recovery Action |
|-------|-------|-----------------|
| FIELD_REQUIRED | Required field missing | Add field validation before sync |
| INVALID_TYPE | Type conversion failed | Fix data type mismatch |
| DUPLICATE_DETECTED | Matching record exists | Merge or update existing |
| OWNER_NOT_FOUND | Invalid Owner ID | Use queue or default owner |
| RECORD_LOCKED | SFDC workflow active | Retry after delay |
| PERMISSION_DENIED | Field not writable | Check FLS settings |
| API_LIMIT_EXCEEDED | Daily limit reached | Wait for reset |

## Common Issue Resolution

### Issue: Leads Not Syncing

**Symptoms**: New Marketo leads not appearing in SFDC

**Diagnostic Steps**:
1. Check sync status: `mcp__marketo__sync_status()`
2. Verify lead has required fields
3. Check sync filter criteria
4. Review API limits

**Resolution**:
- Ensure required fields populated
- Verify lead meets sync criteria
- Check API call availability

### Issue: Sync Delays

**Symptoms**: Sync taking longer than 5 minutes

**Diagnostic Steps**:
1. Check sync queue depth
2. Review API limit usage
3. Look for bulk operations

**Resolution**:
- Reduce concurrent syncs
- Optimize high-volume operations
- Contact Marketo support if persistent

### Issue: Field Validation Errors

**Symptoms**: Sync fails with "FIELD_REQUIRED" or "INVALID_TYPE"

**Resolution Steps**:
```yaml
1. Identify failing field from error message
2. Check Marketo field value
3. Verify SFDC field requirements
4. Fix data or add validation rule
5. Retry failed records
```

## Error Resolution Workflow

### Step-by-Step Process

```markdown
## Sync Error Resolution

### Error Summary
| Error Code | Description | Count | Resolution |
|------------|-------------|-------|------------|
| FIELD_REQUIRED | Required field missing | [N] | Add field mapping |
| INVALID_TYPE | Type conversion failed | [N] | Fix data type |
| DUPLICATE_DETECTED | Duplicate in SFDC | [N] | Configure duplicate rules |

### Resolution Steps for Top Errors

#### Error: FIELD_REQUIRED - Company
**Count**: [N] records affected
**Root Cause**: Company field not populated before sync
**Resolution**:
1. Add validation rule in Marketo
2. Populate company from enrichment
3. Re-sync affected records

#### Error: DUPLICATE_DETECTED
**Count**: [N] records affected
**Root Cause**: Matching records exist in SFDC
**Resolution**:
1. Review SFDC duplicate rules
2. Configure Marketo duplicate handling
3. Merge duplicates or update existing
```

## Batch Error Recovery

### Hourly Recovery Campaign

```yaml
Sync Error Recovery:
  Campaign: Handle SFDC Sync Errors
  Type: Batch Campaign (hourly)

  Smart List:
    Filter: Sync Status = Failed
    Filter: Sync Error Date in past 24 hours

  Flow:
    1. Choice: Error Type = Required Field
       - Yes: Send to Enrichment Queue
       - No: Continue

    2. Choice: Error Type = Duplicate
       - Yes: Request Merge Review
       - No: Continue

    3. Choice: Error Type = Owner
       - Yes: Assign to Default Queue
       - No: Continue

    4. Default: Send to Manual Review

    5. Retry Sync (if recoverable)
```

### Automated Retry Script

```javascript
// Retry failed syncs with exponential backoff
const retryFailedSyncs = async (errorType, maxRetries = 3) => {
  const errors = await mcp__marketo__sync_errors({
    errorType,
    limit: 100
  });

  for (const error of errors) {
    let attempts = 0;
    let success = false;

    while (attempts < maxRetries && !success) {
      try {
        await mcp__marketo__sync_lead({
          leadId: error.leadId
        });
        success = true;
      } catch (e) {
        attempts++;
        await sleep(Math.pow(2, attempts) * 1000);
      }
    }

    if (!success) {
      // Flag for manual review
      await flagForManualReview(error);
    }
  }
};
```

## Prevention Strategies

### Pre-Sync Validation

```yaml
Validation Before Sync:
  Required Fields:
    - Email: Valid format, not bounce
    - First Name: Not empty
    - Last Name: Not empty
    - Company: Not empty

  Data Quality:
    - Phone: Valid format
    - Country: ISO standard
    - No test data (test@, fake@)
```

### Sync Health Dashboard

```markdown
# Salesforce-Marketo Sync Status
**Report Date**: [Date]
**Overall Sync Health**: [Healthy/Warning/Critical]

## Connection Status
| Component | Status | Last Sync |
|-----------|--------|-----------|
| SFDC Connection | ✅ Connected | [Timestamp] |
| Lead Sync | ✅ Active | [Timestamp] |
| Contact Sync | ✅ Active | [Timestamp] |
| Campaign Sync | ⚠️ Delayed | [Timestamp] |

## Sync Volume (Last 24 Hours)
| Direction | Records | Errors | Success Rate |
|-----------|---------|--------|--------------|
| Marketo → SFDC | [N] | [N] | [%] |
| SFDC → Marketo | [N] | [N] | [%] |

## Active Errors
| Error Type | Count | Impact | Priority |
|------------|-------|--------|----------|
| [Type] | [N] | [Impact] | P1/P2/P3 |
```

## Delegation Patterns

For related operations during sync management:

| Action Type | Delegate To |
|-------------|-------------|
| Marketo lead updates | `marketo-lead-manager` |
| Bulk data corrections | `marketo-data-operations` |
| Campaign association | `marketo-program-architect` |
| SFDC configuration | `sfdc-metadata` agents |
| Complex orchestration | `marketo-orchestrator` |
