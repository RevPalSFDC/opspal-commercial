# Picklist Dependency Playbook
**Complete Guide to Salesforce Picklist Field Dependencies**

**Version**: 1.0.0
**Last Updated**: October 2025

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Getting Started](#getting-started)
4. [Complete Workflows](#complete-workflows)
5. [Advanced Scenarios](#advanced-scenarios)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)
8. [Reference](#reference)

---

## Introduction

### What Are Picklist Dependencies?

Picklist dependencies allow one picklist field (the **controlling field**) to filter the available values in another picklist field (the **dependent field**) based on the selected controlling value.

**Real-World Example:**
- **Controlling Field**: Industry
  - Values: Technology, Finance, Healthcare
- **Dependent Field**: Account Type
  - When Industry = "Technology" → Show: SaaS, Hardware, Software
  - When Industry = "Finance" → Show: Banking, Insurance, Investment
  - When Industry = "Healthcare" → Show: Provider, Payer, Pharma

**Benefits:**
- Keeps picklist values relevant based on context
- Reduces user confusion (fewer irrelevant choices)
- Enforces data quality (prevents invalid combinations)
- Simplifies reporting (cleaner, more meaningful categories)

### When to Use Dependencies

**Good Use Cases:**
- ✅ Industry → Account Type (Technology companies can't be "Banking" type)
- ✅ Product Category → Product Type (Software → SaaS, PaaS, IaaS)
- ✅ Country → State/Province (USA → California, Texas, etc.)
- ✅ Department → Role (Sales → SDR, AE, CSM)
- ✅ Issue Type → Sub-Type (Bug → Critical, Major, Minor)

**Poor Use Cases:**
- ❌ Date → anything (dates aren't picklists)
- ❌ Circular dependencies (A controls B, B controls A)
- ❌ Too many levels (A controls B controls C controls D - too complex)
- ❌ Frequently changing values (use formula fields or automation instead)

---

## Core Concepts

### Anatomy of a Dependency

```xml
<!-- Dependent Field Metadata -->
<CustomField>
    <fullName>Account_Type__c</fullName>
    <label>Account Type</label>
    <type>Picklist</type>

    <!-- This makes it a dependent picklist -->
    <controllingField>Industry</controllingField>

    <!-- Values and their dependency rules -->
    <valueSet>
        <valueSetDefinition>
            <!-- Define all possible values -->
            <value>
                <fullName>SaaS</fullName>
                <label>SaaS</label>
                <isActive>true</isActive>
            </value>
            <value>
                <fullName>Banking</fullName>
                <label>Banking</label>
                <isActive>true</isActive>
            </value>

            <!-- Dependency matrix -->
            <valueSettings>
                <!-- SaaS is available when Industry = Technology -->
                <controllingFieldValue>Technology</controllingFieldValue>
                <valueName>SaaS</valueName>
            </valueSettings>
            <valueSettings>
                <!-- Banking is available when Industry = Finance -->
                <controllingFieldValue>Finance</controllingFieldValue>
                <valueName>Banking</valueName>
            </valueSettings>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

### Key Components

1. **controllingField**: The field that drives the filtering
2. **valueSettings**: The dependency matrix (maps controlling values to dependent values)
3. **valueSetDefinition**: All possible dependent values (full list)
4. **Record Type Integration**: Values must be enabled on each record type

### Dependency Matrix

The **dependency matrix** defines which dependent values are available for each controlling value:

```javascript
const dependencyMatrix = {
    'Technology': ['SaaS', 'Hardware', 'Software'],  // When Industry = Technology
    'Finance': ['Banking', 'Insurance', 'Investment'], // When Industry = Finance
    'Healthcare': ['Provider', 'Payer', 'Pharma']      // When Industry = Healthcare
};
```

**Important**:
- Dependent values can map to **multiple** controlling values (overlapping dependencies)
- Each controlling value should have **at least one** dependent value
- Dependent values **not in the matrix** won't be available for any controlling value (orphaned)

---

## Getting Started

### Prerequisites

1. **Salesforce Environment**:
   - Authenticated Salesforce org (sandbox recommended for testing)
   - Object with picklist fields (or create new ones)
   - Record types on object (if applicable)

2. **Required Tools**:
   - Node.js installed
   - Salesforce CLI (`sf`)
   - This plugin installed

3. **Environment Setup**:
   ```bash
   # Set default org
   export SF_TARGET_ORG=myorg-sandbox

   # Verify connection
   sf org display --target-org myorg-sandbox
   ```

### Quick Start: Create Your First Dependency

**Step 1**: Analyze existing fields
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-describer.js describe Account
```

**Step 2**: Create dependency
```javascript
const { PicklistDependencyManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager');

const manager = new PicklistDependencyManager({ org: 'myorg-sandbox' });

const result = await manager.createDependency({
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    dependencyMatrix: {
        'Technology': ['SaaS', 'Hardware'],
        'Finance': ['Banking', 'Insurance']
    },
    recordTypes: 'all',
    validateBeforeDeploy: true
});

console.log('Deployment ID:', result.deploymentId);
```

**Step 3**: Verify in Salesforce UI
- Open Account record
- Select Industry = "Technology"
- Check Account Type only shows SaaS, Hardware
- Change Industry = "Finance"
- Check Account Type only shows Banking, Insurance

---

## Complete Workflows

### Workflow 1: Create Simple Dependency (No Global Value Sets)

**Scenario**: Create Industry → Account Type dependency on Account object

**Prerequisites**:
- Industry field exists with values: Technology, Finance
- Account_Type__c field exists with values: SaaS, Hardware, Banking, Insurance

**Complete Code**:
```javascript
const { PicklistDependencyManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager');
const { PicklistDependencyValidator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-validator');

async function createIndustryTypeDependency() {
    const orgAlias = 'myorg-sandbox';

    console.log('Step 1: Validate configuration...');
    const validator = new PicklistDependencyValidator({ org: orgAlias });

    const dependencyMatrix = {
        'Technology': ['SaaS', 'Hardware'],
        'Finance': ['Banking', 'Insurance']
    };

    const validation = await validator.validateBeforeDeployment({
        objectName: 'Account',
        controllingFieldApiName: 'Industry',
        dependentFieldApiName: 'Account_Type__c',
        dependencyMatrix
    });

    if (!validation.canProceed) {
        console.error('Validation failed:', validation.errors);
        return;
    }

    console.log('Step 2: Create dependency...');
    const manager = new PicklistDependencyManager({ org: orgAlias });

    const result = await manager.createDependency({
        objectName: 'Account',
        controllingFieldApiName: 'Industry',
        dependentFieldApiName: 'Account_Type__c',
        dependencyMatrix,
        recordTypes: 'all'
    });

    console.log('✅ Success! Deployment ID:', result.deploymentId);

    console.log('Step 3: Verify deployment...');
    const verification = await validator.verifyDependencyDeployment({
        objectName: 'Account',
        controllingFieldApiName: 'Industry',
        dependentFieldApiName: 'Account_Type__c'
    });

    if (verification.success) {
        console.log('✅ Dependency verified and functional');
    } else {
        console.error('❌ Verification failed:', verification.message);
    }
}
```

**Expected Time**: 2-3 minutes
**Complexity**: Low

---

### Workflow 2: Create Dependency with Global Value Sets

**Scenario**: Create dependency using Global Value Sets for centralized value management

**Prerequisites**:
- None (we'll create everything)

**Complete Code**:
```javascript
const { GlobalValueSetManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/global-value-set-manager');
const { PicklistDependencyManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager');

async function createDependencyWithGlobalValueSets() {
    const orgAlias = 'myorg-sandbox';

    // Step 1: Create Global Value Sets
    console.log('Step 1: Creating Global Value Sets...');
    const gvsManager = new GlobalValueSetManager({ org: orgAlias });

    // Controlling field Global Value Set
    await gvsManager.createGlobalValueSet({
        fullName: 'Industries',
        masterLabel: 'Industries',
        description: 'Standard industry classifications',
        values: [
            { fullName: 'Technology', label: 'Technology', isActive: true },
            { fullName: 'Finance', label: 'Finance', isActive: true },
            { fullName: 'Healthcare', label: 'Healthcare', isActive: true }
        ]
    });
    console.log('  ✓ Created Industries Global Value Set');

    // Dependent field Global Value Set
    await gvsManager.createGlobalValueSet({
        fullName: 'AccountTypes',
        masterLabel: 'Account Types',
        description: 'Account type categories',
        values: [
            { fullName: 'SaaS', label: 'SaaS', isActive: true },
            { fullName: 'Hardware', label: 'Hardware', isActive: true },
            { fullName: 'Banking', label: 'Banking', isActive: true },
            { fullName: 'Insurance', label: 'Insurance', isActive: true },
            { fullName: 'Provider', label: 'Provider', isActive: true }
        ]
    });
    console.log('  ✓ Created AccountTypes Global Value Set');

    // Step 2: Create fields referencing Global Value Sets
    // Note: This would be done via Metadata API deployment
    // Create Industry field with valueSet.valueSetName = 'Industries'
    // Create Account_Type__c field with valueSet.valueSetName = 'AccountTypes'
    console.log('\nStep 2: Create fields referencing Global Value Sets');
    console.log('  → Deploy field metadata with valueSet.valueSetName references');
    console.log('  → (This step requires manual metadata deployment or field creation)');

    // Step 3: Create dependency
    console.log('\nStep 3: Creating dependency...');
    const depManager = new PicklistDependencyManager({ org: orgAlias });

    const result = await depManager.createDependency({
        objectName: 'Account',
        controllingFieldApiName: 'Industry',
        dependentFieldApiName: 'Account_Type__c',
        dependencyMatrix: {
            'Technology': ['SaaS', 'Hardware'],
            'Finance': ['Banking', 'Insurance'],
            'Healthcare': ['Provider']
        },
        recordTypes: 'all'
    });

    console.log('✅ Dependency created successfully');
    console.log('   Deployment ID:', result.deploymentId);
}
```

**Expected Time**: 5-8 minutes
**Complexity**: Medium

---

### Workflow 3: Update Existing Dependency Matrix

**Scenario**: Add new controlling value "Retail" with dependent values "Online" and "Brick and Mortar"

**Prerequisites**:
- Existing dependency already created
- New values added to controlling and dependent fields

**Complete Code**:
```javascript
const { PicklistDependencyManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager');
const { UnifiedPicklistManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/unified-picklist-manager');

async function updateDependencyMatrix() {
    const orgAlias = 'myorg-sandbox';

    // Step 1: Add new values to controlling field
    console.log('Step 1: Adding new controlling value "Retail"...');
    const picklistMgr = new UnifiedPicklistManager({ org: orgAlias });

    await picklistMgr.updatePicklistAcrossRecordTypes({
        objectName: 'Account',
        fieldApiName: 'Industry',
        valuesToAdd: ['Retail'],
        recordTypes: 'all'
    });
    console.log('  ✓ Added "Retail" to Industry field');

    // Step 2: Add new values to dependent field
    console.log('Step 2: Adding new dependent values...');

    await picklistMgr.updatePicklistAcrossRecordTypes({
        objectName: 'Account',
        fieldApiName: 'Account_Type__c',
        valuesToAdd: ['Online', 'Brick and Mortar'],
        recordTypes: 'all'
    });
    console.log('  ✓ Added "Online", "Brick and Mortar" to Account Type field');

    // Step 3: Update dependency matrix
    console.log('Step 3: Updating dependency matrix...');
    const depManager = new PicklistDependencyManager({ org: orgAlias });

    const result = await depManager.updateDependencyMatrix({
        objectName: 'Account',
        controllingFieldApiName: 'Industry',
        dependentFieldApiName: 'Account_Type__c',
        newDependencyMatrix: {
            // Existing mappings
            'Technology': ['SaaS', 'Hardware'],
            'Finance': ['Banking', 'Insurance'],
            'Healthcare': ['Provider'],
            // NEW mapping
            'Retail': ['Online', 'Brick and Mortar']
        },
        recordTypes: 'all'
    });

    console.log('✅ Dependency matrix updated');
    console.log('   Deployment ID:', result.deploymentId);
}
```

**Expected Time**: 4-6 minutes
**Complexity**: Medium

---

## Advanced Scenarios

### Scenario 1: Overlapping Dependencies

**When dependent values can map to multiple controlling values**

```javascript
const dependencyMatrix = {
    'Technology': ['Enterprise', 'SMB', 'Startup'],     // Enterprise and SMB appear here
    'Finance': ['Enterprise', 'SMB', 'Investment'],     // Enterprise and SMB also here
    'Healthcare': ['Enterprise', 'Provider', 'Payer']   // Enterprise here too
};
```

**Result**:
- When Industry = "Technology" → Account Type shows: Enterprise, SMB, Startup
- When Industry = "Finance" → Account Type shows: Enterprise, SMB, Investment
- "Enterprise" and "SMB" are available for multiple industries (this is VALID)

**Use Case**: Common account types (Enterprise, SMB) that span multiple industries

---

### Scenario 2: Exclusive Dependencies

**When each dependent value maps to only ONE controlling value**

```javascript
const dependencyMatrix = {
    'North America': ['USA', 'Canada', 'Mexico'],
    'Europe': ['UK', 'Germany', 'France'],
    'Asia': ['Japan', 'China', 'India']
};
```

**Result**: Each country is exclusive to one region

**Use Case**: Geographic hierarchies, mutually exclusive categories

---

### Scenario 3: Multi-Level Dependencies (Advanced)

**Scenario**: Product Category → Product Type, Product Type → Product Subtype

⚠️ **Warning**: Salesforce only supports **one level** of dependency (A → B). For multi-level (A → B → C), you need:
1. Create dependency A → B
2. Create separate dependency B → C
3. Users must select values in order (A, then B, then C)

**Example**:
```javascript
// Dependency 1: Product Category → Product Type
await depManager.createDependency({
    objectName: 'Product2',
    controllingFieldApiName: 'Category__c',
    dependentFieldApiName: 'Type__c',
    dependencyMatrix: {
        'Software': ['SaaS', 'PaaS', 'IaaS'],
        'Hardware': ['Server', 'Storage', 'Network']
    }
});

// Dependency 2: Product Type → Product Subtype
await depManager.createDependency({
    objectName: 'Product2',
    controllingFieldApiName: 'Type__c',
    dependentFieldApiName: 'Subtype__c',
    dependencyMatrix: {
        'SaaS': ['CRM', 'ERP', 'Marketing'],
        'PaaS': ['Database', 'Middleware', 'Integration']
    }
});
```

**User Experience**:
1. Select Category = "Software" → Type shows: SaaS, PaaS, IaaS
2. Select Type = "SaaS" → Subtype shows: CRM, ERP, Marketing

---

## Troubleshooting

### Common Errors

#### Error 1: "bad value for restricted picklist field: Account_Type__c"

**Cause**: User tried to select a dependent value that's not available for the selected controlling value

**Diagnosis**:
```bash
# Check dependency matrix
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-describer.js dependency Account Account_Type__c Industry

# Verify value is mapped to controlling value
```

**Fix**:
```javascript
// Update dependency matrix to include the value
await depManager.updateDependencyMatrix({
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    newDependencyMatrix: {
        'Technology': ['SaaS', 'Hardware', 'MissingValue'], // Add MissingValue
        // ... other mappings
    }
});
```

---

#### Error 2: "Required field missing: controllingField"

**Cause**: Dependent field metadata doesn't have `controllingField` attribute set

**Diagnosis**:
- Check field metadata XML for `<controllingField>` element
- May have been deployed without dependency configuration

**Fix**:
```javascript
// Re-create dependency using PicklistDependencyManager
// This will set controllingField attribute correctly
await depManager.createDependency({
    // ... configuration
});
```

---

#### Error 3: "Picklist values not visible on record types"

**Cause**: Record type metadata wasn't updated when dependency was created

**Diagnosis**:
```bash
# Check record type metadata
sf project retrieve start --metadata RecordType:Account.YourRecordType

# Look for picklist field in recordType XML
# Verify values are in <values> section
```

**Fix**:
```javascript
const { UnifiedPicklistManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/unified-picklist-manager');

const manager = new UnifiedPicklistManager({ org: orgAlias });

await manager.verifyAndFix({
    objectName: 'Account',
    fieldApiName: 'Account_Type__c',
    expectedValues: ['SaaS', 'Hardware', 'Banking', 'Insurance'],
    recordTypes: 'all',
    autoFix: true
});
```

---

#### Error 4: "Circular dependency detected"

**Cause**: Trying to create dependency where A controls B and B controls A

**Diagnosis**:
```javascript
// Validator will catch this
const validation = await validator.validateBeforeDeployment({
    objectName: 'Account',
    controllingFieldApiName: 'FieldA',
    dependentFieldApiName: 'FieldB',
    dependencyMatrix: { /* ... */ }
});

// Check validation.errors for circular dependency message
```

**Fix**:
- Break the circular reference
- Choose one-way dependency (either A → B or B → A, not both)
- Redesign dependency hierarchy

---

## Best Practices

### 1. Always Validate Before Deployment

```javascript
// ALWAYS run validation first
const validator = new PicklistDependencyValidator({ org: orgAlias });

const validation = await validator.validateBeforeDeployment(config);

if (!validation.canProceed) {
    console.error('Validation failed:', validation.errors);
    return; // Stop here
}

// Only proceed if validation passes
await depManager.createDependency(config);
```

**Why**: Catches 90%+ of errors before deployment, saves time and frustration

---

### 2. Test in Sandbox First

**Always:**
- Create in sandbox environment first
- Test all scenarios (each controlling value)
- Verify user experience with actual users
- Confirm reporting works correctly
- Then deploy to production

**Why**: Dependencies are complex and difficult to reverse. Testing prevents production issues.

---

### 3. Document Business Logic

```javascript
// Document WHY dependencies exist
const dependencyMatrix = {
    // Technology companies can be SaaS (cloud), Hardware (physical), or Services (consulting)
    'Technology': ['SaaS', 'Hardware', 'Services'],

    // Finance companies are Banking (consumer/commercial) or Insurance (risk management)
    // Investment requires special licensing and is handled separately
    'Finance': ['Banking', 'Insurance']
};
```

**Why**: Makes maintenance easier, clarifies business rules, helps future developers

---

### 4. Use Descriptive Field Names

**Good**:
- `Product_Category__c` → `Product_Type__c`
- `Account_Region__c` → `Account_Country__c`
- `Case_Type__c` → `Case_Subtype__c`

**Bad**:
- `Field1__c` → `Field2__c`
- `Type__c` → `SubType__c` (ambiguous)

**Why**: Clear names make dependencies self-documenting

---

### 5. Monitor for Orphaned Values

```javascript
// Validator warns about orphaned values
const validation = await validator.validateBeforeDeployment(config);

// Check warnings
if (validation.warnings.length > 0) {
    console.log('Warnings:', validation.warnings);
    // "Dependent values not mapped to any controlling value: OldValue1, OldValue2"
}
```

**Fix orphaned values**:
- Map them to appropriate controlling values, or
- Deactivate them if no longer needed

**Why**: Orphaned values are inaccessible to users (dead data)

---

### 6. Plan for Record Type Complexity

**Simple (1-3 record types)**: Deploy to 'all' automatically

**Medium (4-10 record types)**: Review which record types need which values

**Complex (10+ record types)**:
- Consider batching deployments
- May want selective record type updates
- Test performance

**Example - Selective Record Types**:
```javascript
await depManager.createDependency({
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    dependencyMatrix: { /* ... */ },
    recordTypes: ['Enterprise', 'SMB'] // Only these two
});
```

---

## Reference

### Complete API Reference

#### PicklistDependencyManager

**Methods**:
```javascript
createDependency(params)
updateDependencyMatrix(params)
validateDependencyMatrix(params)
backupFieldMetadata(objectName, fieldApiName, orgAlias)
rollbackFieldMetadata(objectName, fieldApiName, orgAlias)
```

**Key Parameters**:
- `objectName` - Salesforce object API name
- `controllingFieldApiName` - Controlling field
- `dependentFieldApiName` - Dependent field
- `dependencyMatrix` - Object mapping controlling values to dependent values
- `recordTypes` - 'all' or array of record type developer names
- `validateBeforeDeploy` - Run validation before deployment (default: true)

#### GlobalValueSetManager

**Methods**:
```javascript
createGlobalValueSet(params)
addValuesToGlobalSet(params)
updateGlobalValueSet(params)
deactivateGlobalSetValues(params)
globalValueSetExists(fullName, orgAlias)
```

**Key Parameters**:
- `fullName` - Global Value Set API name
- `masterLabel` - Display label
- `values` - Array of value objects
- `description` - Set description
- `sorted` - Whether values are alphabetically sorted

#### PicklistDependencyValidator

**Methods**:
```javascript
validateBeforeDeployment(params)
verifyDependencyDeployment(params)
validateFieldsExist(objectName, controllingField, dependentField, orgAlias)
validateFieldTypes(objectName, controllingField, dependentField, orgAlias)
validateDependencyMatrix(dependencyMatrix)
checkCircularDependency(objectName, controllingField, dependentField, orgAlias)
```

**Validation Checks**:
- Fields exist
- Field types compatible
- Controlling values exist
- Dependent values exist
- No orphaned values
- No circular dependencies
- Matrix completeness

---

### CLI Commands

```bash
# Analyze existing dependency
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-describer.js dependency <object> <dependent-field> <controlling-field>

# Create dependency (interactive)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/create-picklist-dependency-workflow.js --interactive

# Create dependency (direct)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/create-picklist-dependency-workflow.js \
  --org myorg \
  --object Account \
  --controlling Industry \
  --dependent Account_Type__c \
  --matrix '{"Technology":["SaaS","Hardware"]}'

# Dry run (validation only)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/create-picklist-dependency-workflow.js \
  --org myorg \
  --object Account \
  --controlling Industry \
  --dependent Account_Type__c \
  --matrix '{"Technology":["SaaS"]}' \
  --dry-run
```

---

### File Locations

**Core Libraries**:
- `scripts/lib/picklist-dependency-manager.js`
- `scripts/lib/global-value-set-manager.js`
- `scripts/lib/picklist-dependency-validator.js`
- `scripts/lib/unified-picklist-manager.js` (base class)
- `scripts/lib/picklist-describer.js` (analysis)

**Examples**:
- `scripts/examples/create-picklist-dependency-workflow.js`
- `scripts/examples/modify-picklist-with-recordtypes.js`

**Tests**:
- `test/unit/picklist-dependency-manager.test.js`
- `test/unit/global-value-set-manager.test.js`
- `test/unit/picklist-dependency-validator.test.js`

**Documentation**:
- `docs/PICKLIST_DEPENDENCY_PLAYBOOK.md` (this file)
- `docs/GLOBAL_VALUE_SET_GUIDE.md`
- `docs/API_METHOD_SELECTION_GUIDE.md`
- `docs/DEPENDENCY_QUICK_REFERENCE.md`

---

## FAQ

**Q: Can I remove a dependency after creating it?**
A: Yes, remove the `controllingField` attribute from dependent field metadata and redeploy.

**Q: Can dependent values map to multiple controlling values?**
A: Yes! This is called "overlapping dependencies" and is completely valid.

**Q: What happens to historical data when I create a dependency?**
A: Existing records are not affected. The dependency only applies to new selections and edits.

**Q: Do I need to update record types?**
A: Yes! `PicklistDependencyManager` handles this automatically.

**Q: Can I use this in production?**
A: Yes, but **test in sandbox first**. Dependencies are complex and hard to reverse.

**Q: What if deployment fails?**
A: `PicklistDependencyManager` includes automatic backup. Use `rollbackFieldMetadata()` to restore.

**Q: How long does deployment take?**
A: Simple dependencies: 2-3 minutes. Complex: 5-8 minutes. With Global Value Sets: +2 min/set.

---

**Version**: 1.0.0
**Maintained By**: Salesforce Plugin Team
**Last Updated**: October 2025
