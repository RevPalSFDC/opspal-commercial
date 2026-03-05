# Flow Change Detection Guide

This document explains Salesforce Flow's `doesRequireRecordChangedToMeetCriteria` setting and how to prevent issues when modifying flows.

## The Problem

Removing the "Only when a record is updated to meet the condition criteria" setting from a flow can cause it to run on **every** record update, not just when relevant values change. This can lead to:

- Unexpected record updates
- Infinite loop triggers
- Performance degradation
- Governor limit exhaustion

## Understanding the Setting

### What Does `doesRequireRecordChangedToMeetCriteria` Do?

When **enabled** (recommended for most update-triggered flows):
- Flow only runs when a record **changes from NOT meeting** criteria **TO meeting** criteria
- Prevents the flow from running on every update

When **disabled** (use with caution):
- Flow runs on **every** update where criteria are met
- Even if the record already met the criteria before the update

### Example Scenario

**Flow Criteria:** `Status equals 'Closed'`

| Update | With Change Detection | Without Change Detection |
|--------|----------------------|-------------------------|
| Status: Open → Closed | ✅ Runs | ✅ Runs |
| Status: Closed → Closed (no change) | ❌ Does NOT run | ⚠️ Runs |
| Description changed (Status still Closed) | ❌ Does NOT run | ⚠️ Runs |

## Flow XML Structure

The setting appears in the `<start>` element of Flow XML:

```xml
<start>
    <locationX>50</locationX>
    <locationY>0</locationY>
    <object>Opportunity</object>
    <recordTriggerType>Update</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>

    <!-- This is the critical setting -->
    <doesRequireRecordChangedToMeetCriteria>true</doesRequireRecordChangedToMeetCriteria>

    <filters>
        <field>StageName</field>
        <operator>EqualTo</operator>
        <value>
            <stringValue>Closed Won</stringValue>
        </value>
    </filters>
</start>
```

## Using the Flow Change Detector

The `flow-change-detector.js` script identifies risky changes before deployment:

### Check a Single Flow

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-change-detector.js check path/to/MyFlow.flow-meta.xml
```

### Compare Flow Versions

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-change-detector.js compare --old v1/MyFlow.flow-meta.xml --new v2/MyFlow.flow-meta.xml
```

### Check All Flows in a Directory

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-change-detector.js directory force-app/main/default/flows/
```

## Risk Detection Rules

The detector flags these issues:

### 🔴 CRITICAL: Change Detection Removed

**Symptom:** `doesRequireRecordChangedToMeetCriteria` changed from `true` to `false` or removed

**Risk:** Flow will run on every update, not just when values change

**Fix:** Keep the setting enabled, or add explicit `IsChanged()` conditions

### 🟡 WARNING: High Trigger Order

**Symptom:** Flow trigger order > 100

**Risk:** Flows with high trigger order that depend on change detection may miss updates

**Fix:** Review trigger order and ensure proper sequencing

### 🟡 WARNING: No Entry Criteria

**Symptom:** Update-triggered flow with no filter conditions

**Risk:** Flow runs on every record update

**Fix:** Add appropriate entry criteria

## Safe Patterns for Update-Triggered Flows

### Pattern 1: Use Change Detection (Recommended)

```xml
<start>
    <doesRequireRecordChangedToMeetCriteria>true</doesRequireRecordChangedToMeetCriteria>
    <recordTriggerType>Update</recordTriggerType>
    <filters>
        <field>Status</field>
        <operator>EqualTo</operator>
        <value><stringValue>Active</stringValue></value>
    </filters>
</start>
```

### Pattern 2: Explicit IsChanged() in Decision

If you need to disable change detection, add an explicit check:

```xml
<decisions>
    <name>Check_If_Status_Changed</name>
    <rules>
        <name>Status_Did_Change</name>
        <conditions>
            <leftValueReference>$Record.Status</leftValueReference>
            <operator>NotEqualTo</operator>
            <rightValue>
                <elementReference>$Record__Prior.Status</elementReference>
            </rightValue>
        </conditions>
    </rules>
</decisions>
```

### Pattern 3: Use ISCHANGED() in Entry Criteria

In Flow Builder, add this to entry conditions:
- `{!$Record.Status}` is changed to `true` (requires formula field)

## The /flow-versions Command

View all versions of a flow and their change detection settings:

```bash
/flow-versions MyFlowName
```

Output:
```
Flow: MyFlowName
================

Version | Status   | Change Detection | Created
--------|----------|-----------------|--------
3       | Active   | ✓ Enabled       | 2025-01-15
2       | Inactive | ✓ Enabled       | 2025-01-10
1       | Inactive | ✗ Disabled      | 2025-01-05

⚠️ Version 1 had change detection disabled
   Recommend keeping current setting (enabled)
```

## Pre-Deployment Checklist

Before deploying flow changes:

1. [ ] Run `flow-change-detector.js` on changed flows
2. [ ] Review any CRITICAL or WARNING messages
3. [ ] If removing change detection, document the business reason
4. [ ] Test in sandbox with bulk data (200+ records)
5. [ ] Monitor debug logs after deployment

## Common Scenarios

### Scenario 1: "My flow runs too often"

**Diagnosis:** Check if `doesRequireRecordChangedToMeetCriteria` is disabled

**Solution:** Enable change detection or add explicit IsChanged conditions

### Scenario 2: "My flow doesn't run when I expect"

**Diagnosis:** Check if change detection is enabled AND the record already meets criteria

**Solution:**
- Ensure the record changes FROM not meeting TO meeting criteria
- Or disable change detection (with explicit IsChanged checks)

### Scenario 3: "I'm getting governor limit errors"

**Diagnosis:** Flow running on too many records

**Solution:**
1. Enable change detection
2. Add more specific entry criteria
3. Add bulkification patterns in flow elements

## Integration with Agents

The `sfdc-automation-builder` agent automatically checks for these issues when creating or modifying flows. The `flow-change-detector.js` is invoked as part of the pre-deployment validation.

## Related Scripts

| Script | Purpose |
|--------|---------|
| `flow-change-detector.js` | Detect risky flow changes |
| `admin-handoff-generator.js` | Generate flow documentation |
| `/flow-versions` command | View flow version history |

## References

- [Salesforce Help: Record-Triggered Flows](https://help.salesforce.com/s/articleView?id=sf.flow_concepts_trigger_record.htm)
- [Salesforce Help: Flow Best Practices](https://help.salesforce.com/s/articleView?id=sf.flow_build_bestpractices.htm)
- Plugin: `salesforce-plugin/scripts/lib/flow-change-detector.js`
