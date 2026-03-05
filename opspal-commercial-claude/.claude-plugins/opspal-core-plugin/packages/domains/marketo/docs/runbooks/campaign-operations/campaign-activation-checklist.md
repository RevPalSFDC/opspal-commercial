# Campaign Activation Checklist

## Purpose

Pre-activation validation checklist for Marketo smart campaigns.

## Pre-Activation Checklist

### 1. Campaign Configuration

- [ ] **Campaign Type Correct**
  - Trigger, Batch, or Request campaign
  - Type matches intended use case

- [ ] **Naming Convention**
  - Follows standard: `[Date] [Type] - [Description]`
  - Located in correct folder

- [ ] **Description Populated**
  - Clear purpose documented
  - Owner/creator identified

### 2. Smart List Validation

#### For Trigger Campaigns:
- [ ] **Trigger Defined**
  - At least one trigger selected
  - Trigger constraints configured

- [ ] **Qualification Rules**
  - Each lead can run through: Once/Every time
  - First occurrence setting correct

- [ ] **Filters Applied**
  - Qualification filters to limit scope
  - Exclusion filters for unwanted leads

#### For Batch Campaigns:
- [ ] **Selection Criteria**
  - Filters define target audience
  - Estimated count reviewed

- [ ] **Schedule Configured**
  - Run date/time set
  - Recurrence (if applicable)

### 3. Flow Step Validation

- [ ] **Flow Steps Present**
  - At least one flow step defined
  - Steps in logical order

- [ ] **Email Assets Approved**
  - All referenced emails in approved state
  - No draft changes pending

- [ ] **Landing Pages Approved**
  - All referenced LPs approved
  - URLs correct

- [ ] **Wait Steps Reviewed**
  - Total wait time reasonable
  - Business days vs calendar days

- [ ] **Choice Steps Validated**
  - All branches have actions
  - Default action configured

- [ ] **Data Changes Safe**
  - Field updates won't break processes
  - No unintended triggers

### 4. Conflict Detection

- [ ] **No Trigger Conflicts**
  - Run conflict detection
  - No overlapping active triggers

- [ ] **No Circular Dependencies**
  - Campaign doesn't trigger itself
  - No A→B→A loops

- [ ] **No Field Update Loops**
  - Field changes don't trigger other campaigns that change back

### 5. Volume Estimation

- [ ] **Expected Volume Reviewed**
  - Estimated daily/total volume
  - Volume appropriate for campaign type

- [ ] **Rate Limits Checked**
  - API calls available
  - Won't exceed daily limit

### 6. Testing

- [ ] **Test Lead Used**
  - Campaign tested with test lead
  - All flow paths verified

- [ ] **Email Preview Checked**
  - Tokens rendering correctly
  - Links working

- [ ] **Activity Logged**
  - Test activities appearing
  - Expected data changes occurred

### 7. Approval & Documentation

- [ ] **Peer Review Complete**
  - Another team member reviewed
  - Feedback addressed

- [ ] **Documentation Updated**
  - Campaign purpose documented
  - Success criteria defined

- [ ] **Rollback Plan Ready**
  - Know how to deactivate quickly
  - Remediation plan for issues

## Quick Validation Command

Run automated pre-flight check:
```
/marketo-preflight campaign-activate --target=CAMPAIGN_ID
```

## Activation Decision Tree

```
Campaign Ready?
├── All checklist items complete?
│   ├── YES → Proceed to activate
│   └── NO → Complete remaining items
├── Any blockers found?
│   ├── YES → Resolve before activation
│   └── NO → Continue
├── Warnings present?
│   ├── YES → Review and acknowledge
│   └── NO → Continue
└── Final approval obtained?
    ├── YES → Activate campaign
    └── NO → Get required approval
```

## Post-Activation Monitoring

### First Hour
- Monitor trigger rate
- Check for errors in activity log
- Verify expected flow execution

### First Day
- Review overall performance
- Check email delivery/engagement
- Verify data changes correct

### First Week
- Full performance review
- Address any issues
- Document learnings

## Emergency Deactivation

If issues are discovered after activation:

1. **Immediate**: Deactivate campaign
   - Admin > Campaign > Deactivate
   - Or via API

2. **Assess**: Review impact
   - How many leads affected?
   - What actions executed?

3. **Remediate**: Fix issues
   - Correct data if needed
   - Fix campaign configuration

4. **Document**: Record incident
   - What went wrong
   - How it was fixed
   - Prevention measures

## Related Resources

- **Agent**: `marketo-campaign-builder`
- **Script**: `scripts/lib/campaign-activation-validator.js`
- **Hook**: `hooks/pre-campaign-activation.sh`
- **Command**: `/marketo-preflight campaign-activate`
- **Command**: `/create-smart-campaign`
