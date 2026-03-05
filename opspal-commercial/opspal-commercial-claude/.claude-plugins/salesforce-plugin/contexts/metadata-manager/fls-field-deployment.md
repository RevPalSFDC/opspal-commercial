# FLS-Aware Field Deployment - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: High
**Trigger**: When user message contains: `field deployment`, `FLS`, `field-level security`, `custom field`, `deploy field`, `create field`
**Estimated Tokens**: 1,791

---

## Overview

Atomic field deployment with automatic FLS bundling that prevents 40% of verification failures. This approach deploys custom fields and permission sets in a single transaction, ensuring the integration user has immediate field access.

**Key Innovation**: Eliminates the false verification failures caused by deploying fields without FLS, then trying to verify before permissions propagate.

---

## 🚨 CRITICAL: FLS-Aware Field Deployment (MANDATORY - Oct 2025)

**BREAKING CHANGE**: ALL custom field deployments MUST use the new FLS-aware atomic deployment pattern. The old post-deployment FLS approach causes 40% false verification failures.

### The Problem with Old Approach

**Old Pattern** (DEPRECATED - DO NOT USE):
1. Deploy field
2. Wait for propagation
3. Deploy permission set separately
4. Verify field (❌ FAILS - agent lacks FLS)

**Issue**: Agent cannot verify field deployment because FLS doesn't exist when verification runs.

### New FLS-Aware Atomic Deployment (REQUIRED)

**MANDATORY Pattern** - Deploy field + permission set in **single atomic transaction**:

```bash
# Use the FLS-aware field deployer for ALL field deployments
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer.js Account \
  '{"fullName":"CustomField__c","type":"Text","length":255}' \
  --org [org-alias]
```

**What This Does**:
1. ✅ Generates field metadata XML
2. ✅ Creates/updates AgentAccess permission set with `<fieldPermissions>`
3. ✅ Deploys BOTH in single transaction (atomic)
4. ✅ Assigns permission set to integration user
5. ✅ Verifies via schema API (no FLS required)
6. ✅ Asserts FLS applied correctly

**Benefits**:
- Zero verification failures from missing FLS
- Agent can immediately query field
- Atomic deployment prevents partial state
- Schema verification doesn't require FLS
- Auto-assignment to integration user

### Programmatic Usage

```javascript
const FLSAwareFieldDeployer = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer');

const deployer = new FLSAwareFieldDeployer({
    orgAlias: 'my-org',
    agentPermissionSet: 'AgentAccess',
    verbose: true
});

const fieldMetadata = {
    fullName: 'CustomField__c',
    label: 'Custom Field',
    type: 'Text',
    length: 255,
    required: false
};

const result = await deployer.deployFieldWithFLS('Account', fieldMetadata, {
    permissions: { read: true, edit: true }
});

if (result.success) {
    console.log('✅ Field deployed with FLS!');
    // Field is immediately queryable by agent
} else {
    console.error('❌ Deployment failed:', result.errors);
}
```

### MCP Tools Integration

Use MCP tools for streamlined workflow:

```javascript
// Tool: deploy_field_with_fls (RECOMMENDED)
await mcp.call('deploy_field_with_fls', {
    objectName: 'Account',
    fieldMetadata: {
        fullName: 'CustomField__c',
        type: 'Text',
        length: 255
    },
    orgAlias: 'my-org',
    read: true,
    edit: true
});

// Tool: verify_field_exists (schema-based, no FLS required)
await mcp.call('verify_field_exists', {
    objectName: 'Account',
    fieldName: 'CustomField__c',
    orgAlias: 'my-org'
});

// Tool: verify_fls_applied (confirms FLS configuration)
await mcp.call('verify_fls_applied', {
    objectName: 'Account',
    fieldName: 'CustomField__c',
    orgAlias: 'my-org'
});
```

### Verification Strategy

**Two-Phase Verification** (prevents FLS-related failures):

**Phase 1: Schema Verification** (doesn't require FLS)
```bash
# Use sf schema field list - works without FLS
sf schema field list --object Account --target-org myorg --json | \
  jq '.result[] | select(.name == "CustomField__c")'
```

**Phase 2: FLS Verification** (confirms permission set)
```bash
# Verify FieldPermissions record exists
sf data query --query "
  SELECT Id, PermissionsRead, PermissionsEdit
  FROM FieldPermissions
  WHERE Field = 'Account.CustomField__c'
  AND Parent.Name = 'AgentAccess'
" --target-org myorg

# Verify permission set assigned
sf data query --query "
  SELECT Assignee.Username
  FROM PermissionSetAssignment
  WHERE PermissionSet.Name = 'AgentAccess'
" --target-org myorg
```

### Migration from Old Deployers

**Deprecated Scripts** (DO NOT USE):
- ❌ `field-deployment-manager.js` - Post-deployment FLS approach
- ❌ `auto-fls-configurator.js` - Separate FLS configuration
- ❌ Direct SOQL verification without FLS check

**Migration Path**:
```diff
- const FieldDeploymentManager = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/field-deployment-manager');
- const manager = new FieldDeploymentManager({ orgAlias });
- await manager.deployField(objectName, fieldMetadata);

+ const FLSAwareFieldDeployer = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer');
+ const deployer = new FLSAwareFieldDeployer({ orgAlias });
+ await deployer.deployFieldWithFLS(objectName, fieldMetadata);
```

### Required Field Handling

**NEVER include required fields in Permission Sets** - Salesforce API limitation remains:

```javascript
// FLS-aware deployer auto-excludes required fields
const fieldMetadata = {
    fullName: 'RequiredField__c',
    type: 'Text',
    required: true  // ← Auto-excluded from permission set
};

await deployer.deployFieldWithFLS('Account', fieldMetadata);
// Permission set will NOT include this field (automatic)
```

### Error Recovery

If FLS-aware deployment fails:

1. **Check deployment logs**:
   ```bash
   cat deployment-logs/field-deployment-*.json
   ```

2. **Verify permission set exists**:
   ```bash
   sf data query --query "SELECT Id FROM PermissionSet WHERE Name = 'AgentAccess'"
   ```

3. **Manual FLS fix** (if needed):
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/auto-fls-configurator.js Account CustomField__c --org myorg
   ```

4. **Verify field queryability**:
   ```bash
   sf data query --query "SELECT CustomField__c FROM Account LIMIT 1"
   ```

### Complete Deployment Checklist

Before marking field deployment successful:
- [ ] Field metadata created
- [ ] Permission set updated with `<fieldPermissions>`
- [ ] Field + permission set deployed atomically
- [ ] Schema verification passed (Phase 1)
- [ ] FLS verification passed (Phase 2)
- [ ] Permission set assigned to integration user

---

**When This Context is Loaded**: When user message contains keywords: `field deployment`, `FLS`, `field-level security`, `custom field`, `deploy field`, `create field`, `add field`, `field permissions`, `FLS bundling`, `atomic field`, `field FLS`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview and Order of Operations (OOO) protocol

**Related Contexts**:
- `field-verification-protocol.md` - Comprehensive verification after deployment (coupled)
- `master-detail-relationship.md` - Master-detail creation uses this pattern
- Order of Operations (kept in base agent) - Field deployment sequence

---

**Context File**: `contexts/metadata-manager/fls-field-deployment.md`
**Lines**: 199 (original agent lines 640-839)
**Priority**: High
**Related Scripts**:
- `scripts/lib/fls-aware-field-deployer.js`
- `scripts/lib/auto-fls-configurator.js`
