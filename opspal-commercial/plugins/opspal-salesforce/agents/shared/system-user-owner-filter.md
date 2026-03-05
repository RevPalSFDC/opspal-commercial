# System User Owner Filter

> **MANDATORY**: When querying Account Owners for territory assignment, lead routing, or ownership analysis, ALWAYS filter out system/integration users.

## Why This Matters

**Root Cause (P0 - Reflection Cohort data-quality)**: System and integration users (e.g., Salesforce Integration, Data Loader, API User) appear as Account Owners in orgs that use automated data loads or integrations. When territory or lead assignment logic queries "who owns this account?" and gets a system user, the downstream assignment is incorrect - leads get routed to non-existent queues, round-robin breaks, and territory coverage gaps appear.

**Blast Radius**: HIGH - Affects all downstream lead routing, territory assignment, and ownership reports.

## Required Pattern

### Step 1: Identify System Users in the Org

Before any owner-based logic, query for system users:

```sql
-- Find likely system/integration users
SELECT Id, Name, Username, UserType, IsActive, Profile.Name
FROM User
WHERE UserType IN ('AutomatedProcess', 'Guest', 'Standard')
AND (
  Name LIKE '%Integration%'
  OR Name LIKE '%API%'
  OR Name LIKE '%Sync%'
  OR Name LIKE '%System%'
  OR Name LIKE '%Data%Loader%'
  OR Name LIKE '%Migration%'
  OR Name LIKE '%Automated%'
  OR Profile.Name IN ('Salesforce API Only System Integrations', 'System Administrator Integration')
)
```

### Step 2: Exclude System Users from Owner Queries

```sql
-- WRONG - includes system users as owners
SELECT Id, Name, OwnerId, Owner.Name
FROM Account
WHERE Territory2Id = '{territoryId}'

-- CORRECT - filter out system/integration owners
SELECT Id, Name, OwnerId, Owner.Name
FROM Account
WHERE Territory2Id = '{territoryId}'
AND Owner.UserType <> 'AutomatedProcess'
AND Owner.IsActive = true
AND OwnerId NOT IN (
  SELECT Id FROM User WHERE Name LIKE '%Integration%'
  OR Name LIKE '%API User%'
  OR UserType = 'AutomatedProcess'
)
```

### Step 3: Handle Accounts with System Owners

When an account's owner IS a system user, flag it for reassignment rather than using it for routing:

```
⚠️  Account "Acme Corp" (001xxx) has system user owner: "Salesforce Integration" (005xxx)
   This account needs owner reassignment before territory/lead routing will work correctly.

   Options:
   1. Reassign to the territory's assigned rep
   2. Reassign to the account's most recent active opportunity owner
   3. Flag for manual review
```

## Common System User Patterns

| Pattern | Example | Why It's an Owner |
|---------|---------|-------------------|
| Integration user | "Salesforce Integration" | Data loader bulk imports |
| API user | "API User" | Middleware/iPaaS syncs |
| Migration user | "Data Migration User" | One-time data loads |
| Process automation | "Automated Process" | Flow/Process Builder |
| Former employee | Inactive user | Left company, accounts not reassigned |

## Impact on Territory Assignment

When building territory models or running assignment rules:
1. **DO NOT** count system-owned accounts in territory balance calculations
2. **DO NOT** use system user ownership to determine existing territory coverage
3. **DO** flag accounts with system owners as "unassigned" in territory reports
4. **DO** include system-owned account count as a data quality metric

## See Also

- `agents/shared/soql-field-validation-guide.md` - Field validation
- `scripts/lib/ooo-write-operations.js` - Safe write operations
- `config/territory2-api-quirks.json` - Territory API quirks

---
**Source**: Reflection Cohort - data-quality (P0)
**Version**: 1.0.0
**Date**: 2026-03-01
