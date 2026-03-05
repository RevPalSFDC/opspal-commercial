---
description: Pre-validate territory operations before execution to prevent errors
argument-hint: "[operation] [options]"
---

# Territory Validator Command

Validate territory operations before execution to catch errors early.

## Usage

```
/territory-validator [operation] [options]
```

## Operations

| Operation | Description |
|-----------|-------------|
| `create-model` | Validate new model can be created |
| `add-territory` | Validate territory addition |
| `assign-users` | Validate user assignments |
| `assign-accounts` | Validate account assignments |
| `delete` | Validate safe deletion |
| `activate` | Validate model can be activated |

## Examples

```
/territory-validator activate --model-id=0MCxxxxxxxxxx
/territory-validator add-territory --model-id=0MC... --parent-id=0MI... --name="US West"
/territory-validator assign-users --csv=user_assignments.csv
/territory-validator delete --territory-id=0MI...
```

## Instructions for Claude

When the user invokes this command, perform validation for the specified operation:

### For `create-model`:

Check:
1. User has Manage Territories permission
2. No duplicate DeveloperName

### For `add-territory`:

Use pre-validator script:

```bash
node scripts/territory/territory-pre-validator.js $ORG create \
  --model-id=$MODEL_ID \
  --parent-id=$PARENT_ID \
  --type-id=$TYPE_ID \
  --developer-name=$DEV_NAME
```

Checks:
- Model exists and is in Planning state
- Parent territory exists and is in same model
- Territory type exists
- DeveloperName is unique in model
- Would not create circular reference

### For `assign-users`:

If CSV provided:
```bash
node scripts/territory/territory-bulk-assignment.js $ORG user $CSV --dry-run
```

If single assignment:
```sql
-- Check user is active
SELECT Id, IsActive FROM User WHERE Id = '[user_id]'

-- Check territory exists
SELECT Id, Name FROM Territory2 WHERE Id = '[territory_id]'

-- Check for duplicate
SELECT Id FROM UserTerritory2Association
WHERE UserId = '[user_id]' AND Territory2Id = '[territory_id]'
```

### For `assign-accounts`:

If CSV provided:
```bash
node scripts/territory/territory-bulk-assignment.js $ORG account $CSV --dry-run
```

If single assignment:
```sql
-- Check account exists
SELECT Id, Name FROM Account WHERE Id = '[account_id]'

-- Check territory exists
SELECT Id, Name FROM Territory2 WHERE Id = '[territory_id]'

-- Check for exclusion
SELECT Id FROM Territory2ObjectExclusion
WHERE ObjectId = '[account_id]' AND Territory2Id = '[territory_id]'

-- Check for duplicate
SELECT Id FROM ObjectTerritory2Association
WHERE ObjectId = '[account_id]' AND Territory2Id = '[territory_id]'
```

### For `delete`:

Use safe delete script in dry-run mode:

```bash
node scripts/territory/territory-safe-delete.js $ORG territory $TERRITORY_ID --dry-run
```

Reports:
- Child territory count (blocks without --cascade)
- User assignment count
- Account assignment count
- Exclusion count

### For `activate`:

Use lifecycle manager:

```bash
node scripts/territory/territory-model-lifecycle.js $ORG validate $MODEL_ID
```

Checks:
- Model is in Planning state
- No other model is Active
- Model has at least one territory
- No orphaned territories
- No circular references in hierarchy
- User assignments configured (warning if not)

## Output Format

```
═══════════════════════════════════════════════════════════
TERRITORY VALIDATION: [operation]
═══════════════════════════════════════════════════════════

CHECKS PERFORMED:
───────────────────────────────────────────────────────────
✅ [Check Name]: [Pass message]
❌ [Check Name]: [Fail message]
⚠️  [Check Name]: [Warning message]

RESULT: [PASS / FAIL / WARNINGS]
───────────────────────────────────────────────────────────
[Additional details or suggestions]

═══════════════════════════════════════════════════════════
```

## Related Commands

- `/territory-discovery` - Discover current configuration
- `/territory-assign` - Execute assignments

## Related Agents

- `sfdc-territory-orchestrator` - Master coordinator with built-in validation
- `sfdc-territory-deployment` - Deployment with validation pipeline
