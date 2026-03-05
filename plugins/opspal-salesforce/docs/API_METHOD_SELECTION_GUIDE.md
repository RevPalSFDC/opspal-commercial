# API Method Selection Guide
**Salesforce Picklist Dependency Operations**

**Version**: 1.0.0
**Date**: October 2025

---

## Overview

When working with Salesforce picklist dependencies, choosing the right API method is critical for success. This guide provides a decision framework for selecting between **MCP**, **Salesforce CLI**, **Metadata API**, **Tooling REST API**, and **SOQL** based on your operation type.

---

## Quick Decision Tree

```
What operation are you performing?
    ↓
┌────────────────────────────────────────────────┐
│ Operation Type?                                │
└──────┬─────────────────────────────────────────┘
       │
   ┌───┴──────────────────────────────┐
   │                                  │
Global Value Set               Field Dependency
Operations                     Operations
   │                                  │
   ▼                                  ▼
Use Tooling API               Use Metadata API
   │                                  │
   ├─ Create GVS                     ├─ Create dependency
   ├─ Add values                     ├─ Update matrix
   ├─ Update GVS                     ├─ Set controllingField
   └─ Validate exists                └─ Deploy + record types
          │                                   │
          ▼                                   ▼
  GlobalValueSetManager           PicklistDependencyManager
```

---

## API Methods Comparison

### 1. Tooling REST API

**Best For:**
- Global Value Set operations
- Quick JSON-based updates
- Programmatic value management

**Use Cases:**
- ✅ Create new Global Value Set
- ✅ Add values to existing Global Value Set
- ✅ Update Global Value Set (full replacement)
- ✅ Deactivate values in Global Value Set
- ✅ Query Global Value Set metadata

**Advantages:**
- JSON format (easier than XML)
- Direct HTTP requests
- Fast for small operations
- No package.xml needed

**Disadvantages:**
- Requires full metadata replacement (no partial updates)
- Can't set `controllingField` attribute
- Can't build `valueSettings` array
- Limited to Global Value Set operations

**Library:** `GlobalValueSetManager`

**Example:**
```javascript
const { GlobalValueSetManager } = require('./scripts/lib/global-value-set-manager');
const manager = new GlobalValueSetManager({ org: 'myorg' });

// Create Global Value Set via Tooling API
await manager.createGlobalValueSet({
    fullName: 'Industries',
    masterLabel: 'Industries',
    values: [
        { fullName: 'Technology', label: 'Technology' }
    ]
});
```

---

### 2. Metadata API (via CLI or Direct)

**Best For:**
- Field dependency operations
- Complex metadata deployments
- Atomic multi-component deployments

**Use Cases:**
- ✅ Create controlling/dependent field relationships
- ✅ Set `controllingField` attribute
- ✅ Build `valueSettings` array (dependency matrix)
- ✅ Deploy field + record type metadata atomically
- ✅ Update dependency matrices

**Advantages:**
- Full control over metadata structure
- Supports `controllingField` and `valueSettings`
- Atomic deployments (field + record types together)
- Best error messages
- CLI wraps complexity

**Disadvantages:**
- XML format (more complex)
- Requires package.xml
- Slower than Tooling API
- Must deploy to see results

**Library:** `PicklistDependencyManager`

**Example:**
```javascript
const { PicklistDependencyManager } = require('./scripts/lib/picklist-dependency-manager');
const manager = new PicklistDependencyManager({ org: 'myorg' });

// Create dependency via Metadata API
await manager.createDependency({
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    dependencyMatrix: {
        'Technology': ['SaaS', 'Hardware']
    }
});
```

---

### 3. Salesforce CLI (sf)

**Best For:**
- Wrapped Metadata API operations
- Standard deployments
- Interactive use

**Use Cases:**
- ✅ Deploy metadata packages
- ✅ Query org metadata
- ✅ Standard field operations

**Advantages:**
- Simplest interface
- Best error messages
- Handles authentication
- Automatic retries

**Disadvantages:**
- Limited to standard operations
- Can't build complex metadata structures directly
- Must construct XML manually for dependencies

**When to Use:**
- Behind the scenes in `PicklistDependencyManager`
- For manual deployments after XML construction
- For org queries and validation

**Example:**
```bash
# Deploy dependency metadata (after construction)
sf project deploy start --manifest package.xml --target-org myorg
```

---

### 4. SOQL/Tooling Queries

**Best For:**
- Read-only operations
- Validation
- Verification

**Use Cases:**
- ✅ Query picklist values
- ✅ Check field metadata
- ✅ Verify dependencies exist
- ✅ Discover record types

**Advantages:**
- Fast
- No deployment needed
- Safe (read-only)

**Disadvantages:**
- Can't modify metadata
- Limited metadata visibility

**Library:** Used by `PicklistDependencyValidator`

**Example:**
```javascript
// Query to check dependency
const query = `
    SELECT DependentPicklist, ControllerName
    FROM FieldDefinition
    WHERE EntityDefinition.QualifiedApiName = 'Account'
    AND QualifiedApiName = 'Account_Type__c'
`;
```

---

## Decision Matrix

| Operation | Recommended API | Why? | Library |
|-----------|----------------|------|---------|
| **Create Global Value Set** | Tooling API | JSON format, simpler | `GlobalValueSetManager` |
| **Add values to GVS** | Tooling API | Fast, no deployment | `GlobalValueSetManager` |
| **Update GVS** | Tooling API | Full replacement supported | `GlobalValueSetManager` |
| **Create field dependency** | Metadata API | Only way to set controllingField | `PicklistDependencyManager` |
| **Update dependency matrix** | Metadata API | Only way to modify valueSettings | `PicklistDependencyManager` |
| **Deploy field + record types** | Metadata API | Atomic deployment | `PicklistDependencyManager` |
| **Update record types** | Metadata API | Tooling API unreliable here | `UnifiedPicklistManager` |
| **Validate dependency** | SOQL | Fast, read-only | `PicklistDependencyValidator` |
| **Verify deployment** | SOQL | Confirm changes applied | `PicklistDependencyValidator` |
| **Query picklist values** | SOQL | Fast discovery | `picklist-describer.js` |

---

## Detailed Operation Guides

### Operation 1: Create New Dependency

**Scenario:** Create Industry → Account Type dependency on Account object

**Step-by-Step API Selection:**

1. **Check if Global Value Sets needed**
   - **If YES** → Use Tooling API to create Global Value Sets first
   - **If NO** → Skip to step 2

2. **Ensure controlling field has values**
   - **API**: Metadata API (via `UnifiedPicklistManager`)
   - **Why**: Must deploy picklist values to controlling field

3. **Ensure dependent field has values**
   - **API**: Metadata API (via `UnifiedPicklistManager`)
   - **Why**: Must deploy picklist values to dependent field

4. **Create dependency relationship**
   - **API**: Metadata API (via `PicklistDependencyManager`)
   - **Why**: Only Metadata API can set `controllingField` and `valueSettings`

5. **Update record types**
   - **API**: Metadata API (atomic with step 4)
   - **Why**: Must be deployed with field metadata for atomic operation

6. **Verify deployment**
   - **API**: SOQL queries
   - **Why**: Fast verification without additional deployments

**Recommended Flow:**
```javascript
// 1. Create GVS if needed (Tooling API)
await GlobalValueSetManager.createGlobalValueSet(...);

// 2-5. Create dependency (Metadata API - all atomic)
await PicklistDependencyManager.createDependency({
    // This handles steps 2-5 automatically
    validateBeforeDeploy: true  // Uses SOQL for validation
});

// 6. Verify (SOQL)
await PicklistDependencyValidator.verifyDependencyDeployment(...);
```

---

### Operation 2: Update Existing Dependency Matrix

**Scenario:** Add new controlling value "Retail" with dependent values

**Step-by-Step API Selection:**

1. **Add new controlling value**
   - **API**: Metadata API (via `UnifiedPicklistManager`)
   - **Why**: Must deploy value to controlling field

2. **Add new dependent values**
   - **API**: Metadata API (via `UnifiedPicklistManager`)
   - **Why**: Must deploy values to dependent field

3. **Update dependency matrix**
   - **API**: Metadata API (via `PicklistDependencyManager`)
   - **Why**: Only Metadata API can modify `valueSettings` array

4. **Update record types**
   - **API**: Metadata API (atomic with step 3)
   - **Why**: New values must be enabled on record types

**Recommended Flow:**
```javascript
// Steps 1-4 handled atomically
await PicklistDependencyManager.updateDependencyMatrix({
    newDependencyMatrix: {
        // Existing controlling values
        'Technology': ['SaaS', 'Hardware'],
        // NEW controlling value
        'Retail': ['Online', 'Brick and Mortar']
    }
});
```

---

### Operation 3: Migrate Field to Global Value Set

**Scenario:** Migrate Industry field from field-specific to Global Value Set

**Step-by-Step API Selection:**

1. **Create Global Value Set**
   - **API**: Tooling API
   - **Why**: Fastest, simplest for GVS creation

2. **Export current picklist values**
   - **API**: SOQL
   - **Why**: Need to know what values to include in GVS

3. **Update field to reference Global Value Set**
   - **API**: Metadata API
   - **Why**: Must change field's `valueSet` to reference GVS

4. **Preserve dependency if exists**
   - **API**: Check with SOQL, preserve with Metadata API
   - **Why**: Dependencies survive migration if handled correctly

**Recommended Flow:**
```javascript
// 1. Extract current values
const currentValues = await describeField('Account', 'Industry');

// 2. Create GVS with those values
await GlobalValueSetManager.createGlobalValueSet({
    fullName: 'Industries',
    values: currentValues
});

// 3. Update field to reference GVS (Metadata API)
// Deploy field metadata with:
// <valueSet>
//     <valueSetName>Industries</valueSetName>
// </valueSet>

// 4. Dependency preserved automatically (controllingField still points to field name)
```

---

## Performance Comparison

| API Method | Operation | Typical Time | When to Use |
|------------|-----------|--------------|-------------|
| **Tooling API** | Create GVS | 5-15 seconds | Small, quick changes |
| **Tooling API** | Add values to GVS | 10-20 seconds | Incremental updates |
| **Metadata API** | Deploy single field | 30-60 seconds | Simple field changes |
| **Metadata API** | Deploy dependency | 2-5 minutes | Complex metadata |
| **Metadata API** | Deploy field + 10 record types | 3-8 minutes | Large orgs |
| **SOQL Query** | Validation | 1-3 seconds | Any validation |

**Key Insight**: Use Tooling API for quick Global Value Set operations, Metadata API for dependencies and complex deployments.

---

## Common Pitfalls

### Pitfall 1: Using Tooling API for Dependencies

❌ **Wrong:**
```javascript
// Trying to create dependency via Tooling API
const field = await toolingApi.update('CustomField', fieldId, {
    controllingField: 'Industry'  // Won't work!
});
```

✅ **Right:**
```javascript
// Use Metadata API via PicklistDependencyManager
await PicklistDependencyManager.createDependency({
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    // ...
});
```

**Why**: Tooling API doesn't support `controllingField` attribute or `valueSettings` array. Must use Metadata API.

---

### Pitfall 2: Forgetting Record Types

❌ **Wrong:**
```javascript
// Deploy field metadata only
await deployField('Account', 'Account_Type__c');
// Values won't be visible on record types!
```

✅ **Right:**
```javascript
// Deploy field + record types atomically
await PicklistDependencyManager.createDependency({
    recordTypes: 'all',  // Auto-discovers and updates
    // ...
});
```

**Why**: Picklist values must be explicitly enabled on each record type. Deploying field metadata alone leaves values in "Available" but not "Selected" state.

---

### Pitfall 3: Partial Global Value Set Updates

❌ **Wrong:**
```javascript
// Trying to add one value (doesn't work with Tooling API)
await toolingApi.patch('/GlobalValueSet/' + id, {
    customValue: [{ fullName: 'NewValue' }]  // Overwrites all!
});
```

✅ **Right:**
```javascript
// Use GlobalValueSetManager which handles full replacement
await GlobalValueSetManager.addValuesToGlobalSet({
    fullName: 'Industries',
    valuesToAdd: [{ fullName: 'NewValue' }]
    // Automatically fetches existing values and merges
});
```

**Why**: Tooling API requires full metadata replacement. Our library handles fetching existing values and merging automatically.

---

## Best Practices

### 1. Always Use the Right Library

Don't try to use API methods directly. Use our abstraction libraries:

| Need | Library | Why |
|------|---------|-----|
| **Global Value Sets** | `GlobalValueSetManager` | Handles full replacement pattern |
| **Dependencies** | `PicklistDependencyManager` | Constructs XML correctly |
| **Validation** | `PicklistDependencyValidator` | Catches errors before deployment |
| **Picklist values** | `UnifiedPicklistManager` | Handles record types automatically |

### 2. Validate Before Every Deployment

```javascript
// Always validate first
const validation = await validator.validateBeforeDeployment(config);
if (!validation.canProceed) {
    throw new Error('Validation failed');
}

// Then deploy
await manager.createDependency(config);
```

### 3. Use Atomic Deployments

```javascript
// ✅ GOOD: Deploy field + record types together
await PicklistDependencyManager.createDependency({
    recordTypes: 'all'  // Deployed atomically
});

// ❌ BAD: Deploy separately
await deployField(...);
await deployRecordType(...);  // Race conditions, partial failures
```

### 4. Test in Sandbox First

All dependency operations are complex and hard to reverse. **Always:**
- Create in sandbox first
- Test thoroughly
- Verify user experience
- Then deploy to production

---

## Troubleshooting Guide

### Issue: "Cannot find Global Value Set"

**API Used**: Metadata API trying to reference GVS

**Solution**:
```javascript
// Create GVS first via Tooling API
await GlobalValueSetManager.createGlobalValueSet({
    fullName: 'Industries',
    // ...
});

// Then create field that references it
```

**Why**: Global Value Sets must exist before fields can reference them.

---

### Issue: "Values not visible to users"

**API Used**: Metadata API (field deployed but not record types)

**Solution**:
```javascript
// Update record types to enable values
await UnifiedPicklistManager.verifyAndFix({
    objectName,
    fieldApiName,
    expectedValues,
    recordTypes: 'all',
    autoFix: true
});
```

**Why**: Record type metadata not updated. Values are "Available" but not "Selected".

---

### Issue: "Circular dependency detected"

**API Used**: Metadata API (validation caught the issue)

**Solution**:
- Break circular reference
- Redesign dependency hierarchy
- Use one-way dependencies only

**Why**: Salesforce doesn't support circular dependencies (A controls B, B controls A).

---

## Summary

### Quick Reference

**For Global Value Sets** → Use `GlobalValueSetManager` (Tooling API)
**For Dependencies** → Use `PicklistDependencyManager` (Metadata API)
**For Validation** → Use `PicklistDependencyValidator` (SOQL)
**For Record Types** → Use `UnifiedPicklistManager` (Metadata API)

### Decision Flow

```
1. What are you doing?
   - Creating/updating GVS? → GlobalValueSetManager
   - Creating/updating dependency? → PicklistDependencyManager
   - Validating? → PicklistDependencyValidator

2. Always validate before deployment

3. Deploy atomically (field + record types)

4. Verify after deployment
```

---

**Last Updated**: October 2025
**Maintained By**: Salesforce Plugin Team
