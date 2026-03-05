# Phase 4.1 Usage Examples

**Complete end-to-end examples** for using the Flow Authoring Toolkit (CLI, Templates, Batch Operations).

## Table of Contents

1. [Quick Start Examples](#quick-start-examples)
2. [Template-Based Workflows](#template-based-workflows)
3. [Batch Operations](#batch-operations)
4. [Agent-Driven Workflows](#agent-driven-workflows)
5. [Advanced Integration Patterns](#advanced-integration-patterns)

---

## Quick Start Examples

### Example 1: Create and Deploy Simple Flow

**Scenario**: Create a basic Flow from scratch

```bash
# 1. Create Flow
flow create Account_Status_Update --type Record-Triggered --object Account

# 2. Add elements with natural language
flow add Account_Status_Update.flow-meta.xml \
  "Add a decision called Check_Status if Status equals Active then Update_Field"

flow add Account_Status_Update.flow-meta.xml \
  "Add a record update called Update_Field to set Last_Active_Date to TODAY()"

# 3. Validate
flow validate Account_Status_Update.flow-meta.xml --best-practices --output table

# 4. Test deployment (dry-run)
flow deploy Account_Status_Update.flow-meta.xml --activate --dry-run

# 5. Deploy for real
flow deploy Account_Status_Update.flow-meta.xml --activate
```

### Example 2: Use Template for Quick Setup

**Scenario**: Set up lead assignment for California leads

```bash
# 1. Check available templates
flow template list --category core

# 2. Show template details
flow template show lead-assignment

# 3. Apply template with parameters
flow template apply lead-assignment \
  --name CA_Lead_Assignment \
  --params "assignmentField=State,assignmentValue=California,ownerUserId=005xx000000XXXX"

# 4. Validate
flow validate CA_Lead_Assignment.flow-meta.xml --best-practices

# 5. Deploy
flow deploy CA_Lead_Assignment.flow-meta.xml --activate
```

---

## Template-Based Workflows

### Workflow 1: Multi-Region Lead Assignment

**Scenario**: Set up lead assignment for 5 different regions

```bash
# Create template for each region
flow template apply lead-assignment --name CA_Leads --params "assignmentField=State,assignmentValue=California,ownerUserId=005CA..."
flow template apply lead-assignment --name NY_Leads --params "assignmentField=State,assignmentValue=New York,ownerUserId=005NY..."
flow template apply lead-assignment --name TX_Leads --params "assignmentField=State,assignmentValue=Texas,ownerUserId=005TX..."
flow template apply lead-assignment --name FL_Leads --params "assignmentField=State,assignmentValue=Florida,ownerUserId=005FL..."
flow template apply lead-assignment --name IL_Leads --params "assignmentField=State,assignmentValue=Illinois,ownerUserId=005IL..."

# Validate all at once
flow batch validate "./flows/*_Leads.flow-meta.xml" --output summary

# Deploy all at once
flow batch deploy "./flows/*_Leads.flow-meta.xml" --activate --parallel 3
```

**Time Saved**: 5 Flows × 10 min = 50 min → 10 min with templates (80% faster)

### Workflow 2: Opportunity Stage Gate Validation

**Scenario**: Enforce data quality at each stage

```bash
# Stage 1: Qualification
flow template apply opportunity-validation \
  --name Opp_Validation_Qualification \
  --params "requiredStage=Qualification,requiredField=Budget__c,errorMessage=Budget required for Qualification stage"

# Stage 2: Proposal
flow template apply opportunity-validation \
  --name Opp_Validation_Proposal \
  --params "requiredStage=Proposal,requiredField=Decision_Maker__c,errorMessage=Decision Maker required for Proposal stage"

# Stage 3: Negotiation
flow template apply opportunity-validation \
  --name Opp_Validation_Negotiation \
  --params "requiredStage=Negotiation,requiredField=Legal_Approval__c,errorMessage=Legal Approval required for Negotiation stage"

# Validate all stage gates
flow batch validate "./flows/Opp_Validation_*.flow-meta.xml" --best-practices

# Deploy all
flow batch deploy "./flows/Opp_Validation_*.flow-meta.xml" --activate
```

### Workflow 3: Custom Template from Existing Flow

**Scenario**: Convert successful Flow into reusable template

```bash
# 1. Create custom template from existing Flow
flow template create industry-based-assignment \
  --flow Account_Assignment_Tech.flow-meta.xml \
  --description "Assign accounts based on industry" \
  --category custom

# 2. Edit template to parameterize (manual step)
# Open templates/custom/industry-based-assignment.json
# Add {{industry}} and {{ownerId}} placeholders

# 3. Apply custom template
flow template apply industry-based-assignment \
  --name Tech_Account_Assignment \
  --params "industry=Technology,ownerId=005xx..."

flow template apply industry-based-assignment \
  --name Healthcare_Account_Assignment \
  --params "industry=Healthcare,ownerId=005yy..."
```

---

## Batch Operations

### Workflow 1: Org-Wide Flow Validation

**Scenario**: Validate all Flows before migration to production

```bash
# 1. Find all Flows in project
find ./force-app/main/default/flows -name "*.flow-meta.xml" > flow-list.txt

# 2. Validate all Flows
flow batch validate "./force-app/main/default/flows/*.flow-meta.xml" \
  --parallel 10 \
  --best-practices \
  --output json > validation-results.json

# 3. Analyze results
node scripts/analyze-validation-results.js validation-results.json

# 4. Fix failures
# (Manual fixes or automated fixes)

# 5. Re-validate fixed Flows
flow batch validate "./flows/fixed/*.flow-meta.xml" --output summary
```

**Performance**: 50 Flows × 3s = 150s sequential → 15s with batch (10x faster)

### Workflow 2: Mass Flow Update for Compliance

**Scenario**: Add compliance check to all Account-related Flows

```bash
# 1. Find all Account Flows
grep -l "Account" ./flows/*.flow-meta.xml | xargs -I {} basename {}

# 2. Add compliance check to all
flow batch modify "./flows/Account_*.flow-meta.xml" \
  --instruction "Add a decision called Compliance_Check if Type equals Restricted then Require_Approval"

# 3. Validate modified Flows
flow batch validate "./flows/Account_*.flow-meta.xml" --best-practices

# 4. Deploy updated Flows
flow batch deploy "./flows/Account_*.flow-meta.xml" --activate --parallel 3
```

### Workflow 3: Staged Deployment with Checkpoints

**Scenario**: Deploy Flows in stages with manual approval between stages

```bash
# Stage 1: Core business logic Flows
flow batch deploy "./flows/stage1/*.flow-meta.xml" --activate --parallel 3
echo "Stage 1 complete. Review and press Enter to continue..."
read

# Stage 2: Integration Flows
flow batch deploy "./flows/stage2/*.flow-meta.xml" --activate --parallel 3
echo "Stage 2 complete. Review and press Enter to continue..."
read

# Stage 3: Helper/Utility Flows
flow batch deploy "./flows/stage3/*.flow-meta.xml" --activate --parallel 3
echo "All stages complete!"
```

---

## Agent-Driven Workflows

### Workflow 1: Template Selection with Agent

**User Request**: "I need to set up lead routing for enterprise deals"

**Agent Response** (flow-template-specialist):
```
I recommend the lead-assignment template for your use case.

This template will:
✅ Route leads based on criteria (e.g., Annual Revenue)
✅ Assign to specific user or queue
✅ Send notification email

Let me apply it:
```

**Agent Actions**:
```javascript
// Agent invokes TemplateRegistry
const registry = new TemplateRegistry();

const flowPath = await registry.applyTemplate('lead-assignment', 'Enterprise_Lead_Routing', {
  assignmentField: 'Annual_Revenue__c',
  assignmentValue: '1000000',  // $1M+
  ownerUserId: enterpriseTeamQueueId,
  notificationEmail: 'enterprise@company.com'
}, {
  author: flowAuthor,
  outputDir: './flows'
});

// Agent validates and deploys
await flowAuthor.loadFlow(flowPath);
const validation = await flowAuthor.validate();

if (validation.valid) {
  await flowAuthor.deploy({ activateOnDeploy: true });
}
```

### Workflow 2: Batch Operations with Orchestration

**User Request**: "Deploy all 20 Flows we just created"

**Agent Response** (sfdc-orchestrator with flow-batch-operator):
```
I'll deploy all 20 Flows in batches for safety:

Step 1: Validate all Flows
Step 2: Deploy in groups of 5
Step 3: Verify each group before continuing
```

**Agent Actions**:
```javascript
const manager = new FlowBatchManager(orgAlias, { parallel: 5 });

// Step 1: Validate all
this.log('Validating all 20 Flows...');
const validationResults = await manager.validateBatch(flowPaths);

if (validationResults.some(r => !r.success)) {
  throw new Error('Some Flows failed validation');
}

// Step 2: Deploy in groups
const groups = [
  flowPaths.slice(0, 5),
  flowPaths.slice(5, 10),
  flowPaths.slice(10, 15),
  flowPaths.slice(15, 20)
];

for (const [index, group] of groups.entries()) {
  this.log(`Deploying group ${index + 1}/4...`);

  const results = await manager.deployBatch(group, {
    activateOnDeploy: true
  });

  this.log(`Group ${index + 1}: ${results.filter(r => r.success).length}/5 succeeded`);
}
```

### Workflow 3: Template Customization with Agent

**User Request**: "Use the case escalation template but add a Slack notification"

**Agent Response** (flow-template-specialist):
```
I'll apply the case-escalation template and add a custom Slack notification step:

1. Apply base template
2. Add custom Slack notification element
3. Validate combined result
```

**Agent Actions**:
```bash
# 1. Apply template
flow template apply case-escalation \
  --name High_Priority_Escalation \
  --params "priorityLevel=High,ageThresholdHours=24,escalationQueueId=00G..."

# 2. Add custom element
flow add High_Priority_Escalation.flow-meta.xml \
  "Add an action called Send_Slack_Alert to call the Slack API with message 'High priority case escalated'"

# 3. Validate
flow validate High_Priority_Escalation.flow-meta.xml --best-practices
```

---

## Advanced Integration Patterns

### Pattern 1: CI/CD Pipeline Integration

**GitHub Actions Workflow**:

``yaml
name: Deploy Flows to Production

on:
  push:
    branches: [main]
    paths: ['flows/**']

jobs:
  deploy-flows:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install Dependencies
        run: npm install

      - name: Authenticate to Salesforce
        run: sf auth jwt:grant --client-id ${{ secrets.SF_CLIENT_ID }} --jwt-key-file ./server.key --username ${{ secrets.SF_USERNAME }}

      - name: Validate All Flows
        run: flow batch validate "./flows/*.flow-meta.xml" --output json > results.json

      - name: Check Validation Results
        run: |
          if grep -q '"success": false' results.json; then
            echo "Validation failed"
            exit 1
          fi

      - name: Deploy Flows
        run: flow batch deploy "./flows/*.flow-meta.xml" --activate --parallel 3
```

### Pattern 2: Programmatic Template Generation

**Generate templates from user input**:

```javascript
async function generateFlowFromUserInput(userInput) {
  const { TemplateRegistry } = require('./templates');
  const registry = new TemplateRegistry();

  // Parse user requirements
  const requirements = parseRequirements(userInput);

  // Select appropriate template
  const templateName = selectTemplate(requirements);

  // Generate parameters from requirements
  const params = extractParameters(requirements);

  // Apply template
  const flowPath = await registry.applyTemplate(templateName, requirements.flowName, params);

  return flowPath;
}

// Usage
const flowPath = await generateFlowFromUserInput({
  description: 'Route high-value leads to enterprise team',
  object: 'Lead',
  criteria: { field: 'Annual_Revenue__c', operator: '>=', value: 1000000 },
  action: { type: 'assign', targetUserId: '005xx...' }
});
```

### Pattern 3: Dynamic Batch Processing

**Process Flows based on dynamic criteria**:

```javascript
const glob = require('glob');
const FlowBatchManager = require('./scripts/lib/flow-batch-manager');

async function deployFlowsByPattern(pattern, options = {}) {
  // Find matching Flows
  const flowPaths = glob.sync(pattern);

  // Filter by validation status
  const manager = new FlowBatchManager(orgAlias, { parallel: 5 });
  const validationResults = await manager.validateBatch(flowPaths);

  const validFlows = validationResults
    .filter(r => r.success)
    .map(r => r.flowPath);

  console.log(`${validFlows.length}/${flowPaths.length} Flows passed validation`);

  // Deploy only valid Flows
  if (validFlows.length > 0) {
    const deployResults = await manager.deployBatch(validFlows, {
      activateOnDeploy: options.activate || false,
      continueOnError: options.continueOnError || false
    });

    return deployResults;
  }

  return [];
}

// Usage
await deployFlowsByPattern('./flows/Account_*.xml', { activate: true });
await deployFlowsByPattern('./flows/Opportunity_*.xml', { activate: true, continueOnError: true });
```

---

## Performance Comparisons

### Traditional vs Phase 4.1 Workflow

**Scenario**: Create and deploy 10 similar Flows

**Traditional Approach** (Manual):
```
1. Create Flow in UI: 15 min
2. Configure elements: 20 min
3. Test: 10 min
4. Deploy: 5 min
---
Total per Flow: 50 min × 10 = 500 min (8.3 hours)
```

**Phase 4.1 Approach** (Templates + Batch):
```bash
# 1. Apply template 10 times (automated)
for region in CA NY TX FL IL WA OR AZ CO MA; do
  flow template apply lead-assignment \
    --name ${region}_Leads \
    --params "assignmentField=State,assignmentValue=$region,ownerUserId=..."
done
# Time: 2 min

# 2. Validate all
flow batch validate "./flows/*_Leads.xml" --parallel 10
# Time: 1 min

# 3. Deploy all
flow batch deploy "./flows/*_Leads.xml" --activate --parallel 5
# Time: 2 min

# Total: 5 min (100x faster)
```

---

## Troubleshooting Examples

### Issue 1: Template Parameter Validation

**Problem**: Template application fails with missing parameter

```
Error: Missing required parameter: ownerUserId
```

**Solution**:
```bash
# 1. Show template details to see all parameters
flow template show lead-assignment

# 2. Identify missing required parameters
# Output shows: ownerUserId (required)

# 3. Apply with all required parameters
flow template apply lead-assignment \
  --name MyFlow \
  --params "assignmentField=State,assignmentValue=CA,ownerUserId=005xx000000XXXX"
```

### Issue 2: Batch Deployment Partial Failure

**Problem**: Some Flows deployed, others failed

```
Batch deployment: 7/10 succeeded, 3/10 failed
```

**Solution**:
```bash
# 1. Get failed Flow details
flow batch deploy "./flows/*.xml" --output json > results.json

# 2. Analyze failures
node -e "console.log(JSON.parse(require('fs').readFileSync('results.json')).filter(r => !r.success))"

# 3. Fix failed Flows manually

# 4. Retry only failed Flows
flow batch deploy "./flows/failed/*.xml" --activate
```

---

## Best Practices Summary

1. **Always validate before deploy**:
   ```bash
   flow validate <path> --best-practices
   ```

2. **Use dry-run for testing**:
   ```bash
   flow deploy <path> --dry-run
   ```

3. **Batch operations for efficiency**:
   ```bash
   flow batch validate "./flows/*.xml" --parallel 5
   ```

4. **Templates for common patterns**:
   ```bash
   flow template list → flow template apply
   ```

5. **Document your Flows**:
   ```bash
   flow docs <path> --output markdown
   ```

---

**For complete API documentation**, see:
- `PHASE_4.1_COMPLETE.md` - Full feature guide
- `scripts/lib/flow-author.js` - FlowAuthor API
- `scripts/lib/flow-batch-manager.js` - Batch operations API
- `templates/index.js` - Template registry API
