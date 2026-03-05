---
description: Real-time monitoring of Marketo-Salesforce synchronization status and errors
argument-hint: "[--errors] [--queue] [--mappings] [--full]"
---

# Monitor Salesforce Sync Status

Real-time monitoring of Marketo-Salesforce synchronization status and errors.

## Usage

```
/monitor-sync [--errors] [--queue] [--mappings] [--full]
```

## Parameters

- `--errors` - Show recent sync errors with resolution guidance
- `--queue` - Show sync queue depth and pending records
- `--mappings` - Validate field mappings between systems
- `--full` - Complete sync health report (combines all)

## What This Command Shows

### Connection Status
- Salesforce connection state
- Last successful sync time
- Sync enabled/disabled status

### Error Analysis
- Recent sync errors grouped by type
- Error severity classification
- Resolution guidance for each error type

### Queue Health
- Pending records count
- Queue depth trend
- Estimated sync time

### Field Mapping Validation
- Mapped vs unmapped fields
- Type compatibility issues
- Missing required mappings

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 SALESFORCE SYNC MONITOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Connection Status
| Component | Status | Last Update |
|-----------|--------|-------------|
| SFDC Connection | ✅ Connected | 2 min ago |
| Lead Sync | ✅ Active | 3 min ago |
| Contact Sync | ✅ Active | 3 min ago |
| Campaign Sync | ⚠️ Delayed | 15 min ago |

## Sync Volume (Last 24 Hours)
| Direction | Records | Errors | Success Rate |
|-----------|---------|--------|--------------|
| Marketo → SFDC | 1,245 | 23 | 98.2% |
| SFDC → Marketo | 892 | 5 | 99.4% |

## Queue Status
- Pending Records: 142
- Queue Depth: 🟢 Healthy
- Est. Clear Time: ~5 minutes

## Recent Errors (Last 24h)

### FIELD_VALIDATION (15 errors)
Severity: Medium
Resolution: Check field mappings and SFDC validation rules

Example:
- Lead 12345: "Company is required"
- Lead 12346: "Email format invalid"

### DUPLICATE_DETECTED (5 errors)
Severity: Medium
Resolution: Review SFDC duplicate rules or merge existing records

### PERMISSION (3 errors)
Severity: High
Resolution: Review Marketo sync user permissions in Salesforce

## Recommendations

1. ⚠️ Address FIELD_VALIDATION errors
   - 15 leads blocked due to missing Company field
   - Action: Populate Company in Marketo before sync

2. ⚠️ Review campaign sync delay
   - Campaign sync is 15 minutes behind
   - May indicate high volume or configuration issue

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SYNC HEALTH SCORE: 85/100 (Good)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Error Code Reference

| Error | Severity | Resolution |
|-------|----------|------------|
| UNABLE_TO_LOCK_ROW | Low | Auto-retry, record temporarily locked |
| ENTITY_IS_DELETED | Medium | Verify lead exists in SFDC |
| FIELD_CUSTOM_VALIDATION | Medium | Check SFDC validation rules |
| REQUIRED_FIELD_MISSING | Medium | Populate field in Marketo |
| DUPLICATE_DETECTED | Medium | Configure duplicate rules |
| INSUFFICIENT_ACCESS | High | Check sync user permissions |

## Related Agent

This command uses: `marketo-sfdc-sync-specialist`

## Related Commands

- `/marketo-logs --type=sync_to_sfdc` - View sync activity logs
- `/marketo-audit --focus=sync` - Full sync audit
