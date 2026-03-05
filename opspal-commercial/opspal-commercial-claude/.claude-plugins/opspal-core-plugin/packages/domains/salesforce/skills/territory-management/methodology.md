# Territory Management Methodology

## 7-Phase Workflow

### Phase 0: Pre-flight Validation

**MANDATORY before ANY territory operation**

#### Permission Check

```sql
-- Check user has Manage Territories permission
SELECT Id, PermissionsManageTerritories
FROM PermissionSet
WHERE PermissionsManageTerritories = true

-- Check Territory2 is enabled (test query)
SELECT Id FROM Territory2Model LIMIT 1
```

#### Model State Check

```sql
-- Get current model states
SELECT Id, Name, DeveloperName, State, CreatedDate
FROM Territory2Model
ORDER BY State ASC, CreatedDate DESC
```

**State Rules:**
- Planning: Full CRUD allowed
- Active: Updates and assignments allowed
- Archived: Read-only - no modifications
- Cloning: Wait for completion

#### Type Availability Check

```sql
SELECT Id, MasterLabel, DeveloperName, Priority
FROM Territory2Type
ORDER BY Priority ASC
```

---

### Phase 1: Discovery

**Goal**: Understand current territory state

#### Model Discovery

```sql
SELECT Id, Name, DeveloperName, State, Description,
       CreatedDate, LastModifiedDate
FROM Territory2Model
```

#### Hierarchy Mapping

```sql
SELECT Id, Name, DeveloperName, ParentTerritory2Id,
       Territory2ModelId, Territory2TypeId,
       AccountAccessLevel, OpportunityAccessLevel,
       CaseAccessLevel, ContactAccessLevel
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
ORDER BY ParentTerritory2Id NULLS FIRST, Name
```

#### User Coverage Analysis

```sql
-- Assignments per territory
SELECT Territory2Id, COUNT(UserId) userCount
FROM UserTerritory2Association
WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '<id>')
GROUP BY Territory2Id

-- Users in multiple territories
SELECT UserId, COUNT(Territory2Id) territoryCount
FROM UserTerritory2Association
GROUP BY UserId
HAVING COUNT(Territory2Id) > 1
```

#### Account Distribution Analysis

```sql
-- Assignments per territory
SELECT Territory2Id, COUNT(ObjectId) accountCount
FROM ObjectTerritory2Association
WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '<id>')
GROUP BY Territory2Id

-- Assignment cause breakdown
SELECT AssociationCause, COUNT(Id) cnt
FROM ObjectTerritory2Association
GROUP BY AssociationCause
```

#### Health Score Calculation

```javascript
function calculateHealth(discovery) {
  let score = 100;

  // Model health (20 pts)
  if (!discovery.hasActiveModel) score -= 20;

  // Coverage health (40 pts)
  const emptyUserPct = discovery.territoriesWithNoUsers / discovery.totalTerritories;
  score -= Math.min(20, emptyUserPct * 40);

  const emptyAccountPct = discovery.territoriesWithNoAccounts / discovery.totalTerritories;
  score -= Math.min(20, emptyAccountPct * 40);

  // Integrity health (40 pts)
  if (discovery.orphanedTerritories > 0) score -= 20;
  if (discovery.hasCycles) score -= 20;

  return { score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F' };
}
```

---

### Phase 2: Design

**Goal**: Plan territory structure

#### Hierarchy Design Decision Tree

```
What is the primary sales motion?
├── Geographic coverage → Geographic Pattern
│   └── Levels: Global → Region → Country → State → City
├── Account-based (named accounts) → Account Pattern
│   └── Levels: Segment → Vertical → Named Account
├── Both geographic and segment → Hybrid Pattern
│   └── Levels: Region + Segment → Territory
└── Product/solution focus → Product Pattern
    └── Levels: Solution Area → Product Line → Specialty
```

#### Access Level Design

| Territory Level | Account | Opportunity | Case | Contact |
|-----------------|---------|-------------|------|---------|
| Global/Region | Read | Read | Read | Read |
| Country/Segment | Edit | Edit | Read | Edit |
| Territory/Rep | Edit | Edit | Edit | Edit |
| Named Account | All | Edit | Edit | Edit |

#### Type Priority Design

```
Priority 1 (Highest): Strategic/Named Accounts
Priority 2: Enterprise
Priority 3: Major/Mid-Market
Priority 4: Commercial
Priority 5: Geographic
Priority 10+: Overlay/Specialist (lowest)
```

---

### Phase 3: Validation

**Goal**: Ensure changes are safe

#### Required Validations

1. **DeveloperName Uniqueness**
```sql
SELECT Id, DeveloperName FROM Territory2
WHERE DeveloperName = '<proposed_name>'
AND Territory2ModelId = '<model_id>'
```

2. **Parent Reference Valid**
```sql
SELECT Id FROM Territory2
WHERE Id = '<parent_id>'
AND Territory2ModelId = '<model_id>'
```

3. **Type Reference Valid**
```sql
SELECT Id FROM Territory2Type
WHERE Id = '<type_id>'
```

4. **No Circular References**
```javascript
function wouldCreateCycle(territoryId, newParentId, hierarchy) {
  let current = newParentId;
  while (current) {
    if (current === territoryId) return true;
    current = hierarchy.get(current)?.parentId;
  }
  return false;
}
```

5. **Access Levels Valid**
- AccountAccessLevel: "Read", "Edit", or "All"
- OpportunityAccessLevel: "None", "Read", or "Edit"
- CaseAccessLevel: "None", "Read", or "Edit"
- ContactAccessLevel: "None", "Read", or "Edit"

---

### Phase 4: Checkpoint

**Goal**: Enable rollback

#### Checkpoint Contents

```javascript
const checkpoint = {
  id: `ckpt_${Date.now()}`,
  timestamp: new Date().toISOString(),
  operation: operationType,
  modelId: modelId,
  territories: [/* current territory records */],
  userAssignments: [/* current user assignments */],
  accountAssignments: [/* current account assignments */]
};
```

#### Checkpoint Storage

```bash
# Store in checkpoints directory
checkpoints/{org-alias}/{checkpoint-id}.json
```

---

### Phase 5: Execution

**Goal**: Apply changes safely

#### Hierarchy Build Order (Top-Down)

```javascript
async function deployHierarchy(hierarchy) {
  // 1. Create root nodes first
  for (const root of hierarchy.roots) {
    const result = await createTerritory(root);
    idMap.set(root.developerName, result.id);
  }

  // 2. Create children level by level
  for (let level = 1; level <= maxDepth; level++) {
    for (const territory of hierarchy.getLevel(level)) {
      const parentId = idMap.get(territory.parentDeveloperName);
      territory.parentTerritory2Id = parentId;
      const result = await createTerritory(territory);
      idMap.set(territory.developerName, result.id);
    }
  }
}
```

#### Delete Order (Bottom-Up)

```javascript
async function deleteSubtree(rootId) {
  // 1. Collect all descendants (DFS)
  const toDelete = collectDescendants(rootId);

  // 2. Sort by depth descending (leaves first)
  toDelete.sort((a, b) => b.depth - a.depth);

  // 3. For each territory (bottom-up):
  for (const territory of toDelete) {
    // Remove user assignments
    await deleteUserAssignments(territory.id);
    // Remove account assignments
    await deleteAccountAssignments(territory.id);
    // Delete territory
    await deleteTerritory(territory.id);
  }
}
```

#### Bulk Operations (Chunked)

```javascript
const CHUNK_SIZE = 200;

async function bulkCreate(records) {
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    await sfBulkCreate('Territory2', chunk);
    await sleep(500); // Rate limit protection
  }
}
```

---

### Phase 6: Assignment

**Goal**: Route users and accounts

#### User Assignment

```javascript
async function assignUser(userId, territoryId, role) {
  // Check for existing
  const existing = await query(`
    SELECT Id FROM UserTerritory2Association
    WHERE UserId = '${userId}' AND Territory2Id = '${territoryId}'
  `);

  if (existing.length > 0) {
    // Update role if provided
    if (role) await update('UserTerritory2Association', existing[0].Id, { RoleInTerritory2: role });
    return { action: 'updated' };
  }

  // Create assignment
  await create('UserTerritory2Association', { UserId: userId, Territory2Id: territoryId, RoleInTerritory2: role });
  return { action: 'created' };
}
```

#### Account Assignment

```javascript
async function assignAccount(accountId, territoryId, cause = 'Territory2Manual') {
  // Check for exclusion
  const exclusion = await query(`
    SELECT Id FROM Territory2ObjectExclusion
    WHERE ObjectId = '${accountId}' AND Territory2Id = '${territoryId}'
  `);

  if (exclusion.length > 0) {
    return { action: 'blocked', reason: 'Account excluded from territory' };
  }

  // Check for existing
  const existing = await query(`
    SELECT Id FROM ObjectTerritory2Association
    WHERE ObjectId = '${accountId}' AND Territory2Id = '${territoryId}'
  `);

  if (existing.length > 0) {
    return { action: 'already_assigned' };
  }

  // Create assignment
  await create('ObjectTerritory2Association', {
    ObjectId: accountId,
    Territory2Id: territoryId,
    AssociationCause: cause
  });
  return { action: 'created' };
}
```

---

### Phase 7: Verification

**Goal**: Confirm success

#### Post-Deployment Checks

```javascript
async function verify(deployment) {
  const issues = [];

  // Check territories created
  const created = await query(`
    SELECT DeveloperName FROM Territory2
    WHERE DeveloperName IN ('${deployment.territories.join("','")}')
  `);
  if (created.length !== deployment.territories.length) {
    issues.push('Some territories were not created');
  }

  // Check no orphans
  const orphans = await query(`
    SELECT Id FROM Territory2
    WHERE ParentTerritory2Id NOT IN (SELECT Id FROM Territory2)
    AND ParentTerritory2Id != null
  `);
  if (orphans.length > 0) {
    issues.push(`${orphans.length} orphaned territories detected`);
  }

  // Check user assignments
  const userAssignments = await query(`
    SELECT COUNT(Id) cnt FROM UserTerritory2Association
    WHERE Territory2Id IN ('${deployment.territories.join("','")}')
  `);

  return {
    success: issues.length === 0,
    issues: issues,
    metrics: {
      territoriesCreated: created.length,
      userAssignments: userAssignments[0].cnt
    }
  };
}
```

#### Health Report Generation

Generate comprehensive health report including:
- Model state
- Hierarchy visualization
- User coverage metrics
- Account distribution
- Issues and recommendations
