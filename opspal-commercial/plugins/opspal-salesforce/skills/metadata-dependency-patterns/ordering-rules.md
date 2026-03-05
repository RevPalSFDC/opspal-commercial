# Deployment Ordering Rules

## Standard Deployment Order

Deploy components in this order to respect dependencies:

```
1. Custom Objects (without relationships)
2. Custom Fields (non-formula, non-lookup)
3. Lookup/Master-Detail Fields
4. Formula Fields
5. Validation Rules (inactive first)
6. Page Layouts
7. Record Types
8. Permission Sets
9. Profiles
10. Flows (inactive first)
11. Process Builders (inactive first)
12. Workflow Rules (inactive first)
13. Apex Classes
14. Apex Triggers
15. Lightning Components
16. Activation of Flows/Processes/Workflows
17. Activation of Validation Rules
```

## Dependency-Aware Ordering

### Analyze Before Deploy
```bash
# Determine optimal deployment order
node scripts/lib/sfdc-dependency-analyzer.js \
  --source ./force-app/main/default \
  --output deployment-order.json
```

### Generated Order Example
```json
{
  "phases": [
    {
      "phase": 1,
      "description": "Foundation - no dependencies",
      "components": ["Account.Industry__c", "Contact.Score__c"]
    },
    {
      "phase": 2,
      "description": "Dependent fields",
      "components": ["Account.Contact_Count__c"]
    },
    {
      "phase": 3,
      "description": "Logic components",
      "components": ["Account_Validation_Rule", "Contact_Update_Flow"]
    }
  ]
}
```

## Object-Level Dependencies

### Custom Objects
```
Deploy order:
1. Parent objects first
2. Child objects second
3. Junction objects last

Example:
Account (no deps) → Contact (depends on Account) → ContactRole (junction)
```

### Field Dependencies
```
Deploy order:
1. Referenced fields first
2. Lookup fields second
3. Formula fields last

Example:
Status__c (picklist) → StatusDate__c (date) → StatusFormula__c (formula using both)
```

## Automation Dependencies

### Flow Dependencies
```
Deploy order:
1. Referenced objects/fields
2. Called subflows
3. Parent flows
4. Activate in reverse order

Example:
Contact_Validation_Subflow → Account_Update_Flow → Master_Orchestrator_Flow
```

### Apex Dependencies
```
Deploy order:
1. Utility classes (no dependencies)
2. Service classes
3. Controller classes
4. Triggers
5. Test classes
```

## Conflict Resolution

### Field Already Exists
```bash
# Check if field exists
sf data query --query "SELECT Id FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' AND QualifiedApiName = 'Status__c'" --use-tooling-api

# If exists, deploy with allowPartial
sf project deploy start --source-dir ./force-app --allow-partial
```

### Type Mismatch
```
Error: Field type cannot be changed
Solution:
1. Backup data
2. Delete field
3. Recreate with new type
4. Restore data
```

### Dependency Cycle Detected
```
Error: Cannot deploy due to circular dependency
Solution:
1. Analyze cycle using dependency analyzer
2. Remove temporary dependency
3. Deploy phase 1
4. Add back dependency
5. Deploy phase 2
```

## Rollback Order

**Deploy in reverse order for rollback:**

```
1. Deactivate Flows/Processes/Workflows/Validation Rules
2. Remove Lightning Components
3. Remove Triggers
4. Remove Apex Classes
5. Reset Page Layouts
6. Remove Formula Fields
7. Remove Validation Rules
8. Remove Lookup Fields
9. Remove Standard Fields
10. Remove Custom Objects
```

### Rollback Script Pattern
```bash
# Generated rollback script
node scripts/lib/generate-rollback-script.js \
  --deployment deployment-manifest.json \
  --output rollback.sh
```
