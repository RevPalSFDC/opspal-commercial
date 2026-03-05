# Territory2 Operations Playbook

**Version**: 1.0.0
**Created**: 2026-01-15
**ROI**: $6,000/year (reduces territory friction significantly)

This playbook documents critical Territory2 API quirks, workflows, and best practices to prevent common errors.

---

## Table of Contents

1. [Critical API Quirks](#critical-api-quirks)
2. [BooleanFilter Workflow](#booleanfilter-workflow)
3. [Common Operations](#common-operations)
4. [Error Recovery](#error-recovery)
5. [Best Practices](#best-practices)
6. [Quick Reference](#quick-reference)

---

## Critical API Quirks

### 1. MasterLabel vs Name/DeveloperName

**CRITICAL**: Territory2 objects use `MasterLabel` as the display name field, NOT `Name` or `DeveloperName`.

```sql
-- ❌ WRONG: Will return no results or error
SELECT Name FROM Territory2

-- ✅ CORRECT: Use MasterLabel
SELECT MasterLabel, DeveloperName FROM Territory2
```

| Object | Display Name Field | API Name Field |
|--------|-------------------|----------------|
| Territory2 | MasterLabel | DeveloperName |
| Territory2Model | MasterLabel | DeveloperName |
| Territory2Type | MasterLabel | DeveloperName |
| ObjectTerritory2AssignmentRule | MasterLabel | DeveloperName |

### 2. BooleanFilter Modification Lock

**BLOCKING**: Cannot modify `ObjectTerritory2AssignmentRuleItem` records when the parent `ObjectTerritory2AssignmentRule` has a non-empty `BooleanFilter`.

**Symptoms**:
- Silent failures when adding/removing rule items
- Cryptic DML errors
- Operations appear to succeed but no changes persist

**Solution**: See [BooleanFilter Workflow](#booleanfilter-workflow)

### 3. Tooling API Required

Most Territory2 metadata queries require `--use-tooling-api`:

```bash
# ✅ CORRECT
sf data query --query "SELECT MasterLabel FROM Territory2" --use-tooling-api

# ❌ WRONG - will fail
sf data query --query "SELECT MasterLabel FROM Territory2"
```

### 4. Territory2AlignmentLog Query Limitations

The `Territory2AlignmentLog` object has query restrictions:
- Cannot query `CreatedDate` in WHERE clause directly
- Limited to recent records (system auto-purges old logs)
- Requires specific field combinations

```sql
-- ✅ Query recent alignment operations
SELECT Id, Status, RequestType, EndDate, Territory2ModelId
FROM Territory2AlignmentLog
ORDER BY EndDate DESC LIMIT 10
```

### 5. UserTerritory2Association Cascade Behavior

When deleting a Territory2:
- UserTerritory2Association records are NOT automatically deleted
- Manual cleanup required before territory deletion
- Orphaned associations cause runtime errors

---

## BooleanFilter Workflow

When modifying assignment rules that have a BooleanFilter, you MUST follow this exact sequence:

### Step 1: Save Current BooleanFilter

```bash
sf data query \
  --query "SELECT Id, MasterLabel, BooleanFilter FROM ObjectTerritory2AssignmentRule WHERE Id = '0OH...'" \
  --use-tooling-api \
  --target-org [alias]
```

**Record the BooleanFilter value** (e.g., `"1 AND (2 OR 3)"`)

### Step 2: Clear BooleanFilter

```bash
sf data update record \
  --sobject ObjectTerritory2AssignmentRule \
  --record-id 0OH... \
  --values "BooleanFilter=''" \
  --use-tooling-api \
  --target-org [alias]
```

### Step 3: Modify Rule Items

Now you can safely:
- Add new `ObjectTerritory2AssignmentRuleItem` records
- Update existing items
- Delete items

```bash
# Create new rule item
sf data create record \
  --sobject ObjectTerritory2AssignmentRuleItem \
  --values "ObjectTerritory2AssignmentRuleId='0OH...' Field='Account.Industry' Operation='equals' Value='Technology'" \
  --use-tooling-api
```

### Step 4: Update BooleanFilter (if needed)

If you added/removed items, update the BooleanFilter logic to match:

```bash
# Example: After adding a 4th item
sf data update record \
  --sobject ObjectTerritory2AssignmentRule \
  --record-id 0OH... \
  --values "BooleanFilter='1 AND (2 OR 3 OR 4)'" \
  --use-tooling-api \
  --target-org [alias]
```

### Step 5: Restore BooleanFilter

If items unchanged, restore original value:

```bash
sf data update record \
  --sobject ObjectTerritory2AssignmentRule \
  --record-id 0OH... \
  --values "BooleanFilter='1 AND (2 OR 3)'" \
  --use-tooling-api \
  --target-org [alias]
```

### Automation

Use the Territory Rule Validator to automate this check:

```bash
# Check if BooleanFilter exists before modifying
node scripts/lib/territory-rule-validator.js check [ruleId] --org [alias]

# Get full workflow commands
node scripts/lib/territory-rule-validator.js workflow [ruleId] --org [alias]
```

---

## Common Operations

### List All Territory Models

```bash
sf data query \
  --query "SELECT Id, MasterLabel, DeveloperName, State FROM Territory2Model" \
  --use-tooling-api
```

States: `Planning`, `Active`, `Archived`

### List Territories in a Model

```bash
sf data query \
  --query "SELECT Id, MasterLabel, DeveloperName, Territory2TypeId, ParentTerritory2Id FROM Territory2 WHERE Territory2ModelId = '0TM...'" \
  --use-tooling-api
```

### List User Assignments

```bash
sf data query \
  --query "SELECT Id, UserId, Territory2Id, IsActive, RoleInTerritory2 FROM UserTerritory2Association WHERE Territory2Id = '0Ml...'" \
  --use-tooling-api
```

### List Account Assignments

```bash
sf data query \
  --query "SELECT Id, AccountId, Territory2Id FROM ObjectTerritory2Association WHERE Territory2Id = '0Ml...'" \
  --use-tooling-api
```

### List Assignment Rules

```bash
sf data query \
  --query "SELECT Id, MasterLabel, DeveloperName, BooleanFilter, IsActive, Territory2ModelId FROM ObjectTerritory2AssignmentRule WHERE Territory2ModelId = '0TM...'" \
  --use-tooling-api
```

### List Rule Items

```bash
sf data query \
  --query "SELECT Id, SortOrder, Field, Operation, Value FROM ObjectTerritory2AssignmentRuleItem WHERE ObjectTerritory2AssignmentRuleId = '0OH...'" \
  --use-tooling-api
```

---

## Error Recovery

### Error: "Cannot modify rule items"

**Cause**: BooleanFilter exists on parent rule

**Solution**:
1. Check for BooleanFilter: `node scripts/lib/territory-rule-validator.js check [ruleId]`
2. Follow [BooleanFilter Workflow](#booleanfilter-workflow)

### Error: "Field 'Name' does not exist"

**Cause**: Using wrong field name

**Solution**: Use `MasterLabel` instead of `Name`

### Error: "Invalid field for sobject"

**Cause**: Missing `--use-tooling-api` flag

**Solution**: Add `--use-tooling-api` to query

### Error: "Territory model not active"

**Cause**: Trying to assign users/accounts to planning model

**Solution**: Activate model first or use planning model for testing only

### Error: "Orphaned associations"

**Cause**: UserTerritory2Association records exist for deleted territories

**Solution**:
```bash
# Find orphaned associations
sf data query --query "SELECT Id, UserId, Territory2Id FROM UserTerritory2Association WHERE Territory2Id NOT IN (SELECT Id FROM Territory2)" --use-tooling-api

# Delete orphans
sf data delete bulk --sobject UserTerritory2Association --file orphan-ids.csv
```

---

## Best Practices

### 1. Always Use Tooling API

All Territory2-related queries should include `--use-tooling-api`.

### 2. Check BooleanFilter Before Modifying Rules

Always run the territory rule validator before modifying rule items:

```bash
node scripts/lib/territory-rule-validator.js check [ruleId] --org [alias]
```

### 3. Use MasterLabel for Display Names

Never use `Name` - always use `MasterLabel`.

### 4. Backup Before Bulk Operations

Before bulk territory changes:
```bash
# Export current state
sf data query --query "SELECT Id, MasterLabel, ParentTerritory2Id FROM Territory2 WHERE Territory2ModelId = '0TM...'" --use-tooling-api --result-format csv > territory-backup.csv
```

### 5. Test in Planning Model First

Make changes in Planning state before activating:
1. Create model in Planning state
2. Configure all territories and rules
3. Test with sample accounts
4. Activate model

### 6. Monitor Alignment Operations

After running territory alignment:
```bash
sf data query --query "SELECT Status, RequestType, SubmittedByUserId, EndDate FROM Territory2AlignmentLog ORDER BY EndDate DESC LIMIT 5" --use-tooling-api
```

### 7. Clean Up User Associations Before Deleting Territories

```bash
# Delete user associations first
sf data delete bulk --sobject UserTerritory2Association --where "Territory2Id = '0Ml...'" --use-tooling-api

# Then delete territory
sf data delete record --sobject Territory2 --record-id 0Ml... --use-tooling-api
```

---

## Quick Reference

### Field Names

| Object | Display Name | API Name |
|--------|--------------|----------|
| Territory2Model | MasterLabel | DeveloperName |
| Territory2 | MasterLabel | DeveloperName |
| Territory2Type | MasterLabel | DeveloperName |
| ObjectTerritory2AssignmentRule | MasterLabel | DeveloperName |

### ID Prefixes

| Object | Prefix |
|--------|--------|
| Territory2Model | 0TM |
| Territory2 | 0Ml |
| Territory2Type | 0TB |
| UserTerritory2Association | 0M1 |
| ObjectTerritory2Association | 0Le |
| ObjectTerritory2AssignmentRule | 0OH |
| ObjectTerritory2AssignmentRuleItem | 0OK |

### CLI Commands Quick Reference

```bash
# Query territories
sf data query --query "SELECT MasterLabel FROM Territory2" --use-tooling-api

# Check rule BooleanFilter
node scripts/lib/territory-rule-validator.js check [ruleId]

# Get modification workflow
node scripts/lib/territory-rule-validator.js workflow [ruleId]

# Validate operation
node scripts/lib/territory-rule-validator.js validate-operation create [ruleId]
```

### Related Files

- **Validator**: `scripts/lib/territory-rule-validator.js`
- **Pre-Tool Hook**: `hooks/pre-tool-use-territory-rule-validator.sh`
- **API Quirks Config**: `config/territory2-api-quirks.json`
- **Territory Agents**: `agents/sfdc-territory-*.md`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-15 | Initial playbook based on reflection analysis |
