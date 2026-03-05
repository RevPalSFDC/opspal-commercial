---
description: Interactive wizard for assigning users and accounts to territories
argument-hint: "[options]"
---

# Territory Assignment Wizard

Interactive wizard for configuring user and account territory assignments.

## Usage

```
/territory-assign [type] [options]
```

## Types

| Type | Description |
|------|-------------|
| `user` | Assign users to territories |
| `account` | Assign accounts to territories |
| `bulk` | Bulk assignment from CSV |

## Examples

```
/territory-assign user
/territory-assign account --territory=US_West
/territory-assign bulk --csv=assignments.csv --type=user
```

## Instructions for Claude

When the user invokes this command, run the interactive wizard:

### Step 1: Determine Assignment Type

If not specified, ask:
- User assignment
- Account assignment
- Bulk assignment (CSV)

### Step 2: Select Model (if multiple exist)

```sql
SELECT Id, Name, State FROM Territory2Model
WHERE State IN ('Planning', 'Active')
ORDER BY State DESC, Name
```

Present options and let user select.

### Step 3: For User Assignment

**3a. Select Territory**

```sql
SELECT Id, Name, DeveloperName
FROM Territory2
WHERE Territory2ModelId = '[model_id]'
ORDER BY Name
```

Present hierarchy or search option.

**3b. Select User**

```sql
SELECT Id, Name, Email
FROM User
WHERE IsActive = true
ORDER BY Name
LIMIT 100
```

Let user search or browse.

**3c. Set Role (optional)**

Common roles:
- Sales Rep
- Sales Manager
- Account Executive
- Overlay
- Inside Sales

**3d. Validate and Execute**

Check for duplicate:
```sql
SELECT Id FROM UserTerritory2Association
WHERE UserId = '[user_id]' AND Territory2Id = '[territory_id]'
```

If no duplicate:
```bash
sf data create record --sobject UserTerritory2Association \
  --values "UserId='[user_id]' Territory2Id='[territory_id]' RoleInTerritory2='[role]'" \
  --target-org $ORG
```

### Step 4: For Account Assignment

**4a. Select Territory** (same as user)

**4b. Select Account**

```sql
SELECT Id, Name, BillingCity, BillingState
FROM Account
ORDER BY Name
LIMIT 100
```

Let user search or browse.

**4c. Validate**

Check for exclusion:
```sql
SELECT Id FROM Territory2ObjectExclusion
WHERE ObjectId = '[account_id]' AND Territory2Id = '[territory_id]'
```

If excluded, warn user and offer to remove exclusion.

Check for duplicate:
```sql
SELECT Id FROM ObjectTerritory2Association
WHERE ObjectId = '[account_id]' AND Territory2Id = '[territory_id]'
```

**4d. Execute**

```bash
sf data create record --sobject ObjectTerritory2Association \
  --values "ObjectId='[account_id]' Territory2Id='[territory_id]' AssociationCause='Territory2Manual'" \
  --target-org $ORG
```

### Step 5: For Bulk Assignment

**5a. Validate CSV Format**

User CSV:
```csv
UserId,Territory2Id,RoleInTerritory2
005xxx,0MIxxx,Sales Rep
```

Account CSV:
```csv
ObjectId,Territory2Id,AssociationCause
001xxx,0MIxxx,Territory2Manual
```

`AssociationCause` is required in strict mode (default). If legacy files omit this column,
you must explicitly opt into fallback mode:

```bash
node scripts/territory/territory-bulk-assignment.js $ORG account $CSV \
  --allow-default-association-cause --association-cause=Territory2Manual
```

**5b. Pre-validate**

```bash
node scripts/territory/territory-bulk-assignment.js $ORG [type] $CSV --dry-run
```

**5c. Show Validation Summary**

```
Validation Results:
───────────────────────────────────────────────────────────
Total Records:  100
✅ Valid:       95
❌ Invalid:     3
⚠️  Duplicates:  2

Invalid Records:
  - Row 15: User not found
  - Row 23: Territory not found
  - Row 67: User inactive

Proceed with 95 valid records? (y/n)
```

**5d. Execute (if confirmed)**

```bash
node scripts/territory/territory-bulk-assignment.js $ORG [type] $CSV
```

### Step 6: Confirmation

After successful assignment:

```
═══════════════════════════════════════════════════════════
ASSIGNMENT COMPLETE
═══════════════════════════════════════════════════════════

Type:      [User/Account]
Territory: [Territory Name]
[User:     [User Name] / Account: [Account Name]]
Role:      [Role if user]

Assignment ID: [record_id]

Would you like to:
1. Make another assignment
2. View territory assignments
3. Done

═══════════════════════════════════════════════════════════
```

## Wizard Flow Diagram

```
Start
  │
  ├─► Type? ─┬─► User ───► Select Territory ─► Select User ─► Set Role ─► Validate ─► Create
  │          │
  │          ├─► Account ─► Select Territory ─► Select Account ─► Validate ─► Create
  │          │
  │          └─► Bulk ────► Upload CSV ─► Pre-validate ─► Confirm ─► Execute
  │
  └─► Confirm & Repeat
```

## Related Commands

- `/territory-discovery` - Discover current configuration
- `/territory-validator` - Pre-validate operations

## Related Agents

- `sfdc-territory-assignment` - Full assignment management agent
- `sfdc-territory-orchestrator` - Master coordinator
