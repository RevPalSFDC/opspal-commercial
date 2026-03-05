# Salesforce Flow Version Management Playbook

**Last Updated**: 2025-10-24
**Version**: 1.0.0
**Status**: Production Ready

## Table of Contents

1. [Overview](#overview)
2. [Flow Version Fundamentals](#flow-version-fundamentals)
3. [Correct Order of Operations](#correct-order-of-operations)
4. [API Approaches](#api-approaches)
5. [Deploy as Active Setting](#deploy-as-active-setting)
6. [Version Lifecycle Management](#version-lifecycle-management)
7. [Common Pitfalls](#common-pitfalls)
8. [Tools and Scripts](#tools-and-scripts)
9. [Examples](#examples)

---

## Overview

### The Problem

Salesforce Flows support versioning, but **only one version can be active at a time**. Many deployment errors occur because teams:
- Attempt to modify active versions in place (not allowed)
- Deploy without proper deactivation/activation sequence
- Forget to activate new versions after deployment
- Accumulate excessive obsolete versions

### The Solution

This playbook provides the **definitive guide** for managing Flow versions via API and UI, ensuring:
- ✅ Zero activation failures
- ✅ Clean version history
- ✅ Rollback capability
- ✅ Production-safe deployments

### When to Use This Guide

- Creating a new version of an existing Flow
- Deploying Flows across environments (sandbox → production)
- Managing multiple Flow versions
- Cleaning up obsolete versions
- Troubleshooting activation issues

---

## Flow Version Fundamentals

### Core Principles

**Principle 1**: You CANNOT modify an active Flow version
- Salesforce prevents direct updates to active versions
- You MUST create a new version instead

**Principle 2**: Only ONE version can be active per Flow
- Activating version 5 automatically deactivates version 4
- No manual deactivation needed when using UI or newer APIs

**Principle 3**: Versions are immutable once created
- Each version is a snapshot
- Use versions for rollback capability

**Principle 4**: Inactive versions can be deleted
- Keep last 5-10 versions for history
- Delete older versions to reduce clutter

### Version Anatomy

```
Flow: Account_Record_Trigger
├── Version 1 (Obsolete) - Created 2024-01-01
├── Version 2 (Obsolete) - Created 2024-03-15
├── Version 3 (Obsolete) - Created 2024-06-20
├── Version 4 (Obsolete) - Created 2024-09-10
└── Version 5 (Active)   - Created 2024-10-24 ← Current
```

---

## Correct Order of Operations

### The 7-Step Safe Deployment Sequence

**Critical Rule**: NEVER activate a Flow immediately upon deployment. Always follow this sequence:

#### Step 1: Plan and Save New Version
- Make changes to Flow logic in Flow Builder
- Save as a NEW version (Salesforce auto-increments)
- Do NOT attempt to overwrite the active version
- Add version description explaining changes

**Example**:
```
Old Version: Account_Record_Trigger (Version 4 - Active)
New Version: Account_Record_Trigger (Version 5 - Inactive)
Description: "Added validation for null email addresses"
```

#### Step 2: Deactivate Old Version (Optional)

**When Required**:
- Using Metadata API deployment (older methods)
- Need to ensure clean slate before activation
- Explicit control over version lifecycle

**Methods**:

**Option A: FlowDefinition Metadata** (Legacy, API < v44)
```xml
<FlowDefinition>
    <activeVersionNumber>0</activeVersionNumber>
</FlowDefinition>
```

**Option B: Tooling API** (Current, API >= v44)
```javascript
// No explicit deactivation needed - activating new version auto-deactivates old
// But you CAN manually set Status = 'Draft' if needed
```

**⚠️ Important**: API v44+ discourages using FlowDefinition for activation. Use Flow metadata `<status>` instead.

#### Step 3: Deploy New Version

**Deployment Methods**:

**Method 1: Metadata API (Recommended)**
```bash
# Deploy flow with proper naming (no version suffix)
sf project deploy start \
  --metadata "Flow:Account_Record_Trigger" \
  --target-org production
```

**Flow File Naming**:
- ✅ Correct: `Account_Record_Trigger.flow-meta.xml`
- ❌ Wrong: `Account_Record_Trigger-5.flow-meta.xml`

**Method 2: Tooling API**
```javascript
// Use flow-version-manager.js (our custom tool)
const manager = new FlowVersionManager(orgAlias);
await manager.createNewVersion('Account_Record_Trigger', flowMetadata);
```

#### Step 4: Verify Deployment

**Verify the new version exists**:
```bash
sf data query \
  --query "SELECT DeveloperName, VersionNumber, IsActive FROM FlowVersionView WHERE DeveloperName = 'Account_Record_Trigger' ORDER BY VersionNumber DESC" \
  --target-org production \
  --use-tooling-api
```

**Expected Output**:
```
Version 5: IsActive = false (newly deployed)
Version 4: IsActive = true  (old active version)
```

**Verification Checks**:
- ✅ New version exists
- ✅ All field references are valid
- ✅ No syntax errors
- ✅ Entry criteria evaluates correctly

#### Step 5: Activate New Version

**Option A: Using "Deploy as Active" Setting**

Enable in Setup → Process Automation Settings → "Deploy processes and flows as active"

**Behavior**:
- Flows deployed with `<status>Active</status>` will activate automatically
- Requires test coverage for record-triggered flows in production
- Auto-deactivates old version

**When to Use**:
- CI/CD pipelines
- Production deployments with proper testing
- High-confidence deployments

**Option B: Manual Activation**

**Via UI**:
1. Navigate to Flow Builder
2. Open the Flow
3. Select new version
4. Click "Activate"

**Via Tooling API**:
```javascript
// Set Status to 'Active' in Flow metadata
const manager = new FlowVersionManager(orgAlias);
await manager.activateVersion('Account_Record_Trigger', 5);
```

**Via Metadata API**:
```xml
<!-- In Flow-meta.xml -->
<Flow>
    <status>Active</status>
</Flow>
```

#### Step 6: Post-Activation Verification

**Verify activation succeeded**:
```bash
sf data query \
  --query "SELECT DeveloperName, VersionNumber, IsActive FROM FlowVersionView WHERE DeveloperName = 'Account_Record_Trigger' ORDER BY VersionNumber DESC" \
  --target-org production \
  --use-tooling-api
```

**Expected Output**:
```
Version 5: IsActive = true  ← Newly activated
Version 4: IsActive = false ← Auto-deactivated
```

**Verification Checks**:
- ✅ Only Version 5 is active
- ✅ Version 4 is marked "Obsolete"
- ✅ No other versions are active

#### Step 7: Smoke Test

**MANDATORY for production Flows**:

Run a test to ensure the Flow behaves as expected:

**For Record-Triggered Flows**:
```bash
# Create test record that triggers the Flow
sf data create record \
  --sobject Account \
  --values "Name='TEST_SMOKE' Status__c='Draft'" \
  --target-org production

# Verify expected outcome
sf data get record \
  --sobject Account \
  --where "Name='TEST_SMOKE'" \
  --target-org production

# Delete test record
sf data delete record \
  --sobject Account \
  --where "Name='TEST_SMOKE'" \
  --target-org production
```

**For Screen Flows**:
- Manually open Flow in UI
- Complete all screens
- Verify expected results

**Automatic Smoke Testing**:
```javascript
// Using our ooo-metadata-operations.js
const result = await ooo.deployFlowSafe('Account_Record_Trigger', flowPath, {
  smokeTest: {
    testRecord: { Name: 'TEST_SMOKE', Status__c: 'Draft' },
    expectedOutcome: { field: 'Status__c', expectedValue: 'Approved' }
  }
});

if (!result.success) {
  // Flow automatically deactivated if smoke test fails
  console.error('Smoke test failed:', result.error);
}
```

### Rollback on Failure

**If any step fails**, roll back to the previous version:

```javascript
// Automatic rollback
await manager.activateVersion('Account_Record_Trigger', 4); // Reactivate old version
await manager.deleteVersion('Account_Record_Trigger', 5);   // Delete failed version
```

---

## API Approaches

### Modern Approach (API v44+) - RECOMMENDED

**Use Flow Metadata `<status>` Field**:

```xml
<!-- Flow-meta.xml -->
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
    <!-- Flow elements here -->
</Flow>
```

**Advantages**:
- ✅ Recommended by Salesforce
- ✅ Simpler deployment (one file)
- ✅ Auto-deactivates old version when new version activates
- ✅ Works with "Deploy as Active" setting

**Deployment**:
```bash
sf project deploy start --metadata "Flow:MyFlow" --target-org prod
```

### Legacy Approach (API < v44) - DISCOURAGED

**Use FlowDefinition Metadata**:

```xml
<!-- FlowDefinition-meta.xml -->
<FlowDefinition xmlns="http://soap.sforce.com/2006/04/metadata">
    <activeVersionNumber>5</activeVersionNumber>
</FlowDefinition>
```

**Why Discouraged**:
- ❌ Deprecated pattern
- ❌ Can cause "invalid version number" errors
- ❌ Requires separate FlowDefinition file
- ❌ More complex deployment

**When to Use**:
- Only for deactivation (set activeVersionNumber to 0)
- Legacy code maintenance

---

## Deploy as Active Setting

### Configuration

**Location**: Setup → Process Automation Settings → "Deploy processes and flows as active"

### Behavior

**When Enabled**:
- Flows with `<status>Active</status>` deploy as active automatically
- Requires test coverage for record-triggered flows (production only)
- Auto-deactivates previous version
- Deployment fails if tests don't pass (production)

**When Disabled** (Default):
- Flows always deploy as inactive (Draft)
- Requires manual activation after deployment
- No test execution during deployment

### Recommendations

**Enable for**:
- ✅ Production orgs with robust testing
- ✅ CI/CD pipelines with automated tests
- ✅ Well-tested Flows with high confidence

**Disable for**:
- ✅ Sandbox orgs (manual testing preferred)
- ✅ Development environments
- ✅ Complex Flows requiring manual verification

### Environment-Specific Strategy

| Environment | Setting | Rationale |
|-------------|---------|-----------|
| **Dev Sandbox** | Disabled | Manual testing preferred |
| **QA Sandbox** | Enabled | Automated testing ready |
| **UAT Sandbox** | Disabled | User acceptance testing |
| **Production** | Enabled | With test coverage |

---

## Version Lifecycle Management

### Version Cleanup Strategy

**Problem**: Orgs accumulate 20+ obsolete versions over time

**Solution**: Regular cleanup schedule

#### Cleanup Script

```bash
# List all versions of a Flow
sf data query \
  --query "SELECT DeveloperName, VersionNumber, IsActive, LastModifiedDate FROM FlowVersionView WHERE DeveloperName = 'My_Flow' ORDER BY VersionNumber DESC" \
  --target-org my-org \
  --use-tooling-api

# Delete inactive versions (keep last 5)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js cleanupVersions \
  My_Flow \
  my-org \
  --keep 5 \
  --dry-run

# Execute cleanup
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js cleanupVersions \
  My_Flow \
  my-org \
  --keep 5
```

#### Cleanup Policy

**Recommended Retention**:
- Keep last **5 versions** for rollback capability
- Keep last **1 year** of version history
- Delete versions older than 1 year (except last 5)

**Never Delete**:
- Active version (Salesforce prevents this)
- Last version (Salesforce requires at least one)

### Version Comparison

**Compare two versions**:
```bash
# Retrieve both versions
sf project retrieve start \
  --metadata "Flow:My_Flow" \
  --target-org my-org

# Use git diff or xmldiff
diff force-app/main/default/flows/My_Flow-4.flow-meta.xml \
     force-app/main/default/flows/My_Flow-5.flow-meta.xml
```

---

## Common Pitfalls

### Pitfall 1: Deploying Same Version Number

**Error**:
```
Error: Cannot deploy Flow version 4 - version 4 is already active in target org
```

**Cause**: Trying to deploy the same version number that's already active

**Solution**: Always increment version number before deployment

**Prevention**:
```javascript
// Check active version before deployment
const activeVersion = await manager.getActiveVersion('My_Flow');
console.log(`Current active: ${activeVersion.VersionNumber}`);
// Ensure new version > activeVersion.VersionNumber
```

### Pitfall 2: Forgetting to Activate

**Symptom**: Flow deploys successfully but doesn't execute

**Cause**: Deployed as inactive (Draft status)

**Solution**:
1. Check "Deploy as Active" setting
2. Manually activate after deployment
3. Use flow-version-manager.js for automated activation

### Pitfall 3: Missing Test Coverage (Production)

**Error**:
```
Error: This flow cannot be activated because test coverage is below 75%
```

**Cause**: Production requires test coverage for record-triggered flows

**Solution**:
1. Write Apex tests that trigger the Flow
2. Ensure 75%+ coverage
3. Run tests before activation

**Test Pattern**:
```apex
@isTest
static void testAccountRecordTrigger() {
    Test.startTest();
    Account acc = new Account(Name = 'Test');
    insert acc;
    Test.stopTest();

    // Assert Flow executed correctly
    acc = [SELECT Status__c FROM Account WHERE Id = :acc.Id];
    System.assertEquals('Processed', acc.Status__c);
}
```

### Pitfall 4: Invalid Field References

**Error**:
```
Error: Flow validation failed - Field Xyz__c does not exist
```

**Cause**: Flow references field that doesn't exist in target org

**Solution**:
1. Verify all field references before deployment
2. Use OOO precheck: `ooo.deployFlowSafe()` with validation
3. Deploy fields BEFORE deploying Flows

**Prevention**:
```bash
# Verify field exists
sf sobject describe Account --target-org production | grep Xyz__c

# Deploy fields first
sf project deploy start --metadata "CustomField:Account.Xyz__c" --target-org production

# Then deploy Flow
sf project deploy start --metadata "Flow:Account_Record_Trigger" --target-org production
```

### Pitfall 5: Using FlowDefinition Incorrectly

**Error**:
```
Error: Invalid activeVersionNumber
```

**Cause**: Using deprecated FlowDefinition metadata pattern

**Solution**: Use Flow metadata `<status>` field instead (API v44+)

---

## Tools and Scripts

### flow-version-manager.js

**Location**: `scripts/lib/flow-version-manager.js`

**Usage**:
```bash
# List all versions
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js listVersions My_Flow my-org

# Get active version
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js getActiveVersion My_Flow my-org

# Activate specific version
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js activateVersion My_Flow 5 my-org

# Deactivate Flow (set to no active version)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js deactivateFlow My_Flow my-org

# Cleanup old versions
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js cleanupVersions My_Flow my-org --keep 5
```

### ooo-metadata-operations.js

**Location**: `scripts/lib/ooo-metadata-operations.js`

**Safe Deployment with Version Management**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations.js deployFlowSafe \
  My_Flow \
  ./flows/My_Flow.flow-meta.xml \
  my-org \
  --smoke-test '{"testRecord":{"Name":"Test"},"expectedOutcome":{"field":"Status__c","expectedValue":"Active"}}' \
  --verbose
```

**Programmatic Usage**:
```javascript
const { OOOMetadataOperations } = require('./ooo-metadata-operations');
const ooo = new OOOMetadataOperations('my-org', { verbose: true });

const result = await ooo.deployFlowSafe('My_Flow', flowPath, {
  smokeTest: {
    testRecord: { Name: 'TEST' },
    expectedOutcome: { field: 'Status__c', expectedValue: 'Active' }
  }
});
```

---

## Examples

### Example 1: Simple Version Update

**Scenario**: Update existing Flow in production

```bash
# Step 1: Retrieve current Flow
sf project retrieve start \
  --metadata "Flow:Account_Record_Trigger" \
  --target-org production

# Step 2: Modify Flow-meta.xml (make changes)

# Step 3: Deploy with safe method
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/ooo-metadata-operations.js deployFlowSafe \
  Account_Record_Trigger \
  ./force-app/main/default/flows/Account_Record_Trigger.flow-meta.xml \
  production \
  --smoke-test '{"testRecord":{"Name":"TEST_SMOKE","Status__c":"Draft"},"expectedOutcome":{"field":"Status__c","expectedValue":"Approved"}}' \
  --verbose

# Result: New version created, tested, and activated
```

### Example 2: Cross-Org Deployment

**Scenario**: Deploy Flow from Dev → QA → Production

```bash
# Step 1: Deploy to QA (test first)
sf project deploy start \
  --metadata "Flow:Account_Record_Trigger" \
  --target-org qa \
  --test-level RunLocalTests

# Step 2: Activate in QA (if "Deploy as Active" disabled)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js activateVersion \
  Account_Record_Trigger \
  $(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js getLatestVersion Account_Record_Trigger qa) \
  qa

# Step 3: Test in QA environment
# (manual testing)

# Step 4: Deploy to Production (with "Deploy as Active" enabled)
sf project deploy start \
  --metadata "Flow:Account_Record_Trigger" \
  --target-org production \
  --test-level RunLocalTests

# Result: Flow auto-activates in production (if setting enabled)
```

### Example 3: Rollback to Previous Version

**Scenario**: New version has bug, need to rollback

```bash
# Step 1: Identify previous good version
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js listVersions Account_Record_Trigger production

# Output:
# Version 5: Active (deployed today - HAS BUG)
# Version 4: Obsolete (deployed last week - GOOD)

# Step 2: Activate previous version
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js activateVersion \
  Account_Record_Trigger \
  4 \
  production

# Step 3: Verify rollback
sf data query \
  --query "SELECT VersionNumber, IsActive FROM FlowVersionView WHERE DeveloperName = 'Account_Record_Trigger' ORDER BY VersionNumber DESC" \
  --target-org production \
  --use-tooling-api

# Output:
# Version 5: Inactive
# Version 4: Active ← Rolled back
```

### Example 4: Version Cleanup

**Scenario**: Flow has 20 versions, need cleanup

```bash
# Step 1: List all versions
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js listVersions Account_Record_Trigger production

# Step 2: Dry run cleanup (keep last 5)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js cleanupVersions \
  Account_Record_Trigger \
  production \
  --keep 5 \
  --dry-run

# Output: Would delete versions 1-15

# Step 3: Execute cleanup
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-version-manager.js cleanupVersions \
  Account_Record_Trigger \
  production \
  --keep 5

# Result: Only versions 16-20 remain
```

---

## Related Documentation

- [Salesforce Order of Operations](./SALESFORCE_ORDER_OF_OPERATIONS.md) - D3 Flow deployment sequence
- [Salesforce Tooling API Flow Objects](./SALESFORCE_TOOLING_API_FLOW_OBJECTS.md) - API reference
- [Flow Design Best Practices](./FLOW_DESIGN_BEST_PRACTICES.md) - Design patterns
- [Flow Elements Reference](./FLOW_ELEMENTS_REFERENCE.md) - Elements dictionary

---

## References

1. [Salesforce Flow Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.flow.meta/flow/)
2. [Metadata API Developer Guide - Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flow.htm)
3. [Tooling API Reference - FlowDefinitionView](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-24 | Initial playbook created |

---

**Maintainer**: RevPal Engineering
**Review Frequency**: Quarterly or when API version upgraded
