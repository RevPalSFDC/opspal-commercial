# Runbook 6: Account Assignment Patterns

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Sales Operations

---

## Table of Contents

1. [Assignment Methods](#assignment-methods)
2. [Manual Assignments](#manual-assignments)
3. [Assignment Rules](#assignment-rules)
4. [Exclusions](#exclusions)
5. [Multi-Territory Accounts](#multi-territory-accounts)
6. [Opportunity Territory Assignment](#opportunity-territory-assignment)

---

## Assignment Methods

### ObjectTerritory2Association

Links accounts (or leads) to territories.

| Field | Required | Description |
|-------|----------|-------------|
| ObjectId | Yes | Account or Lead ID |
| Territory2Id | Yes | Target territory |
| AssociationCause | Yes | How it was assigned |

### Association Causes

| Cause | Description | Created By |
|-------|-------------|------------|
| `Territory2Manual` | Manual assignment | Admin/API |
| `Territory2Rule` | Assignment rule | System |
| `Territory2Api` | Programmatic | API/Apex |

---

## Manual Assignments

### Create Assignment

```bash
sf data create record --sobject ObjectTerritory2Association \
  --values "ObjectId='001...' Territory2Id='0MI...' AssociationCause='Territory2Manual'" \
  --target-org $ORG
```

### Check for Existing Assignment

```sql
SELECT Id FROM ObjectTerritory2Association
WHERE ObjectId = '<account_id>' AND Territory2Id = '<territory_id>'
```

### Full Pattern with Validation

```javascript
async function assignAccountToTerritory(orgAlias, accountId, territoryId) {
  // 1. Validate account exists
  const account = await query(`
    SELECT Id, Name FROM Account WHERE Id = '${accountId}'
  `);
  if (account.length === 0) throw new Error('Account not found');

  // 2. Validate territory exists
  const territory = await query(`
    SELECT Id, Name FROM Territory2 WHERE Id = '${territoryId}'
  `);
  if (territory.length === 0) throw new Error('Territory not found');

  // 3. Check for exclusion
  const exclusion = await query(`
    SELECT Id FROM Territory2ObjectExclusion
    WHERE ObjectId = '${accountId}' AND Territory2Id = '${territoryId}'
  `);
  if (exclusion.length > 0) {
    return { action: 'blocked', reason: 'Account excluded from territory' };
  }

  // 4. Check for existing assignment
  const existing = await query(`
    SELECT Id FROM ObjectTerritory2Association
    WHERE ObjectId = '${accountId}' AND Territory2Id = '${territoryId}'
  `);
  if (existing.length > 0) {
    return { action: 'exists', id: existing[0].Id };
  }

  // 5. Create assignment
  const result = await create('ObjectTerritory2Association', {
    ObjectId: accountId,
    Territory2Id: territoryId,
    AssociationCause: 'Territory2Manual'
  });

  return { action: 'created', id: result.id };
}
```

### Bulk Manual Assignment

**CSV Format:**

```csv
ObjectId,Territory2Id,AssociationCause
001xxx000000001,0MIxxx000000001,Territory2Manual
001xxx000000002,0MIxxx000000001,Territory2Manual
001xxx000000003,0MIxxx000000002,Territory2Manual
```

```bash
sf data import bulk \
  --sobject ObjectTerritory2Association \
  --file account_assignments.csv \
  --target-org $ORG
```

---

## Assignment Rules

### Territory2Rule Structure

| Field | Description |
|-------|-------------|
| DeveloperName | API name |
| MasterLabel | Display name |
| Active | Is rule active |
| ObjectType | Account or Lead |
| BooleanFilter | Logic combining criteria |
| RuleItems | Individual criteria |

### Rule Metadata XML

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

### Common Rule Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| equals | Exact match | BillingCountry = 'US' |
| notEqual | Not equal | Type != 'Competitor' |
| lessThan | Less than | AnnualRevenue < 1000000 |
| greaterThan | Greater than | AnnualRevenue > 50000000 |
| lessOrEqual | Less or equal | Employees <= 100 |
| greaterOrEqual | Greater or equal | Employees >= 500 |
| contains | Contains text | Name CONTAINS 'Corp' |
| notContain | Doesn't contain | Name NOT CONTAINS 'Test' |
| startsWith | Starts with | BillingPostalCode STARTS '90' |
| includes | In list (multi-select) | Industry INCLUDES 'Tech;Finance' |

### Boolean Filter Examples

| Filter | Logic |
|--------|-------|
| `1 AND 2` | Both criteria must match |
| `1 OR 2` | Either criteria matches |
| `(1 AND 2) OR 3` | (First AND Second) OR Third |
| `1 AND (2 OR 3)` | First AND (Second OR Third) |

### Running Assignment Rules

Assignment rules run:
1. **Automatically**: When account is created/updated (if enabled)
2. **Manually**: Via Setup UI "Run Assignment Rules"
3. **Scheduled**: Via scheduled job (if configured)

**Note**: There is no direct REST API to run rules. Use UI or create custom Apex.

### Check Rule Results

```sql
-- Accounts assigned by rules
SELECT a.Name, ota.Territory2Id, ota.AssociationCause
FROM ObjectTerritory2Association ota
JOIN Account a ON ota.ObjectId = a.Id
WHERE ota.AssociationCause = 'Territory2Rule'
ORDER BY a.Name
```

---

## Exclusions

### Create Exclusion

```bash
sf data create record --sobject Territory2ObjectExclusion \
  --values "ObjectId='001...' Territory2Id='0MI...'" \
  --target-org $ORG
```

### When to Use Exclusions

| Scenario | Use Exclusion? |
|----------|----------------|
| VIP account needs special handling | Yes |
| Account matches rule but shouldn't | Yes |
| Competitor account | Maybe (or use rule criteria) |
| Temporary override | Yes (remove later) |

### Exclusion Impact

- Account will NOT be assigned to territory by rules
- Existing assignment (if any) remains
- Manual assignment still possible

### Remove Exclusion

```bash
# Find exclusion ID
sf data query --query "SELECT Id FROM Territory2ObjectExclusion WHERE ObjectId = '001...' AND Territory2Id = '0MI...'" --target-org $ORG

# Delete
sf data delete record --sobject Territory2ObjectExclusion --record-id '0ET...' --target-org $ORG
```

### Query Exclusions

```sql
SELECT te.Id, a.Name AccountName, t.Name TerritoryName
FROM Territory2ObjectExclusion te
JOIN Account a ON te.ObjectId = a.Id
JOIN Territory2 t ON te.Territory2Id = t.Id
```

---

## Multi-Territory Accounts

### Accounts Can Be in Multiple Territories

Use cases:
- Geographic + overlay coverage
- Primary + backup territories
- Cross-functional teams

### Query Multi-Territory Accounts

```sql
SELECT ObjectId, COUNT(Territory2Id) TerritoryCount
FROM ObjectTerritory2Association
GROUP BY ObjectId
HAVING COUNT(Territory2Id) > 1
```

### Detailed Multi-Territory Report

```sql
SELECT a.Name AccountName, t.Name TerritoryName,
       ota.AssociationCause, tt.Priority
FROM ObjectTerritory2Association ota
JOIN Account a ON ota.ObjectId = a.Id
JOIN Territory2 t ON ota.Territory2Id = t.Id
JOIN Territory2Type tt ON t.Territory2TypeId = tt.Id
WHERE ota.ObjectId IN (
  SELECT ObjectId FROM ObjectTerritory2Association
  GROUP BY ObjectId HAVING COUNT(*) > 1
)
ORDER BY a.Name, tt.Priority
```

---

## Opportunity Territory Assignment

### Opportunity.Territory2Id Field

Opportunities have a `Territory2Id` field that can be set:
- Manually
- By filter-based opportunity assignment

### Filter-Based Opportunity Territory Assignment

When enabled, Salesforce runs an Apex filter to assign opportunities to territories.

**Default Behavior**: Assigns to highest priority territory of the account.

### Query Opportunity Territory Assignment

```sql
SELECT o.Name, o.Territory2Id, t.Name TerritoryName
FROM Opportunity o
LEFT JOIN Territory2 t ON o.Territory2Id = t.Id
WHERE o.AccountId = '<account_id>'
```

### Manual Opportunity Territory Update

```bash
sf data update record --sobject Opportunity \
  --record-id '006...' \
  --values "Territory2Id='0MI...'" \
  --target-org $ORG
```

---

## Coverage Metrics

### Assignment Summary

```sql
SELECT
  COUNT(DISTINCT ota.ObjectId) AssignedAccounts,
  COUNT(ota.Id) TotalAssignments,
  COUNT(DISTINCT ota.Territory2Id) TerritoriesWithAccounts
FROM ObjectTerritory2Association ota
JOIN Territory2 t ON ota.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
```

### Assignment Cause Breakdown

```sql
SELECT AssociationCause, COUNT(Id) cnt
FROM ObjectTerritory2Association ota
JOIN Territory2 t ON ota.Territory2Id = t.Id
WHERE t.Territory2ModelId = '<model_id>'
GROUP BY AssociationCause
```

### Territories Without Accounts

```sql
SELECT Id, Name
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
AND Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)
```

### Accounts Without Territory

```sql
SELECT Id, Name
FROM Account
WHERE Id NOT IN (SELECT ObjectId FROM ObjectTerritory2Association)
LIMIT 100
```

---

## Related Runbooks

- [Runbook 5: User Assignment Strategies](05-user-assignment-strategies.md)
- [Runbook 7: Testing and Validation](07-testing-and-validation.md)
- [Runbook 8: Deployment and Activation](08-deployment-and-activation.md)
