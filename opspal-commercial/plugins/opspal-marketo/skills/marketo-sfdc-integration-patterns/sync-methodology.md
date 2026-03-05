# Sync Methodology

## Sync Health Check Workflow

### Phase 1: Status Verification

```javascript
// 1. Query sync status
const status = await mcp__marketo__sync_status();

// 2. Check last sync times
// - Lead sync timestamp
// - Campaign sync timestamp
// - Activity sync timestamp

// 3. Validate connection status
// - API connectivity
// - Authentication status
```

### Phase 2: Field Mapping Validation

```javascript
// 4. Retrieve current mappings
const mappings = await mcp__marketo__field_mappings();

// 5. Compare with SFDC schema
await mcp__salesforce__describe('Lead');
await mcp__salesforce__describe('Contact');

// 6. Identify mapping issues:
// - Unmapped required fields
// - Type mismatches
// - Deprecated field references
```

### Phase 3: Sync Error Analysis

```javascript
// 7. Retrieve sync errors
const errors = await mcp__marketo__sync_errors();

// 8. Categorize errors:
// - Field validation errors
// - Required field missing
// - Duplicate detection
// - Permission errors
// - API limit errors

// 9. Calculate error rates and trends
```

## Lead/Contact Sync Rules

### Sync to Lead vs Contact

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

## Program-Campaign Sync

### Configuration

```yaml
Program-Campaign Mapping:
  - Which programs sync to campaigns
  - Membership sync status
  - Cost sync configuration

Gap Identification:
  - Programs without campaign mapping
  - Orphaned campaign memberships
```

### Sync Settings

| Setting | Recommendation |
|---------|----------------|
| Auto-sync programs | Yes for major programs |
| Membership sync | Bidirectional |
| Cost sync | From Marketo |
| Status mapping | 1:1 where possible |

## Sync Health Monitoring

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

## Sync Configuration Checklist

### Lead Sync
- [ ] Required fields validated before sync
- [ ] Email address mandatory and valid
- [ ] Company field populated
- [ ] Lead source tracked
- [ ] Owner assignment configured

### Contact Sync
- [ ] Lead-to-contact conversion rules defined
- [ ] Account matching criteria set
- [ ] Contact role assignment configured
- [ ] Activity sync enabled

### Campaign Sync
- [ ] Program-to-campaign mapping defined
- [ ] Membership status mapping configured
- [ ] Cost sync enabled (if needed)
- [ ] Attribution settings configured

### Performance
- [ ] Sync filters minimize unnecessary syncs
- [ ] High-volume operations scheduled off-peak
- [ ] API limits monitored
- [ ] Error alerts configured
