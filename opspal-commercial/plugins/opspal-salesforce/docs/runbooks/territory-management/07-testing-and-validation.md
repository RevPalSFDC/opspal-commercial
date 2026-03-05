# Runbook 7: Testing and Validation

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Developers, QA

---

## Table of Contents

1. [Validation Framework](#validation-framework)
2. [Pre-Deployment Validation](#pre-deployment-validation)
3. [Hierarchy Validation](#hierarchy-validation)
4. [Assignment Validation](#assignment-validation)
5. [Access Level Testing](#access-level-testing)
6. [Regression Testing](#regression-testing)

---

## Validation Framework

### Validation Layers

```
┌─────────────────────────────────────────┐
│           Pre-Deployment                │
│  (Schema, references, permissions)      │
├─────────────────────────────────────────┤
│           Structural                    │
│  (Hierarchy, cycles, orphans)           │
├─────────────────────────────────────────┤
│           Business Logic                │
│  (Rules, assignments, coverage)         │
├─────────────────────────────────────────┤
│           Access Control                │
│  (Permissions, sharing, visibility)     │
└─────────────────────────────────────────┘
```

### Validation Checkpoints

| Checkpoint | When | Blocks Proceed? |
|------------|------|-----------------|
| Schema validation | Before any write | Yes |
| Reference integrity | Before create/update | Yes |
| Hierarchy validation | Before reparenting | Yes |
| Access level audit | Before activation | No (warning) |
| Coverage analysis | Before go-live | No (warning) |

---

## Pre-Deployment Validation

### Required Permissions Check

```sql
SELECT Id, Name, PermissionsManageTerritories
FROM Profile
WHERE PermissionsManageTerritories = true
```

```javascript
async function validatePermissions(userId) {
  const user = await query(`
    SELECT Id, Profile.PermissionsManageTerritories,
           (SELECT PermissionSet.PermissionsManageTerritories
            FROM PermissionSetAssignments)
    FROM User WHERE Id = '${userId}'
  `);

  const hasPermission =
    user[0].Profile?.PermissionsManageTerritories ||
    user[0].PermissionSetAssignments?.some(
      psa => psa.PermissionSet?.PermissionsManageTerritories
    );

  return { userId, hasPermission };
}
```

### Territory2 Feature Enabled Check

```sql
-- Check if any Territory2Model exists
SELECT COUNT(Id) cnt FROM Territory2Model
```

If count is 0 and you cannot create models, Territory Management may not be enabled.

### DeveloperName Uniqueness

```javascript
async function validateDeveloperName(modelId, developerName) {
  const existing = await query(`
    SELECT Id FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND DeveloperName = '${developerName}'
  `);

  return {
    isUnique: existing.length === 0,
    conflictId: existing[0]?.Id
  };
}
```

### Required Fields Validation

```javascript
function validateTerritoryFields(territory) {
  const errors = [];

  // Required fields
  if (!territory.Name) errors.push('Name is required');
  if (!territory.DeveloperName) errors.push('DeveloperName is required');
  if (!territory.Territory2ModelId) errors.push('Territory2ModelId is required');
  if (!territory.Territory2TypeId) errors.push('Territory2TypeId is required');

  // Access level validation
  const validAccountAccess = ['Read', 'Edit', 'All'];
  const validOppCaseAccess = ['None', 'Read', 'Edit'];

  if (!validAccountAccess.includes(territory.AccountAccessLevel)) {
    errors.push(`AccountAccessLevel must be: ${validAccountAccess.join(', ')}`);
  }
  if (!validOppCaseAccess.includes(territory.OpportunityAccessLevel)) {
    errors.push(`OpportunityAccessLevel must be: ${validOppCaseAccess.join(', ')}`);
  }
  if (!validOppCaseAccess.includes(territory.CaseAccessLevel)) {
    errors.push(`CaseAccessLevel must be: ${validOppCaseAccess.join(', ')}`);
  }

  // DeveloperName format
  if (territory.DeveloperName && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(territory.DeveloperName)) {
    errors.push('DeveloperName must start with letter, contain only alphanumeric and underscore');
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Hierarchy Validation

### Cycle Detection

```javascript
async function detectCycles(modelId) {
  const territories = await query(`
    SELECT Id, ParentTerritory2Id FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const parentMap = new Map(
    territories.map(t => [t.Id, t.ParentTerritory2Id])
  );

  const cycles = [];

  for (const territory of territories) {
    const visited = new Set();
    let current = territory.Id;

    while (current && parentMap.has(current)) {
      if (visited.has(current)) {
        cycles.push({
          territoryId: territory.Id,
          cycleStart: current
        });
        break;
      }
      visited.add(current);
      current = parentMap.get(current);
    }
  }

  return { hasCycles: cycles.length > 0, cycles };
}
```

### Orphan Detection

```javascript
async function detectOrphans(modelId) {
  const orphans = await query(`
    SELECT Id, Name, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND ParentTerritory2Id != null
    AND ParentTerritory2Id NOT IN (
      SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}'
    )
  `);

  return {
    hasOrphans: orphans.length > 0,
    orphans: orphans.map(o => ({
      id: o.Id,
      name: o.Name,
      invalidParentId: o.ParentTerritory2Id
    }))
  };
}
```

### Depth Calculation

```javascript
async function calculateHierarchyMetrics(modelId) {
  const territories = await query(`
    SELECT Id, ParentTerritory2Id FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const parentMap = new Map(
    territories.map(t => [t.Id, t.ParentTerritory2Id])
  );

  let maxDepth = 0;
  const depthMap = new Map();

  function getDepth(id) {
    if (depthMap.has(id)) return depthMap.get(id);

    const parentId = parentMap.get(id);
    if (!parentId) {
      depthMap.set(id, 0);
      return 0;
    }

    const depth = getDepth(parentId) + 1;
    depthMap.set(id, depth);
    maxDepth = Math.max(maxDepth, depth);
    return depth;
  }

  territories.forEach(t => getDepth(t.Id));

  // Count by level
  const levelCounts = {};
  depthMap.forEach((depth) => {
    levelCounts[depth] = (levelCounts[depth] || 0) + 1;
  });

  return {
    totalTerritories: territories.length,
    maxDepth,
    levelCounts,
    rootCount: levelCounts[0] || 0
  };
}
```

### Parent Reference Validation

```javascript
async function validateParentReference(modelId, territoryId, newParentId) {
  // Check 1: New parent exists
  const parent = await query(`
    SELECT Id, Territory2ModelId FROM Territory2
    WHERE Id = '${newParentId}'
  `);

  if (parent.length === 0) {
    return { valid: false, error: 'Parent territory not found' };
  }

  // Check 2: Same model
  if (parent[0].Territory2ModelId !== modelId) {
    return { valid: false, error: 'Parent must be in same model' };
  }

  // Check 3: Would not create cycle
  const wouldCycle = await wouldCreateCycle(territoryId, newParentId, modelId);
  if (wouldCycle) {
    return { valid: false, error: 'Would create circular reference' };
  }

  return { valid: true };
}

async function wouldCreateCycle(territoryId, newParentId, modelId) {
  const territories = await query(`
    SELECT Id, ParentTerritory2Id FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const parentMap = new Map(
    territories.map(t => [t.Id, t.ParentTerritory2Id])
  );

  // Simulate the change
  parentMap.set(territoryId, newParentId);

  // Check if we can reach territoryId from newParentId
  let current = newParentId;
  const visited = new Set();

  while (current) {
    if (current === territoryId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    current = parentMap.get(current);
  }

  return false;
}
```

---

## Assignment Validation

### User Assignment Validation

```javascript
async function validateUserAssignment(userId, territoryId) {
  const errors = [];

  // Check user exists and is active
  const user = await query(`
    SELECT Id, IsActive, Name FROM User WHERE Id = '${userId}'
  `);

  if (user.length === 0) {
    errors.push('User not found');
    return { valid: false, errors };
  }

  if (!user[0].IsActive) {
    errors.push('User is inactive');
  }

  // Check territory exists
  const territory = await query(`
    SELECT Id, Name FROM Territory2 WHERE Id = '${territoryId}'
  `);

  if (territory.length === 0) {
    errors.push('Territory not found');
  }

  // Check for duplicate assignment
  const existing = await query(`
    SELECT Id FROM UserTerritory2Association
    WHERE UserId = '${userId}' AND Territory2Id = '${territoryId}'
  `);

  if (existing.length > 0) {
    errors.push('Assignment already exists');
  }

  return { valid: errors.length === 0, errors };
}
```

### Account Assignment Validation

```javascript
async function validateAccountAssignment(accountId, territoryId) {
  const errors = [];

  // Check account exists
  const account = await query(`
    SELECT Id, Name FROM Account WHERE Id = '${accountId}'
  `);

  if (account.length === 0) {
    errors.push('Account not found');
    return { valid: false, errors };
  }

  // Check territory exists
  const territory = await query(`
    SELECT Id, Name FROM Territory2 WHERE Id = '${territoryId}'
  `);

  if (territory.length === 0) {
    errors.push('Territory not found');
  }

  // Check for exclusion
  const exclusion = await query(`
    SELECT Id FROM Territory2ObjectExclusion
    WHERE ObjectId = '${accountId}' AND Territory2Id = '${territoryId}'
  `);

  if (exclusion.length > 0) {
    errors.push('Account is excluded from this territory');
  }

  // Check for duplicate assignment
  const existing = await query(`
    SELECT Id FROM ObjectTerritory2Association
    WHERE ObjectId = '${accountId}' AND Territory2Id = '${territoryId}'
  `);

  if (existing.length > 0) {
    errors.push('Assignment already exists');
  }

  return { valid: errors.length === 0, errors };
}
```

### Bulk Assignment Pre-Validation

```javascript
async function validateBulkAssignments(assignments, type = 'user') {
  const results = {
    valid: [],
    invalid: [],
    summary: { total: assignments.length, valid: 0, invalid: 0 }
  };

  // Batch fetch all referenced entities
  const entityIds = type === 'user'
    ? [...new Set(assignments.map(a => a.UserId))]
    : [...new Set(assignments.map(a => a.ObjectId))];

  const territoryIds = [...new Set(assignments.map(a => a.Territory2Id))];

  // Validate entities exist
  const entityQuery = type === 'user'
    ? `SELECT Id, IsActive FROM User WHERE Id IN ('${entityIds.join("','")}')`
    : `SELECT Id FROM Account WHERE Id IN ('${entityIds.join("','")}')`;

  const entities = await query(entityQuery);
  const validEntities = new Set(
    type === 'user'
      ? entities.filter(e => e.IsActive).map(e => e.Id)
      : entities.map(e => e.Id)
  );

  // Validate territories exist
  const territories = await query(`
    SELECT Id FROM Territory2 WHERE Id IN ('${territoryIds.join("','")}')
  `);
  const validTerritories = new Set(territories.map(t => t.Id));

  // Check existing assignments
  const existingQuery = type === 'user'
    ? `SELECT UserId, Territory2Id FROM UserTerritory2Association
       WHERE UserId IN ('${entityIds.join("','")}')
       AND Territory2Id IN ('${territoryIds.join("','")}')`
    : `SELECT ObjectId, Territory2Id FROM ObjectTerritory2Association
       WHERE ObjectId IN ('${entityIds.join("','")}')
       AND Territory2Id IN ('${territoryIds.join("','")}')`;

  const existing = await query(existingQuery);
  const existingSet = new Set(
    existing.map(e =>
      type === 'user'
        ? `${e.UserId}_${e.Territory2Id}`
        : `${e.ObjectId}_${e.Territory2Id}`
    )
  );

  // Validate each assignment
  for (const assignment of assignments) {
    const entityId = type === 'user' ? assignment.UserId : assignment.ObjectId;
    const key = `${entityId}_${assignment.Territory2Id}`;
    const errors = [];

    if (!validEntities.has(entityId)) {
      errors.push(`${type === 'user' ? 'User' : 'Account'} not found or inactive`);
    }
    if (!validTerritories.has(assignment.Territory2Id)) {
      errors.push('Territory not found');
    }
    if (existingSet.has(key)) {
      errors.push('Assignment already exists');
    }

    if (errors.length === 0) {
      results.valid.push(assignment);
      results.summary.valid++;
    } else {
      results.invalid.push({ ...assignment, errors });
      results.summary.invalid++;
    }
  }

  return results;
}
```

---

## Access Level Testing

### Access Level Matrix Test

```javascript
async function testAccessLevels(modelId, testUserId, testAccountId) {
  const results = [];

  // Get user's territory assignments
  const userTerritories = await query(`
    SELECT t.Id, t.Name, t.AccountAccessLevel,
           t.OpportunityAccessLevel, t.CaseAccessLevel
    FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE uta.UserId = '${testUserId}'
    AND t.Territory2ModelId = '${modelId}'
  `);

  // Get account's territory assignments
  const accountTerritories = await query(`
    SELECT t.Id, t.Name
    FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE ota.ObjectId = '${testAccountId}'
    AND t.Territory2ModelId = '${modelId}'
  `);

  // Find overlapping territories
  const userTerritoryIds = new Set(userTerritories.map(t => t.Id));
  const overlapping = accountTerritories.filter(t => userTerritoryIds.has(t.Id));

  for (const territory of overlapping) {
    const userTerritory = userTerritories.find(t => t.Id === territory.Id);
    results.push({
      territoryId: territory.Id,
      territoryName: territory.Name,
      accountAccess: userTerritory.AccountAccessLevel,
      opportunityAccess: userTerritory.OpportunityAccessLevel,
      caseAccess: userTerritory.CaseAccessLevel
    });
  }

  return {
    userId: testUserId,
    accountId: testAccountId,
    accessVia: results,
    hasAccess: results.length > 0
  };
}
```

### Sharing Verification

```sql
-- Check if account is accessible via territory
SELECT Id, AccountId, UserOrGroupId, RowCause
FROM AccountShare
WHERE AccountId = '<account_id>'
AND UserOrGroupId = '<user_id>'
AND RowCause = 'Territory2'
```

---

## Regression Testing

### Full Model Validation Suite

```javascript
async function runModelValidation(modelId) {
  const results = {
    modelId,
    timestamp: new Date().toISOString(),
    checks: []
  };

  // 1. Hierarchy validation
  const cycleCheck = await detectCycles(modelId);
  results.checks.push({
    name: 'Cycle Detection',
    passed: !cycleCheck.hasCycles,
    details: cycleCheck
  });

  const orphanCheck = await detectOrphans(modelId);
  results.checks.push({
    name: 'Orphan Detection',
    passed: !orphanCheck.hasOrphans,
    details: orphanCheck
  });

  // 2. Metrics
  const metrics = await calculateHierarchyMetrics(modelId);
  results.checks.push({
    name: 'Hierarchy Metrics',
    passed: metrics.maxDepth <= 10, // Warning if too deep
    details: metrics
  });

  // 3. Coverage
  const coverage = await calculateCoverage(modelId);
  results.checks.push({
    name: 'Coverage Analysis',
    passed: coverage.territoriesWithUsers > 0,
    details: coverage
  });

  // Overall result
  results.passed = results.checks.every(c => c.passed);

  return results;
}

async function calculateCoverage(modelId) {
  // NOTE: COUNT(DISTINCT) and JOIN are not valid in SOQL
  // Use separate queries and aggregate in code

  const totalTerritories = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const territoriesWithUsers = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND Id IN (SELECT Territory2Id FROM UserTerritory2Association)
  `);

  const territoriesWithAccounts = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND Id IN (SELECT Territory2Id FROM ObjectTerritory2Association)
  `);

  // For unique users/accounts, use GROUP BY and count results
  const uniqueUsers = await query(`
    SELECT UserId FROM UserTerritory2Association
    WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}')
    GROUP BY UserId
  `);

  const uniqueAccounts = await query(`
    SELECT ObjectId FROM ObjectTerritory2Association
    WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}')
    GROUP BY ObjectId
  `);

  return {
    TotalTerritories: totalTerritories[0].cnt,
    TerritoriesWithUsers: territoriesWithUsers[0].cnt,
    TerritoriesWithAccounts: territoriesWithAccounts[0].cnt,
    UniqueUsers: uniqueUsers.length,
    UniqueAccounts: uniqueAccounts.length
  };
}
```

### Pre-Activation Checklist

```javascript
async function preActivationChecklist(modelId) {
  const checklist = [];

  // 1. No cycles
  const cycles = await detectCycles(modelId);
  checklist.push({
    item: 'No circular references in hierarchy',
    status: cycles.hasCycles ? 'FAIL' : 'PASS',
    blocking: true
  });

  // 2. No orphans
  const orphans = await detectOrphans(modelId);
  checklist.push({
    item: 'No orphaned territories',
    status: orphans.hasOrphans ? 'FAIL' : 'PASS',
    blocking: true
  });

  // 3. At least one territory
  const count = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);
  checklist.push({
    item: 'At least one territory exists',
    status: count[0].cnt > 0 ? 'PASS' : 'FAIL',
    blocking: true
  });

  // 4. User assignments exist
  const userAssignments = await query(`
    SELECT COUNT(uta.Id) cnt
    FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `);
  checklist.push({
    item: 'User assignments configured',
    status: userAssignments[0].cnt > 0 ? 'PASS' : 'WARN',
    blocking: false
  });

  // 5. Account assignments or rules exist
  const accountAssignments = await query(`
    SELECT COUNT(ota.Id) cnt
    FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `);
  checklist.push({
    item: 'Account assignments or rules configured',
    status: accountAssignments[0].cnt > 0 ? 'PASS' : 'WARN',
    blocking: false
  });

  return {
    checklist,
    canActivate: checklist.filter(c => c.blocking && c.status === 'FAIL').length === 0,
    warnings: checklist.filter(c => c.status === 'WARN').length
  };
}
```

---

## Test Data Generation

### Create Test Territory Structure

```javascript
async function createTestHierarchy(modelId, typeId) {
  const testTerritories = [
    { Name: 'Test_Root', DeveloperName: 'Test_Root', parent: null },
    { Name: 'Test_L1_A', DeveloperName: 'Test_L1_A', parent: 'Test_Root' },
    { Name: 'Test_L1_B', DeveloperName: 'Test_L1_B', parent: 'Test_Root' },
    { Name: 'Test_L2_A1', DeveloperName: 'Test_L2_A1', parent: 'Test_L1_A' }
  ];

  const created = new Map();

  for (const t of testTerritories) {
    const parentId = t.parent ? created.get(t.parent) : null;

    const result = await create('Territory2', {
      Name: t.Name,
      DeveloperName: t.DeveloperName,
      Territory2ModelId: modelId,
      Territory2TypeId: typeId,
      ParentTerritory2Id: parentId,
      AccountAccessLevel: 'Edit',
      OpportunityAccessLevel: 'Edit',
      CaseAccessLevel: 'Read'
    });

    created.set(t.DeveloperName, result.id);
  }

  return Array.from(created.entries());
}
```

### Cleanup Test Data

```javascript
async function cleanupTestData(modelId, prefix = 'Test_') {
  // Find test territories
  const testTerritories = await query(`
    SELECT Id, DeveloperName FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND DeveloperName LIKE '${prefix}%'
    ORDER BY DeveloperName DESC
  `);

  // Delete in reverse order (children first)
  for (const t of testTerritories) {
    // Remove user assignments
    const userAssignments = await query(`
      SELECT Id FROM UserTerritory2Association
      WHERE Territory2Id = '${t.Id}'
    `);
    for (const ua of userAssignments) {
      await del('UserTerritory2Association', ua.Id);
    }

    // Remove account assignments
    const accountAssignments = await query(`
      SELECT Id FROM ObjectTerritory2Association
      WHERE Territory2Id = '${t.Id}'
    `);
    for (const oa of accountAssignments) {
      await del('ObjectTerritory2Association', oa.Id);
    }

    // Delete territory
    await del('Territory2', t.Id);
  }

  return { deleted: testTerritories.length };
}
```

---

## Related Runbooks

- [Runbook 6: Account Assignment Patterns](06-account-assignment-patterns.md)
- [Runbook 8: Deployment and Activation](08-deployment-and-activation.md)
- [Runbook 10: Troubleshooting Guide](10-troubleshooting-guide.md)
