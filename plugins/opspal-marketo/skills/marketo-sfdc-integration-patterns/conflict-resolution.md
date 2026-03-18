# Conflict Resolution Patterns

## Common Sync Conflicts

### 1. Duplicate Records

**Symptoms**: Multiple records for same person in SFDC

**Diagnostic Steps**:
1. Review email matching settings
2. Check SFDC duplicate rules
3. Verify lead/contact conversion handling

**Resolution**:
- Configure stricter duplicate rules
- Set up duplicate blocking
- Implement merge process

### 2. Field Updates Not Syncing

**Symptoms**: Changes in Marketo not reflecting in SFDC

**Diagnostic Steps**:
1. Verify field is mapped
2. Check field-level sync settings
3. Review update blocking rules

**Resolution**:
- Confirm bidirectional mapping
- Check "Block Field Updates" settings
- Verify field permissions in SFDC

### 3. Owner Assignment Incorrect

**Symptoms**: Leads assigned to wrong SFDC user

**Diagnostic Steps**:
1. Review lead owner mapping rules
2. Check default owner settings
3. Verify SFDC user IDs

**Resolution**:
- Correct owner assignment rules
- Verify user mapping
- Set appropriate defaults

## Sync Direction Conflicts

### Bidirectional Update Collision

```yaml
Scenario: Same field updated in both systems

Problem:
  - Marketo updates "Phone" at 10:00 AM
  - SFDC updates "Phone" at 10:01 AM
  - Which value wins?

Resolution Strategies:
  1. Last write wins (default)
  2. System of record wins (configure)
  3. Manual review (flag for attention)

Recommendation:
  - Designate system of record per field
  - Configure sync direction accordingly
  - Use "Block Field Updates" for SoR fields
```

### Record Ownership Conflicts

```yaml
Ownership Conflict:
  Scenario: Lead syncs before owner assignment

  Problem:
    - Marketo creates lead
    - Sync before assignment rules fire
    - Lead goes to wrong queue

  Resolution:
    1. Pre-sync validation in Marketo
    2. SFDC assignment rules (post-sync)
    3. Delayed sync for new leads (5 min)
```

## Duplicate Management

### Prevention Strategies

```yaml
Duplicate Prevention:
  Marketo Side:
    - Use "Sync Lead to SFDC" only after validation
    - Check existing records before create
    - Use merge API for detected duplicates

  SFDC Side:
    - Configure duplicate rules
    - Set blocking vs warning
    - Use matching rules (email, name+company)
```

### Resolution Workflow

```yaml
Duplicate Resolution:
  1. Identify duplicates (both systems)
  2. Select canonical record
  3. Merge in SFDC (if both there)
  4. Merge in Marketo
  5. Verify sync reflects merge
```

## Error Recovery Patterns

### Retry Logic

```yaml
Retry Configuration:
  Immediate Retry:
    - Network timeout
    - Rate limit (after cooldown)

  Delayed Retry:
    - Record locked (5 min)
    - Validation failure (after fix)

  No Retry:
    - Permission denied
    - Invalid field value
    - Duplicate detected
```

### Recovery Campaign

```yaml
Sync Error Recovery Campaign:
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

## Instance Context Integration

Sync configuration should be tracked in:

```
portals/{instance}/
├── sync-status/
│   ├── current-status.json
│   ├── field-mappings.json
│   └── error-log.json
├── SYNC_CONFIGURATION.md
└── SYNC_TROUBLESHOOTING.md
```

This enables:
- Historical sync performance tracking
- Quick field mapping reference
- Error pattern analysis
