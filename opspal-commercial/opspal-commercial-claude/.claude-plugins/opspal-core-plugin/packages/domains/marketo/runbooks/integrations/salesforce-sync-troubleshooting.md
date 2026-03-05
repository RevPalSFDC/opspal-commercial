# Salesforce Sync Troubleshooting Guide

## Purpose

Diagnose and resolve Marketo-Salesforce sync issues.

## Quick Diagnosis

### Check Sync Status
```
/monitor-sync --full
```

### Common Status Indicators

| Status | Meaning | Action |
|--------|---------|--------|
| ✅ Connected | Healthy | No action |
| ⚠️ Delayed | Slow sync | Monitor queue |
| ❌ Disconnected | No sync | Immediate attention |

## Common Issues & Solutions

### Issue 1: Leads Not Syncing to Salesforce

**Symptoms**:
- New Marketo leads not appearing in SFDC
- Sync queue growing

**Diagnosis**:
1. Check sync is enabled in Admin > Salesforce
2. Verify lead meets sync criteria
3. Check for sync errors on lead

**Common Causes & Solutions**:

| Cause | Solution |
|-------|----------|
| Sync disabled | Enable in Admin > Salesforce |
| Missing required field | Populate Company, Email before sync |
| Duplicate in SFDC | Merge duplicates or configure handling |
| Sync filter excluding | Review sync filters |
| API limit reached | Wait or contact Marketo support |

### Issue 2: Field Updates Not Syncing

**Symptoms**:
- Changes in Marketo not reflecting in SFDC
- Or vice versa

**Diagnosis**:
1. Verify field is mapped
2. Check field-level sync settings
3. Review "Block Field Updates" setting

**Solutions**:

| Cause | Solution |
|-------|----------|
| Field not mapped | Create mapping in field management |
| Blocked updates | Adjust blocking rules |
| Wrong sync direction | Configure bidirectional if needed |
| Field-level permissions | Check SFDC field permissions |

### Issue 3: Duplicate Records Creating

**Symptoms**:
- Same person exists as Lead + Contact in SFDC
- Multiple Marketo leads for same person

**Diagnosis**:
1. Review email matching settings
2. Check SFDC duplicate rules
3. Verify lead-to-contact conversion handling

**Solutions**:

| Cause | Solution |
|-------|----------|
| No email matching | Enable email-based matching |
| Loose duplicate rules | Configure stricter matching |
| Conversion not handled | Configure lead-to-contact rules |

### Issue 4: Sync Errors

**Symptoms**:
- Red exclamation marks on lead records
- Error messages in sync log

**Common Errors**:

#### FIELD_CUSTOM_VALIDATION_EXCEPTION
```
Cause: SFDC validation rule blocking update
Solution:
1. Review validation rule in SFDC
2. Ensure Marketo data meets requirements
3. Populate required fields before sync
```

#### REQUIRED_FIELD_MISSING
```
Cause: Required field in SFDC is empty
Solution:
1. Identify required field from error
2. Map field in Marketo
3. Populate field with valid value
```

#### DUPLICATE_VALUE
```
Cause: Unique field has duplicate value
Solution:
1. Find existing record with value
2. Merge records or update value
3. Configure duplicate handling
```

#### UNABLE_TO_LOCK_ROW
```
Cause: Record locked by another process
Solution:
1. Usually auto-resolves on retry
2. Check for SFDC workflows/triggers
3. Reduce parallel operations
```

#### INSUFFICIENT_ACCESS
```
Cause: Sync user lacks permissions
Solution:
1. Review Marketo sync user profile
2. Add required object permissions
3. Add required field permissions
```

### Issue 5: Sync Delays

**Symptoms**:
- Sync taking > 5 minutes
- Large queue depth

**Diagnosis**:
1. Check queue depth in Admin
2. Review recent bulk operations
3. Check API limit status

**Solutions**:

| Cause | Solution |
|-------|----------|
| High volume period | Wait for queue to clear |
| Bulk operation running | Allow to complete |
| API limits | Pause non-essential syncs |
| System issue | Contact Marketo support |

### Issue 6: Campaign Sync Issues

**Symptoms**:
- Program members not appearing in SFDC campaigns
- Campaign status not updating

**Diagnosis**:
1. Verify program-to-campaign sync enabled
2. Check SFDC campaign exists
3. Review status mapping

**Solutions**:

| Cause | Solution |
|-------|----------|
| Sync not enabled | Enable in program setup |
| Campaign doesn't exist | Create in SFDC first |
| Status mismatch | Configure status mapping |

## Emergency Procedures

### Complete Sync Failure

1. **Verify Status**: Check Admin > Salesforce > Login
2. **Re-authenticate**: If disconnected, re-enter credentials
3. **Check SFDC**: Verify Salesforce service status
4. **Contact Support**: If persists > 30 minutes

### Mass Sync Errors

1. **Pause**: Stop active campaigns sending to SFDC
2. **Analyze**: Group errors by type
3. **Fix Root Cause**: Address underlying issue
4. **Retry**: Use "Sync Lead" to retry failed records
5. **Monitor**: Watch error rate return to normal

## Monitoring Setup

### Daily Checks
- [ ] Sync status is connected
- [ ] Error rate < 2%
- [ ] Queue depth < 500

### Weekly Checks
- [ ] Review sync error report
- [ ] Check field mapping changes
- [ ] Verify campaign sync working

### Monthly Checks
- [ ] Full sync health audit
- [ ] Review sync user permissions
- [ ] Validate field mappings

## Sync Health Commands

```bash
# Full sync status
/monitor-sync --full

# Recent errors
/monitor-sync --errors

# Field mapping validation
/monitor-sync --mappings

# Queue status
/monitor-sync --queue
```

## Escalation Path

1. **Level 1**: Self-diagnose using this guide
2. **Level 2**: Use `marketo-sfdc-sync-specialist` agent
3. **Level 3**: Marketo support ticket
4. **Level 4**: Salesforce + Marketo joint support

## Prevention Best Practices

1. **Required Fields**: Ensure all SFDC required fields mapped
2. **Validation Rules**: Align Marketo validation with SFDC rules
3. **Duplicate Rules**: Configure consistent rules in both systems
4. **Testing**: Test sync in sandbox before production
5. **Monitoring**: Set up alerts for sync health

## Related Resources

- **Agent**: `marketo-sfdc-sync-specialist`
- **Script**: `scripts/lib/sync-health-checker.js`
- **Hook**: `hooks/sync-error-monitor.sh`
- **Command**: `/monitor-sync`
