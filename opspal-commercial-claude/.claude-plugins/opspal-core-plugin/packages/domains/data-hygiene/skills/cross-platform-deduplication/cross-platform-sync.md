# Cross-Platform Sync Handling

## Sync Architecture

### HubSpot → Salesforce Flow

```yaml
Standard Flow:
  HubSpot Company
    ↓ (sync trigger)
  Salesforce Account
    ↓ (return sync)
  HubSpot Company (updated with SF ID)

Sync Fields:
  - salesforceaccountid (HS) ← Account.Id (SF)
  - Company properties → Account fields
  - Owner mapping
```

### Dedup Impact on Sync

```yaml
Risk: Deduplicating HS companies can break SF sync

Scenario:
  1. HS Company A → synced to SF Account X
  2. HS Company B → synced to SF Account X (duplicate)
  3. Delete Company B without proper handling
  4. Result: SF Account X loses sync partner

Solution:
  1. Keep canonical company as sync partner
  2. Update SF Account reference if needed
  3. Use Merge API (preserves sync relationship)
```

## Pre-Dedup Sync Check

### Sync Status Validation

```javascript
const validateSyncStatus = async (company) => {
  const sfAccountId = company.salesforceaccountid;

  if (!sfAccountId) {
    return { status: 'NOT_SYNCED', safe: true };
  }

  // Check SF Account exists
  const sfAccount = await querySalesforce(sfAccountId);

  if (!sfAccount) {
    return {
      status: 'ORPHANED',
      safe: true,
      action: 'Clear salesforceaccountid before merge'
    };
  }

  // Check bidirectional sync
  const lastSyncDate = company.hubspot_lastmodifieddate;
  const daysSinceSync = daysBetween(lastSyncDate, new Date());

  if (daysSinceSync > 30) {
    return {
      status: 'STALE_SYNC',
      safe: false,
      action: 'Verify sync health before merge'
    };
  }

  return {
    status: 'ACTIVE_SYNC',
    safe: true,
    sfAccountId
  };
};
```

## Sync-Safe Merge Patterns

### Pattern 1: Single SF Account

```yaml
Scenario: Multiple HS companies → Same SF Account

Steps:
  1. Identify canonical (highest score)
  2. Verify canonical has salesforceaccountid
  3. Merge duplicates INTO canonical
  4. SF sync continues with canonical

Safe: ✅ SF Account maintains single sync partner
```

### Pattern 2: Multiple SF Accounts

```yaml
Scenario: Different HS companies → Different SF Accounts

Decision Tree:
  If SF Accounts are duplicates:
    1. Merge SF Accounts first (SFDC side)
    2. Then merge HS Companies
    3. Canonical gets surviving SF Account ID

  If SF Accounts are distinct (e.g., subsidiaries):
    1. DO NOT merge HS Companies
    2. Flag for manual review
    3. May be legitimate separate companies
```

### Pattern 3: No SF Account

```yaml
Scenario: HS companies with no SF link

Steps:
  1. Merge normally using HS-only rules
  2. Canonical may be future sync candidate
  3. No SF impact

Safe: ✅ No sync relationship to maintain
```

## Post-Merge Sync Verification

### Verification Checklist

```yaml
After Each Merge:
  - [ ] Canonical company has salesforceaccountid (if applicable)
  - [ ] SF Account exists and is active
  - [ ] Sync timestamp < 24 hours old
  - [ ] No sync errors in log
```

### Sync Health Report

```markdown
## Post-Merge Sync Health

| Canonical ID | SF Account | Sync Status | Last Sync |
|--------------|------------|-------------|-----------|
| 123 | 001xxx | ✅ Active | 2 hrs ago |
| 456 | 001yyy | ⚠️ Stale | 5 days |
| 789 | - | N/A | - |

### Issues
- Company 456: Sync stale, trigger manual sync
```

## Auto-Associate Warning

### Critical Prerequisite

```yaml
BEFORE ANY DEDUP:
  1. HubSpot Settings > Objects > Companies
  2. Find "Auto-associate companies"
  3. SET TO OFF

Why:
  - Auto-associate creates NEW companies from contacts
  - Can recreate duplicates immediately after cleanup
  - Must remain OFF during dedup process
```

### Verification Script

```javascript
const verifyAutoAssociateOff = async (portalId) => {
  // This would need HubSpot settings API access
  // For now, require manual verification

  console.log('⚠️ MANUAL CHECK REQUIRED');
  console.log('1. Go to HubSpot Settings > Objects > Companies');
  console.log('2. Verify "Auto-associate companies" is OFF');
  console.log('3. Confirm before proceeding');

  return await promptUser('Is auto-associate OFF? (yes/no)');
};
```

## SF-Side Considerations

### Before HS Dedup

```yaml
Check SF Accounts:
  1. Are there duplicate SF Accounts?
  2. If yes: Merge SF Accounts FIRST
  3. Wait for sync to propagate
  4. Then proceed with HS dedup

Reason:
  - SF Account merge updates HS companies
  - May resolve some HS duplicates automatically
  - Cleaner starting point for HS dedup
```

### After HS Dedup

```yaml
Verify SF State:
  1. All surviving HS companies have correct SF Account ID
  2. No orphaned SF Accounts (no HS sync partner)
  3. Sync queue is clear
  4. No sync errors
```
