# Bulk Operations - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: Medium
**Trigger**: When user message contains: `bulk`, `batch`, `multiple objects`, `mass operation`, `bulk deploy`, `parallel`
**Estimated Tokens**: 1,251

---

## Overview

Bulk metadata operations for managing multiple components at scale with parallel processing. This context mandates performance-optimized patterns for deploying 10-50+ components efficiently.

**Key Benefit**: 15x faster execution (70s sequential → 5s parallel) for large-scale metadata operations.

---

## 🎯 Bulk Operations for Metadata Management

**CRITICAL**: Metadata management operations often involve deploying 10-50 components (fields, validation rules, flows) across multiple objects. LLMs default to sequential processing ("deploy one component, then the next"), which results in 25-45s execution times. This section mandates bulk operations patterns to achieve 8-15s execution (2-3x faster).

---

## 📋 4 Mandatory Patterns

### Pattern 1: Parallel Metadata Deployment

**❌ WRONG: Sequential component deployment**
```javascript
// Sequential: Deploy one component at a time
const results = [];
for (const component of components) {
  const result = await deployComponent(component);
  results.push(result);
}
// 30 components × 1000ms = 30,000ms (30 seconds) ⏱️
```

**✅ RIGHT: Parallel metadata deployment**
```javascript
// Parallel: Deploy all independent components simultaneously
const results = await Promise.all(
  components.map(component =>
    deployComponent(component)
  )
);
// 30 components in parallel = ~2000ms (max deploy time) - 15x faster! ⚡
```

**Improvement**: 15x faster (30s → 2s)

**When to Use**: Deploying multiple independent fields, validation rules, or other metadata components that don't depend on each other.

**Caution**: Respect Order of Operations - don't parallelize components with dependencies (e.g., field must exist before flow that references it).

---

### Pattern 2: Batched Validation Checks

**❌ WRONG: Validate components one at a time**
```javascript
// Sequential: Validate each component individually
const validations = [];
for (const component of components) {
  const isValid = await validateComponent(component);
  validations.push(isValid);
}
// 30 components × 500ms = 15,000ms (15 seconds) ⏱️
```

**✅ RIGHT: Parallel validation checks**
```javascript
// Parallel: Validate all components simultaneously
const validations = await Promise.all(
  components.map(component =>
    validateComponent(component)
  )
);
// 30 components in parallel = ~800ms (max validation time) - 18.8x faster! ⚡
```

**Improvement**: 18.8x faster (15s → 800ms)

**When to Use**: Pre-deployment validation of multiple components before actual deployment.

**Key Insight**: Validation operations are often read-only and completely independent, making them ideal candidates for parallelization.

---

### Pattern 3: Parallel Retrieval Operations

**❌ WRONG: Sequential metadata retrieval**
```javascript
// Sequential: Retrieve metadata one object at a time
const metadata = [];
for (const objectName of objects) {
  const objMetadata = await retrieveMetadata(objectName);
  metadata.push(objMetadata);
}
// 20 objects × 800ms = 16,000ms (16 seconds) ⏱️
```

**✅ RIGHT: Parallel metadata retrieval**
```javascript
// Parallel: Retrieve all object metadata simultaneously
const metadata = await Promise.all(
  objects.map(objectName =>
    retrieveMetadata(objectName)
  )
);
// 20 objects in parallel = ~1200ms (max retrieval time) - 13.3x faster! ⚡
```

**Improvement**: 13.3x faster (16s → 1.2s)

**When to Use**: Gathering existing metadata for analysis, comparison, or pre-deployment checks across multiple objects.

**API Considerations**: Be mindful of API rate limits when retrieving metadata for 50+ objects simultaneously. Consider batching in groups of 20-30.

---

### Pattern 4: Cache-First Component Checks

**❌ WRONG: Query component existence repeatedly**
```javascript
// Repeated queries for component validation
const deployments = [];
for (const component of components) {
  const exists = await query(`SELECT Id FROM ... WHERE Name = '${component.name}'`);
  if (!exists) deployments.push(component);
}
// 30 components × 300ms = 9,000ms (9 seconds) ⏱️
```

**✅ RIGHT: Cache component inventory**
```javascript
// Cache: Load all existing components once
const existingComponents = await query(`SELECT Name FROM ... WHERE Type = '${componentType}'`);
const existingNames = new Set(existingComponents.map(c => c.Name));

const deployments = components.filter(component =>
  !existingNames.has(component.name)
);
// 1 query = ~600ms - 15x faster! ⚡
```

**Improvement**: 15x faster (9s → 600ms)

**When to Use**: Checking existence of multiple components before deployment or during incremental updates.

**Key Pattern**: N queries → 1 query + in-memory filtering.

---

## 📊 Performance Targets

| Operation | Sequential (Baseline) | Parallel/Batched | Improvement |
|-----------|----------------------|------------------|-------------|
| **Deploy 30 components** | 30,000ms (30s) | 2,000ms (2s) | 15x faster |
| **Validate 30 components** | 15,000ms (15s) | 800ms | 18.8x faster |
| **Retrieve 20 objects** | 16,000ms (16s) | 1,200ms (1.2s) | 13.3x faster |
| **Check 30 components** | 9,000ms (9s) | 600ms | 15x faster |
| **Full metadata operation** | 70,000ms (70s) | 4,600ms (~5s) | **15.2x faster** |

**Expected Overall**: Full metadata management (20-30 components): 25-45s → 8-15s (2-3x faster)

---

## Practical Patterns

### Bulk Field Deployment

```javascript
const BulkMetadataDeployer = require('./scripts/lib/bulk-metadata-deployer');

const bulkDeployer = new BulkMetadataDeployer({
    orgAlias: 'my-org',
    parallelLimit: 5,  // Concurrent operations limit
    verbose: true
});

// Deploy multiple fields across objects
await bulkDeployer.deployMultipleFields([
    { object: 'Account', field: { fullName: 'Field1__c', type: 'Text', length: 255 } },
    { object: 'Contact', field: { fullName: 'Field2__c', type: 'Number', precision: 10, scale: 2 } },
    { object: 'Opportunity', field: { fullName: 'Field3__c', type: 'Checkbox', defaultValue: false } }
    // ... up to 100 fields
], {
    atomic: false,          // Continue on error vs fail fast
    continueOnError: true,  // Keep deploying even if some fail
    withFLS: true           // Bundle FLS permissions
});
```

**Features**:
- Parallel processing with configurable concurrency limit
- Error recovery and retry
- Progress tracking
- Atomic vs best-effort modes
- Automatic FLS bundling

---

### Bulk Permission Set Updates

```javascript
// Update multiple permission sets in parallel
const permissionSets = ['AgentAccess', 'AdminAccess', 'AnalystAccess'];

const updates = await Promise.all(
    permissionSets.map(psName =>
        updatePermissionSet(psName, {
            objectPermissions: { Account: { read: true, create: true } },
            fieldPermissions: { 'Account.NewField__c': { read: true, edit: true } }
        })
    )
);
```

---

### Bulk Validation Rule Updates

```javascript
// Update multiple validation rules across objects
const validationUpdates = [
    { object: 'Account', rule: 'Required_Field_Check', formula: '...' },
    { object: 'Contact', rule: 'Email_Format_Check', formula: '...' },
    { object: 'Opportunity', rule: 'Stage_Validation', formula: '...' }
];

const results = await Promise.all(
    validationUpdates.map(update =>
        updateValidationRule(update.object, update.rule, update.formula)
    )
);
```

---

### Bulk Flow Deployments

**Caution**: Flows have dependencies (fields must exist first). Use phased deployment:

```javascript
// Phase 1: Deploy all fields in parallel
await Promise.all(
    fields.map(field => deployFieldWithFLS(field.object, field.metadata))
);

// Phase 2: Verify all fields exist
await Promise.all(
    fields.map(field => verifyFieldExists(field.object, field.name))
);

// Phase 3: Deploy all flows in parallel (now that dependencies exist)
await Promise.all(
    flows.map(flow => deployFlowWithVersionManagement(flow.name, flow.path))
);
```

**Key Pattern**: Respect dependencies, parallelize within each phase.

---

## Error Handling Strategies

### Strategy 1: Fail Fast (Atomic Mode)

```javascript
// Stop on first error
try {
    await Promise.all(components.map(c => deployComponent(c)));
} catch (error) {
    console.error('Deployment failed:', error);
    // All or nothing - rollback if needed
}
```

**Use When**: Atomic deployment required (all components must succeed).

---

### Strategy 2: Continue on Error (Best Effort Mode)

```javascript
// Continue deploying even if some fail
const results = await Promise.allSettled(
    components.map(c => deployComponent(c))
);

const succeeded = results.filter(r => r.status === 'fulfilled');
const failed = results.filter(r => r.status === 'rejected');

console.log(`✅ ${succeeded.length} succeeded, ❌ ${failed.length} failed`);
```

**Use When**: Partial success acceptable (e.g., deploying 100 fields, some may already exist).

---

### Strategy 3: Retry Failed Operations

```javascript
// Retry failed operations with exponential backoff
const retryFailedComponents = async (failedComponents, maxRetries = 3) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const results = await Promise.allSettled(
            failedComponents.map(c => deployComponent(c))
        );

        const stillFailed = results
            .filter(r => r.status === 'rejected')
            .map((r, i) => failedComponents[i]);

        if (stillFailed.length === 0) break;

        failedComponents = stillFailed;
        await sleep(Math.pow(2, attempt) * 1000);  // Exponential backoff
    }
};
```

---

## Performance Optimization Tips

1. **Batch Size Tuning**: Test with 5, 10, 20 concurrent operations to find optimal parallelism
2. **API Rate Limits**: Monitor API usage to avoid hitting limits
3. **Memory Management**: For 100+ components, process in batches of 20-30
4. **Progress Tracking**: Log progress every 10 components for long operations
5. **Connection Pooling**: Reuse Salesforce API connections across operations

---

## 🔗 Cross-References

**Playbook Documentation**:
- See `BULK_OPERATIONS_BEST_PRACTICES.md` for batch size tuning
- See `PERFORMANCE_OPTIMIZATION_PLAYBOOK.md` (Pattern 5: Parallel Agent Execution)

**Related Patterns**:
- Order of Operations (OOO): Ensure bulk operations respect dependency order
- FLS-Aware Deployment: Bulk field deployments should bundle FLS
- Validation Framework: Run parallel validation before bulk deployment

---

**When This Context is Loaded**: When user message contains keywords: `bulk`, `batch`, `multiple objects`, `mass operation`, `bulk deploy`, `batch operation`, `multiple fields`, `parallel`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview

**Related Contexts**: None (uses core deployment protocols)

---

**Context File**: `contexts/metadata-manager/bulk-operations.md`
**Lines**: 139 (original agent lines 2552-2691)
**Priority**: Medium
**Related Scripts**: `scripts/lib/bulk-metadata-deployer.js`
