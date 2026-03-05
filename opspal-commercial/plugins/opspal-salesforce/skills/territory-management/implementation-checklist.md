# Territory Implementation Checklist

## Pre-Implementation Gates

### Gate 1: Requirements Confirmed

- [ ] Sales leadership has approved territory structure
- [ ] Territory boundaries are clearly defined
- [ ] User-to-territory mappings documented
- [ ] Assignment rule criteria defined
- [ ] Access level requirements documented
- [ ] Rollout timeline agreed

### Gate 2: Org Readiness

- [ ] Enterprise Territory Management enabled
- [ ] User has "Manage Territories" permission
- [ ] Territory2Types exist (or defined for creation)
- [ ] No conflicting model in Cloning state
- [ ] Model limit not exceeded (max 4)
- [ ] Sandbox testing completed (if production deployment)

### Gate 3: Data Readiness

- [ ] Account data quality verified
- [ ] BillingCountry/State standardized (if geographic)
- [ ] AnnualRevenue populated (if segment-based)
- [ ] User list finalized and validated
- [ ] No inactive users in assignment list
- [ ] Account-territory mapping CSV prepared (if bulk)

### Gate 4: Technical Validation

- [ ] DeveloperNames unique and follow convention
- [ ] Parent-child relationships validated (no cycles)
- [ ] Access levels are valid values
- [ ] Assignment rule criteria tested
- [ ] Bulk import files validated (format, field names)

---

## Implementation Phases

### Phase 1: Model Setup

- [ ] Create Territory2Model (Planning state)
  ```bash
  sf data create record --sobject Territory2Model \
    --values "Name='FY2026 Model' DeveloperName='FY2026'" \
    --target-org $ORG
  ```

- [ ] Create Territory2Types (if new types needed)
  ```bash
  sf project deploy start \
    --source-dir force-app/main/default/territory2Types \
    --target-org $ORG
  ```

- [ ] Verify model created in Planning state
  ```sql
  SELECT Id, Name, State FROM Territory2Model
  WHERE DeveloperName = 'FY2026'
  ```

### Phase 2: Hierarchy Build

- [ ] Create root territories (no parent)
- [ ] Create level 2 territories
- [ ] Create level 3 territories
- [ ] Create remaining levels (top-down)

- [ ] Verify hierarchy integrity
  ```sql
  -- Check for orphans
  SELECT Id, Name FROM Territory2
  WHERE ParentTerritory2Id NOT IN (SELECT Id FROM Territory2)
  AND ParentTerritory2Id != null
  AND Territory2ModelId = '<model_id>'
  ```

### Phase 3: Assignment Rules

- [ ] Create Territory2Rules (inactive initially)
  ```bash
  sf project deploy start \
    --source-dir force-app/main/default/territory2Models/FY2026/rules \
    --target-org $ORG
  ```

- [ ] Test rules with sample accounts
- [ ] Activate rules after verification
- [ ] Run assignment rules (manual or scheduled)

### Phase 4: User Assignments

- [ ] Prepare user-territory CSV
  ```csv
  UserId,Territory2Id,RoleInTerritory2
  005xxx,0MIxxx,Sales Rep
  005yyy,0MIxxx,Sales Manager
  ```

- [ ] Bulk import user assignments
  ```bash
  sf data import bulk \
    --sobject UserTerritory2Association \
    --file user_assignments.csv \
    --target-org $ORG
  ```

- [ ] Verify user coverage
  ```sql
  SELECT Territory2Id, COUNT(UserId) userCount
  FROM UserTerritory2Association
  WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '<id>')
  GROUP BY Territory2Id
  ```

### Phase 5: Account Assignments

- [ ] Run assignment rules (if rule-based)
- [ ] Bulk import manual assignments (if needed)
- [ ] Create exclusions (if needed)

- [ ] Verify account coverage
  ```sql
  SELECT Territory2Id, COUNT(ObjectId) accountCount
  FROM ObjectTerritory2Association
  WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '<id>')
  GROUP BY Territory2Id
  ```

### Phase 6: Validation

- [ ] Verify territory count matches design
- [ ] Verify user assignment count
- [ ] Verify account assignment count
- [ ] Test user access to accounts
- [ ] Review Territory2AlignmentLog for errors
- [ ] Generate health report

### Phase 7: Activation (if new model)

- [ ] Stakeholder approval obtained
- [ ] Communication sent to users
- [ ] Backup of current active model documented

- [ ] Activate model (via UI or Apex)
  - Note: Activating archives current active model
  - This action is **irreversible** for archiving

- [ ] Verify new model is Active
  ```sql
  SELECT Name, State FROM Territory2Model
  ORDER BY State
  ```

### Phase 8: Post-Activation

- [ ] Verify user access to accounts
- [ ] Check Territory2AlignmentLog for completion
- [ ] Monitor for user-reported issues
- [ ] Document any required fixes
- [ ] Update runbook with learnings

---

## Rollback Checklist

If rollback needed:

- [ ] Identify checkpoint to restore from
- [ ] Assess impact of rollback
- [ ] Communicate to affected users
- [ ] Execute rollback (restore checkpoint)
- [ ] Verify restoration complete
- [ ] Document root cause

---

## Bulk Import CSV Templates

### Territory2 Import

```csv
Name,DeveloperName,Territory2ModelId,Territory2TypeId,ParentTerritory2Id,AccountAccessLevel,OpportunityAccessLevel,CaseAccessLevel
US West,US_West,0MCxxx,0MTxxx,,Edit,Edit,Read
California,California,0MCxxx,0MTxxx,0MIxxx,Edit,Edit,Edit
```

### UserTerritory2Association Import

```csv
UserId,Territory2Id,RoleInTerritory2
005xxx,0MIxxx,Sales Rep
005yyy,0MIyyy,Sales Manager
```

### ObjectTerritory2Association Import

```csv
ObjectId,Territory2Id,AssociationCause
001xxx,0MIxxx,Territory2Manual
001yyy,0MIyyy,Territory2Manual
```

---

## Verification Queries

### Territory Health

```sql
-- Model state
SELECT Name, State, CreatedDate FROM Territory2Model

-- Territory count by type
SELECT Territory2TypeId, COUNT(Id) cnt FROM Territory2
WHERE Territory2ModelId = '<id>'
GROUP BY Territory2TypeId

-- Hierarchy depth
SELECT ParentTerritory2Id, COUNT(Id) cnt FROM Territory2
WHERE Territory2ModelId = '<id>'
GROUP BY ParentTerritory2Id
```

### Assignment Coverage

> **SOQL Note**: COUNT(DISTINCT) is not valid in SOQL. Use subquery approach.

```sql
-- Territories with users (use subquery)
SELECT COUNT(Id) FROM Territory2
WHERE Territory2ModelId = '<id>'
AND Id IN (SELECT Territory2Id FROM UserTerritory2Association)

-- Territories without users
SELECT Id, Name FROM Territory2
WHERE Territory2ModelId = '<id>'
AND Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)

-- Assignment rule results
SELECT AssociationCause, COUNT(Id) FROM ObjectTerritory2Association
WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '<id>')
GROUP BY AssociationCause
```

### Audit Trail

```sql
-- Recent model changes
SELECT Field, OldValue, NewValue, CreatedDate, CreatedById
FROM Territory2ModelHistory
WHERE Territory2ModelId = '<id>'
ORDER BY CreatedDate DESC LIMIT 20

-- Assignment job status
SELECT Status, RecordsProcessed, RecordsFailed, StartDateTime
FROM Territory2AlignmentLog
WHERE Territory2ModelId = '<id>'
ORDER BY StartDateTime DESC LIMIT 10
```

---

## Common Issues Checklist

### Pre-Deployment Issues

- [ ] DeveloperName not unique → Change name
- [ ] Parent doesn't exist → Create parent first
- [ ] Type doesn't exist → Deploy type first
- [ ] Model is Archived → Clone to new model
- [ ] Invalid access level → Use Read/Edit/All

### Post-Deployment Issues

- [ ] Users can't see accounts → Check access levels
- [ ] Assignment rules not running → Check rule activation
- [ ] Orphaned territories → Fix parent references
- [ ] Duplicate assignments → Deduplicate
- [ ] Missing users → Add assignments

---

## Sign-Off Checklist

### Technical Sign-Off

- [ ] All territories created successfully
- [ ] Hierarchy integrity validated
- [ ] User assignments complete
- [ ] Account assignments complete
- [ ] No errors in alignment logs
- [ ] Health score acceptable (>80)

### Business Sign-Off

- [ ] Territory structure matches approved design
- [ ] Coverage meets business requirements
- [ ] User access verified by stakeholders
- [ ] Reporting requirements met
- [ ] Rollback plan documented

### Documentation Sign-Off

- [ ] Implementation documented
- [ ] Runbook updated
- [ ] Training materials created
- [ ] Support escalation path defined
