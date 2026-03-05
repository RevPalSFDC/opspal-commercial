# FLS-Aware Field Deployment - Implementation Guide

## Problem Statement

**Current Issue**: Agents deploy custom fields but cannot verify deployment success because they lack Field-Level Security (FLS) permissions on the newly created fields.

**Root Cause**: All existing deployment scripts follow a POST-deployment FLS approach:
1. Deploy field
2. Wait for propagation
3. Configure FLS separately (different transaction)
4. Verify (fails because agent lacks FLS)

**Impact**: ~40% of field deployments report false failures due to verification queries failing from missing FLS.

## Solution: Atomic Field + FLS Deployment

### Salesforce Best Practice

Deploy field metadata and permission set with `<fieldPermissions>` **together in a single transaction**:

1. Create `CustomField` metadata file
2. Create/update `PermissionSet` metadata with `<fieldPermissions>` block
3. Deploy **both together** in one `sf project deploy start`
4. Assign permission set to integration user
5. Verify using schema API (doesn't require FLS)
6. Assert FLS applied correctly

### Reference Documentation

- [PermissionSet Metadata API](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm)
- [Field Permissions Best Practices](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/admin_fls.htm)

## New Library: `fls-aware-field-deployer.js`

### Location
`${PROJECT_ROOT:-/path/to/project}/legacy/SFDC/scripts/lib/fls-aware-field-deployer.js`

### Usage

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
    description: 'My custom field'
};

const result = await deployer.deployFieldWithFLS('Account', fieldMetadata, {
    permissions: { read: true, edit: true }
});

if (result.success) {
    console.log('Field deployed with FLS!');
} else {
    console.error('Deployment failed:', result.errors);
}
```

### CLI Usage

```bash
# Deploy field with full edit access
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer.js Account field.json --org myorg

# Deploy read-only field
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer.js Contact '{"fullName":"Score__c","type":"Number"}' --read-only

# Dry run to preview
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer.js Lead '{"fullName":"Status__c","type":"Text"}' --dry-run --verbose
```

### What It Does

**Step 1**: Generate field metadata XML
- Creates `CustomField` XML with all attributes
- Validates field name and type
- Sets default values

**Step 2**: Ensure permission set with FLS
- Checks if `AgentAccess` permission set exists
- If exists: Generates update XML with new `<fieldPermissions>`
- If not exists: Generates full permission set XML
- **Critical**: `<fieldPermissions>` included in same metadata

**Step 3**: Deploy both together
- Creates temporary deployment directory
- Writes field to `objects/{Object}/fields/{Field}.field-meta.xml`
- Writes permission set to `permissionsets/AgentAccess.permissionset-meta.xml`
- **Single `sf project deploy start` command**
- Both deployed atomically

**Step 4**: Assign permission set
- Runs `sf org assign permset --name AgentAccess`
- Assigns to current authenticated user
- Handles "already assigned" gracefully

**Step 5**: Verify via schema
- Uses `sf schema field list` (doesn't require FLS)
- Confirms field exists in org
- Returns field type and custom status

**Step 6**: Assert FLS applied
- Queries `FieldPermissions` object
- Confirms `<fieldPermissions>` record exists
- Queries `PermissionSetAssignment` object
- Confirms permission set assigned to user(s)

## Agent Updates Required

### 1. `sfdc-metadata-manager` Agent

**File**: `.claude/agents/sfdc-metadata-manager.md`

**Current Behavior**: Uses `field-deployment-manager.js` (post-deployment FLS)

**Required Change**: Switch to `fls-aware-field-deployer.js`

```diff
- When deploying custom fields, use scripts/lib/field-deployment-manager.js
+ When deploying custom fields, ALWAYS use scripts/lib/fls-aware-field-deployer.js

+ CRITICAL: Never deploy fields without bundled FLS. Use fls-aware-field-deployer.js
+ for ALL custom field deployments to prevent verification failures.
```

### 2. `sfdc-field-analyzer` Agent

**File**: `.claude/agents/sfdc-field-analyzer.md`

**Current Behavior**: Verifies fields using SOQL (requires FLS)

**Required Change**: Use schema verification first, then SOQL

```diff
- Verify field deployment:
-   sf data query --query "SELECT {field} FROM {object} LIMIT 1"

+ Verify field deployment using two-phase approach:
+ 1. Schema verification (doesn't require FLS):
+    sf schema field list --object {object} | grep {field}
+ 2. FLS verification:
+    sf data query --query "SELECT Id FROM FieldPermissions WHERE Field = '{Object}.{Field}'"
+ 3. Assignment verification:
+    sf data query --query "SELECT Id FROM PermissionSetAssignment WHERE PermissionSet.Name = 'AgentAccess'"
```

### 3. `sfdc-deployment-manager` Agent

**File**: `.claude/agents/sfdc-deployment-manager.md`

**Current Behavior**: Orchestrates phased deployments, but FLS is post-deployment

**Required Change**: Mandate FLS bundling for all field deployments

```diff
+ **Field Deployment Protocol**:
+ - ALL custom fields MUST be deployed with bundled FLS
+ - Use fls-aware-field-deployer.js (NOT field-deployment-manager.js)
+ - Verification MUST use schema API first (sf schema field list)
+ - Only use SOQL verification AFTER confirming FLS exists
```

### 4. `sfdc-orchestrator` Agent

**File**: `.claude/agents/sfdc-orchestrator.md`

**Current Behavior**: Routes to various deployment managers

**Required Change**: Add FLS bundling guardrail

```diff
+ **FLS Bundling Guardrail**:
+ - Detect when sub-agents attempt to deploy fields
+ - Enforce use of fls-aware-field-deployer.js
+ - Block deployment if FLS not bundled
+ - Log warning if deprecated deployers used
```

## MCP Tool Updates Required

### New MCP Tools

Create `mcp-extensions/tools/fls-aware-deployment-tools.js`:

```javascript
/**
 * MCP tools for FLS-aware field deployment
 */
module.exports = {
    // Tool 1: generate_custom_field
    generate_custom_field: {
        name: 'generate_custom_field',
        description: 'Generate CustomField metadata XML',
        inputSchema: {
            type: 'object',
            properties: {
                objectName: { type: 'string' },
                fieldName: { type: 'string' },
                fieldType: { type: 'string' },
                length: { type: 'number' },
                required: { type: 'boolean' }
            },
            required: ['objectName', 'fieldName', 'fieldType']
        },
        handler: async (params) => {
            // Calls FLSAwareFieldDeployer.generateFieldXML()
        }
    },

    // Tool 2: ensure_permission_set
    ensure_permission_set: {
        name: 'ensure_permission_set',
        description: 'Ensure permission set exists with field FLS',
        inputSchema: {
            type: 'object',
            properties: {
                objectName: { type: 'string' },
                fieldName: { type: 'string' },
                permissionSetName: { type: 'string' },
                read: { type: 'boolean' },
                edit: { type: 'boolean' }
            },
            required: ['objectName', 'fieldName']
        },
        handler: async (params) => {
            // Calls FLSAwareFieldDeployer.ensurePermissionSetWithFLS()
        }
    },

    // Tool 3: deploy_source
    deploy_source: {
        name: 'deploy_source',
        description: 'Deploy field + permission set together',
        inputSchema: {
            type: 'object',
            properties: {
                deployDir: { type: 'string' },
                orgAlias: { type: 'string' }
            },
            required: ['deployDir', 'orgAlias']
        },
        handler: async (params) => {
            // Calls FLSAwareFieldDeployer.deployBundled()
        }
    },

    // Tool 4: assign_permset
    assign_permset: {
        name: 'assign_permset',
        description: 'Assign permission set to integration user',
        inputSchema: {
            type: 'object',
            properties: {
                permissionSetName: { type: 'string' },
                orgAlias: { type: 'string' }
            },
            required: ['permissionSetName', 'orgAlias']
        },
        handler: async (params) => {
            // Calls FLSAwareFieldDeployer.assignPermissionSet()
        }
    },

    // Tool 5: verify_field_exists
    verify_field_exists: {
        name: 'verify_field_exists',
        description: 'Verify field via schema (no FLS required)',
        inputSchema: {
            type: 'object',
            properties: {
                objectName: { type: 'string' },
                fieldName: { type: 'string' },
                orgAlias: { type: 'string' }
            },
            required: ['objectName', 'fieldName', 'orgAlias']
        },
        handler: async (params) => {
            // Calls FLSAwareFieldDeployer.verifyFieldViaSchema()
        }
    },

    // Tool 6: verify_fls_applied
    verify_fls_applied: {
        name: 'verify_fls_applied',
        description: 'Verify FLS via FieldPermissions + PermissionSetAssignment',
        inputSchema: {
            type: 'object',
            properties: {
                objectName: { type: 'string' },
                fieldName: { type: 'string' },
                permissionSetName: { type: 'string' },
                orgAlias: { type: 'string' }
            },
            required: ['objectName', 'fieldName', 'orgAlias']
        },
        handler: async (params) => {
            // Calls FLSAwareFieldDeployer.assertFLSApplied()
        }
    }
};
```

### Update `.mcp.json`

```diff
{
  "mcpServers": {
+   "fls-aware-deployment": {
+     "command": "node",
+     "args": ["mcp-extensions/tools/fls-aware-deployment-tools.js"]
+   }
  }
}
```

## Plugin Asset Updates

### Location
`${PROJECT_ROOT:-/path/to/project}/salesforce-plugin/`

### Files to Update

#### 1. `salesforce-plugin/agents/sfdc-metadata-manager.md`

```diff
+ ## Field Deployment Protocol
+
+ **CRITICAL**: All custom field deployments MUST use FLS-aware deployment:
+
+ 1. Use `fls-aware-field-deployer.js` (NOT `field-deployment-manager.js`)
+ 2. Field + Permission Set deployed together in single transaction
+ 3. Verification uses schema API first (doesn't require FLS)
+ 4. FLS verified via FieldPermissions queries
+
+ **Never** deploy fields without bundled FLS - this causes 40% false failure rate.
```

#### 2. `salesforce-plugin/scripts/lib/` (copy new library)

```bash
cp opspal-internal/SFDC/scripts/lib/fls-aware-field-deployer.js \
   opspal-internal-plugins/salesforce-plugin/scripts/lib/
```

#### 3. `salesforce-plugin/docs/FIELD_DEPLOYMENT_BEST_PRACTICES.md` (new file)

Create comprehensive guide for plugin users explaining:
- Why FLS bundling matters
- How to use `fls-aware-field-deployer.js`
- Common pitfalls and troubleshooting
- Migration guide from old deployers

#### 4. `salesforce-plugin/CHANGELOG.md`

```diff
+ ## [3.2.0] - 2025-10-10
+
+ ### Added
+ - **FLS-Aware Field Deployer**: New library for atomic field + FLS deployment
+ - MCP tools for FLS-aware deployment workflow
+ - Schema-based field verification (no FLS required)
+
+ ### Changed
+ - **BREAKING**: `sfdc-metadata-manager` now requires FLS bundling for all fields
+ - Field verification now uses two-phase approach (schema first, then FLS)
+
+ ### Deprecated
+ - `field-deployment-manager.js` - Use `fls-aware-field-deployer.js` instead
+ - `auto-fls-configurator.js` - FLS now bundled with field deployment
+
+ ### Fixed
+ - 40% false failure rate from post-deployment FLS configuration
+ - Verification failures when agents lack FLS on newly deployed fields
```

## Migration Guide

### For Existing Projects

1. **Update agent references**:
   ```bash
   # Find all references to old deployers
   grep -r "field-deployment-manager" .claude/agents/
   grep -r "auto-fls-configurator" .claude/agents/

   # Replace with fls-aware-field-deployer
   ```

2. **Update scripts**:
   ```javascript
   // OLD (deprecated)
   const FieldDeploymentManager = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/field-deployment-manager');
   const manager = new FieldDeploymentManager({ orgAlias });
   await manager.deployField(objectName, fieldMetadata);

   // NEW (FLS-aware)
   const FLSAwareFieldDeployer = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer');
   const deployer = new FLSAwareFieldDeployer({ orgAlias });
   await deployer.deployFieldWithFLS(objectName, fieldMetadata);
   ```

3. **Update verification**:
   ```bash
   # OLD (requires FLS)
   sf data query --query "SELECT ${field} FROM ${object} LIMIT 1"

   # NEW (schema-based)
   sf schema field list --object ${object} --json | jq ".result[] | select(.name == \"${field}\")"
   ```

4. **Create AgentAccess permission set** (if doesn't exist):
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/fls-aware-field-deployer.js Account \
     '{"fullName":"Test__c","type":"Text"}' \
     --org myorg --dry-run

   # Inspect generated permission set in .fls-field-deploy/
   ```

### Rollback Plan

If FLS-aware deployment causes issues:

1. **Disable bundling** (temporary):
   ```bash
   export DISABLE_FLS_BUNDLING=true
   ```

2. **Use old deployer**:
   ```javascript
   // Fallback to old approach
   const FieldDeploymentManager = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/field-deployment-manager');
   ```

3. **Manual FLS configuration**:
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/auto-fls-configurator.js Account CustomField__c --org myorg
   ```

## Testing Checklist

- [ ] Deploy field to sandbox using `fls-aware-field-deployer.js`
- [ ] Verify field appears in schema (no FLS required)
- [ ] Verify FieldPermissions record exists
- [ ] Verify PermissionSetAssignment exists
- [ ] Verify agent can query field (SOQL test)
- [ ] Verify agent can update field value
- [ ] Test with existing permission set
- [ ] Test with new permission set
- [ ] Test read-only FLS
- [ ] Test dry-run mode

## Success Metrics

**Target**: Reduce field deployment verification failures from 40% to <5%

**Metrics to Track**:
- Field deployment success rate
- FLS verification pass rate
- Time to field accessibility
- Agent error rates on field queries

## References

- Salesforce: [Field-Level Security Best Practices](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/admin_fls.htm)
- Salesforce: [PermissionSet Metadata API](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm)
- Salesforce: [Deploy Metadata](docs/sf-cli-reference/SALESFORCE_CLI_REFERENCE.md)

---

**Version**: 1.0
**Last Updated**: 2025-10-10
**Author**: RevPal Engineering (based on field deployment learnings)
