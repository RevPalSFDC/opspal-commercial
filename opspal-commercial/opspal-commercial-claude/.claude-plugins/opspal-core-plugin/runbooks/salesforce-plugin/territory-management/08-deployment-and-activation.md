# Runbook 8: Deployment and Activation

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Developers, Release Managers

---

## Table of Contents

1. [Deployment Methods](#deployment-methods)
2. [Metadata Deployment](#metadata-deployment)
3. [Model State Transitions](#model-state-transitions)
4. [Activation Process](#activation-process)
5. [Rollback Procedures](#rollback-procedures)
6. [Production Checklist](#production-checklist)

---

## Deployment Methods

### Method Comparison

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| Metadata API | Full model deployment | Version controlled, repeatable | Complex package structure |
| Data API | Incremental changes | Quick, targeted | No version control |
| Change Sets | Sandbox to prod | UI-based | Manual, limited tracking |
| CLI (sf) | Development | Fast iteration | Requires CLI setup |

### Recommended Approach by Scenario

| Scenario | Method |
|----------|--------|
| New model implementation | Metadata API |
| Add territories to existing model | Data API |
| Update territory properties | Data API |
| Clone model for new fiscal year | UI + Metadata API |
| Emergency fix | Data API |

---

## Metadata Deployment

### Package Structure

```
force-app/main/default/
├── territory2Models/
│   └── FY2026/
│       ├── FY2026.territory2Model-meta.xml
│       ├── rules/
│       │   ├── US_West_Accounts.territory2Rule-meta.xml
│       │   └── Enterprise_Accounts.territory2Rule-meta.xml
│       └── territories/
│           ├── Global.territory2-meta.xml
│           ├── North_America.territory2-meta.xml
│           └── US_West.territory2-meta.xml
└── territory2Types/
    ├── Global.territory2Type-meta.xml
    ├── Region.territory2Type-meta.xml
    └── Territory.territory2Type-meta.xml
```

### Territory2Model Metadata

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Territory2Model xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>FY2026</name>
    <developerName>FY2026</developerName>
    <description>Fiscal Year 2026 Territory Model</description>
</Territory2Model>
```

### Territory2 Metadata

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Territory2 xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>US West</name>
    <developerName>US_West</developerName>
    <territory2Model>FY2026</territory2Model>
    <territory2Type>Region</territory2Type>
    <parentTerritory2>North_America</parentTerritory2>
    <accountAccessLevel>Edit</accountAccessLevel>
    <opportunityAccessLevel>Edit</opportunityAccessLevel>
    <caseAccessLevel>Read</caseAccessLevel>
    <contactAccessLevel>Read</contactAccessLevel>
    <description>Western United States region</description>
</Territory2>
```

### Territory2Type Metadata

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Territory2Type xmlns="http://soap.sforce.com/2006/04/metadata">
    <developerName>Region</developerName>
    <masterLabel>Region</masterLabel>
    <priority>2</priority>
    <description>Geographic region territory type</description>
</Territory2Type>
```

### Territory2Rule Metadata

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Territory2Rule xmlns="http://soap.sforce.com/2006/04/metadata">
    <active>true</active>
    <booleanFilter>1 AND 2</booleanFilter>
    <developerName>US_West_Accounts</developerName>
    <masterLabel>US West Accounts</masterLabel>
    <objectType>Account</objectType>
    <ruleItems>
        <field>BillingCountry</field>
        <operation>equals</operation>
        <value>United States</value>
    </ruleItems>
    <ruleItems>
        <field>BillingState</field>
        <operation>equals</operation>
        <value>California;Oregon;Washington</value>
    </ruleItems>
</Territory2Rule>
```

### package.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>Territory2Type</name>
    </types>
    <types>
        <members>FY2026</members>
        <name>Territory2Model</name>
    </types>
    <types>
        <members>FY2026.Global</members>
        <members>FY2026.North_America</members>
        <members>FY2026.US_West</members>
        <name>Territory2</name>
    </types>
    <types>
        <members>FY2026.US_West_Accounts</members>
        <name>Territory2Rule</name>
    </types>
    <version>62.0</version>
</Package>
```

### Deploy Command

```bash
# Validate only (dry run)
sf project deploy start \
  --source-dir force-app/main/default/territory2Models \
  --source-dir force-app/main/default/territory2Types \
  --target-org $ORG \
  --dry-run

# Deploy
sf project deploy start \
  --source-dir force-app/main/default/territory2Models \
  --source-dir force-app/main/default/territory2Types \
  --target-org $ORG \
  --wait 30
```

---

## Model State Transitions

### State Diagram

```
┌─────────────┐
│  Planning   │ ← Initial state
└──────┬──────┘
       │ Activate
       ▼
┌─────────────┐
│   Active    │ ← Only one model can be active
└──────┬──────┘
       │ Archive
       ▼
┌─────────────┐
│  Archived   │ ← Read-only, can be deleted
└─────────────┘

┌─────────────┐
│   Cloning   │ ← Temporary state during clone
└─────────────┘
```

### Valid Transitions

| From | To | Method |
|------|------|--------|
| Planning | Active | Activate (requires API/Apex) |
| Active | Archived | Archive in UI |
| Archived | (delete) | Delete in UI |
| Any | Cloning | Clone operation |

### State Restrictions

| State | Can Modify Structure? | Can Modify Assignments? | Can Delete? |
|-------|----------------------|------------------------|-------------|
| Planning | Yes | Yes | Yes |
| Active | Limited | Yes | No |
| Archived | No | No | Yes |
| Cloning | No | No | No |

---

## Activation Process

### Pre-Activation Requirements

1. Model must be in **Planning** state
2. Model must have at least one territory
3. No circular references in hierarchy
4. No orphaned territories
5. Territory types must have valid priorities

### Activation via Custom Apex (Recommended)

Since there's no direct REST API for activation, use custom Apex:

```apex
@RestResource(urlMapping='/territory/activate/*')
global with sharing class Territory2ModelActivator {

    @HttpPost
    global static ActivationResult activateModel() {
        RestRequest req = RestContext.request;
        String modelId = req.requestURI.substring(
            req.requestURI.lastIndexOf('/') + 1
        );

        ActivationResult result = new ActivationResult();

        try {
            // Validate model exists and is in Planning state
            Territory2Model model = [
                SELECT Id, Name, State
                FROM Territory2Model
                WHERE Id = :modelId
                LIMIT 1
            ];

            if (model.State != 'Planning') {
                result.success = false;
                result.message = 'Model must be in Planning state to activate';
                return result;
            }

            // Check for existing active model
            List<Territory2Model> activeModels = [
                SELECT Id, Name
                FROM Territory2Model
                WHERE State = 'Active'
            ];

            if (!activeModels.isEmpty()) {
                result.success = false;
                result.message = 'Another model is already active: ' +
                    activeModels[0].Name;
                return result;
            }

            // Validate hierarchy
            Integer cycleCount = [
                SELECT COUNT()
                FROM Territory2
                WHERE Territory2ModelId = :modelId
                AND ParentTerritory2Id != null
                AND ParentTerritory2.Territory2ModelId != :modelId
            ];

            if (cycleCount > 0) {
                result.success = false;
                result.message = 'Model has invalid parent references';
                return result;
            }

            // Activate the model
            model.State = 'Active';
            update model;

            result.success = true;
            result.message = 'Model activated successfully';
            result.modelId = model.Id;
            result.modelName = model.Name;

        } catch (Exception e) {
            result.success = false;
            result.message = 'Activation failed: ' + e.getMessage();
        }

        return result;
    }

    global class ActivationResult {
        global Boolean success;
        global String message;
        global String modelId;
        global String modelName;
    }
}
```

### Call Activation Endpoint

```bash
# Activate model via custom endpoint
curl -X POST "https://<instance>.salesforce.com/services/apexrest/territory/activate/<model_id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

### Post-Activation Steps

1. **Verify Model State**

```sql
SELECT Id, Name, State FROM Territory2Model WHERE Id = '<model_id>'
```

2. **Run Assignment Rules** (if configured)
   - Navigate to Setup > Territories > Run Assignment Rules
   - Or trigger via scheduled job

3. **Verify Sharing Recalculation**

```sql
-- Check for pending sharing calculations
SELECT Id, Territory2ModelId, Status
FROM Territory2AlignmentLog
WHERE Territory2ModelId = '<model_id>'
ORDER BY CreatedDate DESC
LIMIT 5
```

4. **Test User Access**
   - Log in as test users
   - Verify account visibility
   - Check opportunity access

---

## Rollback Procedures

### Rollback Scenarios

| Scenario | Rollback Method |
|----------|-----------------|
| Wrong territories deployed | Delete and redeploy |
| Wrong assignments | Bulk delete assignments |
| Model activated prematurely | Archive and activate previous |
| Performance issues | Archive model |

### Rollback Active Model

**Note**: You cannot directly deactivate an active model. You must archive it.

```javascript
// 1. Archive current model
async function archiveModel(modelId) {
  // First verify it's active
  const model = await query(`
    SELECT Id, State FROM Territory2Model WHERE Id = '${modelId}'
  `);

  if (model[0].State !== 'Active') {
    throw new Error('Model must be Active to archive');
  }

  // Archive via update
  await update('Territory2Model', modelId, { State: 'Archived' });

  return { success: true, previousState: 'Active', newState: 'Archived' };
}
```

### Rollback Territory Changes

```javascript
async function rollbackTerritoryChanges(modelId, checkpoint) {
  // checkpoint = { territories: [...], assignments: [...] }

  // 1. Get current state
  const current = await query(`
    SELECT Id, Name, DeveloperName, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const currentMap = new Map(current.map(t => [t.DeveloperName, t]));

  // 2. Restore deleted territories
  for (const t of checkpoint.territories) {
    if (!currentMap.has(t.DeveloperName)) {
      await create('Territory2', {
        Name: t.Name,
        DeveloperName: t.DeveloperName,
        Territory2ModelId: modelId,
        Territory2TypeId: t.Territory2TypeId,
        ParentTerritory2Id: t.ParentTerritory2Id,
        AccountAccessLevel: t.AccountAccessLevel,
        OpportunityAccessLevel: t.OpportunityAccessLevel,
        CaseAccessLevel: t.CaseAccessLevel
      });
    }
  }

  // 3. Delete new territories (reverse order)
  const checkpointNames = new Set(checkpoint.territories.map(t => t.DeveloperName));
  const toDelete = current.filter(t => !checkpointNames.has(t.DeveloperName));

  for (const t of toDelete.reverse()) {
    await deleteTerritorySafe(t.Id);
  }

  return { restored: checkpoint.territories.length, deleted: toDelete.length };
}
```

### Emergency Deactivation

If you need to urgently deactivate territory management:

1. **Archive the active model** (removes access implications)
2. **Do NOT delete** - keep for audit trail
3. **Communicate to users** about temporary loss of territory-based access

```bash
# Archive active model
sf data update record --sobject Territory2Model \
  --record-id '<model_id>' \
  --values "State='Archived'" \
  --target-org $ORG
```

---

## Production Checklist

### Pre-Deployment Checklist

- [ ] **Environment Verified**
  - [ ] Deploying to correct org
  - [ ] User has Manage Territories permission
  - [ ] Territory Management feature enabled

- [ ] **Model Validated**
  - [ ] No circular references
  - [ ] No orphaned territories
  - [ ] All required fields populated
  - [ ] DeveloperNames are unique

- [ ] **Hierarchy Reviewed**
  - [ ] Structure matches design document
  - [ ] Depth is reasonable (<=5 levels)
  - [ ] Access levels appropriate per tier

- [ ] **Assignments Planned**
  - [ ] User assignment list ready
  - [ ] Account assignment rules configured
  - [ ] Exclusions documented

- [ ] **Testing Complete**
  - [ ] Sandbox testing passed
  - [ ] Access levels verified
  - [ ] Assignment rules tested

- [ ] **Rollback Plan Ready**
  - [ ] Checkpoint created
  - [ ] Rollback procedure documented
  - [ ] Responsible person identified

### Deployment Steps

1. **Create Checkpoint**

```javascript
async function createCheckpoint(modelId) {
  const territories = await query(`
    SELECT Id, Name, DeveloperName, ParentTerritory2Id,
           Territory2TypeId, AccountAccessLevel,
           OpportunityAccessLevel, CaseAccessLevel
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  const userAssignments = await query(`
    SELECT UserId, Territory2Id, RoleInTerritory2
    FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `);

  const accountAssignments = await query(`
    SELECT ObjectId, Territory2Id, AssociationCause
    FROM ObjectTerritory2Association ota
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
  `);

  return {
    timestamp: new Date().toISOString(),
    modelId,
    territories,
    userAssignments,
    accountAssignments
  };
}
```

2. **Deploy Metadata**

```bash
sf project deploy start \
  --source-dir force-app/main/default/territory2Models \
  --source-dir force-app/main/default/territory2Types \
  --target-org $ORG \
  --wait 30
```

3. **Verify Deployment**

```sql
SELECT Id, Name, DeveloperName, State
FROM Territory2Model
WHERE DeveloperName = 'FY2026'
```

4. **Execute User Assignments**

```bash
sf data import bulk \
  --sobject UserTerritory2Association \
  --file user_assignments.csv \
  --target-org $ORG
```

5. **Activate Model** (if ready)

```bash
curl -X POST "https://<instance>.salesforce.com/services/apexrest/territory/activate/<model_id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

6. **Run Assignment Rules**
   - Navigate to Setup > Territories
   - Click "Run Assignment Rules"

7. **Verify Success**

```sql
-- Check model state
SELECT Id, Name, State FROM Territory2Model WHERE Id = '<model_id>'

-- Check territory count
SELECT COUNT(Id) FROM Territory2 WHERE Territory2ModelId = '<model_id>'

-- Check user assignments
SELECT COUNT(Id) FROM UserTerritory2Association uta
JOIN Territory2 t ON uta.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'

-- Check account assignments
SELECT COUNT(Id) FROM ObjectTerritory2Association ota
JOIN Territory2 t ON ota.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
```

### Post-Deployment Checklist

- [ ] Model state is Active
- [ ] All territories created
- [ ] User assignments complete
- [ ] Account assignments initiated
- [ ] Assignment rule job running/complete
- [ ] Test users confirmed access
- [ ] Stakeholders notified
- [ ] Checkpoint archived for rollback

---

## Related Runbooks

- [Runbook 7: Testing and Validation](07-testing-and-validation.md)
- [Runbook 9: Monitoring and Maintenance](09-monitoring-and-maintenance.md)
- [Runbook 10: Troubleshooting Guide](10-troubleshooting-guide.md)
