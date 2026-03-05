# Master-Detail Relationship - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: High
**Trigger**: When user message contains: `master-detail`, `relationship`, `cascade`, `reparenting`, `rollup`, `master-detail field`
**Estimated Tokens**: 1,818

---

## Overview

Master-detail relationship creation and modification with propagation handling. This protocol addresses the 15-30 minute metadata propagation delays before related lists become available in layouts.

**Key Challenge**: Salesforce requires time for Master-Detail relationships to propagate through the metadata cache before related lists can be deployed. This is NOT a deployment failure - it's expected platform behavior.

---

## 🚨 CRITICAL: Master-Detail Relationship Propagation Protocol (NEW - Oct 2025)

**MANDATORY**: Master-Detail relationships have **15-30 minute metadata propagation delays** before related lists become available. This is NOT a deployment failure - it's expected Salesforce behavior.

### The Propagation Timeline

| Metadata Type | Propagation Time | Impact |
|---------------|-----------------|--------|
| Master-Detail Field Creation | **15-30 minutes** | Related lists unavailable in layouts |
| Custom Object Creation | Immediate (<30 sec) | Object queryable immediately |
| Permission Set Deployment | 5-10 minutes | User permissions effective |
| Field-Level Security | 5-10 minutes | Field accessibility updated |

### Why This Matters

**Common Failure Pattern**:
```bash
# This sequence WILL FAIL if run immediately after M-D creation:
sf project deploy start --metadata CustomObject:Child__c  # Succeeds
sf project deploy start --metadata Layout:Parent__c-Layout  # FAILS!

# Error: Cannot find related list: Children
```

**Root Cause**: Salesforce's metadata indexing requires time to:
1. Register Master-Detail relationship in metadata cache
2. Update parent object's available relationship list
3. Propagate relationship name to layout configuration
4. Refresh Tooling API responses

### Deployment Strategies

**Strategy A: Manual UI Approach (Immediate - RECOMMENDED for Ad-Hoc)**
After deploying Master-Detail field:
1. Setup → Object Manager → Parent Object → Page Layouts
2. Drag related list from palette (available immediately in UI)
3. Configure columns and save
4. Export layout metadata if needed for source control

**Benefits**:
- ✅ Works immediately (no waiting)
- ✅ Full control over layout configuration
- ✅ Best for one-off changes

**Strategy B: Automated API Approach (15-30 min wait - REQUIRED for CI/CD)**
```bash
# Step 1: Deploy Master-Detail field
sf project deploy start --metadata CustomField:Child__c.Parent__c --target-org myorg

# Step 2: Wait for propagation using utility
node scripts/lib/metadata-propagation-waiter.js master-detail \
  Child__c \
  Children \
  myorg

# Step 3: Deploy layout with related list
sf project deploy start --metadata Layout:Parent__c-Layout --target-org myorg
```

**Benefits**:
- ✅ Fully automated for CI/CD pipelines
- ✅ Metadata tracked in source control
- ✅ Reproducible deployments

### Using the Propagation Waiter

**Programmatic Usage**:
```javascript
const MetadataPropagationWaiter = require('./scripts/lib/metadata-propagation-waiter');

const waiter = new MetadataPropagationWaiter({
  orgAlias: 'myorg',
  verbose: true
});

// Wait for Master-Detail propagation
const result = await waiter.waitForMasterDetailPropagation({
  childObject: 'BDU_Checkin_Attendee__c',
  relationshipName: 'Attendees',
  parentObject: 'BDU_Checkin__c'  // Optional but recommended
});

if (result.found) {
  console.log(`✓ Propagated in ${result.elapsed}s`);
  console.log(`  Relationship Name: ${result.relationshipName}`);

  // Safe to deploy layout now
  await deployLayout();
} else {
  console.error('Timeout - manual UI configuration recommended');
}
```

**CLI Usage**:
```bash
# Wait up to 30 minutes for Master-Detail propagation
node scripts/lib/metadata-propagation-waiter.js master-detail \
  BDU_Checkin_Attendee__c \
  Attendees \
  acme-corp-main

# Returns:
# - Exit code 0: Propagation complete (proceed with layout)
# - Exit code 1: Timeout (use manual UI or retry)
```

### Permission Set Propagation

Master-Detail Permission Sets have special requirements:

**Validation Before Deployment**:
```bash
# ALWAYS validate Permission Set before deploying
node scripts/lib/permission-set-validator.js \
  --file force-app/.../MyPermissionSet.permissionset-meta.xml \
  --org myorg

# Catches 80% of Permission Set errors:
# - Missing parent object permissions
# - Invalid permission hierarchies
# - Duplicate permission blocks
```

**Wait for Permission Set Propagation**:
```bash
# After deploying Permission Set, verify it's effective
node scripts/lib/metadata-propagation-waiter.js permission-set \
  BDU_Checkin_Access \
  myorg
```

### Error Messages and Solutions

**Error**: `Cannot find related list: Children`
- **Cause**: Master-Detail relationship not yet propagated
- **Solution**: Wait 15-30 minutes OR use manual UI approach
- **Tool**: `node scripts/lib/metadata-propagation-waiter.js master-detail`

**Error**: `Permission Read Child__c depends on permission(s): Read Parent__c`
- **Cause**: Missing parent object permissions in Permission Set
- **Solution**: Add parent object permissions block
- **Tool**: `node scripts/lib/permission-set-validator.js --file <path>`

**Error**: `Field permissions granted but no object-level Read access`
- **Cause**: Field-level permissions without object permissions
- **Solution**: Add object-level Read permission
- **Tool**: Validator automatically detects this pattern

### Mandatory Workflow for Master-Detail Creation

**Complete Workflow** (Use this EVERY time):
```bash
# Phase 1: Objects and Fields (Immediate)
sf project deploy start \
  --source-dir force-app/main/default/objects/Child__c \
  --source-dir force-app/main/default/objects/Parent__c \
  --target-org myorg

# Phase 2: Validate Master-Detail Relationship
node scripts/lib/metadata-propagation-waiter.js master-detail \
  Child__c \
  Children \
  myorg

# Phase 3: Permission Set with Validation
node scripts/lib/permission-set-validator.js \
  --file force-app/.../Access.permissionset-meta.xml \
  --org myorg

sf project deploy start \
  --metadata PermissionSet:Access \
  --target-org myorg

# Phase 4: Wait for Permission Set Propagation
node scripts/lib/metadata-propagation-waiter.js permission-set \
  Access \
  myorg

# Phase 5: Layout with Related List (After propagation)
sf project deploy start \
  --metadata Layout:Parent__c-Layout \
  --target-org myorg
```

### Integration with FLS-Aware Deployment

**When creating Master-Detail with FLS**:
```javascript
const FLSAwareFieldDeployer = require('./scripts/lib/fls-aware-field-deployer');
const MetadataPropagationWaiter = require('./scripts/lib/metadata-propagation-waiter');

// Step 1: Deploy Master-Detail field with FLS atomically
const deployer = new FLSAwareFieldDeployer({ orgAlias: 'myorg' });

const masterDetailField = {
    fullName: 'Parent__c',
    label: 'Parent',
    type: 'MasterDetail',
    referenceTo: 'Parent__c',
    relationshipLabel: 'Children',
    relationshipName: 'Children'
};

await deployer.deployFieldWithFLS('Child__c', masterDetailField);

// Step 2: Wait for propagation
const waiter = new MetadataPropagationWaiter({ orgAlias: 'myorg' });
await waiter.waitForMasterDetailPropagation({
    childObject: 'Child__c',
    relationshipName: 'Children'
});

// Step 3: Deploy layout (safe now)
await deployLayout('Parent__c-Layout');
```

### Documentation References

- **Comprehensive Guide**: `docs/MASTER_DETAIL_RELATIONSHIPS.md`
- **Permission Set Patterns**: `docs/PERMISSION_SET_PATTERNS.md`
- **Playbook Template**: `templates/playbooks/salesforce-master-detail-object-creation/`
- **Validation Script**: `templates/playbooks/.../validation-script.sh`

### Key Takeaways

1. **15-30 minute propagation is NORMAL** - not a deployment failure
2. **Manual UI works immediately** - best for ad-hoc changes
3. **Automated API requires wait** - use propagation waiter
4. **Validate Permission Sets first** - prevents 80% of errors
5. **Parent permissions are MANDATORY** - for Master-Detail relationships
6. **Use FLS-aware deployment** - ensures atomic field + permission creation

### Master-Detail Migration Pattern

For Master-Detail referenceTo changes (field references new object):

**3-Phase Workflow (REQUIRED):**
```bash
# Phase 1: Remove Apex references
# Comment out field assignments in Apex, deploy

# Phase 2: Migrate field
# Delete old M-D field, create new M-D field with updated referenceTo

# Phase 3: Restore Apex references
# Uncomment field assignments, deploy
```

**Why:** Salesforce API does not allow updating Master-Detail referenceTo. Attempting direct update causes:
```
ERROR: CustomField [Object__c.Field__c]: Cannot update referenceTo
```

---

**When This Context is Loaded**: When user message contains keywords: `master-detail`, `relationship`, `cascade`, `reparenting`, `rollup`, `master-detail field`, `relationship field`, `cascading delete`, `relationship propagation`, `lookup to master-detail`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview and Order of Operations (OOO) protocol

**Related Contexts**:
- `fls-field-deployment.md` - Master-detail creation uses FLS-aware deployment pattern
- Order of Operations (kept in base agent) - Master-detail deployment sequence

---

**Context File**: `contexts/metadata-manager/master-detail-relationship.md`
**Lines**: 202 (original agent lines 1583-1785)
**Priority**: High
**Related Scripts**:
- `scripts/lib/metadata-propagation-waiter.js`
- `scripts/lib/permission-set-validator.js`
- `scripts/lib/fls-aware-field-deployer.js`
