# Runbook 10: Troubleshooting Guide

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Developers, Support

---

## Table of Contents

1. [Common Errors](#common-errors)
2. [Deployment Issues](#deployment-issues)
3. [Assignment Problems](#assignment-problems)
4. [Access Issues](#access-issues)
5. [Performance Problems](#performance-problems)
6. [Diagnostic Queries](#diagnostic-queries)

---

## Common Errors

### Error Reference Table

| Error Code/Message | Cause | Solution |
|-------------------|-------|----------|
| `DUPLICATE_DEVELOPER_NAME` | Territory DeveloperName already exists | Use unique DeveloperName per model |
| `FIELD_INTEGRITY_EXCEPTION` | Required field missing | Check AccountAccessLevel, etc. |
| `INVALID_CROSS_REFERENCE_KEY` | Invalid parent or type reference | Verify ParentTerritory2Id, Territory2TypeId |
| `INVALID_OPERATION_WITH_CHILD_TERRITORY` | Deleting territory with children | Delete children first |
| `TERRITORY_ALREADY_IN_MODEL` | Duplicate territory in model | Remove existing or update |
| `REQUIRED_FIELD_MISSING` | Missing required field | Add Territory2ModelId, Territory2TypeId |
| `ENTITY_IS_DELETED` | Referenced record deleted | Query for valid reference |
| `UNABLE_TO_LOCK_ROW` | Concurrent modification | Retry with exponential backoff |

---

## Deployment Issues

### Issue: Deployment Fails with "Required Field Missing"

**Symptoms:**
- Metadata deployment fails
- Error mentions missing field

**Diagnosis:**

```bash
# Check package.xml includes all dependencies
cat force-app/main/default/territory2Models/package.xml
```

**Solution:**

Ensure metadata XML includes all required fields:

```xml
<!-- Territory2 requires these fields -->
<Territory2>
    <name>Required</name>
    <developerName>Required</developerName>
    <territory2Model>Required</territory2Model>
    <territory2Type>Required</territory2Type>
    <accountAccessLevel>Required</accountAccessLevel>
    <opportunityAccessLevel>Required</opportunityAccessLevel>
    <caseAccessLevel>Required</caseAccessLevel>
</Territory2>
```

### Issue: Parent Reference Invalid

**Symptoms:**
- Error: "Invalid cross reference id"
- Deployment fails

**Diagnosis:**

```sql
-- Check if parent exists
SELECT Id, Name, DeveloperName
FROM Territory2
WHERE DeveloperName = '<parent_developer_name>'
AND Territory2ModelId = '<model_id>'
```

**Solution:**

1. Deploy parent territories before children
2. Use correct DeveloperName references in metadata
3. Ensure parent is in same model

### Issue: Territory Type Not Found

**Symptoms:**
- Error: "Territory2Type not found"

**Diagnosis:**

```sql
SELECT Id, DeveloperName, MasterLabel
FROM Territory2Type
```

**Solution:**

1. Deploy Territory2Type before Territory2
2. Verify DeveloperName matches exactly

```bash
# Deploy types first
sf project deploy start \
  --source-dir force-app/main/default/territory2Types \
  --target-org $ORG

# Then deploy model and territories
sf project deploy start \
  --source-dir force-app/main/default/territory2Models \
  --target-org $ORG
```

### Issue: Circular Reference Detected

**Symptoms:**
- Deployment fails
- Error about circular hierarchy

**Diagnosis:**

```javascript
async function findCircularRefs(modelId) {
  const territories = await query(`
    SELECT Id, DeveloperName, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const parentMap = new Map(
    territories.map(t => [t.Id, t.ParentTerritory2Id])
  );

  for (const t of territories) {
    const visited = new Set();
    let current = t.Id;

    while (current) {
      if (visited.has(current)) {
        console.log(`Cycle detected starting at: ${t.DeveloperName}`);
        console.log(`Cycle path: ${Array.from(visited).join(' -> ')}`);
        break;
      }
      visited.add(current);
      current = parentMap.get(current);
    }
  }
}
```

**Solution:**

1. Identify the cycle path
2. Fix parent references in metadata
3. Redeploy

---

## Assignment Problems

### Issue: User Assignment Fails

**Symptoms:**
- Cannot assign user to territory
- Error: "User not found" or "User inactive"

**Diagnosis:**

```sql
-- Check user status
SELECT Id, Name, IsActive, ProfileId
FROM User
WHERE Id = '<user_id>'

-- Check existing assignments
SELECT Id, Territory2Id
FROM UserTerritory2Association
WHERE UserId = '<user_id>'
```

**Solution:**

1. Verify user is active
2. Check if assignment already exists
3. Verify territory exists

```javascript
async function safeAssignUser(userId, territoryId) {
  // Check user
  const user = await query(`
    SELECT Id, IsActive FROM User WHERE Id = '${userId}'
  `);

  if (user.length === 0) {
    throw new Error('User not found');
  }
  if (!user[0].IsActive) {
    throw new Error('User is inactive');
  }

  // Check existing
  const existing = await query(`
    SELECT Id FROM UserTerritory2Association
    WHERE UserId = '${userId}' AND Territory2Id = '${territoryId}'
  `);

  if (existing.length > 0) {
    return { status: 'exists', id: existing[0].Id };
  }

  // Create
  const result = await create('UserTerritory2Association', {
    UserId: userId,
    Territory2Id: territoryId
  });

  return { status: 'created', id: result.id };
}
```

### Issue: Account Assignment Blocked by Exclusion

**Symptoms:**
- Manual assignment works but rule doesn't assign
- Account missing from expected territory

**Diagnosis:**

```sql
-- Check for exclusion
SELECT Id, ObjectId, Territory2Id
FROM Territory2ObjectExclusion
WHERE ObjectId = '<account_id>'
AND Territory2Id = '<territory_id>'
```

**Solution:**

1. Remove exclusion if no longer needed:

```bash
sf data delete record --sobject Territory2ObjectExclusion \
  --record-id '<exclusion_id>' \
  --target-org $ORG
```

2. Or manually assign (exclusions don't block manual assignments)

### Issue: Assignment Rules Not Running

**Symptoms:**
- New accounts not being assigned
- Rule exists but no assignments created

**Diagnosis:**

```sql
-- Check rule status
SELECT Id, DeveloperName, Active
FROM Territory2Rule
WHERE Territory2ModelId = '<model_id>'
```

**Solution:**

1. Verify rules are active
2. Manually trigger rule run:
   - Setup > Territories > Run Assignment Rules
3. Check rule criteria matches account data

```sql
-- Verify account matches rule criteria
-- Example: Rule requires BillingCountry = 'United States'
SELECT Id, Name, BillingCountry, BillingState
FROM Account
WHERE Id = '<account_id>'
```

### Issue: Bulk Assignment Fails

**Symptoms:**
- Bulk import errors
- Some records succeed, others fail

**Diagnosis:**

```javascript
async function diagnoseBulkFailures(failedRecords) {
  for (const record of failedRecords) {
    // Check user/account exists
    const entityExists = await checkEntityExists(record);

    // Check territory exists
    const territoryExists = await checkTerritoryExists(record.Territory2Id);

    // Check for duplicates
    const isDuplicate = await checkDuplicate(record);

    console.log({
      record,
      entityExists,
      territoryExists,
      isDuplicate
    });
  }
}
```

**Solution:**

1. Pre-validate data before import
2. Remove duplicates from CSV
3. Process in smaller batches (200 records)
4. Retry failed records after fixing issues

---

## Access Issues

### Issue: User Can't See Account

**Symptoms:**
- User assigned to territory
- Account assigned to same territory
- User still can't access account

**Diagnosis:**

```sql
-- Verify user assignment
SELECT Id FROM UserTerritory2Association
WHERE UserId = '<user_id>'
AND Territory2Id = '<territory_id>'

-- Verify account assignment
SELECT Id FROM ObjectTerritory2Association
WHERE ObjectId = '<account_id>'
AND Territory2Id = '<territory_id>'

-- Check territory access level
SELECT AccountAccessLevel FROM Territory2
WHERE Id = '<territory_id>'

-- Check sharing record
SELECT Id, RowCause FROM AccountShare
WHERE AccountId = '<account_id>'
AND UserOrGroupId = '<user_id>'
```

**Solution:**

1. Verify both assignments exist
2. Check AccountAccessLevel is 'Read' or higher
3. Wait for sharing recalculation (can take time)
4. Check for conflicting org-wide defaults or sharing rules

### Issue: Model Activation Doesn't Grant Access

**Symptoms:**
- Model activated
- Assignments exist
- Users report no access

**Diagnosis:**

```sql
-- Check model state
SELECT Id, Name, State FROM Territory2Model
WHERE Id = '<model_id>'

-- Check for another active model
SELECT Id, Name, State FROM Territory2Model
WHERE State = 'Active'

-- Check sharing recalculation status
SELECT Id, Status FROM Territory2AlignmentLog
WHERE Territory2ModelId = '<model_id>'
ORDER BY CreatedDate DESC
LIMIT 1
```

**Solution:**

1. Ensure model state is 'Active'
2. Only one model can be active at a time
3. Wait for sharing recalculation to complete
4. If stuck, archive and re-activate

### Issue: Wrong Access Level

**Symptoms:**
- User can view but not edit
- User has more access than expected

**Diagnosis:**

```sql
-- Check all paths to account access
SELECT
  t.Name TerritoryName,
  t.AccountAccessLevel,
  uta.RoleInTerritory2
FROM UserTerritory2Association uta
JOIN Territory2 t ON uta.Territory2Id = t.Id
JOIN ObjectTerritory2Association ota ON t.Id = ota.Territory2Id
WHERE uta.UserId = '<user_id>'
AND ota.ObjectId = '<account_id>'
```

**Solution:**

1. User gets highest access level from all territory paths
2. Update territory access levels if needed
3. Check if account is in multiple territories with different levels

---

## Performance Problems

### Issue: Sharing Recalculation Slow

**Symptoms:**
- Model activation takes hours
- Assignment rules run slowly

**Diagnosis:**

```sql
-- Check job duration
SELECT
  Id,
  StartDateTime,
  EndDateTime,
  RecordsProcessed
FROM Territory2AlignmentLog
ORDER BY StartDateTime DESC
LIMIT 10
```

**Solution:**

1. Run during off-hours
2. Process in phases (activate with minimal territories, add more later)
3. Consider territory structure simplification
4. Check for large number of accounts

### Issue: Query Timeout on Territory Data

**Symptoms:**
- Reports time out
- SOQL queries fail

**Diagnosis:**

```sql
-- Count territories
SELECT COUNT(Id) FROM Territory2 WHERE Territory2ModelId = '<model_id>'

-- Count assignments
SELECT COUNT(Id) FROM UserTerritory2Association uta
JOIN Territory2 t ON uta.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
```

**Solution:**

1. Add selective filters
2. Use indexed fields (Id, Name)
3. Break into smaller queries
4. Use batch processing

```javascript
// Process in chunks
async function queryInChunks(baseQuery, chunkSize = 2000) {
  let offset = 0;
  let allResults = [];
  let hasMore = true;

  while (hasMore) {
    const results = await query(`
      ${baseQuery}
      LIMIT ${chunkSize}
      OFFSET ${offset}
    `);

    allResults = allResults.concat(results);
    hasMore = results.length === chunkSize;
    offset += chunkSize;
  }

  return allResults;
}
```

---

## Diagnostic Queries

### Complete Model Diagnostic

```sql
-- Model overview
SELECT
  m.Id,
  m.Name,
  m.State,
  (SELECT COUNT(Id) FROM Territory2 WHERE Territory2ModelId = m.Id) TerritoryCount,
  (SELECT COUNT(Id) FROM Territory2Rule WHERE Territory2ModelId = m.Id) RuleCount
FROM Territory2Model m
WHERE m.Id = '<model_id>'
```

### Hierarchy Health Check

```javascript
async function hierarchyHealthCheck(modelId) {
  const results = {
    modelId,
    timestamp: new Date().toISOString(),
    issues: []
  };

  // 1. Check for orphans
  const orphans = await query(`
    SELECT Id, Name, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND ParentTerritory2Id != null
    AND ParentTerritory2Id NOT IN (
      SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}'
    )
  `);

  if (orphans.length > 0) {
    results.issues.push({
      type: 'ORPHAN',
      severity: 'CRITICAL',
      message: `${orphans.length} orphaned territories found`,
      data: orphans
    });
  }

  // 2. Check for deep hierarchies (>10 levels)
  const territories = await query(`
    SELECT Id, ParentTerritory2Id FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const parentMap = new Map(territories.map(t => [t.Id, t.ParentTerritory2Id]));
  let maxDepth = 0;

  for (const t of territories) {
    let depth = 0;
    let current = t.Id;

    while (current && depth < 50) {
      depth++;
      current = parentMap.get(current);
    }

    maxDepth = Math.max(maxDepth, depth);
  }

  if (maxDepth > 10) {
    results.issues.push({
      type: 'DEEP_HIERARCHY',
      severity: 'WARNING',
      message: `Hierarchy depth is ${maxDepth} (recommended max: 10)`,
      data: { maxDepth }
    });
  }

  // 3. Check for empty territories
  const emptyTerritories = await query(`
    SELECT COUNT(Id) cnt FROM Territory2 t
    WHERE t.Territory2ModelId = '${modelId}'
    AND t.Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)
    AND t.Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)
  `);

  if (emptyTerritories[0].cnt > 0) {
    results.issues.push({
      type: 'EMPTY_TERRITORIES',
      severity: 'INFO',
      message: `${emptyTerritories[0].cnt} empty territories`,
      data: { count: emptyTerritories[0].cnt }
    });
  }

  results.healthy = results.issues.filter(i => i.severity === 'CRITICAL').length === 0;

  return results;
}
```

### Assignment Diagnostic

```javascript
async function assignmentDiagnostic(modelId) {
  const results = {};

  // User assignment stats
  results.userAssignments = await query(`
    SELECT
      COUNT(DISTINCT uta.UserId) UniqueUsers,
      COUNT(uta.Id) TotalAssignments,
      COUNT(DISTINCT uta.Territory2Id) TerritoriesWithUsers
    FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `);

  // Account assignment stats
  results.accountAssignments = await query(`
    SELECT
      COUNT(DISTINCT ota.ObjectId) UniqueAccounts,
      COUNT(ota.Id) TotalAssignments,
      COUNT(DISTINCT ota.Territory2Id) TerritoriesWithAccounts,
      AssociationCause,
      COUNT(Id) CountByCause
    FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
    GROUP BY AssociationCause
  `);

  // Exclusions
  results.exclusions = await query(`
    SELECT COUNT(Id) cnt
    FROM Territory2ObjectExclusion te
    JOIN Territory2 t ON te.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `);

  // Multi-territory accounts
  results.multiTerritoryAccounts = await query(`
    SELECT COUNT(*) cnt
    FROM (
      SELECT ObjectId
      FROM ObjectTerritory2Association ota
      JOIN Territory2 t ON ota.Territory2Id = t.Id
      WHERE t.Territory2ModelId = '${modelId}'
      GROUP BY ObjectId
      HAVING COUNT(Territory2Id) > 1
    )
  `);

  return results;
}
```

### Full System Diagnostic

```javascript
async function fullSystemDiagnostic() {
  const report = {
    timestamp: new Date().toISOString(),
    models: []
  };

  // Get all models
  const models = await query(`
    SELECT Id, Name, State FROM Territory2Model ORDER BY State, Name
  `);

  for (const model of models) {
    const modelReport = {
      id: model.Id,
      name: model.Name,
      state: model.State
    };

    // Territory count
    const territoryCount = await query(`
      SELECT COUNT(Id) cnt FROM Territory2
      WHERE Territory2ModelId = '${model.Id}'
    `);
    modelReport.territoryCount = territoryCount[0].cnt;

    // Health check
    modelReport.health = await hierarchyHealthCheck(model.Id);

    // Assignment stats
    modelReport.assignments = await assignmentDiagnostic(model.Id);

    // Recent job status (if any)
    const recentJob = await query(`
      SELECT Status, RecordsProcessed, RecordsFailed, StartDateTime
      FROM Territory2AlignmentLog
      WHERE Territory2ModelId = '${model.Id}'
      ORDER BY StartDateTime DESC
      LIMIT 1
    `);
    modelReport.lastJob = recentJob[0] || null;

    report.models.push(modelReport);
  }

  return report;
}
```

---

## Quick Reference Commands

### Check Model Status

```bash
sf data query --query "SELECT Id, Name, State FROM Territory2Model" --target-org $ORG
```

### Count Territories

```bash
sf data query --query "SELECT COUNT(Id) FROM Territory2 WHERE Territory2ModelId = '<id>'" --target-org $ORG
```

### Check Assignment Job

```bash
sf data query --query "SELECT Status, RecordsProcessed, RecordsFailed FROM Territory2AlignmentLog ORDER BY StartDateTime DESC LIMIT 1" --target-org $ORG
```

### Find Empty Territories

```bash
sf data query --query "SELECT Id, Name FROM Territory2 WHERE Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association) AND Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)" --target-org $ORG
```

---

## Related Runbooks

- [Runbook 7: Testing and Validation](07-testing-and-validation.md)
- [Runbook 8: Deployment and Activation](08-deployment-and-activation.md)
- [Runbook 9: Monitoring and Maintenance](09-monitoring-and-maintenance.md)
