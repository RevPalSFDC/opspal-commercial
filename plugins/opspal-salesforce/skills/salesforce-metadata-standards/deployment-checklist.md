# Pre-Deployment Checklist

## MANDATORY Validation

Run before EVERY deployment:

```bash
node scripts/sfdc-pre-deployment-validator.js [org-alias] [deployment-path]
```

This catches 80% of deployment failures.

---

## Critical Checks

### 1. Field History Tracking Limits

**Limit**: Maximum 20 fields per object (HARD LIMIT)

```bash
# Query current count
sf data query --query "SELECT COUNT() FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = 'Account'
  AND IsFieldHistoryTracked = true" --use-tooling-api
```

**If adding tracked fields**: Verify count + new fields ≤ 20

**Resolution**: Remove tracking from less critical fields first

---

### 2. Picklist Formula Validation

**Common Error**: Using ISBLANK/ISNULL on picklist fields

```javascript
// ❌ WILL FAIL DEPLOYMENT
ISBLANK(Status__c)
ISNULL(Priority__c)

// ✅ CORRECT
TEXT(Status__c) = ""
ISPICKVAL(Status__c, "")
```

**Automated Check**:
```bash
grep -r "ISBLANK\|ISNULL" force-app/ --include="*.xml" | grep -i picklist
```

---

### 3. Object Relationship Verification

**Problem**: Wrong object references (e.g., QuoteLineItem vs OpportunityLineItem)

**Verification**:
```bash
# Check object exists and is accessible
sf sobject describe QuoteLineItem
sf sobject describe OpportunityLineItem
```

**Common Confusions**:
| Object A | Object B | Difference |
|----------|----------|------------|
| `Quote` | `SBQQ__Quote__c` | Standard vs CPQ |
| `QuoteLineItem` | `SBQQ__QuoteLine__c` | Standard vs CPQ |
| `Opportunity` | `OpportunityLineItem` | Parent vs Child |

---

### 4. API Version Consistency

**Current Standard**: v62.0

**Check**:
```bash
grep -r "apiVersion" force-app/ --include="*-meta.xml" | sort | uniq
```

**All files should show same version**. Mixed versions can cause issues.

---

### 5. Apex Test Coverage

**Requirement**: Minimum 75% code coverage for production

```bash
# Run tests with coverage
sf apex run test --code-coverage --result-format human

# Check overall coverage
sf apex get test --code-coverage
```

**If below 75%**: Deployment to production will fail

---

### 6. Dependency Validation

**Check required metadata exists**:

```bash
# Validate package.xml includes all dependencies
sf project deploy validate --manifest package.xml --target-org [org]
```

**Common missing dependencies**:
- Custom fields referenced in formulas
- Apex classes referenced in Flows
- Permission sets for new objects
- Record types for layouts

---

## Deployment Source Validation

### Structure Check

```bash
node scripts/lib/deployment-source-validator.js validate-source ./force-app
```

**Expected structure**:
```
force-app/
└── main/
    └── default/
        ├── classes/
        ├── flows/
        ├── objects/
        ├── permissionsets/
        └── ...
```

### Common Structure Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "No source-backed components" | Wrong directory structure | Move to force-app/main/default/ |
| "Duplicate component" | Same file in multiple locations | Remove duplicate |
| "Invalid metadata type" | File in wrong folder | Move to correct folder |

---

## SOQL Query Validation

### Mixed Operators in OR Conditions

```sql
-- ❌ WILL FAIL - Mixed = and LIKE
WHERE Type = 'Renewal' OR Type LIKE '%Renew%'

-- ✅ CORRECT - All same operator type
WHERE Type IN ('Renewal') OR Type LIKE '%Renew%'
WHERE Type LIKE 'Renewal' OR Type LIKE '%Renew%'
```

### Tooling API Requirements

**Objects requiring `--use-tooling-api`**:
- `FlexiPage`
- `Layout`
- `FlowVersionView`
- `FieldDefinition`
- `EntityDefinition`
- `ApexClass`
- `ApexTrigger`

```bash
# ✅ CORRECT
sf data query --query "SELECT DeveloperName FROM FlexiPage" --use-tooling-api

# ❌ WRONG - Will return 0 results
sf data query --query "SELECT DeveloperName FROM FlexiPage"
```

### FlowVersionView Special Case

```sql
-- ❌ WRONG - ApiName doesn't exist
SELECT ApiName FROM FlowVersionView

-- ✅ CORRECT - Use DeveloperName
SELECT DeveloperName FROM FlowVersionView
```

---

## Permission Verification

### FLS Check

Before deploying fields:
```bash
# Verify profile has access
sf data query --query "SELECT Field, PermissionsRead, PermissionsEdit
  FROM FieldPermissions
  WHERE SobjectType = 'Account'
  AND ParentId IN (SELECT Id FROM PermissionSet WHERE Name = 'Admin')"
```

### Object Access Check

```bash
# Verify object permissions
sf data query --query "SELECT SobjectType, PermissionsRead, PermissionsCreate
  FROM ObjectPermissions
  WHERE ParentId IN (SELECT Id FROM Profile WHERE Name = 'System Administrator')"
```

---

## Environment Checks

### Org Connection

```bash
# Verify connection
sf org display --target-org [org-alias]

# List available orgs
sf org list
```

### Sandbox vs Production

| Check | Sandbox | Production |
|-------|---------|------------|
| Test Coverage Required | No | Yes (75%+) |
| Deployment Validation | Optional | Required |
| Quick Deploy | Yes (24hr) | Yes (24hr) |

---

## Pre-Deployment Checklist Template

```markdown
## Deployment: [Feature Name]
**Date**: [YYYY-MM-DD]
**Target Org**: [org-alias]
**Deployer**: [Name]

### Validation Checks

- [ ] Pre-deployment validator passed
- [ ] Field history tracking under limit
- [ ] No picklist formula errors
- [ ] Object relationships verified
- [ ] API version consistent (v62.0)
- [ ] Apex test coverage ≥ 75%
- [ ] All dependencies included
- [ ] Source structure valid
- [ ] SOQL queries validated
- [ ] Permissions verified

### Deployment Steps

1. [ ] Run validation deployment
2. [ ] Review validation results
3. [ ] Execute quick deploy (if validation passed)
4. [ ] Verify deployment success
5. [ ] Run post-deployment tests

### Rollback Plan

**If deployment fails**:
1. [Rollback step 1]
2. [Rollback step 2]
3. [Rollback step 3]

### Sign-off

- [ ] Developer verified
- [ ] Reviewer approved
- [ ] Deployment complete
```

---

## Post-Deployment Verification

### Verify Metadata Deployed

```bash
# Check specific component
sf data query --query "SELECT DeveloperName, Status
  FROM FlowVersionView
  WHERE MasterLabel = '[Flow Name]'" --use-tooling-api
```

### Run Smoke Tests

```bash
# Run specific test class
sf apex run test --tests [TestClassName] --target-org [org]
```

### Check Permissions Applied

```bash
# Verify permission set assignments
sf data query --query "SELECT Assignee.Name, PermissionSet.Name
  FROM PermissionSetAssignment
  WHERE PermissionSet.Name = '[PermissionSetName]'"
```
