# Picklist Dependency Deployment - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: High
**Trigger**: When user message contains: `picklist dependency`, `controlling field`, `dependent field`, `picklist cascade`, `field dependency`
**Estimated Tokens**: 3,879

---

## Overview

Complete picklist dependency management including controlling/dependent field handling. This context covers the complex workflow for creating field dependencies where one picklist field filters available values in another picklist field.

**Key Complexity**: Picklist dependencies require special metadata handling beyond standard picklist modifications, including controllingField attributes, valueSettings arrays, and atomic record type updates.

---

## 🔗 CRITICAL: Picklist Dependency Deployment Protocol (NEW - Oct 2025)

**CRITICAL**: Deploying picklist field dependencies requires special handling beyond standard picklist modifications. Use dedicated dependency management tools to ensure correct controllingField, valueSettings, and record type integration.

### What Are Picklist Dependencies?

Picklist dependencies allow one picklist field (controlling field) to filter available values in another picklist field (dependent field) based on the controlling field's selected value.

**Example:**
- **Controlling Field**: Industry (Technology, Finance, Healthcare)
- **Dependent Field**: Account Type
  - When Industry = "Technology" → Account Type shows [SaaS, Hardware, Services]
  - When Industry = "Finance" → Account Type shows [Banking, Insurance, Investment]

---

## The Dependency Deployment Complexity

**Why dependencies require special handling:**
1. **controllingField attribute** must be set in dependent field metadata
2. **valueSettings array** defines the dependency matrix (mapping)
3. **Record type metadata** must be updated for both fields atomically
4. **Deployment order** critical: Global Sets → Controlling Field → Dependent Field → Record Types
5. **Circular dependencies** must be detected and prevented

---

## API Method Selection Framework

**Decision Tree for Dependency Operations:**

```
Operation Type
    ↓
┌───────────────────────────────────────────────┐
│ What needs to be done?                        │
└───────┬──────────────────────────────────────┘
        │
    ┌───┴────────────────────────────────┐
    │                                    │
Global Value Set Operations    Field Dependency Operations
    │                                    │
    ▼                                    ▼
Use Tooling API                   Use Metadata API
    │                                    │
    ├─ Create Global Value Set          ├─ Create dependency
    ├─ Add values to set                ├─ Update dependency matrix
    ├─ Update set (full replace)        ├─ Modify valueSettings
    └─ Validate set exists              └─ Deploy field + record types
           │                                    │
           ▼                                    ▼
   GlobalValueSetManager              PicklistDependencyManager
```

**Method Selection Rules:**
1. **Global Value Sets** → Always use Tooling API (`GlobalValueSetManager`)
2. **Field Dependencies** → Always use Metadata API (`PicklistDependencyManager`)
3. **Record Type Updates** → Always use Metadata API (Tooling API is unreliable)
4. **Validation/Verification** → Use SOQL/Tooling API queries

---

## Deployment Workflow (7-Step Playbook)

**Complete dependency creation workflow:**

### Step 1: Plan and Gather Information
```javascript
// Identify fields and dependency matrix
const config = {
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    dependencyMatrix: {
        'Technology': ['SaaS', 'Hardware', 'Services'],
        'Finance': ['Banking', 'Insurance', 'Investment'],
        'Healthcare': ['Provider', 'Payer', 'Pharma']
    },
    recordTypes: 'all'  // or ['Enterprise', 'SMB']
};
```

### Step 2: Prepare Global Value Sets (if needed)
```javascript
const { GlobalValueSetManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/global-value-set-manager');
const gvsManager = new GlobalValueSetManager({ org: orgAlias });

// Only if using Global Value Sets for either field
await gvsManager.createGlobalValueSet({
    fullName: 'Industries',
    masterLabel: 'Industries',
    description: 'Standard industry values',
    values: [
        { fullName: 'Technology', label: 'Technology', isActive: true },
        { fullName: 'Finance', label: 'Finance', isActive: true },
        { fullName: 'Healthcare', label: 'Healthcare', isActive: true }
    ]
});

await gvsManager.createGlobalValueSet({
    fullName: 'AccountTypes',
    masterLabel: 'Account Types',
    values: [
        { fullName: 'SaaS', label: 'SaaS', isActive: true },
        { fullName: 'Hardware', label: 'Hardware', isActive: true },
        { fullName: 'Banking', label: 'Banking', isActive: true }
        // ... more values
    ]
});
```

### Step 3: Validate Dependency Configuration
```javascript
const { PicklistDependencyValidator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-validator');
const validator = new PicklistDependencyValidator({ org: orgAlias });

const validation = await validator.validateBeforeDeployment({
    objectName: config.objectName,
    controllingFieldApiName: config.controllingFieldApiName,
    dependentFieldApiName: config.dependentFieldApiName,
    dependencyMatrix: config.dependencyMatrix
});

if (!validation.canProceed) {
    console.error('❌ Dependency validation failed:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('Cannot proceed with deployment');
}

console.log('✅ Dependency validation passed');
if (validation.warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    validation.warnings.forEach(warn => console.warn(`  - ${warn}`));
}
```

### Step 4: Create/Update Controlling Field (if needed)
```javascript
// If controlling field needs picklist values added
const { UnifiedPicklistManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/unified-picklist-manager');
const picklistMgr = new UnifiedPicklistManager({ org: orgAlias });

await picklistMgr.updatePicklistAcrossRecordTypes({
    objectName: config.objectName,
    fieldApiName: config.controllingFieldApiName,
    valuesToAdd: ['Technology', 'Finance', 'Healthcare'],  // Ensure all controlling values exist
    recordTypes: 'all'
});
```

### Step 5: Create Dependency
```javascript
const { PicklistDependencyManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager');
const depManager = new PicklistDependencyManager({ org: orgAlias });

const result = await depManager.createDependency({
    objectName: config.objectName,
    controllingFieldApiName: config.controllingFieldApiName,
    dependentFieldApiName: config.dependentFieldApiName,
    dependencyMatrix: config.dependencyMatrix,
    recordTypes: config.recordTypes,
    validateBeforeDeploy: true  // Runs comprehensive pre-deployment validation
});

if (!result.success) {
    throw new Error(`Dependency creation failed: ${result.error}`);
}

console.log('✅ Dependency created successfully');
console.log(`   Deployment ID: ${result.deploymentId}`);
console.log(`   Record Types Updated: ${result.recordTypesUpdated.join(', ')}`);
```

### Step 6: Verify Dependency Deployment
```javascript
const verification = await validator.verifyDependencyDeployment({
    objectName: config.objectName,
    controllingFieldApiName: config.controllingFieldApiName,
    dependentFieldApiName: config.dependentFieldApiName
});

if (!verification.success) {
    console.error('❌ Dependency verification failed:');
    console.error(verification.checks);
    throw new Error('Dependency not working correctly');
}

console.log('✅ Dependency verified successfully');
console.log('   Dependent field correctly references controlling field');
console.log('   Dependency matrix active and functional');
```

### Step 7: Enable Values for Record Types
```javascript
// Already handled by PicklistDependencyManager.createDependency()
// which calls UnifiedPicklistManager.updateRecordTypeMetadata()
// internally.

// Verify all record types have correct values enabled:
const rtVerification = await picklistMgr.verifyPicklistAvailability({
    objectName: config.objectName,
    fieldApiName: config.dependentFieldApiName,
    expectedValues: Object.values(config.dependencyMatrix).flat(),
    recordTypes: 'all'
});

if (!rtVerification.success) {
    console.warn('⚠️  Some record types have missing values');
    // Auto-fix if needed
    await picklistMgr.verifyAndFix({
        objectName: config.objectName,
        fieldApiName: config.dependentFieldApiName,
        expectedValues: Object.values(config.dependencyMatrix).flat(),
        recordTypes: 'all',
        autoFix: true
    });
}
```

---

## Updating Existing Dependencies

**Modify dependency matrix without recreating:**

```javascript
const depManager = new PicklistDependencyManager({ org: orgAlias });

// Add new controlling value with dependent values
const result = await depManager.updateDependencyMatrix({
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    newDependencyMatrix: {
        'Technology': ['SaaS', 'Hardware', 'Services'],
        'Finance': ['Banking', 'Insurance', 'Investment'],
        'Healthcare': ['Provider', 'Payer', 'Pharma'],
        'Retail': ['Online', 'Brick and Mortar', 'Hybrid']  // NEW
    },
    recordTypes: 'all'
});

console.log('✅ Dependency matrix updated');
```

---

## Critical Deployment Rules

### MUST DO:
1. ✅ **Always validate before deployment** (`validator.validateBeforeDeployment()`)
2. ✅ **Create Global Value Sets FIRST** if using them
3. ✅ **Ensure all controlling values exist** before creating dependency
4. ✅ **Ensure all dependent values exist** before creating dependency
5. ✅ **Deploy field metadata + record type metadata atomically**
6. ✅ **Verify deployment after completion** (`validator.verifyDependencyDeployment()`)
7. ✅ **Test in sandbox first** - dependencies are complex and hard to reverse

### NEVER DO:
1. ❌ **Skip validation** - can lead to orphaned values
2. ❌ **Create dependency without record type updates** - values won't be visible
3. ❌ **Use Tooling API for field dependencies** - unreliable, use Metadata API
4. ❌ **Create circular dependencies** (A controls B, B controls A)
5. ❌ **Deploy to production without sandbox testing**
6. ❌ **Manually edit XML** - use PicklistDependencyManager

---

## Error Recovery

### Common Deployment Errors:

**Error 1**: "Required field missing: controllingField"
- **Cause**: Dependent field metadata missing controllingField attribute
- **Fix**: Re-deploy using PicklistDependencyManager (sets attribute correctly)

**Error 2**: "Values not visible to users"
- **Cause**: Record type metadata not updated
- **Fix**:
  ```javascript
  await picklistMgr.verifyAndFix({
      objectName,
      fieldApiName: dependentFieldApiName,
      expectedValues: allDependentValues,
      recordTypes: 'all',
      autoFix: true
  });
  ```

**Error 3**: "Circular dependency detected"
- **Cause**: Field A controls B, B controls A
- **Fix**: Break circular reference, redesign dependency hierarchy

**Error 4**: "Global Value Set not found"
- **Cause**: Referenced Global Value Set doesn't exist
- **Fix**:
  ```javascript
  const gvsManager = new GlobalValueSetManager({ org: orgAlias });
  await gvsManager.createGlobalValueSet({ fullName, masterLabel, values });
  ```

---

## Integration with Order of Operations

**Dependency deployment order (Section B):**

```
1. Global Value Sets (if used)
   ↓
2. Controlling Field metadata (with all values)
   ↓
3. Dependent Field metadata (with controllingField + valueSettings)
   ↓
4. Record Type metadata (for both fields)
   ↓
5. Verification queries (confirm dependency active)
```

**Never deploy out of order** - dependencies are sensitive to sequence.

---

## CLI Quick Reference

**Analyze existing dependency:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-describer.js dependency Account Account_Type__c Industry
```

**Validate before deployment:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-validator.js validate \
    --object Account \
    --controlling Industry \
    --dependent Account_Type__c \
    --matrix '{"Technology":["SaaS","Hardware"]}' \
    --org myorg
```

**Create dependency:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager.js create \
    --object Account \
    --controlling Industry \
    --dependent Account_Type__c \
    --matrix '{"Technology":["SaaS","Hardware"],"Finance":["Banking"]}' \
    --org myorg
```

---

## Complete Example

**End-to-end dependency creation:**

```javascript
const { GlobalValueSetManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/global-value-set-manager');
const { PicklistDependencyManager } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager');
const { PicklistDependencyValidator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-validator');

async function createAccountIndustryTypeDependency(orgAlias) {
    try {
        console.log('🚀 Creating Account Industry → Type dependency\n');

        // Step 1: Validate configuration
        console.log('Step 1: Validating configuration...');
        const validator = new PicklistDependencyValidator({ org: orgAlias });

        const dependencyMatrix = {
            'Technology': ['SaaS', 'Hardware', 'Services'],
            'Finance': ['Banking', 'Insurance', 'Investment'],
            'Healthcare': ['Provider', 'Payer', 'Pharma']
        };

        const validation = await validator.validateBeforeDeployment({
            objectName: 'Account',
            controllingFieldApiName: 'Industry',
            dependentFieldApiName: 'Account_Type__c',
            dependencyMatrix
        });

        if (!validation.canProceed) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
        console.log('✅ Validation passed\n');

        // Step 2: Create dependency
        console.log('Step 2: Creating dependency...');
        const depManager = new PicklistDependencyManager({ org: orgAlias });

        const result = await depManager.createDependency({
            objectName: 'Account',
            controllingFieldApiName: 'Industry',
            dependentFieldApiName: 'Account_Type__c',
            dependencyMatrix,
            recordTypes: 'all',
            validateBeforeDeploy: true
        });

        console.log('✅ Dependency created');
        console.log(`   Deployment ID: ${result.deploymentId}`);
        console.log(`   Record Types: ${result.recordTypesUpdated.join(', ')}\n`);

        // Step 3: Verify
        console.log('Step 3: Verifying deployment...');
        const verifyResult = await validator.verifyDependencyDeployment({
            objectName: 'Account',
            controllingFieldApiName: 'Industry',
            dependentFieldApiName: 'Account_Type__c'
        });

        if (!verifyResult.success) {
            throw new Error('Verification failed');
        }
        console.log('✅ Verification passed\n');

        console.log('✅ Dependency deployment complete!');
        return result;

    } catch (error) {
        console.error('❌ Dependency deployment failed:', error.message);
        throw error;
    }
}
```

---

## Key Differences from Regular Picklist Deployment

| Aspect | Regular Picklist | Picklist Dependency |
|--------|-----------------|---------------------|
| **Metadata** | Field values only | Field + controllingField + valueSettings |
| **Tool** | UnifiedPicklistManager | PicklistDependencyManager |
| **Validation** | Basic value check | Matrix validation + circular dependency check |
| **Deployment** | Single field | Controlling + Dependent + Record Types |
| **Complexity** | Low | High |
| **Reversibility** | Easy | Difficult |
| **Testing** | Optional | Mandatory (sandbox first) |

---

## Documentation References

- **Core Library**: `scripts/lib/picklist-dependency-manager.js`
- **Validation**: `scripts/lib/picklist-dependency-validator.js`
- **Global Sets**: `scripts/lib/global-value-set-manager.js`
- **Analysis Tool**: `scripts/lib/picklist-describer.js`
- **Base Picklist**: `scripts/lib/unified-picklist-manager.js`
- **Implementation Plan**: See project documentation for complete playbook

---

**When This Context is Loaded**: When user message contains keywords: `picklist dependency`, `controlling field`, `dependent field`, `picklist cascade`, `field dependency`, `picklist relationship`, `dependent picklist`, `controlling picklist`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview

**Related Contexts**:
- `picklist-modification-protocol.md` - Basic picklist modification (prerequisite knowledge)
- Order of Operations (kept in base agent) - Deployment sequencing

---

**Context File**: `contexts/metadata-manager/picklist-dependency-deployment.md`
**Lines**: 431 (original agent lines 1151-1582)
**Priority**: High
**Related Scripts**:
- `scripts/lib/picklist-dependency-manager.js`
- `scripts/lib/picklist-dependency-validator.js`
- `scripts/lib/global-value-set-manager.js`
- `scripts/lib/unified-picklist-manager.js`
- `scripts/lib/picklist-describer.js`
