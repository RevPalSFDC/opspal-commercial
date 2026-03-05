# Bulk Operations Guide

## Purpose

Safe procedures for executing bulk operations in Marketo.

## Pre-Operation Checklist

Before any bulk operation:

- [ ] Identify exact record set
- [ ] Document expected record count
- [ ] Run pre-flight validation
- [ ] Create backup/export of affected records
- [ ] Verify rate limit availability
- [ ] Schedule during off-peak hours (if large)
- [ ] Notify stakeholders (if production)

## Operation Types

### Bulk Lead Create

**Use Case**: Import new leads from external source.

**Pre-Checks**:
1. Validate source data format
2. Map fields to Marketo schema
3. Check for duplicates against existing
4. Validate required fields present

**Procedure**:
```javascript
// Use batch-operation-wrapper.js
const batchProcessor = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/batch-operation-wrapper');

const result = await batchProcessor.batchProcess(
  leads,
  'create',
  {
    batchSize: 300,
    concurrency: 3,
    dryRun: true // Test first!
  }
);
```

**Post-Checks**:
- Verify create count matches expected
- Spot-check sample records
- Check for sync to SFDC (if applicable)

### Bulk Lead Update

**Use Case**: Update field values across many leads.

**Pre-Checks**:
1. Export current values (backup)
2. Validate new values
3. Check update won't trigger unwanted campaigns

**Procedure**:
```javascript
const result = await batchProcessor.batchProcess(
  leads,
  'update',
  {
    batchSize: 300,
    concurrency: 5,
    lookupField: 'id' // or 'email'
  }
);
```

**Post-Checks**:
- Verify update count
- Spot-check values
- Monitor triggered campaigns

### Bulk Lead Delete

**Use Case**: Remove leads from database.

**Pre-Checks**:
1. MANDATORY: Export all data before deletion
2. Verify deletion criteria is correct
3. Check for campaign memberships
4. Get manager approval (Tier 4)

**Procedure**:
```javascript
// DANGER: Irreversible operation
// Set environment variable first:
// export MARKETO_CONFIRM_BULK_DELETE=1

const result = await batchProcessor.batchProcess(
  leadIds,
  'delete',
  {
    batchSize: 100, // Smaller batches for safety
    concurrency: 2,
    dryRun: true // ALWAYS test first
  }
);
```

**Post-Checks**:
- Verify delete count
- Confirm no unintended deletions
- Archive export file

### Bulk Program Membership

**Use Case**: Add/remove leads from programs.

**Pre-Checks**:
1. Verify program exists and is correct
2. Check for duplicate memberships
3. Understand program flow implications

**Procedure**:
```javascript
const result = await batchProcessor.batchProcess(
  leads,
  'addToProgram',
  {
    programId: 1234,
    status: 'Member',
    batchSize: 300
  }
);
```

## Rate Limit Management

### Limits
- 100 API calls per 20 seconds
- 300 records per batch operation
- 50,000 API calls per day

### Monitoring
```javascript
const rateLimiter = require('.claude-plugins/opspal-core-plugin/packages/domains/marketo/scripts/lib/rate-limit-manager');

// Check before operation
const status = rateLimiter.getStatus();
console.log(`Daily usage: ${status.dailyUsage}%`);
console.log(`Window available: ${status.windowRemaining}`);
```

### Throttling Strategy
- Large operations (>10,000): Use concurrency=2
- Medium operations (1,000-10,000): Use concurrency=5
- Small operations (<1,000): Use concurrency=10

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| 606 Rate Limit | Too many calls | Wait and retry |
| 1006 Field Not Found | Invalid field name | Check schema |
| 1004 Lead Not Found | Invalid lead ID | Verify IDs |
| 1007 Duplicate | Lead already exists | Use dedup flag |

### Retry Strategy
```javascript
const options = {
  retryAttempts: 3,
  retryDelay: 2000,
  retryMultiplier: 2,
  retryableErrors: [606, 'TIMEOUT', 'NETWORK_ERROR']
};
```

### Partial Failure Handling
- Log all failures with details
- Generate failure report
- Create retry batch for failed records
- Investigate patterns in failures

## Rollback Procedures

### Field Update Rollback
1. Use exported backup file
2. Create reverse update batch
3. Apply original values
4. Verify rollback complete

### Delete Rollback
**Note**: Deletes are NOT reversible. Prevention is the only option.
1. Recreate from backup export
2. Will get new lead IDs
3. Program memberships are lost
4. Activity history is lost

## Volume Guidelines

| Volume | Category | Approval | Time Estimate |
|--------|----------|----------|---------------|
| < 100 | Small | Self | < 1 min |
| 100-1,000 | Medium | Self | 1-5 min |
| 1,000-10,000 | Large | Peer | 5-30 min |
| 10,000-50,000 | Very Large | Manager | 30-120 min |
| > 50,000 | Massive | CAB | Multiple hours |

## Related Resources

- **Agent**: `marketo-data-operations`
- **Script**: `scripts/lib/batch-operation-wrapper.js`
- **Script**: `scripts/lib/rate-limit-manager.js`
- **Hook**: `hooks/pre-bulk-operation.sh`
- **Command**: `/marketo-preflight bulk-update`
