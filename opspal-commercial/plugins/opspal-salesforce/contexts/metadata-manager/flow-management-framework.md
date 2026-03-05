# Flow Management Framework - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: High
**Trigger**: When user message contains: `flow`, `automation`, `activate flow`, `deactivate flow`, `flow version`, `deploy flow`
**Estimated Tokens**: 1,998

---

## Overview

Complete flow lifecycle management with version control, best practices validation, and safe deployment patterns. This framework ensures flows are deployed safely with proper validation, versioning, and rollback capabilities.

**Key Benefits**:
- Automatic version management with rollback
- Best practices validation (blocks anti-patterns)
- Safe deployment sequence: inactive → verify → activate → test
- Automatic cleanup of old versions

---

## 📚 Flow Management Framework (v1.0.0 - MANDATORY)

**CRITICAL**: All Flow deployments MUST use the comprehensive Flow Management Framework.

### Core Documentation (MUST READ)
1. **Flow Version Management**: `docs/FLOW_VERSION_MANAGEMENT.md` - Complete version lifecycle playbook
2. **Flow Design Best Practices**: `docs/FLOW_DESIGN_BEST_PRACTICES.md` - Design patterns and anti-patterns
3. **Flow Elements Reference**: `docs/FLOW_ELEMENTS_REFERENCE.md` - Complete elements dictionary

---

## Critical Rules for Flow Deployment

### Rule 1: Version Management (MANDATORY)
- ALWAYS use `flow-version-manager.js` for version operations
- ALWAYS use `deployFlowWithVersionManagement()` (NOT deployFlowSafe alone)
- ALWAYS increment version numbers
- ALWAYS verify activation after deployment
- ALWAYS cleanup old versions (keep last 5)

### Rule 2: Best Practices Validation (MANDATORY)
- Run `flow-best-practices-validator.js` BEFORE every Flow deployment
- Minimum compliance score: 70/100 for production
- Fix ALL CRITICAL violations before deployment
- Block deployment if anti-patterns detected

### Rule 3: Anti-Patterns (NEVER ALLOW)
- ❌ DML operations inside loops (CRITICAL - will fail in production)
- ❌ SOQL queries inside loops (CRITICAL - will hit governor limits)
- ❌ Unnecessary Get Records (querying data you already have)
- ❌ Hard-coded Salesforce IDs (breaks across orgs)
- ❌ Missing fault paths on DML/SOQL elements

### Rule 4: Required Patterns (ALWAYS ENFORCE)
- ✅ Query all needed data BEFORE loops
- ✅ Use collections and bulk DML outside loops
- ✅ Use $Record directly in record-triggered Flows
- ✅ Add fault paths to all DML/SOQL elements
- ✅ Include smoke tests for production Flows

---

## Pre-Flow-Deployment Checklist

**BEFORE ANY Flow deployment**:
```bash
# 1. Validate best practices (MANDATORY)
node scripts/lib/flow-best-practices-validator.js <flow-path> --verbose

# Output example:
# Compliance Score: 85/100 ✅
# - 0 CRITICAL violations
# - 1 MEDIUM violation (unnecessary Get Records)

# 2. Deploy with version management (MANDATORY)
node scripts/lib/ooo-metadata-operations.js deployFlowWithVersionManagement \
  <flow-name> <flow-path> <org> \
  --smoke-test '<test-config>' \
  --cleanup \
  --keep 5 \
  --verbose
```

**If compliance score < 70 or CRITICAL violations found**: ❌ **BLOCK DEPLOYMENT**

---

## Safe Flow Deployment with Version Management (D3)

**NEVER activate flows without version management AND validation**:

```javascript
const { OOOMetadataOperations } = require('./scripts/lib/ooo-metadata-operations');
const FlowBestPracticesValidator = require('./scripts/lib/flow-best-practices-validator');

const ooo = new OOOMetadataOperations(orgAlias, { verbose: true });

// STEP 1: Validate best practices (MANDATORY)
const validator = new FlowBestPracticesValidator({
    flowPath: './flows/Quote_Status_Update.flow-meta.xml',
    verbose: true
});

const validation = await validator.validate();

if (validation.complianceScore < 70) {
    throw new Error(`Flow fails compliance (Score: ${validation.complianceScore}). Fix violations before deployment.`);
}

if (validation.violations.some(v => v.severity === 'CRITICAL')) {
    throw new Error(`Flow has CRITICAL violations. Must fix before deployment.`);
}

// STEP 2: Deploy flow with version management + safety sequence
const result = await ooo.deployFlowWithVersionManagement(
    'Quote_Status_Update',
    './flows/Quote_Status_Update.flow-meta.xml',
    {
        smokeTest: {
            testRecord: {
                Name: 'Test Quote',
                SBQQ__Account__c: '001xxx',
                SBQQ__Status__c: 'Draft'
            },
            expectedOutcome: {
                field: 'SBQQ__Status__c',
                expectedValue: 'Approved'  // What flow should set
            }
        },
        cleanup: true,       // Clean up old versions
        keepVersions: 5,     // Keep last 5 versions
        deactivateOld: false // Auto-deactivates when new activates
    }
);

if (!result.success) {
    // Automatic rollback to previous version performed
    throw new Error(`Flow deployment failed: ${result.error}`);
}

console.log(`✅ Flow deployed successfully`);
console.log(`   Previous version: ${result.versionInfo.previousVersion || 'None'}`);
console.log(`   New version: ${result.versionInfo.newVersion}`);
```

**What This Does** (9 Steps with Version Management):
1. **Validate Best Practices** - Check for anti-patterns (DML in loops, etc.)
2. **Query Active Version** - Get current active version number
3. **Increment Version** - Determine new version number
4. **Precheck** - Verify all field references exist + FLS confirmed
5. **Deploy Inactive** - Flow created but not active
6. **Verify Flow** - No missing field references, syntax valid
7. **Activate Flow** - Only after verification passes
8. **Smoke Test** - Create test record → assert expected effect
9. **Cleanup Old Versions** - Remove obsolete versions (keep last 5)

**Rollback**: If validation or deployment fails, automatically rolls back to previous version.

---

## CLI Usage

```bash
# Atomic field deployment (for flow dependencies)
node scripts/lib/ooo-metadata-operations.js deployFieldPlusFlsPlusRT Account myorg \
  --fields '[{"fullName":"Test__c","type":"Text","label":"Test","length":255}]' \
  --permission-set AgentAccess \
  --verbose

# Validate Flow best practices (REQUIRED FIRST)
node scripts/lib/flow-best-practices-validator.js ./flows/MyFlow.flow-meta.xml --verbose

# Flow deployment with version management (NEW - MANDATORY)
node scripts/lib/ooo-metadata-operations.js deployFlowWithVersionManagement \
  MyFlow \
  ./flows/MyFlow.flow-meta.xml \
  myorg \
  --smoke-test '{"testRecord":{"Name":"Test"}}' \
  --cleanup \
  --keep 5 \
  --verbose

# Check Flow version history
node scripts/lib/flow-version-manager.js listVersions MyFlow myorg

# Rollback to previous version if needed
node scripts/lib/flow-version-manager.js activateVersion MyFlow 4 myorg
```

---

## B3: Package-Level Rules

When deploying metadata packages:

**Replace-not-merge awareness**:
```javascript
// ❌ WRONG: Deploy partial permission set
// This REPLACES existing permissions!

// ✅ CORRECT: Retrieve → merge → deploy full set
const existing = await retrievePermissionSet('AgentAccess');
const merged = mergePermissions(existing, newPermissions);
await deployPermissionSet(merged);
```

**Deterministic XML**: Sort lists alphabetically to avoid churn

**Activation always last**: Verify metadata before activating automation

---

## Critical Patterns

### Pattern 1: Field + FLS Atomic
```bash
# Deploy field and permission set together (ONE transaction)
node scripts/lib/ooo-metadata-operations.js deployFieldPlusFlsPlusRT <object> <org> \
  --fields '[...]'
```

**Why**: Flow needs field + FLS to exist before activation. Atomic deployment ensures both are present.

---

### Pattern 2: Flow Inactive→Verify→Activate
```bash
# NEVER: sf project deploy start --metadata Flow:MyFlow (deploys active immediately!)

# ALWAYS: Use safe sequence
node scripts/lib/ooo-metadata-operations.js deployFlowSafe MyFlow ./path myorg
```

**Why**: Activating immediately can break production if flow has errors. Always verify first.

---

### Pattern 3: Validation Before Activation
```javascript
// Check all dependencies before activating
const { OOODependencyEnforcer } = require('./scripts/lib/ooo-dependency-enforcer');
const enforcer = new OOODependencyEnforcer(orgAlias);

const validation = await enforcer.validateAll({
    flows: [{ name: 'MyFlow', path: './flows/MyFlow.flow-meta.xml' }]
});

if (!validation.passed) {
    throw new Error(`Dependency validation failed: ${validation.violations.length} issues`);
}
```

**Why**: Ensures all fields, objects, and permissions exist before flow activation.

---

## Common Anti-Patterns and Fixes

### Anti-Pattern 1: DML in Loops
**❌ WRONG**:
```
Loop through records
  Update each record individually (DML inside loop)
```

**✅ RIGHT**:
```
Loop through records
  Add to collection
Update collection (DML outside loop - bulk operation)
```

**Why**: DML inside loops hits governor limits (150 DML statements per transaction).

---

### Anti-Pattern 2: SOQL in Loops
**❌ WRONG**:
```
Loop through accounts
  Query contacts for each account (SOQL inside loop)
```

**✅ RIGHT**:
```
Query all contacts for all accounts (SOQL before loop)
Loop through accounts
  Filter contacts from pre-queried data
```

**Why**: SOQL inside loops hits governor limits (100 SOQL queries per transaction).

---

### Anti-Pattern 3: Hard-Coded IDs
**❌ WRONG**:
```
Set Account.OwnerId = '005xxxxxxxxxxxxx'
```

**✅ RIGHT**:
```
Query user by username or role
Set Account.OwnerId = {!queriedUser.Id}
```

**Why**: Hard-coded IDs break when moving between sandboxes and production.

---

## Flow Version Management

### List All Versions
```bash
node scripts/lib/flow-version-manager.js listVersions MyFlow myorg
```

**Output**:
```
Flow: MyFlow
  Version 1: Inactive (created 2025-10-01)
  Version 2: Inactive (created 2025-10-15)
  Version 3: Active (created 2025-10-28) ← Current
  Version 4: Inactive (created 2025-10-30)
```

### Activate Specific Version
```bash
node scripts/lib/flow-version-manager.js activateVersion MyFlow 3 myorg
```

**Use Case**: Rollback to previous version if new version has issues.

### Cleanup Old Versions
```bash
node scripts/lib/flow-version-manager.js cleanup MyFlow myorg --keep 5
```

**Removes**: Versions older than the last 5, keeping only recent versions.

---

## Smoke Testing

### What is a Smoke Test?
A smoke test creates a test record, triggers the flow, and verifies the expected outcome.

### Example Smoke Test Config
```javascript
smokeTest: {
    testRecord: {
        Name: 'Test Opportunity',
        StageName: 'Prospecting',
        CloseDate: '2025-12-31',
        Amount: 50000
    },
    expectedOutcome: {
        field: 'StageName',
        expectedValue: 'Qualification',  // Flow should update stage
        timeout: 5000  // Wait up to 5 seconds for flow to execute
    },
    cleanup: true  // Delete test record after smoke test
}
```

### When Smoke Tests Fail
- Flow did not execute (check trigger criteria)
- Field not updated as expected (logic error)
- Timeout (flow taking too long - performance issue)
- Permission issue (flow lacks FLS for field)

---

## Reference Documentation

- **Complete OOO Spec**: `docs/SALESFORCE_ORDER_OF_OPERATIONS.md`
- **Metadata Operations Library**: `scripts/lib/ooo-metadata-operations.js`
- **Dependency Enforcer**: `scripts/lib/ooo-dependency-enforcer.js`
- **Flow Version Manager**: `scripts/lib/flow-version-manager.js`
- **Best Practices Validator**: `scripts/lib/flow-best-practices-validator.js`
- **CLI Help**: `node scripts/lib/ooo-metadata-operations.js --help`

---

**When This Context is Loaded**: When user message contains keywords: `flow`, `automation`, `activate flow`, `deactivate flow`, `flow version`, `deploy flow`, `flow definition`, `flow lifecycle`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview and Order of Operations (OOO) protocol

**Related Contexts**:
- `common-tasks-reference.md` - Flow deployment examples
- Order of Operations (kept in base agent) - Flow deployment sequence

---

**Context File**: `contexts/metadata-manager/flow-management-framework.md`
**Lines**: 222 (original agent lines 101-323)
**Priority**: High
**Related Scripts**:
- `scripts/lib/ooo-metadata-operations.js`
- `scripts/lib/flow-version-manager.js`
- `scripts/lib/flow-best-practices-validator.js`
- `scripts/lib/ooo-dependency-enforcer.js`
