# Error Recovery Patterns

## Common Deployment Errors

### Field History Tracking Limit

**Error:** `You have exceeded the maximum number of tracking fields for this object`

**Cause:** Object has 20+ fields with history tracking enabled (hard limit)

**Recovery:**
```bash
# Query current count
sf data query --query "SELECT COUNT() FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = 'Account'
  AND IsFieldHistoryTracked = true" --use-tooling-api

# Identify tracked fields
sf data query --query "SELECT DeveloperName FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = 'Account'
  AND IsFieldHistoryTracked = true" --use-tooling-api
```

**Fix:**
1. Disable tracking on less critical fields
2. Remove new tracking request from deployment
3. Re-evaluate which fields truly need history

### Picklist Formula Validation Error

**Error:** `Error in formula: Invalid function ISBLANK on picklist field`

**Cause:** Using ISBLANK() or ISNULL() on picklist fields

**Recovery:**
```javascript
// Find and replace in formula
// ❌ Before
ISBLANK(Status__c)

// ✅ After
TEXT(Status__c) = ""
```

**Prevention:** Run picklist formula validation before deployment

### Flow .CurrentItem Syntax Error

**Error:** `Unknown variable: $CurrentItem`

**Cause:** Using `$CurrentItem` instead of `{!loopVar.CurrentItem}`

**Recovery:**
```bash
# Auto-fix with validator
node scripts/lib/flow-xml-validator.js <flow.xml> --fix
```

**Pattern:**
```xml
<!-- ❌ Wrong -->
<value>$CurrentItem.Status__c</value>

<!-- ✅ Correct -->
<value>{!loopVar.Status__c}</value>
```

### Field Deletion - Active Dependencies

**Error:** `Cannot delete field: Referenced in [automation]`

**Cause:** Field is referenced in flows, validation rules, or formulas

**Recovery:**
```bash
# Identify all references
node scripts/lib/metadata-dependency-analyzer.js <org> <object> <field>
```

**Fix Order:**
1. Update/delete dependent automation first
2. Deploy automation changes
3. Then deploy field deletion
4. Never delete field before dependencies removed

### Metadata Conflict

**Error:** `Conflict detected: [metadata type] was modified by another user`

**Cause:** Concurrent deployments, metadata lock conflicts

**Recovery:**
1. Refresh local metadata from org
2. Merge changes manually
3. Re-deploy with updated metadata

**Prevention:**
- Use runbook context to check for active deployments
- Schedule deployments during low-activity windows

### Apex Test Coverage

**Error:** `Code coverage is less than 75%`

**Cause:** Insufficient test coverage for production deployment

**Recovery:**
```bash
# Check current coverage
sf apex run test --code-coverage --synchronous --target-org <org>

# Identify uncovered classes
sf data query --query "SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered
  FROM ApexCodeCoverageAggregate WHERE NumLinesUncovered > 0" --use-tooling-api
```

**Fix:**
1. Write additional test methods
2. Cover edge cases
3. Re-run tests before deployment

## Validation Rule Conflicts

**Error:** `Validation rule [name] prevents save`

**Detection:**
```javascript
const { OOODependencyEnforcer } = require('./scripts/lib/ooo-dependency-enforcer');

const enforcer = new OOODependencyEnforcer(orgAlias);
const validation = await enforcer.validateDataWrites({
  object: 'Account',
  payload: { Name: 'Test', Industry: 'Technology' }
});

if (!validation.passed) {
  validation.violations.forEach(v => {
    console.log(`Rule: ${v.ruleName}`);
    console.log(`Condition: ${v.condition}`);
    console.log(`Fix: ${v.remediation}`);
  });
}
```

**Recovery:**
1. Temporarily deactivate conflicting rule
2. Deploy changes
3. Reactivate rule

**OR** adjust payload to satisfy rule

## Rollback Patterns

### Quick Rollback

```bash
# If deployment just completed and needs rollback
sf project deploy cancel --job-id <deployment-job-id>
```

### Full Rollback

```bash
# Create rollback package from backup
cp backups/pre-deploy-backup.xml package.xml

# Deploy rollback package
sf project deploy start --manifest package.xml --target-org <org>
```

### Partial Rollback

```javascript
// Rollback specific metadata only
const rollbackItems = [
  'flows/AccountValidation.flow-meta.xml',
  'objects/Account/fields/Status__c.field-meta.xml'
];

await deployFromBackup(rollbackItems, backupPath, orgAlias);
```

## Recovery Decision Tree

```
Deployment Failed?
├─ Error: Field History Tracking Limit
│  └─ Disable tracking on other fields → Retry
│
├─ Error: Formula Validation
│  └─ Fix picklist function usage → Retry
│
├─ Error: Flow Syntax
│  └─ Run flow-xml-validator --fix → Retry
│
├─ Error: Field Dependencies
│  └─ Deploy dependency updates first → Then field change
│
├─ Error: Metadata Conflict
│  └─ Refresh + Merge → Retry
│
├─ Error: Test Coverage
│  └─ Add tests → Run tests → Retry
│
├─ Error: Validation Rule Block
│  └─ Adjust payload OR deactivate rule → Retry
│
└─ Unknown Error
   └─ Check deployment status → Review debug logs → Escalate
```

## Post-Failure Analysis

After any deployment failure:

1. **Capture State**
   ```bash
   sf project deploy report --job-id <job-id> > failure-report.txt
   ```

2. **Analyze Error**
   ```bash
   grep -i "error" failure-report.txt
   ```

3. **Check Runbook for Known Issues**
   ```bash
   node scripts/lib/runbook-context-extractor.js \
     --org <org> --operation-type deployment
   ```

4. **Document for Future Prevention**
   - Add to runbook if recurring issue
   - Update validation scripts if new pattern discovered
