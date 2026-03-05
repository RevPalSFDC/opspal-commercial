# OOO Quick Start Guide

## What is OOO?

**Order of Operations (OOO)** is a systematic approach to Salesforce operations that prevents common deployment and data failures through:

1. **Introspection** - Understand before acting
2. **Planning** - Sequence correctly
3. **Application** - Execute safely
4. **Verification** - Confirm success
5. **Activation** - Only after verification

## 3-Minute Quick Start

### For Record Creation

```bash
# Create a record safely
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-write-operations.js createRecordSafe Account myorg \
  --payload '{"Name":"Test Company","Industry":"Technology"}' \
  --verbose
```

**What happens**:
- Describes Account object
- Checks validation rules
- Resolves record type
- Verifies FLS
- Creates record
- Confirms creation

### For Field Deployment

```bash
# Deploy field with FLS atomically
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations.js deployFieldPlusFlsPlusRT Account myorg \
  --fields '[{"fullName":"CustomField__c","type":"Text","length":255}]' \
  --permission-set AgentAccess \
  --verbose
```

**What happens**:
- Generates field metadata
- Creates/updates permission set
- Deploys both together
- Verifies field exists
- Confirms FLS applied

### For Flow Deployment

```bash
# Deploy flow safely
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations.js deployFlowSafe MyFlow ./flows/MyFlow.flow-meta.xml myorg \
  --smoke-test '{"testRecord":{"Name":"Test"}}' \
  --verbose
```

**What happens**:
- Checks field references exist
- Deploys flow as Inactive
- Verifies no missing refs
- Activates flow
- Runs smoke test
- Rolls back if test fails

## When to Use Each Tool

| Your Task | Tool | Command |
|-----------|------|---------|
| Creating records | `ooo-write-operations.js` | `createRecordSafe` |
| Deploying fields | `ooo-metadata-operations.js` | `deployFieldPlusFlsPlusRT` |
| Deploying flows | `ooo-metadata-operations.js` | `deployFlowSafe` |
| Checking rules | `ooo-validation-rule-analyzer.js` | `getRules` or `predict` |
| Validating dependencies | `ooo-dependency-enforcer.js` | `validate` |
| Checking permissions | `ooo-permission-guardrail.js` | `validate` |

## Common Patterns

### Pattern 1: Introspect Before Bulk

```javascript
const { OOOWriteOperations } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-write-operations');
const ooo = new OOOWriteOperations(orgAlias);

// Introspect once
const metadata = await ooo.describeObject('Contact');
const rules = await ooo.getActiveValidationRules('Contact');

// Apply to 1000 records
// (Use bulk-api-handler.js for execution)
```

### Pattern 2: Atomic Metadata

```javascript
const { OOOMetadataOperations } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations');
const ooo = new OOOMetadataOperations(orgAlias);

// Field + Permission in ONE transaction
await ooo.deployFieldPlusFlsPlusRT('Account', fieldDefs, {
    permissionSetName: 'AgentAccess'
});
```

### Pattern 3: Validate Before Deploy

```bash
# Check dependencies first
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-dependency-enforcer.js validate package.xml myorg \
  --context context.json

# If exit code 0, safe to deploy
if [ $? -eq 0 ]; then
  sf project deploy start --manifest package.xml --target-org myorg
fi
```

## Error Messages Explained

### Validation Failure
```
❌ Record creation failed:
   Rule: Account_Industry_Required
   Formula: AND(ISBLANK(Industry), RecordType.Name = 'Customer')
   Message: Industry is required for Customer accounts
```

**Fix**: Add `Industry` field to payload

### Dependency Violation
```
❌ Dependency validation failed: 1 violations
   CRITICAL: Flow "MyFlow" references unknown field Account.CustomField__c
   Remediation: Deploy field Account.CustomField__c before activating flow
```

**Fix**: Deploy field first, then flow

### Permission Downgrade
```
❌ Permission downgrades detected - deployment blocked
   FIELD_READ_REMOVED: Account.CustomField__c
   Impact: Field will no longer be readable
   Use --allow-downgrade flag to proceed
```

**Fix**: Add `--allow-downgrade` flag or fix permissions

## Tips

1. **Use --verbose flag** for detailed logging
2. **Use --dry-run** to preview without executing
3. **Check logs** in `.ooo-logs/` for audit trail
4. **Start with introspection** to understand object state
5. **Test in sandbox** before production

## Need Help?

- **Full Documentation**: `docs/SALESFORCE_ORDER_OF_OPERATIONS.md`
- **Playbooks**: `templates/playbooks/safe-record-creation/` and `safe-flow-deployment/`
- **CLI Help**: Run any tool without arguments for usage info

## 30-Second Test

```bash
cd .claude-plugins/opspal-core-plugin/packages/domains/salesforce

# Test introspection (read-only, safe)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-write-operations.js introspect Account your-org --verbose

# Should show: object metadata, required fields, validation rules
```

If this works, you're ready to use OOO!
