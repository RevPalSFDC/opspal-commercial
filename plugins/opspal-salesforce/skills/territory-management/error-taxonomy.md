# Territory Error Taxonomy

## Common Errors and Recovery

### DUPLICATE_VALUE

**Error Message:**
```
DUPLICATE_VALUE: Developer name already exists: US_West
```

**Cause:** DeveloperName is not unique within the Territory2Model

**Prevention:**
```sql
-- Check before create
SELECT Id FROM Territory2
WHERE DeveloperName = '<proposed_name>'
AND Territory2ModelId = '<model_id>'
```

**Recovery:**
1. Query existing territory with that DeveloperName
2. Choose alternative name (append suffix like `_v2`, `_new`)
3. Or update existing territory if that was the intent

---

### FIELD_INTEGRITY_EXCEPTION

**Error Messages:**
```
FIELD_INTEGRITY_EXCEPTION: Territory2TypeId: Required fields are missing
FIELD_INTEGRITY_EXCEPTION: AccountAccessLevel: Invalid value 'full' for field
```

**Cause:** Missing required field or invalid field value

**Required Fields for Territory2:**
- Name
- DeveloperName
- Territory2ModelId
- Territory2TypeId
- AccountAccessLevel
- OpportunityAccessLevel (default to None if not set)
- CaseAccessLevel (default to None if not set)

**Valid Access Level Values:**
- AccountAccessLevel: `Read`, `Edit`, `All`
- OpportunityAccessLevel: `None`, `Read`, `Edit`
- CaseAccessLevel: `None`, `Read`, `Edit`
- ContactAccessLevel: `None`, `Read`, `Edit`

**Recovery:**
1. Review field requirements
2. Add missing fields
3. Correct invalid values

---

### INVALID_CROSS_REFERENCE_KEY

**Error Messages:**
```
INVALID_CROSS_REFERENCE_KEY: ParentTerritory2Id: Invalid territory reference
INVALID_CROSS_REFERENCE_KEY: Territory2ModelId: Record not found
INVALID_CROSS_REFERENCE_KEY: Territory2TypeId: Invalid type reference
```

**Cause:** Referenced record doesn't exist or is inaccessible

**Prevention:**
```sql
-- Validate parent exists
SELECT Id FROM Territory2 WHERE Id = '<parent_id>'

-- Validate model exists and is modifiable
SELECT Id, State FROM Territory2Model WHERE Id = '<model_id>'

-- Validate type exists
SELECT Id FROM Territory2Type WHERE Id = '<type_id>'
```

**Recovery:**
1. Query the referenced object to get correct ID
2. If parent was just created, ensure you're using the new ID
3. For model references, verify model state is not Archived

---

### DELETE_FAILED

**Error Messages:**
```
DELETE_FAILED: entity cannot be deleted because it has child records
DELETE_FAILED: Territory cannot be deleted because users are assigned
```

**Cause:** Territory has dependent records (children, user assignments, account assignments)

**Prevention:**
```sql
-- Check for children
SELECT Id, Name FROM Territory2 WHERE ParentTerritory2Id = '<territory_id>'

-- Check for user assignments
SELECT Id, UserId FROM UserTerritory2Association WHERE Territory2Id = '<territory_id>'

-- Check for account assignments
SELECT Id, ObjectId FROM ObjectTerritory2Association WHERE Territory2Id = '<territory_id>'
```

**Recovery:**
1. Delete or reassign child territories first (bottom-up)
2. Remove user assignments
3. Remove account assignments
4. Then delete the territory

**Safe Delete Pattern:**
```javascript
async function safeDeleteTerritory(territoryId) {
  // 1. Remove user assignments
  const userAssignments = await query(`
    SELECT Id FROM UserTerritory2Association WHERE Territory2Id = '${territoryId}'
  `);
  for (const ua of userAssignments) {
    await delete('UserTerritory2Association', ua.Id);
  }

  // 2. Remove account assignments
  const accountAssignments = await query(`
    SELECT Id FROM ObjectTerritory2Association WHERE Territory2Id = '${territoryId}'
  `);
  for (const aa of accountAssignments) {
    await delete('ObjectTerritory2Association', aa.Id);
  }

  // 3. Delete child territories (recursive)
  const children = await query(`
    SELECT Id FROM Territory2 WHERE ParentTerritory2Id = '${territoryId}'
  `);
  for (const child of children) {
    await safeDeleteTerritory(child.Id);
  }

  // 4. Delete territory
  await delete('Territory2', territoryId);
}
```

---

### UNABLE_TO_LOCK_ROW

**Error Message:**
```
UNABLE_TO_LOCK_ROW: unable to obtain exclusive access to this record
```

**Cause:** Concurrent modification or sharing recalculation in progress

**Prevention:**
- Avoid concurrent territory operations
- Schedule bulk operations during low-traffic periods
- Use batch operations with delays between chunks

**Recovery:**
```javascript
async function executeWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.message.includes('UNABLE_TO_LOCK_ROW') && attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Retry ${attempt}/${maxRetries} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}
```

---

### INVALID_OPERATION

**Error Messages:**
```
INVALID_OPERATION: Cannot modify archived territory model
INVALID_OPERATION: Territory model is currently being cloned
```

**Cause:** Attempting operation on model in invalid state

**Model State Rules:**

| State | Allowed Operations |
|-------|-------------------|
| Planning | All CRUD operations |
| Active | Updates, assignments (deletions with caution) |
| Archived | Read only - no modifications |
| Cloning | Read only - wait for completion |

**Prevention:**
```sql
SELECT State FROM Territory2Model WHERE Id = '<model_id>'
```

**Recovery:**
1. If Archived: Clone to create new Planning model
2. If Cloning: Wait and retry (poll every 30 seconds)
3. If need to modify Active: Make changes carefully, consider creating new Planning model first

---

### INSUFFICIENT_ACCESS_OR_READONLY

**Error Messages:**
```
INSUFFICIENT_ACCESS_OR_READONLY: You do not have permission to manage territories
INSUFFICIENT_ACCESS: insufficient access rights on cross-reference id
```

**Cause:** User lacks Manage Territories permission

**Prevention:**
```sql
-- Check current user permissions
SELECT Id, PermissionsManageTerritories
FROM PermissionSetAssignment
WHERE AssigneeId = :currentUserId

-- Or check available permission sets
SELECT Id, Name FROM PermissionSet
WHERE PermissionsManageTerritories = true
```

**Recovery:**
1. Verify the API user has "Manage Territories" permission
2. This is an all-or-nothing permission - cannot be granularly assigned
3. Contact Salesforce admin to grant permission

---

### CIRCULAR_DEPENDENCY

**Error Message:**
```
CIRCULAR_DEPENDENCY: Cannot set parent - would create circular reference
```

**Cause:** Attempting to set parent that would create cycle in hierarchy

**Prevention:**
```javascript
function wouldCreateCycle(territoryId, newParentId, hierarchy) {
  let current = newParentId;
  const visited = new Set();

  while (current) {
    if (current === territoryId) return true;
    if (visited.has(current)) return true; // Existing cycle
    visited.add(current);
    current = hierarchy.get(current)?.parentId;
  }

  return false;
}
```

**Recovery:**
1. Choose different parent territory
2. If restructuring needed, move the target parent first
3. Perform reparenting in correct order

---

### ENTITY_IS_DELETED

**Error Message:**
```
ENTITY_IS_DELETED: entity is deleted
```

**Cause:** Referencing a deleted record

**Prevention:**
- Always query to verify records exist before referencing
- Use transactions or careful ordering to avoid race conditions

**Recovery:**
1. Refresh your cached data
2. Query for current valid IDs
3. Retry with correct references

---

## Bulk Operation Errors

### LIMIT_EXCEEDED

**Error Message:**
```
LIMIT_EXCEEDED: Too many query rows: 50001
```

**Prevention:**
```sql
-- Use LIMIT and OFFSET for large queries
SELECT Id, Name FROM Territory2
WHERE Territory2ModelId = '<model_id>'
LIMIT 2000 OFFSET 0
```

**Recovery:**
- Paginate queries
- Use SOQL for COUNT before full query
- Consider async processing for large datasets

---

### STRING_TOO_LONG

**Error Message:**
```
STRING_TOO_LONG: Name: data value too large
```

**Field Limits:**
- Name: 80 characters
- DeveloperName: 80 characters
- Description: 255 characters

**Prevention:**
```javascript
function validateFieldLengths(data) {
  const limits = {
    Name: 80,
    DeveloperName: 80,
    Description: 255
  };

  for (const [field, limit] of Object.entries(limits)) {
    if (data[field] && data[field].length > limit) {
      throw new Error(`${field} exceeds ${limit} character limit`);
    }
  }
}
```

---

## Assignment-Specific Errors

### DUPLICATE_USER_ASSIGNMENT

**Cause:** User already assigned to territory

**Prevention:**
```sql
SELECT Id FROM UserTerritory2Association
WHERE UserId = '<user_id>' AND Territory2Id = '<territory_id>'
```

**Recovery:**
- If updating role, use UPDATE instead of INSERT
- Skip if assignment already exists

### ACCOUNT_EXCLUDED

**Cause:** Account has Territory2ObjectExclusion record

**Prevention:**
```sql
SELECT Id FROM Territory2ObjectExclusion
WHERE ObjectId = '<account_id>' AND Territory2Id = '<territory_id>'
```

**Recovery:**
- Remove exclusion first if assignment is intended
- Or acknowledge the exclusion is intentional

### USER_LICENSE_INVALID

**Cause:** User license doesn't support territory assignment

**Common Non-Territory Licenses:**
- Chatter Free
- Customer Community
- Platform licenses (some)

**Prevention:**
```sql
SELECT Id, Profile.UserLicense.Name FROM User
WHERE Id = '<user_id>'
```

---

## Error Recovery Decision Tree

```
Error Occurred
├── Is it DUPLICATE_VALUE?
│   └── Yes → Check existing, use UPDATE or new name
├── Is it FIELD_INTEGRITY_EXCEPTION?
│   └── Yes → Review required fields, fix values
├── Is it INVALID_CROSS_REFERENCE_KEY?
│   └── Yes → Verify reference IDs exist
├── Is it DELETE_FAILED?
│   └── Yes → Remove dependencies first (bottom-up)
├── Is it UNABLE_TO_LOCK_ROW?
│   └── Yes → Retry with exponential backoff
├── Is it INVALID_OPERATION (archived)?
│   └── Yes → Clone model to Planning state
├── Is it INSUFFICIENT_ACCESS?
│   └── Yes → Request Manage Territories permission
└── Is it CIRCULAR_DEPENDENCY?
    └── Yes → Choose different parent, restructure order
```
