---
description: Interactive guide for Salesforce flow activation with comprehensive troubleshooting
argument-hint: "[options]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# Activate Salesforce Flows

This command helps activate deployed flows that are in Draft status, with special handling for flows with Apex invocation, formula errors, and other common blockers.

## What this does:
1. Lists all flows in Draft status with detailed metadata
2. Validates flows for common activation blockers
3. Provides activation options (Metadata API, Apex, or UI instructions)
4. Verifies activation was successful
5. Troubleshoots and fixes common activation failures

## Usage:
Just type `/activate-flows` and I'll guide you through the process.

## Common issues handled:
- Flows with formula errors (especially picklist comparisons)
- Flows referencing inactive or non-existent components
- Flows invoking Apex classes (requires special handling)
- Version conflicts and permission issues
- Object/field existence problems (Quote vs SBQQ__Quote__c)

## Step-by-Step Process:

### 1. Discovery Phase
I'll run these queries to understand your flow landscape:

```sql
-- Find all Draft flows
SELECT Id, Definition.DeveloperName, MasterLabel, VersionNumber, Status, ProcessType
FROM Flow
WHERE Status = 'Draft'
ORDER BY MasterLabel

-- Check for Apex invocations
SELECT Id, MasterLabel, (SELECT Id FROM FlowActionCalls WHERE ActionType = 'apex')
FROM Flow
WHERE Status = 'Draft'
```

### 2. Pre-Activation Validation

Before attempting activation, I'll run comprehensive validation:

```bash
# Validate flow formulas
node scripts/lib/flow-formula-validator.js [flow-file] [org-alias]

# Check object existence (especially for Quote/CPQ scenarios)
node scripts/lib/object-existence-validator.js [org-alias] [object-name] --discover

# Check for Apex invocations
node scripts/lib/flow-activation-validator.js [org-alias] [flow-directory]
```

### 3. Activation Methods

#### Option A: Metadata API Activation (Preferred for simple flows)
```bash
# Retrieve flow metadata
sf project retrieve start --metadata Flow:FlowDeveloperName --target-org [org]

# Update Status to Active in XML
sed -i 's/<status>Draft<\/status>/<status>Active<\/status>/' [flow-file]

# Deploy with activation
sf project deploy start --metadata Flow:FlowDeveloperName --target-org [org]
```

#### Option B: Apex Activation (Required for flows with Apex invocation)
```apex
// Use when Metadata API fails due to Apex invocation
public class FlowActivator {
    public static void activateFlow(String flowDeveloperName) {
        Flow flowToActivate = [
            SELECT Id, Definition.DeveloperName
            FROM Flow
            WHERE Definition.DeveloperName = :flowDeveloperName
            AND Status = 'Draft'
            LIMIT 1
        ];

        // Use Metadata API from Apex context
        Metadata.Flow flow = new Metadata.Flow();
        flow.fullName = flowDeveloperName;
        flow.status = FlowProcessType.Active;

        Metadata.DeployContainer container = new Metadata.DeployContainer();
        container.addMetadata(flow);

        Metadata.Operations.enqueueDeployment(container, null);
    }
}
```

#### Option C: UI Activation Steps (Fallback)
1. Navigate to Setup → Process Automation → Flows
2. Find your flow: **[Flow Name]**
3. Click on the flow to open Flow Builder
4. Click **"Activate"** button in top right
5. If you see errors, refer to troubleshooting below
6. Confirm activation in popup dialog

### 4. Post-Activation Verification

```sql
-- Verify activation status
SELECT Id, Status, VersionNumber, LastModifiedDate, LastModifiedBy.Name
FROM Flow
WHERE Definition.DeveloperName = :flowName
ORDER BY VersionNumber DESC
LIMIT 1

-- Check for any error logs
SELECT Id, FlowVersionId, ErrorMessage, CreatedDate
FROM FlowExecutionErrorEvent
WHERE FlowVersionId = :flowId
ORDER BY CreatedDate DESC
LIMIT 10
```

## Common Activation Blockers & Solutions:

### 1. Formula Errors (Most Common)
**Problem**: Picklist comparisons without TEXT() wrapper
**Example**: `Type_Contract__c = 'GBP'` on a picklist field
**Solution**:
```bash
# Auto-fix formula errors
node scripts/lib/flow-formula-validator.js [flow-file] --auto-fix

# Manual fix: Wrap picklist comparisons
# Change: Type_Contract__c = 'GBP'
# To: TEXT(Type_Contract__c) = 'GBP'
```

### 2. Object Not Found (CPQ Issues)
**Problem**: Flow references Quote but org has SBQQ__Quote__c
**Solution**:
```bash
# Discover which Quote object exists
node scripts/lib/object-existence-validator.js [org] Quote --discover

# Update flow to use correct object
# Quote → SBQQ__Quote__c
# QuoteLineItem → SBQQ__QuoteLine__c
```

### 3. Field Path Issues
**Problem**: Flow references OwnerId directly on Quote (should be Opportunity.OwnerId)
**Solution**:
```bash
# Validate field paths
node scripts/lib/object-field-resolver.js [org] Quote OwnerId

# Update to correct path:
# {!$Record.OwnerId} → {!$Record.Opportunity.OwnerId}
```

### 4. Apex Invocation Security
**Problem**: Flow invokes Apex but user lacks permission
**Solution**:
```bash
# Check user profile
sf data query --query "SELECT Profile.Name FROM User WHERE Username = '[username]'" --target-org [org]

# If not System Admin, use manual activation or request admin help
```

### 5. Inactive Dependencies
**Problem**: Flow references inactive Process Builder or Approval Process
**Solution**:
```bash
# Find dependencies
sf data query --query "SELECT Id, TableEnumOrId FROM ProcessDefinition WHERE State = 'Inactive'" --use-tooling-api

# Activate dependencies first, then retry flow activation
```

## Quick Troubleshooting Workflow:

When activation fails, I'll automatically:

1. **Run formula validator**:
   ```bash
   node scripts/lib/flow-formula-validator.js [flow-file] [org]
   ```

2. **Check object existence**:
   ```bash
   node scripts/lib/object-existence-validator.js [org] [referenced-objects]
   ```

3. **Validate field paths**:
   ```bash
   node scripts/lib/object-field-resolver.js [org] [object] [field]
   ```

4. **Check for Apex invocations**:
   ```bash
   node scripts/lib/flow-activation-validator.js [org] [flow-directory]
   ```

5. **Verify user permissions**:
   ```bash
   sf data query --query "SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '[userId]'"
   ```

## Example Session:

```
User: /activate-flows
Assistant: I'll help you activate flows in your org. Let me start by finding all Draft flows...

🔍 Found 3 flows in Draft status:

1. Quote_Approval_Evaluation (Version 1)
   ⚠️ Contains Apex invocation: QuoteApprovalHandler
   ⚠️ Formula issue detected: Type_Contract__c comparison needs TEXT()

2. Account_Update_Handler (Version 2)
   ✅ No issues detected

3. Lead_Assignment_Rules (Version 1)
   ⚠️ References inactive Process Builder: Lead_Routing_Process

Let me fix the issues before activation...

🔧 Fixing Quote_Approval_Evaluation:
   - Adding TEXT() wrapper to picklist comparison... ✅
   - Verifying Apex class exists... ✅
   - Will require UI activation due to Apex invocation

📋 Activation Plan:
1. Account_Update_Handler - Can activate via API
2. Lead_Assignment_Rules - Need to activate Process Builder first
3. Quote_Approval_Evaluation - Requires manual UI activation

Shall I proceed? [yes/no]
```

## Related Commands:
- `/validate-approval-framework` - Validate approval framework deployment
- `/fix-flow-errors` - Auto-fix common flow formula errors
- `/deploy-flows` - Deploy and activate flows in one step
- `/validate-flows` - Pre-deployment flow validation

## Success Metrics:
- ✅ All flows identified with status and issues
- ✅ Formula errors auto-detected and fixed
- ✅ Object existence validated (Quote vs SBQQ__Quote__c)
- ✅ Apex invocation handling provided
- ✅ Clear remediation steps for each blocker
- ✅ Verification queries confirm activation

## Related Resources:
- **Flow Best Practices**: docs/SALESFORCE_FLOW_BEST_PRACTICES.md
- **Platform Limitations**: docs/SALESFORCE_PLATFORM_LIMITATIONS.md
- **Object Field Patterns**: docs/SALESFORCE_OBJECT_FIELD_PATTERNS.md
- **Approval Framework Playbook**: templates/playbooks/salesforce-approval-framework-deployment/
