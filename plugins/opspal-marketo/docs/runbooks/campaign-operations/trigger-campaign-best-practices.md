# Trigger Campaign Best Practices

## Purpose

Guidelines for designing and maintaining trigger campaigns in Marketo.

## Design Principles

### 1. Single Responsibility

Each campaign should do ONE thing well.

**Good**:
- "Send Welcome Email on Form Fill"
- "Update Lead Score on Email Click"
- "Route MQL to Sales"

**Bad**:
- "Handle All Form Submissions" (too broad)
- "Do Everything for New Leads" (too complex)

### 2. Clear Naming Convention

Format: `[Date/Quarter] [Action] - [Trigger Context]`

**Examples**:
- `2025-Q4 Send Welcome Email - Demo Form`
- `2025-12 Update Score - Email Click`
- `Evergreen Route to Sales - MQL Threshold`

### 3. Appropriate Filtering

Always add filters to narrow scope.

**Before** (risky):
```
Trigger: Data Value Changes
         Any field
```

**After** (safe):
```
Trigger: Data Value Changes
         Attribute: Lead Status
         New Value: MQL

Filter: Lead Score >= 100
Filter: Email not invalid
```

## Trigger Selection Guide

### High-Volume Triggers (Use Carefully)

| Trigger | Volume | Recommendation |
|---------|--------|----------------|
| Data Value Changes | Very High | Always add field + value constraint |
| Visits Web Page | High | Add specific page URL |
| Clicks Link | High | Add specific link/email constraint |

### Medium-Volume Triggers (Standard Use)

| Trigger | Volume | Recommendation |
|---------|--------|----------------|
| Fills Out Form | Medium | Add specific form filter |
| Opens Email | Medium | Add specific email filter |
| Program Status Changes | Medium | Add program + status filter |

### Low-Volume Triggers (Safe)

| Trigger | Volume | Recommendation |
|---------|--------|----------------|
| Campaign is Requested | Low | Standard use |
| Added to List | Low | Add specific list |
| Score is Changed | Low | Add score threshold |

## API-Driven Trigger Patterns

### Static List Trigger (Added to List)
Use a static list as the dynamic entry point when Smart List rules cannot be edited via API.

**Pattern:**
1. Smart Campaign trigger: **Added to List = "API Entry List"**
2. External system adds leads to the list via API

```javascript
mcp__marketo__list_add_leads({
  listId: 1234,
  leads: [{ id: 5678 }]
});
```

### Request Campaign Trigger
Use a single requestable campaign for multiple external events.

**Pattern:**
1. Smart Campaign trigger: **Campaign is Requested (Web Service API)**
2. External system triggers the campaign via API with tokens

```javascript
mcp__marketo__campaign_request({
  campaignId: 2045,
  leads: [{ id: 5678 }],
  tokens: [{ name: '{{my.EventType}}', value: 'product_signup' }]
});
```

## Qualification Rules

### "Each lead can run through"

| Setting | Use Case |
|---------|----------|
| Once | One-time events (welcome email, trial signup) |
| Every time | Recurring actions (score updates, notifications) |
| Once every X days | Recurring but limited (weekly digest) |

### Example Configurations

**Welcome Email** (Once):
```
Qualification: Once
Reason: Lead should only receive welcome once
```

**Lead Score Update** (Every Time):
```
Qualification: Every time
Reason: Score should update on each engagement
```

**Weekly Activity Summary** (Once every 7 days):
```
Qualification: Once every 7 days
Reason: Don't spam with summaries
```

## Conflict Prevention

### Same-Trigger Conflicts

When multiple campaigns use the same trigger:

1. **Consolidate**: Combine into one campaign with branching
2. **Differentiate**: Add filters to make triggers exclusive
3. **Prioritize**: Use choice steps within single campaign

**Conflict Example**:
```
Campaign A: Trigger = Form Fill (Demo Form)
Campaign B: Trigger = Form Fill (Demo Form)
Result: Both campaigns run - unpredictable order
```

**Resolution**:
```
Single Campaign: Trigger = Form Fill (Demo Form)
Flow Step 1: Choice
  If Source = Paid Ads → Send Paid Lead Email
  Default → Send Organic Lead Email
```

### Field Update Loops

Prevent campaigns from triggering each other:

**Loop Example**:
```
Campaign A: Trigger = Status Changes to MQL
            Flow: Update Lead Score = 100

Campaign B: Trigger = Score Changes to >= 100
            Flow: Update Status = MQL

Result: Infinite loop!
```

**Prevention**:
```
Campaign A: Trigger = Status Changes to MQL
            Filter: Lead Score < 100
            Flow: Update Lead Score = 100

Campaign B: Trigger = Score Changes to >= 100
            Filter: Status is not MQL
            Flow: Update Status = MQL
```

## Wait Step Guidelines

### When to Use Wait Steps

- Before email sends (allow data sync)
- Between nurture emails
- Before sales notification (verify still qualified)

### Wait Step Best Practices

| Scenario | Recommended Wait |
|----------|------------------|
| Before first email | 5 minutes |
| Between nurture emails | 3-7 days |
| Before sales handoff | 5-15 minutes |
| Re-engagement | 24-48 hours |

### Watch Out For

- Total wait time across campaign
- Business days vs calendar days
- Wait step stacking (multiple waits)

## Error Handling

### Choice Step Patterns

Always include default handling:

```
Step 1: Send Email
        Choice 1: If Email Address is not empty → Send
        Default: Alert - No Email Address

Step 2: Sync to SFDC
        Choice 1: If SFDC Sync Enabled → Sync
        Default: Add to "Manual Review" list
```

### Alert Patterns

For critical flows, add alerts on failure:

```
Step 1: Create SFDC Lead
Step 2: If Lead was NOT created
        → Send Alert to ops@company.com
        → Add to "SFDC Sync Failed" list
```

## Performance Optimization

### Reduce Processing Load

1. **Front-load filters**: Most restrictive filter first
2. **Exit early**: Use filters to exclude non-qualifying leads
3. **Batch similar actions**: Combine related flow steps

### Monitor Performance

- Check campaign processing queue daily
- Alert on queue depth > 1000
- Review slow campaigns weekly

## Testing Procedures

### Before Activation

1. Add test lead matching criteria
2. Trigger the campaign manually
3. Verify each flow step executed
4. Check activity log for errors
5. Verify data changes correct

### After Activation

1. Monitor first 24 hours closely
2. Check error rates
3. Verify volume matches expected
4. Review sample of processed leads

## Documentation Template

For each trigger campaign, document:

```markdown
## Campaign: [Name]

**Purpose**: [What this campaign does]
**Owner**: [Team/Person responsible]
**Created**: [Date]

### Trigger
- Type: [Trigger type]
- Constraints: [Any constraints]

### Filters
1. [Filter 1]
2. [Filter 2]

### Flow Summary
1. [Step 1 description]
2. [Step 2 description]

### Expected Volume
- Daily: [Estimate]
- Monthly: [Estimate]

### Dependencies
- Emails: [List]
- Programs: [List]
- Other campaigns: [List]

### Success Criteria
- [Metric 1]
- [Metric 2]
```

## Related Resources

- **Agent**: `marketo-campaign-builder`
- **Agent**: `marketo-automation-auditor`
- **Command**: `/create-smart-campaign`
- **Command**: `/marketo-preflight campaign-activate`
- **Runbook**: `../campaign-diagnostics/README.md`
