# SFDC Sync Patterns

## Lead Sync Configuration

### Sync Trigger Rules

```yaml
Sync on MQL:
  Campaign: Sync Lead to SFDC on MQL
  Type: Trigger Campaign

  Smart List:
    Trigger: Lead Status is changed
    Filter: Lead Status = MQL
    Filter: Synced to SFDC is false

  Flow:
    1. Change Data Value: Ready to Sync = true
    2. Sync Lead to SFDC
    3. Wait: 2 minutes
    4. Add to List: MQL Sync Verification Queue
```

### Field Mapping Considerations

```yaml
Critical Mappings:
  # Marketo → SFDC (on sync)
  mkto_to_sfdc:
    - mkto: Lead Status
      sfdc: Status
      sync: Marketo wins

    - mkto: Behavior Score
      sfdc: Behavior_Score__c
      sync: Marketo wins

    - mkto: Lead Source Detail
      sfdc: LeadSource
      sync: First touch wins

    - mkto: MQL Date
      sfdc: MQL_Date__c
      sync: Marketo wins

  # SFDC → Marketo (return sync)
  sfdc_to_mkto:
    - sfdc: OwnerId
      mkto: Lead Owner ID
      sync: SFDC wins

    - sfdc: LeadOrContactId
      mkto: SFDC Lead ID
      sync: SFDC wins

    - sfdc: IsConverted
      mkto: SFDC Converted
      sync: SFDC wins
```

### Sync Timing

| Scenario | Sync Timing | Notes |
|----------|-------------|-------|
| New MQL | Immediate | Real-time trigger |
| Score Update | 5-min batch | Prevent over-sync |
| Owner Change | Immediate | Return sync from SFDC |
| Data Enrichment | 5-min batch | Background process |

## Lead vs Contact Routing

### Decision Logic

```yaml
Lead or Contact Decision:
  # Check existing records
  1. Query SFDC Contact by Email:
     - Found: Update Contact, skip Lead creation
     - Not Found: Continue

  2. Query SFDC Lead by Email:
     - Found: Update existing Lead
     - Not Found: Create new Lead

  # Account matching
  3. If creating Lead, check Account match:
     - Company matches Account: Attach Lead to Account
     - No match: Create unattached Lead
```

### Conversion Handling

```yaml
Lead Conversion Sync:
  # When SFDC Lead is converted
  Trigger: SFDC Converted = true

  Actions:
    1. Update Lifecycle Stage: Opportunity
    2. Clear Lead Status (no longer Lead)
    3. Update SFDC Contact ID field
    4. Log Interesting Moment: Lead Converted
```

## Sync Error Handling

### Common Sync Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Required field missing | SFDC validation rule | Add field validation before sync |
| Duplicate detected | SFDC duplicate rule | Merge or update existing |
| Owner not found | Invalid Owner ID | Use queue or default owner |
| Record locked | SFDC workflow/process | Retry after delay |

### Error Recovery Campaign

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

## Sync Verification

### Post-Sync Validation

```yaml
Sync Verification Campaign:
  Trigger: Sync Lead to SFDC completes
  Wait: 5 minutes

  Checks:
    - SFDC Lead ID is not empty
    - Lead Owner ID is not empty
    - Sync Status = Success

  Success Actions:
    - Change Data Value: Synced to SFDC = true
    - Add Interesting Moment: Synced to SFDC

  Failure Actions:
    - Add to List: Sync Failure Queue
    - Alert Marketing Ops
    - Change Data Value: Sync Status = Failed
```

### Sync Health Monitoring

```javascript
const syncHealthMetrics = {
  // Track sync success rate
  successRate: {
    target: 98,
    alert_threshold: 95,
    critical_threshold: 90
  },

  // Track sync latency
  latency: {
    target_minutes: 5,
    alert_threshold: 15,
    critical_threshold: 30
  },

  // Track error patterns
  errorTracking: {
    categorize: true,
    alert_on_spike: true,
    spike_threshold: 2  // 2x normal rate
  }
};
```
