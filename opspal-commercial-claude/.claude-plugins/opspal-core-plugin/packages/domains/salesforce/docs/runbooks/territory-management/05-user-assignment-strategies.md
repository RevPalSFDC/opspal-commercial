# Runbook 5: User Assignment Strategies

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Sales Operations

---

## Table of Contents

1. [Assignment Basics](#assignment-basics)
2. [Single Assignments](#single-assignments)
3. [Bulk Assignments](#bulk-assignments)
4. [Role Management](#role-management)
5. [Coverage Strategies](#coverage-strategies)
6. [Removing Assignments](#removing-assignments)

---

## Assignment Basics

### UserTerritory2Association Object

Links users to territories via junction object.

| Field | Required | Description |
|-------|----------|-------------|
| UserId | Yes | User to assign |
| Territory2Id | Yes | Target territory |
| RoleInTerritory2 | No | User's role in territory |

### Key Rules

1. **Uniqueness**: User+Territory combination must be unique
2. **User State**: User must be active
3. **Multiple Territories**: Users can be in multiple territories
4. **Auto-cleanup**: Deactivating a user removes their assignments

### Access Impact

When a user is assigned to a territory, they gain access to:
- Accounts in that territory (per AccountAccessLevel)
- Related Opportunities (per OpportunityAccessLevel)
- Related Cases (per CaseAccessLevel)
- Related Contacts (per ContactAccessLevel)

---

## Single Assignments

### Create Assignment

```bash
sf data create record --sobject UserTerritory2Association \
  --values "UserId='005...' Territory2Id='0MI...' RoleInTerritory2='Sales Rep'" \
  --target-org $ORG
```

### Check for Duplicate First

```sql
SELECT Id FROM UserTerritory2Association
WHERE UserId = '<user_id>' AND Territory2Id = '<territory_id>'
```

### Full Pattern

```javascript
async function assignUserToTerritory(orgAlias, userId, territoryId, role) {
  // 1. Validate user exists and is active
  const user = await query(`
    SELECT Id, IsActive, Name FROM User WHERE Id = '${userId}'
  `);
  if (user.length === 0) throw new Error('User not found');
  if (!user[0].IsActive) throw new Error('User is inactive');

  // 2. Validate territory exists
  const territory = await query(`
    SELECT Id, Name FROM Territory2 WHERE Id = '${territoryId}'
  `);
  if (territory.length === 0) throw new Error('Territory not found');

  // 3. Check for existing assignment
  const existing = await query(`
    SELECT Id FROM UserTerritory2Association
    WHERE UserId = '${userId}' AND Territory2Id = '${territoryId}'
  `);

  if (existing.length > 0) {
    // Update role if provided
    if (role) {
      await update('UserTerritory2Association', existing[0].Id, {
        RoleInTerritory2: role
      });
      return { action: 'updated', id: existing[0].Id };
    }
    return { action: 'exists', id: existing[0].Id };
  }

  // 4. Create assignment
  const result = await create('UserTerritory2Association', {
    UserId: userId,
    Territory2Id: territoryId,
    RoleInTerritory2: role
  });

  return { action: 'created', id: result.id };
}
```

---

## Bulk Assignments

### CSV Format

```csv
UserId,Territory2Id,RoleInTerritory2
005xxx000000001,0MIxxx000000001,Sales Rep
005xxx000000002,0MIxxx000000001,Sales Manager
005xxx000000003,0MIxxx000000002,Account Executive
```

### Bulk Import Command

```bash
sf data import bulk \
  --sobject UserTerritory2Association \
  --file user_assignments.csv \
  --target-org $ORG
```

### Pre-Import Validation

```javascript
async function validateBulkAssignments(orgAlias, assignments) {
  const errors = [];

  // Get all user IDs
  const userIds = [...new Set(assignments.map(a => a.UserId))];
  const users = await query(`
    SELECT Id, IsActive FROM User WHERE Id IN ('${userIds.join("','")}')
  `);
  const activeUsers = new Set(users.filter(u => u.IsActive).map(u => u.Id));

  // Get all territory IDs
  const territoryIds = [...new Set(assignments.map(a => a.Territory2Id))];
  const territories = await query(`
    SELECT Id FROM Territory2 WHERE Id IN ('${territoryIds.join("','")}')
  `);
  const validTerritories = new Set(territories.map(t => t.Id));

  // Get existing assignments
  const existing = await query(`
    SELECT UserId, Territory2Id FROM UserTerritory2Association
    WHERE UserId IN ('${userIds.join("','")}')
    AND Territory2Id IN ('${territoryIds.join("','")}')
  `);
  const existingSet = new Set(existing.map(e => `${e.UserId}_${e.Territory2Id}`));

  // Validate each assignment
  for (const assignment of assignments) {
    if (!activeUsers.has(assignment.UserId)) {
      errors.push({ ...assignment, error: 'User not found or inactive' });
    } else if (!validTerritories.has(assignment.Territory2Id)) {
      errors.push({ ...assignment, error: 'Territory not found' });
    } else if (existingSet.has(`${assignment.UserId}_${assignment.Territory2Id}`)) {
      errors.push({ ...assignment, error: 'Assignment already exists' });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    validCount: assignments.length - errors.length
  };
}
```

---

## Role Management

### Common Role Values

| Role | Use Case |
|------|----------|
| Sales Rep | Standard field representative |
| Sales Manager | Territory manager/supervisor |
| Account Executive | Primary account owner |
| Solution Specialist | Technical/solution expert |
| Overlay | Supporting/specialist coverage |
| Inside Sales | Inside sales rep |

### Setting Role on Creation

```bash
sf data create record --sobject UserTerritory2Association \
  --values "UserId='005...' Territory2Id='0MI...' RoleInTerritory2='Sales Manager'" \
  --target-org $ORG
```

### Updating Role

```bash
sf data update record --sobject UserTerritory2Association \
  --record-id '0UT...' \
  --values "RoleInTerritory2='Sales Manager'" \
  --target-org $ORG
```

### Role Reporting Query

```sql
SELECT t.Name Territory, uta.RoleInTerritory2 Role,
       COUNT(uta.UserId) UserCount
FROM UserTerritory2Association uta
JOIN Territory2 t ON uta.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
GROUP BY t.Id, t.Name, uta.RoleInTerritory2
ORDER BY t.Name, uta.RoleInTerritory2
```

---

## Coverage Strategies

### Strategy 1: One Rep Per Territory

Each territory has exactly one sales rep.

```sql
-- Find territories needing assignment
SELECT t.Id, t.Name
FROM Territory2 t
WHERE t.Territory2ModelId = '<model_id>'
AND t.Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)
```

### Strategy 2: Team Coverage

Multiple reps per territory with different roles.

```sql
-- Check team completeness
SELECT t.Name, uta.RoleInTerritory2, COUNT(uta.UserId) cnt
FROM Territory2 t
LEFT JOIN UserTerritory2Association uta ON t.Id = uta.Territory2Id
WHERE t.Territory2ModelId = '<model_id>'
GROUP BY t.Id, t.Name, uta.RoleInTerritory2
```

### Strategy 3: Overlay Teams

Specialist coverage across multiple territories.

```sql
-- Find specialists assigned to multiple territories
SELECT u.Name, COUNT(uta.Territory2Id) TerritoryCount
FROM UserTerritory2Association uta
JOIN User u ON uta.UserId = u.Id
JOIN Territory2 t ON uta.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
AND uta.RoleInTerritory2 = 'Overlay'
GROUP BY u.Id, u.Name
HAVING COUNT(uta.Territory2Id) > 1
```

### Coverage Metrics

```sql
-- Coverage summary
SELECT
  COUNT(DISTINCT t.Id) TotalTerritories,
  COUNT(DISTINCT uta.Territory2Id) TerritoriesWithUsers,
  COUNT(DISTINCT CASE WHEN uta.Id IS NULL THEN t.Id END) TerritoriesWithoutUsers,
  COUNT(uta.Id) TotalAssignments,
  COUNT(DISTINCT uta.UserId) UniqueUsers
FROM Territory2 t
LEFT JOIN UserTerritory2Association uta ON t.Id = uta.Territory2Id
WHERE t.Territory2ModelId = '<model_id>'
```

---

## Removing Assignments

### Remove Single Assignment

```bash
# First, find the assignment ID
sf data query --query "SELECT Id FROM UserTerritory2Association WHERE UserId = '005...' AND Territory2Id = '0MI...'" --target-org $ORG

# Then delete
sf data delete record --sobject UserTerritory2Association \
  --record-id '0UT...' \
  --target-org $ORG
```

### Remove All Users from Territory

```javascript
async function removeAllUsersFromTerritory(orgAlias, territoryId) {
  const assignments = await query(`
    SELECT Id FROM UserTerritory2Association
    WHERE Territory2Id = '${territoryId}'
  `);

  if (assignments.length === 0) {
    return { removed: 0 };
  }

  // Bulk delete
  const ids = assignments.map(a => a.Id);
  await bulkDelete('UserTerritory2Association', ids);

  return { removed: ids.length };
}
```

### Remove User from All Territories

```javascript
async function removeUserFromAllTerritories(orgAlias, userId) {
  const assignments = await query(`
    SELECT Id FROM UserTerritory2Association
    WHERE UserId = '${userId}'
  `);

  if (assignments.length === 0) {
    return { removed: 0 };
  }

  const ids = assignments.map(a => a.Id);
  await bulkDelete('UserTerritory2Association', ids);

  return { removed: ids.length };
}
```

---

## Verification Queries

### User Coverage Report

```sql
SELECT
  t.Name Territory,
  COUNT(uta.UserId) UserCount,
  GROUP_CONCAT(u.Name) UserNames
FROM Territory2 t
LEFT JOIN UserTerritory2Association uta ON t.Id = uta.Territory2Id
LEFT JOIN User u ON uta.UserId = u.Id
WHERE t.Territory2ModelId = '<model_id>'
GROUP BY t.Id, t.Name
ORDER BY t.Name
```

### Users in Multiple Territories

```sql
SELECT u.Name, COUNT(uta.Territory2Id) TerritoryCount
FROM UserTerritory2Association uta
JOIN User u ON uta.UserId = u.Id
JOIN Territory2 t ON uta.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
GROUP BY u.Id, u.Name
HAVING COUNT(uta.Territory2Id) > 1
ORDER BY TerritoryCount DESC
```

---

## Related Runbooks

- [Runbook 4: Hierarchy Configuration](04-hierarchy-configuration.md)
- [Runbook 6: Account Assignment Patterns](06-account-assignment-patterns.md)
- [Runbook 7: Testing and Validation](07-testing-and-validation.md)
