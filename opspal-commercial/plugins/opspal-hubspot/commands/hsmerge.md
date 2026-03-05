---
description: Interactive merge strategy selector for HubSpot companies - detects SF sync constraints and recommends lift-and-shift vs merge API
argument-hint: "<master-company-id> <duplicate-company-id>"
---

# HubSpot Merge Strategy Selector

Analyze two HubSpot companies and recommend the optimal merge strategy based on Salesforce sync status and data constraints.

## Usage

```
/hsmerge <master-company-id> <duplicate-company-id>
```

## What It Does

1. **Fetches Both Companies**: Retrieves master and duplicate with SF sync properties
2. **Detects SF Sync**: Checks if `salesforceaccountid` populated on both
3. **Identifies Blockers**: Finds constraints that block standard merge API
4. **Recommends Strategy**: Returns optimal approach (merge API, lift-and-shift, or manual review)
5. **Provides Reasoning**: Explains why recommendation was made

## Strategies

### STANDARD_MERGE
- **When**: Neither company has SF sync, OR only one has SF sync
- **Method**: HubSpot merge API (`POST /crm/v3/objects/companies/merge`)
- **Pros**: Fast, preserves all data, official HubSpot method
- **Cons**: Blocked when both have SF sync

### LIFT_AND_SHIFT
- **When**: Both companies have SF sync with **same SF Account ID**
- **Method**: Move associations then delete duplicate
- **Pros**: Bypasses merge API blocker, preserves SF sync
- **Cons**: More steps, requires two-phase commit

### MANUAL_REVIEW
- **When**: Both companies have SF sync with **different SF Account IDs**
- **Method**: Human review required
- **Reasoning**: Likely legitimately separate accounts, not duplicates

## Examples

### Example 1: SF-Synced Duplicates (Same SF Account)

```bash
/hsmerge 40979075625 40984560305
```

**Output**:
```
═══════════════════════════════════════════════════════════════════
📋 MERGE STRATEGY RECOMMENDATION
═══════════════════════════════════════════════════════════════════
Strategy: LIFT_AND_SHIFT
Reason: Both companies have active Salesforce sync with same SF Account ID - merge API will return HTTP 400

Blockers: salesforce_sync_active

Recommendation:
  Method: lift-and-shift
  Script: scripts/lift-and-shift-company-duplicates.js
  Move all associations from duplicate to master, then delete duplicate

Can Proceed: ✅ Yes
═══════════════════════════════════════════════════════════════════
```

### Example 2: Only One Has SF Sync

```bash
/hsmerge 41000696838 40965782105
```

**Output**:
```
Strategy: STANDARD_MERGE
Reason: Only one company has Salesforce sync - merge API should work

Recommendation:
  Method: merge-api
  API: POST /crm/v3/objects/companies/merge
  Use HubSpot merge API to merge duplicate into master

⚠️  Warning: Ensure master company is the one with Salesforce sync to maintain sync integrity

Can Proceed: ✅ Yes
```

### Example 3: Different SF Accounts (Manual Review)

```bash
/hsmerge 40979075625 40981897579
```

**Output**:
```
Strategy: MANUAL_REVIEW
Reason: Both companies have Salesforce sync but DIFFERENT SF Account IDs - these may be legitimately separate accounts

Blockers: different_salesforce_accounts

Recommendation:
  Method: manual-review
  Verify in Salesforce whether these are truly duplicates or separate accounts

Can Proceed: ❌ No - Manual Review Required
```

## Implementation

Uses `scripts/lib/hubspot-merge-strategy-selector.js` to:
- Query company properties including `salesforceaccountid`
- Detect merge API blockers
- Recommend appropriate strategy
- Provide execution guidance

## Related Commands

- `/hsdedup` - Automated duplicate detection and resolution
- `/hssfdc-scrape` - Scrape Salesforce sync settings
- `/hsworkflows` - List HubSpot workflows

## Related Documentation

- `docs/SALESFORCE_SYNC_MERGE_CONSTRAINTS.md` - Complete SF sync guide
- `docs/HUBSPOT_PATTERN_LIBRARY.md` - Pattern #1: Lift-and-Shift
- `instances/example-company/DUPLICATE_RESOLUTION_SUMMARY.md` - Real-world example

## See Also

- **Lift-and-Shift Script**: `scripts/lift-and-shift-company-duplicates.js`
- **Association Migrator**: `scripts/lib/association-migrator.js`
- **Two-Phase Commit**: `scripts/lib/two-phase-commit-validator.js`
