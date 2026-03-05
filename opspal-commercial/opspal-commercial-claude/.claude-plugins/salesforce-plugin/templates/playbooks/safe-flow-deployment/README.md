# Safe Flow Deployment Playbook (OOO D3 Sequence)

## Overview

This playbook demonstrates the complete D3 sequence from the Salesforce Order of Operations spec for safe, verified flow deployment with smoke testing.

**When to Use**: ANY flow deployment, especially:
- Production environments
- Flows with field updates or record creation
- Process automation with business logic
- Flows that trigger on record save

## The 5-Step Pattern

### Critical Rule: NEVER Deploy Flows Active

```bash
# ❌ WRONG: Deploys flow as Active immediately
sf project deploy start --metadata Flow:MyFlow --target-org myorg

# ✅ CORRECT: Deploy Inactive → Verify → Activate → Smoke Test
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations.js deployFlowSafe MyFlow ./flows/MyFlow.flow-meta.xml myorg
```

## Complete Workflow

### Step 1: Precheck (Fields Exist + FLS Confirmed)

**Before deploying flow**, verify all field references:

```bash
# Extract field references from flow
grep -o '<fieldName>[^<]*</fieldName>' flows/MyFlow.flow-meta.xml | \
  sed 's/<[^>]*>//g' | sort -u > field-refs.txt

# Verify each field exists
while read field; do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query myorg Account "$field"
done < field-refs.txt
```

### Step 2: Deploy Inactive

```bash
# Modify flow XML to set status=Inactive
# (Done automatically by ooo-metadata-operations.js)

# Deploy flow
sf project deploy start --metadata Flow:MyFlow --target-org myorg --wait 10
```

### Step 3: Verify Flow (No Missing References)

```bash
# Query flow definition
sf data query --query "SELECT Id, ApiName, ProcessType, IsActive FROM FlowDefinition WHERE ApiName = 'MyFlow'" --use-tooling-api --target-org myorg

# Verify IsActive = false
# Check for deployment errors in flow nodes
```

### Step 4: Activate Flow

```bash
# Get flow definition ID
FLOW_DEF_ID=$(sf data query --query "SELECT Id FROM FlowDefinition WHERE ApiName = 'MyFlow'" --use-tooling-api --target-org myorg --json | jq -r '.result.records[0].Id')

# Get latest version ID
VERSION_ID=$(sf data query --query "SELECT Id FROM Flow WHERE Definition.ApiName = 'MyFlow' ORDER BY VersionNumber DESC LIMIT 1" --use-tooling-api --target-org myorg --json | jq -r '.result.records[0].Id')

# Activate
sf data update record --sobject FlowDefinition --record-id $FLOW_DEF_ID --values "ActiveVersionId=$VERSION_ID" --use-tooling-api --target-org myorg
```

### Step 5: Smoke Test

```bash
# Create test record that should trigger flow
sf data create record --sobject Account \
  --values "Name=TEST_SMOKE_TEST,Industry=Technology" \
  --target-org myorg --json > test-record.json

# Get record ID
RECORD_ID=$(jq -r '.result.id' test-record.json)

# Wait for flow execution (async)
sleep 5

# Verify expected outcome
sf data query --query "SELECT Id, Status__c FROM Account WHERE Id = '$RECORD_ID'" --target-org myorg

# Expected: Status__c should be set by flow
```

## Complete Example

### Scenario: Deploy Quote Status Update Flow

```javascript
const { OOOMetadataOperations } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations');

const ooo = new OOOMetadataOperations('myorg', { verbose: true });

const result = await ooo.deployFlowSafe(
    'Quote_Status_Update',
    './flows/Quote_Status_Update.flow-meta.xml',
    {
        smokeTest: {
            testRecord: {
                Name: 'Test Quote - DELETE ME',
                SBQQ__Account__c: '001xxx',  // Test account ID
                SBQQ__Status__c: 'Draft'
            },
            expectedOutcome: {
                field: 'SBQQ__Status__c',
                expectedValue: 'Approved',  // What flow should set
                timeout: 10  // Seconds to wait
            }
        }
    }
);

if (result.success) {
    console.log('✅ Flow deployed and smoke tested successfully');
} else {
    console.error(`❌ Flow deployment failed: ${result.error}`);
    // Flow is automatically deactivated if smoke test fails
}
```

### Expected Output

```
🚀 Starting safe flow deployment for Quote_Status_Update
Step 1: Pre-checking field existence and FLS...
  ✓ All field references exist
  ✓ FLS confirmed for all fields
Step 2: Deploying flow as Inactive...
  ✓ Flow deployed (Status: Inactive)
Step 3: Verifying flow references...
  ✓ No missing references
  ✓ Flow syntax valid
Step 4: Activating flow...
  ✓ Flow activated
Step 5: Running smoke test...
  Creating test record...
  ✓ Test record created: 001xxx
  Waiting for flow execution...
  Verifying outcome...
  ✓ Field SBQQ__Status__c = "Approved" (expected)
  ✓ Smoke test passed
✅ Safe flow deployment completed successfully
```

## Rollback on Smoke Test Failure

If smoke test fails:

```
Step 5: Running smoke test...
  Creating test record...
  ✓ Test record created: 001xxx
  Waiting for flow execution...
  Verifying outcome...
  ❌ Field SBQQ__Status__c = "Draft" (expected "Approved")
⚠️  Smoke test failed, rolling back...
  Deactivating flow...
  ✓ Flow deactivated

❌ Smoke test failed:
   Expected: SBQQ__Status__c = "Approved"
   Actual: SBQQ__Status__c = "Draft"

Remediation:
  1. Review flow field update assignments
  2. Check flow entry criteria and filters
  3. Verify SBQQ__Status__c update logic
  4. Fix flow and redeploy
```

**Automatic Rollback**: Flow is deactivated, diff is generated, remediation suggested.

## Field Reference Verification

Before deploying flow, verify ALL field references exist:

```bash
# Extract all field references
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-field-extractor.js ./flows/MyFlow.flow-meta.xml > refs.txt

# Verify each reference
while read ref; do
  OBJ=$(echo $ref | cut -d. -f1)
  FIELD=$(echo $ref | cut -d. -f2)

  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query myorg $OBJ $FIELD || {
    echo "❌ Missing field: $OBJ.$FIELD"
    exit 1
  }
done < refs.txt
```

## FLS Confirmation

Ensure integration user has FLS on all flow-referenced fields:

```bash
# Query FieldPermissions
sf data query --query "
  SELECT Field, PermissionsRead, PermissionsEdit
  FROM FieldPermissions
  WHERE Parent.Name = 'AgentAccess'
  AND Field LIKE 'Account.%'
" --target-org myorg
```

## Smoke Test Design

### Designing Effective Smoke Tests

**Good Smoke Test**:
```json
{
  "testRecord": {
    "Name": "TEST_SMOKE_TEST_DELETE",
    "SBQQ__Status__c": "Draft",
    "SBQQ__Account__c": "001xxx"
  },
  "expectedOutcome": {
    "field": "SBQQ__Status__c",
    "expectedValue": "Approved",
    "timeout": 10
  }
}
```

**Characteristics**:
- Unique name for cleanup
- Triggers flow entry criteria
- Tests specific field update
- Has measurable outcome

**Bad Smoke Test**:
```json
{
  "testRecord": { "Name": "Test" }
}
// ❌ No expected outcome specified
// ❌ May not trigger flow
// ❌ No cleanup strategy
```

### Smoke Test Cleanup

After smoke test (pass or fail):

```bash
# Find and delete smoke test records
sf data query --query "SELECT Id FROM Account WHERE Name LIKE 'TEST_SMOKE_TEST%'" --target-org myorg --json | \
  jq -r '.result.records[].Id' | \
  xargs -I {} sf data delete record --sobject Account --record-id {} --target-org myorg
```

## Troubleshooting

### Issue: Flow Not Activating

**Symptom**: Activation step fails

**Diagnosis**:
```bash
# Check for flow errors
sf data query --query "SELECT Id, Status, ProcessType FROM Flow WHERE Definition.ApiName = 'MyFlow'" --use-tooling-api --target-org myorg
```

**Common Causes**:
- Missing field references
- Invalid formula syntax
- Screen flow vs auto-launched mismatch

### Issue: Smoke Test Fails

**Symptom**: Expected outcome not achieved

**Diagnosis**:
```bash
# Check flow interview records
sf data query --query "SELECT Id, CurrentElement, InterviewStatus FROM FlowInterview WHERE Name LIKE '%MyFlow%' ORDER BY CreatedDate DESC LIMIT 5" --target-org myorg

# Review flow debug logs (if enabled)
```

**Common Causes**:
- Flow entry criteria not met
- Field update formula incorrect
- Flow decision logic error

### Issue: Field Reference Error

**Symptom**: "No such column" error in flow

**Diagnosis**:
```bash
# Verify field exists
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query myorg Account CustomField__c

# Verify FLS
sf data query --query "SELECT Field FROM FieldPermissions WHERE Parent.Name = 'AgentAccess' AND Field = 'Account.CustomField__c'" --target-org myorg
```

**Remediation**: Deploy field with FLS before deploying flow.

## ROI

- **Zero-surprise activations** - Flows verified before going live
- **Immediate rollback** - Failed smoke tests auto-deactivate
- **Clear remediation** - Diff shows exactly what's wrong
- **Production safety** - Test in production without risk

## Reference

- **OOO Spec**: `docs/SALESFORCE_ORDER_OF_OPERATIONS.md` (Section B2, D3)
- **Metadata Operations**: `scripts/lib/ooo-metadata-operations.js`
- **Flow Rollback**: `scripts/lib/ooo-flow-rollback.js`
