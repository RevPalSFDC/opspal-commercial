# Deployment Dependency Order

## Standard Deployment Sequence

### Phase 1: Foundation Metadata

Deploy in this order first:

1. **Custom Settings** - Required by other metadata
2. **Custom Metadata Types** - Used in configurations
3. **Custom Objects** - Before fields and relationships
4. **Custom Fields** - After objects exist
5. **Record Types** - After fields exist
6. **Picklist Values** - After record types

### Phase 2: Configuration Metadata

After foundation is stable:

7. **Page Layouts** - After fields and record types
8. **Profiles** - After layouts exist
9. **Permission Sets** - After objects and fields
10. **Sharing Rules** - After profiles

### Phase 3: Business Logic

After configuration:

11. **Validation Rules** - After fields
12. **Workflow Rules** - After fields (deprecated)
13. **Process Builders** - After fields (deprecated)
14. **Flows** - After all dependencies exist
15. **Apex Triggers** - After objects

### Phase 4: User Interface

After logic:

16. **Lightning Pages** - After page layouts
17. **Lightning Components** - After dependencies
18. **Apps** - After all UI components

## Dependency Analysis

### Use Dependency Analyzer

```bash
node scripts/lib/sfdc-dependency-analyzer.js \
  --manifest package.xml \
  --org <orgAlias> \
  --output dependency-graph.json
```

**Output:**
```json
{
  "deploymentOrder": [
    { "order": 1, "type": "CustomObject", "name": "Account" },
    { "order": 2, "type": "CustomField", "name": "Account.Status__c" },
    { "order": 3, "type": "Flow", "name": "Account_Validation" }
  ],
  "circularDependencies": [],
  "warnings": []
}
```

### Circular Dependency Detection

```javascript
const { OOODependencyEnforcer } = require('./scripts/lib/ooo-dependency-enforcer');

const enforcer = new OOODependencyEnforcer(orgAlias);
const result = await enforcer.detectCircularDependencies(manifestPath);

if (result.hasCircular) {
  console.error('Circular dependencies detected:');
  result.cycles.forEach(cycle => {
    console.error(`  ${cycle.join(' → ')}`);
  });
}
```

## Critical Dependency Patterns

### Flow Field Dependencies

Flows MUST be deployed AFTER all referenced fields exist.

**Detection:**
```javascript
// Parse flow for field references
const flowFields = await extractFlowFieldReferences(flowPath);

// Verify each field exists
for (const field of flowFields) {
  const exists = await verifyFieldExists(orgAlias, field.object, field.field);
  if (!exists) {
    throw new Error(`Flow references non-existent field: ${field.object}.${field.field}`);
  }
}
```

### Picklist Dependencies

Dependent picklists require specific order:

```
1. Deploy controlling field
2. Deploy dependent field
3. Deploy picklist value mappings
```

**Validation:**
```javascript
const validation = await enforcer.validatePicklistOrder({
  object: 'Account',
  controllingField: 'Industry',
  dependentField: 'AccountType'
});

if (!validation.controllingSetFirst) {
  throw new Error('Must deploy controlling field before dependent');
}
```

### Master-Detail Dependencies

Parent object MUST exist before child:

```
1. Deploy parent object
2. Deploy parent fields
3. Deploy child object with MD relationship
4. Deploy child fields
```

### Record Type Dependencies

Record types affect field availability:

```
1. Deploy custom fields
2. Deploy record type
3. Configure field availability per record type
4. Deploy page layouts per record type
```

## Batch Deployment Strategy

### Small Deployments (< 50 components)

Single deployment with proper ordering:

```bash
sf project deploy start --manifest package.xml --target-org <org>
```

### Medium Deployments (50-200 components)

Two-phase deployment:

```bash
# Phase 1: Foundation
sf project deploy start --manifest package-foundation.xml --target-org <org>

# Phase 2: Logic & UI
sf project deploy start --manifest package-logic.xml --target-org <org>
```

### Large Deployments (200+ components)

Multi-phase with verification:

```bash
#!/bin/bash

phases=("foundation" "configuration" "logic" "ui")

for phase in "${phases[@]}"; do
  echo "Deploying phase: $phase"

  sf project deploy start \
    --manifest "packages/package-$phase.xml" \
    --target-org <org>

  # Verify phase
  node scripts/lib/verify-deployment-phase.js "$phase" <org>

  if [ $? -ne 0 ]; then
    echo "Phase $phase failed - stopping deployment"
    exit 1
  fi

  echo "Phase $phase complete"
done
```

## Cross-Object Dependencies

### Account → Contact → Opportunity

```
Order:
1. Account (parent)
2. Contact (child of Account)
3. Opportunity (child of Account)
4. OpportunityContactRole (junction)
```

### Quote → QuoteLineItem → Product

```
Order:
1. Product2
2. PricebookEntry
3. Quote (or SBQQ__Quote__c)
4. QuoteLineItem (or SBQQ__QuoteLine__c)
```

### Custom Object Hierarchies

```
Order:
1. Parent custom object
2. Child custom objects (in dependency order)
3. Junction objects (last)
```

## Deployment Manifest Splitting

### Generate Split Manifests

```javascript
const { ManifestSplitter } = require('./scripts/lib/manifest-splitter');

const splitter = new ManifestSplitter();
const phases = await splitter.splitByDependency(
  'package.xml',
  orgAlias
);

// phases = {
//   'package-phase1.xml': ['CustomObject', 'CustomField'],
//   'package-phase2.xml': ['ValidationRule', 'Flow'],
//   'package-phase3.xml': ['Profile', 'PermissionSet']
// }

for (const [manifest, types] of Object.entries(phases)) {
  fs.writeFileSync(manifest, generatePackageXml(types));
}
```

### Verify Split Validity

```bash
# Ensure no cross-phase dependencies
node scripts/lib/verify-manifest-split.js \
  package-phase1.xml \
  package-phase2.xml \
  package-phase3.xml
```
