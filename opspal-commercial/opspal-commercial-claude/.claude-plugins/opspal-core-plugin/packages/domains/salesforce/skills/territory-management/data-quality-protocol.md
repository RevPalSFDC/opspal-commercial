# Territory Data Quality Protocol

## Pre-Operation Validation Requirements

### Required Field Validation

#### Territory2Model

| Field | Required | Constraints |
|-------|----------|-------------|
| Name | Yes | 80 chars max |
| DeveloperName | Yes | 80 chars, unique, alphanumeric + underscore |

#### Territory2

| Field | Required | Constraints |
|-------|----------|-------------|
| Name | Yes | 80 chars max |
| DeveloperName | Yes | 80 chars, unique per model |
| Territory2ModelId | Yes | Valid model ID, model not Archived |
| Territory2TypeId | Yes | Valid type ID |
| AccountAccessLevel | Yes | "Read", "Edit", or "All" |
| OpportunityAccessLevel | Yes | "None", "Read", or "Edit" |
| CaseAccessLevel | Yes | "None", "Read", or "Edit" |
| ParentTerritory2Id | No | Valid territory ID, same model, no cycles |

#### UserTerritory2Association

| Field | Required | Constraints |
|-------|----------|-------------|
| UserId | Yes | Valid, active user ID |
| Territory2Id | Yes | Valid territory ID |
| RoleInTerritory2 | No | Valid picklist value |

#### ObjectTerritory2Association

| Field | Required | Constraints |
|-------|----------|-------------|
| ObjectId | Yes | Valid Account (or Lead) ID |
| Territory2Id | Yes | Valid territory ID |
| AssociationCause | Yes | "Territory2Manual", "Territory2Rule", or "Territory2Api" |

---

## Uniqueness Validation

### DeveloperName Uniqueness

**Territory2 DeveloperName must be unique within the model:**

```sql
-- Check before create/update
SELECT Id, DeveloperName
FROM Territory2
WHERE DeveloperName = '<proposed_name>'
AND Territory2ModelId = '<model_id>'
AND Id != '<current_id>' -- Exclude self on update
```

**If exists:** Return error, suggest alternative name

**Naming Convention:**
```
<Region>_<Segment>_<Identifier>
Examples:
- US_West_Enterprise
- EMEA_UK_Commercial
- APAC_Named_Accounts
```

### Assignment Uniqueness

**User-Territory combination must be unique:**

```sql
SELECT Id FROM UserTerritory2Association
WHERE UserId = '<user_id>' AND Territory2Id = '<territory_id>'
```

**Account-Territory combination must be unique:**

```sql
SELECT Id FROM ObjectTerritory2Association
WHERE ObjectId = '<account_id>' AND Territory2Id = '<territory_id>'
```

---

## Reference Integrity Validation

### Parent Territory Validation

```sql
-- Parent must exist
SELECT Id, Territory2ModelId FROM Territory2
WHERE Id = '<parent_id>'
```

**Validation Rules:**
1. Parent must exist
2. Parent must be in same model
3. Parent must not create cycle

### Cycle Detection

```javascript
function detectCycle(territoryId, newParentId, hierarchy) {
  // Build ancestry chain from newParent up
  const ancestors = new Set();
  let current = newParentId;

  while (current) {
    if (current === territoryId) {
      return { hasCycle: true, message: 'Would create circular reference' };
    }
    if (ancestors.has(current)) {
      return { hasCycle: true, message: 'Existing cycle detected' };
    }
    ancestors.add(current);
    current = hierarchy.get(current)?.parentId;
  }

  return { hasCycle: false };
}
```

### Type Validation

```sql
-- Type must exist
SELECT Id, DeveloperName, Priority FROM Territory2Type
WHERE Id = '<type_id>'
```

### User Validation

```sql
-- User must exist and be active
SELECT Id, IsActive, Name FROM User
WHERE Id = '<user_id>'
```

**Validation Rules:**
1. User must exist
2. User must be active (IsActive = true)
3. User license must support territories

### Account Validation

```sql
-- Account must exist
SELECT Id, Name FROM Account
WHERE Id = '<account_id>'
```

---

## State Validation

### Model State Rules

| State | Can Create Territories | Can Update Territories | Can Delete Territories | Can Assign |
|-------|------------------------|------------------------|------------------------|------------|
| Planning | Yes | Yes | Yes | Yes |
| Active | Yes | Yes | Yes (caution) | Yes |
| Archived | No | No | No | No |
| Cloning | No | No | No | No |

### Pre-Operation State Check

```sql
SELECT State FROM Territory2Model WHERE Id = '<model_id>'
```

**If Archived:** Block operation, return error
**If Cloning:** Wait and retry, or return error
**If Active:** Allow with caution warnings for deletions

---

## Data Quality Checkpoints

### Before Bulk Operations

1. **Record Count Validation**
   - Ensure record count matches expected
   - Flag unexpected duplicates

2. **Reference Resolution**
   - All foreign keys resolve to valid records
   - No orphaned references

3. **Business Rule Compliance**
   - Access levels follow org standards
   - Naming conventions followed

### After Operations

1. **Count Verification**
   ```sql
   -- Verify expected territory count
   SELECT COUNT(Id) FROM Territory2 WHERE Territory2ModelId = '<model_id>'
   ```

2. **Integrity Check**
   ```sql
   -- Check for orphans
   SELECT Id, Name FROM Territory2
   WHERE ParentTerritory2Id NOT IN (SELECT Id FROM Territory2)
   AND ParentTerritory2Id != null
   ```

3. **Coverage Check**
   ```sql
   -- Territories without users
   SELECT Id, Name FROM Territory2
   WHERE Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)

   -- Territories without accounts
   SELECT Id, Name FROM Territory2
   WHERE Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)
   ```

---

## Error Prevention Patterns

### Safe Create Pattern

```javascript
async function safeCreate(sobject, data) {
  // 1. Validate required fields
  const validation = validateRequiredFields(sobject, data);
  if (!validation.valid) {
    throw new Error(`Missing required fields: ${validation.missing.join(', ')}`);
  }

  // 2. Validate uniqueness
  if (sobject === 'Territory2') {
    const exists = await checkDeveloperNameExists(data.DeveloperName, data.Territory2ModelId);
    if (exists) {
      throw new Error(`DeveloperName '${data.DeveloperName}' already exists`);
    }
  }

  // 3. Validate references
  await validateReferences(sobject, data);

  // 4. Execute create
  return await sfCreate(sobject, data);
}
```

### Safe Delete Pattern

```javascript
async function safeDelete(territoryId) {
  // 1. Check for children
  const children = await query(`
    SELECT Id FROM Territory2 WHERE ParentTerritory2Id = '${territoryId}'
  `);
  if (children.length > 0) {
    throw new Error(`Cannot delete: ${children.length} child territories exist`);
  }

  // 2. Check for user assignments
  const users = await query(`
    SELECT Id FROM UserTerritory2Association WHERE Territory2Id = '${territoryId}'
  `);
  if (users.length > 0) {
    throw new Error(`Cannot delete: ${users.length} user assignments exist`);
  }

  // 3. Check for account assignments
  const accounts = await query(`
    SELECT Id FROM ObjectTerritory2Association WHERE Territory2Id = '${territoryId}'
  `);
  if (accounts.length > 0) {
    throw new Error(`Cannot delete: ${accounts.length} account assignments exist`);
  }

  // 4. Execute delete
  return await sfDelete('Territory2', territoryId);
}
```

---

## Data Quality Scoring

```javascript
function assessDataQuality(territories) {
  let score = 100;
  const issues = [];

  // Check naming conventions
  const badNames = territories.filter(t =>
    !t.DeveloperName.match(/^[A-Za-z][A-Za-z0-9_]*$/)
  );
  if (badNames.length > 0) {
    score -= 10;
    issues.push(`${badNames.length} territories with non-standard names`);
  }

  // Check access levels consistency
  const accessLevels = new Set(territories.map(t => t.AccountAccessLevel));
  if (accessLevels.size > 3) {
    score -= 5;
    issues.push('Inconsistent access levels across territories');
  }

  // Check for missing descriptions
  const noDescription = territories.filter(t => !t.Description);
  if (noDescription.length > territories.length * 0.5) {
    score -= 5;
    issues.push('More than 50% of territories lack descriptions');
  }

  return { score, issues };
}
```
