# Runbook 8: Incremental Segment Building

**Version**: v3.46.0
**Last Updated**: November 21, 2025
**Phase 4 Implementation**: Complete
**Status**: Production Ready

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Understanding Segmentation](#2-understanding-segmentation)
3. [When to Use Segmentation](#3-when-to-use-segmentation)
4. [Segment Templates](#4-segment-templates)
5. [Building Segment-by-Segment](#5-building-segment-by-segment)
6. [Complexity Management](#6-complexity-management)
7. [Testing Segments](#7-testing-segments)
8. [Subflow Extraction](#8-subflow-extraction)
9. [Interactive Building Mode](#9-interactive-building-mode)
10. [Best Practices](#10-best-practices)
11. [Troubleshooting](#11-troubleshooting)
12. [Integration with Other Runbooks](#12-integration-with-other-runbooks)

---

## 1. Introduction

### What is Incremental Segment Building?

**Incremental Segment Building** is a technique for developing complex Salesforce Flows by breaking them into smaller, manageable logical segments. Each segment has a focused purpose, complexity budget, and can be developed, tested, and validated independently before being combined into a complete Flow.

### The Problem This Solves

Large Flow XML files (>500 lines) confuse AI models and exceed context limits, leading to:
- ❌ **AI Hallucination** - Models lose track of flow structure
- ❌ **Context Overload** - Cannot process entire flow at once
- ❌ **Maintenance Difficulty** - Hard to modify specific sections
- ❌ **Error Propagation** - Mistakes compound across large flows
- ❌ **Testing Challenges** - Cannot test specific logic paths easily

### The Solution

**Segment-by-segment building** enables:
- ✅ **AI Comprehension** - Small, focused segments stay within context limits
- ✅ **Incremental Validation** - Validate each segment before moving on
- ✅ **Isolated Testing** - Test segments without full deployment
- ✅ **Parallel Development** - Multiple developers work on different segments
- ✅ **Better Maintainability** - Clear separation of concerns

### Key Concepts

**Segment**: A logical unit of flow logic with a focused purpose (validation, enrichment, routing, notification, loop processing, custom)

**Complexity Budget**: Maximum complexity score allocated to each segment type (e.g., validation: 5, enrichment: 8, routing: 6)

**Segment Template**: Pre-defined pattern with budget, validation rules, best practices, and anti-patterns

**Segmentation Mode**: Optional FlowAuthor mode that tracks segment boundaries and enforces budgets

**Final Output**: Single consolidated Flow in Salesforce (not multiple flows)

---

## 2. Understanding Segmentation

### Segmentation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Complete Salesforce Flow                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │   Segment 1   │→ │   Segment 2    │→ │  Segment 3   │  │
│  │  Validation   │  │   Enrichment   │  │   Routing    │  │
│  │  5/5 points   │  │   8/8 points   │  │  6/6 points  │  │
│  │  ✅ Tested     │  │   ✅ Tested     │  │  ✅ Tested    │  │
│  └───────────────┘  └────────────────┘  └──────────────┘  │
│                                                               │
│  ┌────────────────┐                                         │
│  │   Segment 4    │                                         │
│  │  Notification  │                                         │
│  │  4/4 points    │                                         │
│  │  ✅ Tested      │                                         │
│  └────────────────┘                                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. FlowSegmentManager (`scripts/lib/flow-segment-manager.js`)

**Orchestrates segment-by-segment building**:
- Tracks segment metadata (name, type, budget, current complexity)
- Enforces complexity budgets with warning thresholds (70%, 90%, 100%)
- Validates segment completion
- Manages segment transitions
- Records operation history

**Key Methods**:
```javascript
const manager = new FlowSegmentManager(flowAuthor, options);

// Start new segment
await manager.startSegment('ValidationSegment', 'validation', { budget: 5 });

// Add element to current segment
const result = await manager.addElementToSegment(instruction, options);

// Complete current segment
const completionResult = await manager.completeSegment(options);

// Get segment status
const status = manager.getSegmentStatus();

// List all segments
const segments = manager.listSegments();
```

#### 2. FlowSegmentTemplates (`scripts/lib/flow-segment-templates.js`)

**Provides pre-defined segment patterns**:
- 5 core templates (validation, enrichment, routing, notification, loopProcessing)
- Custom template for mixed logic
- Budget recommendations and ranges
- Validation rules per template
- Best practices and anti-patterns

**Template Structure**:
```javascript
{
  name: 'Validation Segment',
  type: 'validation',
  defaultBudget: 5,
  budgetRange: { min: 3, max: 7 },
  description: 'Validates input data before processing',
  validationRules: {
    maxDecisions: 3,
    requiresFaultPaths: true,
    allowsRecordOperations: false,
    requiresExitPath: true,
    maxNestingLevel: 2
  },
  bestPractices: [
    'Keep validation logic simple and focused',
    'Always include fault paths for error handling',
    'Fail fast on critical validation errors'
  ],
  antiPatterns: [
    'Complex nested decision logic',
    'Record operations in validation segment',
    'Mixing validation with business logic'
  ]
}
```

#### 3. FlowComplexityCalculator (`scripts/lib/flow-complexity-calculator.js`)

**Calculates complexity scores**:
- Element-based scoring (decisions: 2, loops: 3, subflows: 2, actions: 1, etc.)
- Risk categorization (LOW: 0-6, MEDIUM: 7-12, HIGH: 13-20, CRITICAL: 21+)
- Multiple input methods (XML, element counts, natural language)
- Real-time complexity tracking

**Complexity Weights**:
```javascript
const COMPLEXITY_WEIGHTS = {
  decisions: 2,      // Branching logic
  loops: 3,          // Iteration (higher risk)
  subflows: 2,       // Delegation
  actions: 1,        // Basic operations
  assignments: 1,    // Variable updates
  screens: 2,        // User interaction
  waits: 2,          // Timing dependencies
  recordLookups: 2,  // SOQL queries
  recordUpdates: 1,  // DML operations
  recordCreates: 1,  // DML operations
  recordDeletes: 2,  // DML operations (higher risk)
  approvals: 3,      // Complex approval logic
  customApex: 4,     // Black box (highest risk)
  collections: 2,    // Data structures
  formulas: 1        // Calculations
};
```

#### 4. FlowSubflowExtractor (`scripts/lib/flow-subflow-extractor.js`)

**Automatically extracts segments into subflows**:
- Threshold-based extraction (default: 150% of budget)
- Variable analysis for input/output parameters
- Subflow XML generation with proper metadata
- Parent flow update with subflow call replacement
- Complexity reduction tracking

#### 5. FlowSegmentTester (`scripts/lib/flow-segment-tester.js`)

**Tests segments in isolation**:
- Test scenario generation with multiple coverage strategies
- Simulated segment execution without deployment
- Comprehensive assertion framework
- Coverage analysis and reporting
- Markdown test report generation

### Segmentation Workflow

```
1. Enable Segmentation Mode
   ↓
2. Start Segment (choose template)
   ↓
3. Add Elements (track complexity)
   ↓
4. Check Anti-Patterns (validate incrementally)
   ↓
5. Test Segment (isolated testing)
   ↓
6. Complete Segment (full validation)
   ↓
7. Extract to Subflow (if over threshold)
   ↓
8. Start Next Segment
   ↓
9. Repeat until Flow complete
   ↓
10. Deploy as Single Flow
```

---

## 3. When to Use Segmentation

### Complexity Thresholds

**Use segmentation when**:

| Scenario | Complexity | Recommendation |
|----------|-----------|----------------|
| Flow > 20 points | HIGH | **Strongly Recommended** |
| Flow > 30 points | CRITICAL | **Mandatory** |
| Multiple object updates | MEDIUM-HIGH | **Recommended** |
| Complex decision logic | MEDIUM-HIGH | **Recommended** |
| Loop with DML inside | CRITICAL | **Mandatory** |
| 5+ decision branches | HIGH | **Strongly Recommended** |
| Multiple API callouts | MEDIUM-HIGH | **Recommended** |

**Skip segmentation when**:
- ✅ Flow < 10 points (LOW complexity)
- ✅ Single-purpose flows (simple validation, basic assignment)
- ✅ Quick prototypes or one-time scripts
- ✅ Simple notifications or alerts

### Use Case Decision Tree

```
Is your Flow complex?
├─ NO (< 10 points)
│  └─ Use standard Flow authoring (Runbook 1-3)
│
└─ YES (10+ points)
   ├─ Can it be split into logical sections?
   │  ├─ YES
   │  │  └─ Use segmentation (this runbook)
   │  │
   │  └─ NO
   │     └─ Consider subflow extraction first
   │
   └─ Does it have multiple purposes?
      ├─ YES
      │  └─ Use segmentation (this runbook)
      │
      └─ NO
         └─ Use standard authoring, monitor complexity
```

### Common Segmentation Scenarios

#### Scenario 1: Complex Opportunity Validation
```
Segment 1: Validation (5 points)
- Check required fields
- Validate stage prerequisites
- Verify ownership rules

Segment 2: Enrichment (8 points)
- Lookup account details
- Calculate metrics
- Set default values

Segment 3: Routing (6 points)
- Route by amount thresholds
- Assign to appropriate queue
- Trigger approval if needed

Segment 4: Notification (4 points)
- Send email to owner
- Alert manager for high-value deals
- Log activity

Total: 23 points (manageable with segmentation)
```

#### Scenario 2: Account Processing with Loops
```
Segment 1: Validation (5 points)
- Validate account type
- Check required fields

Segment 2: Loop Processing (10 points)
- Iterate through opportunities
- Collect opportunities in collection
- (NO DML inside loop - best practice)

Segment 3: Enrichment (8 points)
- Bulk update opportunities
- Calculate account metrics
- Update account fields

Segment 4: Notification (4 points)
- Send summary email
- Update dashboard

Total: 27 points (requires segmentation for maintainability)
```

#### Scenario 3: Multi-Step Approval Workflow
```
Segment 1: Validation (5 points)
- Validate submission requirements
- Check approver availability

Segment 2: Routing (6 points)
- Determine approval path
- Route to first approver

Segment 3: Custom Logic (7 points)
- Handle approval responses
- Escalate if timeout
- Track approval history

Segment 4: Notification (4 points)
- Notify submitter of decision
- Alert stakeholders
- Log outcome

Total: 22 points (benefits from segmentation)
```

---

## 4. Segment Templates

### Template Overview

**5 Core Templates + 1 Custom**:

| Template | Budget | Use Case | Max Elements |
|----------|--------|----------|--------------|
| **Validation** | 5 points | Input validation, data quality checks | 2 decisions, 1 lookup, 2 assignments |
| **Enrichment** | 8 points | Data lookups, calculations, field updates | 3 lookups, 2 updates, 3 assignments |
| **Routing** | 6 points | Workflow branching, decision-based paths | 3 decisions, 2 actions |
| **Notification** | 4 points | Emails, alerts, external notifications | 2 emails, 2 assignments |
| **Loop Processing** | 10 points | Batch operations, collection iteration | 1 loop, 3 lookups, 2 assignments |
| **Custom** | 7 points | Mixed logic, specialized workflows | 2 decisions, 2 actions, 2 assignments |

### Template Selection Guide

#### Decision Tree

```
What is the primary purpose of this segment?

1. Validating data or prerequisites?
   → Validation Template
   Examples: Check required fields, verify stage, validate amounts

2. Enriching records with additional data?
   → Enrichment Template
   Examples: Lookup account details, calculate metrics, set defaults

3. Making routing decisions?
   → Routing Template
   Examples: Route by criteria, assign to queue, trigger approvals

4. Sending notifications?
   → Notification Template
   Examples: Email alerts, Slack messages, platform events

5. Processing collections/batch operations?
   → Loop Processing Template
   Examples: Iterate opportunities, process contacts, batch updates

6. Mixed or specialized logic?
   → Custom Template
   Examples: Combination of above, unique business logic
```

### Template Details

#### 1. Validation Template

**Purpose**: Validate input data before processing

**Budget**: 5 points (range: 3-7)

**Allowed Elements**:
- Decisions: Up to 3
- Record Lookups: Up to 2 (read-only verification)
- Assignments: Up to 2 (set validation flags)
- Fault Paths: Required for all decisions

**Validation Rules**:
```javascript
{
  maxDecisions: 3,
  requiresFaultPaths: true,
  allowsRecordOperations: false,  // NO DML in validation
  requiresExitPath: true,
  maxNestingLevel: 2
}
```

**Best Practices**:
- Keep validation logic simple and focused
- Always include fault paths for error handling
- Fail fast on critical validation errors
- Use clear, descriptive names for validation checks
- Set boolean flags for downstream use

**Anti-Patterns**:
- ❌ Complex nested decision logic (use separate segments)
- ❌ Record create/update/delete (use Enrichment segment)
- ❌ Mixing validation with business logic
- ❌ Missing fault paths
- ❌ Validation without exit path

**Example Structure**:
```xml
<decisions>
  <name>Check_Required_Fields</name>
  <label>Check Required Fields</label>
  <rules>
    <name>Required_Fields_Present</name>
    <conditionLogic>and</conditionLogic>
    <conditions>
      <leftValueReference>Account.Name</leftValueReference>
      <operator>IsNull</operator>
      <rightValue><booleanValue>false</booleanValue></rightValue>
    </conditions>
    <connector><targetReference>Set_Validation_Flag</targetReference></connector>
  </rules>
  <defaultConnector>
    <targetReference>Validation_Error</targetReference>
  </defaultConnector>
</decisions>

<assignments>
  <name>Set_Validation_Flag</name>
  <assignmentItems>
    <assignToReference>ValidationPassed</assignToReference>
    <operator>Assign</operator>
    <value><booleanValue>true</booleanValue></value>
  </assignmentItems>
</assignments>
```

#### 2. Enrichment Template

**Purpose**: Enrich records with additional data

**Budget**: 8 points (range: 6-10)

**Allowed Elements**:
- Record Lookups: Up to 3
- Record Updates: Up to 2
- Record Creates: Up to 1
- Assignments: Up to 4 (for calculations)
- Formulas: Unlimited (lightweight)

**Validation Rules**:
```javascript
{
  maxRecordLookups: 3,
  maxRecordUpdates: 2,
  requiresBulkification: true,  // If in loop
  allowsSOQLInLoop: false,
  allowsDMLInLoop: false
}
```

**Best Practices**:
- Perform lookups before calculations
- Use assignments for complex calculations
- Bulkify DML operations (use collections)
- Set meaningful default values
- Document data sources in descriptions

**Anti-Patterns**:
- ❌ SOQL queries inside loops
- ❌ DML operations inside loops
- ❌ Updating same record multiple times
- ❌ Missing null checks before field access
- ❌ Over-complex formulas (split into assignments)

**Example Structure**:
```xml
<recordLookups>
  <name>Get_Account_Details</name>
  <label>Get Account Details</label>
  <object>Account</object>
  <assignNullValuesIfNoRecordsFound>false</assignNullValuesIfNoRecordsFound>
  <filters>
    <field>Id</field>
    <operator>EqualTo</operator>
    <value><elementReference>Opportunity.AccountId</elementReference></value>
  </filters>
  <getFirstRecordOnly>true</getFirstRecordOnly>
  <queriedFields>Industry</queriedFields>
  <queriedFields>AnnualRevenue</queriedFields>
  <storeOutputAutomatically>true</storeOutputAutomatically>
</recordLookups>

<assignments>
  <name>Calculate_Discount</name>
  <assignmentItems>
    <assignToReference>DiscountPercent</assignToReference>
    <operator>Assign</operator>
    <value>
      <elementReference>Calculate_Discount_Formula</elementReference>
    </value>
  </assignmentItems>
</assignments>

<recordUpdates>
  <name>Update_Opportunity</name>
  <label>Update Opportunity</label>
  <filters>
    <field>Id</field>
    <operator>EqualTo</operator>
    <value><elementReference>Opportunity.Id</elementReference></value>
  </filters>
  <inputAssignments>
    <field>Discount__c</field>
    <value><elementReference>DiscountPercent</elementReference></value>
  </inputAssignments>
  <object>Opportunity</object>
</recordUpdates>
```

#### 3. Routing Template

**Purpose**: Route workflow based on business rules

**Budget**: 6 points (range: 4-8)

**Allowed Elements**:
- Decisions: Up to 3
- Assignments: Up to 2 (for routing flags)
- Actions: Up to 2 (submit for approval, call subflow)
- Record Updates: Up to 1 (set assignment fields)

**Validation Rules**:
```javascript
{
  maxDecisions: 3,
  maxNestingLevel: 2,
  requiresFaultPaths: true,
  requiresClearPaths: true,
  allowsComplexConditions: true
}
```

**Best Practices**:
- Use clear decision names that describe routing logic
- Document routing criteria in decision descriptions
- Ensure all paths lead to a clear outcome
- Use assignments to set routing flags for downstream use
- Keep decision conditions simple (complex logic in formulas)

**Anti-Patterns**:
- ❌ Deeply nested decisions (>2 levels)
- ❌ Ambiguous routing paths
- ❌ Missing default connectors
- ❌ Complex conditions without formulas
- ❌ Routing without clear termination

**Example Structure**:
```xml
<decisions>
  <name>Route_By_Amount</name>
  <label>Route by Amount</label>
  <rules>
    <name>High_Value_Deal</name>
    <conditionLogic>and</conditionLogic>
    <conditions>
      <leftValueReference>Opportunity.Amount</leftValueReference>
      <operator>GreaterThan</operator>
      <rightValue><numberValue>100000</numberValue></rightValue>
    </conditions>
    <connector><targetReference>Assign_To_Enterprise_Queue</targetReference></connector>
  </rules>
  <rules>
    <name>Medium_Value_Deal</name>
    <conditionLogic>and</conditionLogic>
    <conditions>
      <leftValueReference>Opportunity.Amount</leftValueReference>
      <operator>GreaterThan</operator>
      <rightValue><numberValue>50000</numberValue></rightValue>
    </conditions>
    <connector><targetReference>Assign_To_Standard_Queue</targetReference></connector>
  </rules>
  <defaultConnector>
    <targetReference>Assign_To_Default_Queue</targetReference>
  </defaultConnector>
</decisions>
```

#### 4. Notification Template

**Purpose**: Send notifications and alerts

**Budget**: 4 points (range: 3-5)

**Allowed Elements**:
- Email Alerts: Up to 2
- Actions: Up to 2 (platform events, custom invocables)
- Assignments: Up to 2 (prepare notification data)

**Validation Rules**:
```javascript
{
  maxEmails: 2,
  maxActions: 2,
  requiresRecipientValidation: true,
  allowsConditionalNotifications: true
}
```

**Best Practices**:
- Validate recipients before sending
- Use email templates for consistency
- Set clear subject lines and bodies
- Handle notification failures gracefully
- Log notification status

**Anti-Patterns**:
- ❌ Sending without recipient validation
- ❌ Hardcoded email addresses
- ❌ Missing error handling
- ❌ Too many notifications in one segment
- ❌ Notification without context

**Example Structure**:
```xml
<actionCalls>
  <name>Send_Approval_Request_Email</name>
  <label>Send Approval Request Email</label>
  <actionName>emailSimple</actionName>
  <actionType>emailSimple</actionType>
  <inputParameters>
    <name>emailAddresses</name>
    <value><elementReference>ManagerEmail</elementReference></value>
  </inputParameters>
  <inputParameters>
    <name>emailSubject</name>
    <value><stringValue>Approval Required: {!Opportunity.Name}</stringValue></value>
  </inputParameters>
  <inputParameters>
    <name>emailBody</name>
    <value><elementReference>EmailBody</elementReference></value>
  </inputParameters>
</actionCalls>
```

#### 5. Loop Processing Template

**Purpose**: Process collections or batch operations

**Budget**: 10 points (range: 8-12)

**Allowed Elements**:
- Loops: 1 loop
- Record Lookups: Up to 3 (inside loop)
- Assignments: Up to 4 (collect records, update variables)
- Record Updates: 1 (AFTER loop - bulk operation)

**Validation Rules**:
```javascript
{
  maxLoops: 1,
  allowsSOQLInLoop: true,  // With caution
  allowsDMLInLoop: false,  // CRITICAL: Never allowed
  requiresBulkDMLAfterLoop: true,
  requiresCollectionPattern: true
}
```

**Best Practices**:
- Use collections to gather records inside loop
- Perform bulk DML AFTER loop completes
- Limit loop iterations (use filters before loop)
- Set loop variable names clearly
- Handle empty collections gracefully

**Anti-Patterns**:
- ❌ **CRITICAL**: DML operations inside loops (governor limit violation)
- ❌ Excessive SOQL queries in loop (>100 iterations)
- ❌ Complex logic inside loop (extract to subflow)
- ❌ Nested loops (use subflows instead)
- ❌ Missing collection variable

**Example Structure** (CORRECT pattern):
```xml
<!-- 1. Initialize collection BEFORE loop -->
<assignments>
  <name>Initialize_Opportunities_To_Update</name>
  <assignmentItems>
    <assignToReference>OpportunitiesToUpdate</assignToReference>
    <operator>Assign</operator>
    <value><elementReference>EmptyOpportunityCollection</elementReference></value>
  </assignmentItems>
</assignments>

<!-- 2. Loop and COLLECT records -->
<loops>
  <name>Loop_Through_Opportunities</name>
  <label>Loop Through Opportunities</label>
  <collectionReference>RelatedOpportunities</collectionReference>
  <iterationOrder>Asc</iterationOrder>
  <nextValueConnector>
    <targetReference>Check_Opportunity_Criteria</targetReference>
  </nextValueConnector>
  <noMoreValuesConnector>
    <targetReference>Bulk_Update_Opportunities</targetReference>
  </noMoreValuesConnector>
</loops>

<decisions>
  <name>Check_Opportunity_Criteria</name>
  <rules>
    <name>Meets_Criteria</name>
    <conditionLogic>and</conditionLogic>
    <conditions>
      <leftValueReference>LoopOpportunity.StageName</leftValueReference>
      <operator>EqualTo</operator>
      <rightValue><stringValue>Closed Won</stringValue></rightValue>
    </conditions>
    <connector><targetReference>Add_To_Collection</targetReference></connector>
  </rules>
  <defaultConnector>
    <targetReference>Loop_Through_Opportunities</targetReference>
  </defaultConnector>
</decisions>

<assignments>
  <name>Add_To_Collection</name>
  <assignmentItems>
    <assignToReference>OpportunitiesToUpdate</assignToReference>
    <operator>Add</operator>
    <value><elementReference>LoopOpportunity</elementReference></value>
  </assignmentItems>
  <connector><targetReference>Loop_Through_Opportunities</targetReference></connector>
</assignments>

<!-- 3. Bulk DML AFTER loop -->
<recordUpdates>
  <name>Bulk_Update_Opportunities</name>
  <label>Bulk Update Opportunities</label>
  <inputReference>OpportunitiesToUpdate</inputReference>
</recordUpdates>
```

#### 6. Custom Template

**Purpose**: Mixed or specialized logic

**Budget**: 7 points (range: 5-9)

**Allowed Elements**:
- Mixed: Flexible element types
- Custom: Up to 2 custom Apex actions
- Decisions: Up to 2
- Actions: Up to 2

**Validation Rules**:
```javascript
{
  maxCustomActions: 2,
  requiresDocumentation: true,
  allowsFlexibleStructure: true
}
```

**Best Practices**:
- Document segment purpose clearly
- Follow best practices from other templates
- Keep complexity manageable
- Consider if another template fits better

**When to Use**:
- Business logic doesn't fit other templates
- Unique organizational requirements
- Experimental patterns
- Migration from legacy processes

---

## 5. Building Segment-by-Segment

### Step-by-Step Workflow

#### Step 1: Enable Segmentation Mode

**Enable on FlowAuthor initialization**:

```javascript
const FlowAuthor = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-author');

const flowAuthor = new FlowAuthor(orgAlias, {
  verbose: true,
  segmentationEnabled: true  // Enable segmentation
});

await flowAuthor.initialize();
```

**Verify segmentation is enabled**:
```javascript
console.log(`Segmentation enabled: ${flowAuthor.segmentationEnabled}`);
console.log(`Segment manager: ${flowAuthor.segmentManager ? 'Ready' : 'Not initialized'}`);
```

#### Step 2: Start First Segment

**CLI Method**:
```bash
/flow-segment-start validation \
  --name Initial_Validation \
  --budget 5 \
  --org production
```

**JavaScript Method**:
```javascript
await flowAuthor.startSegment('Initial_Validation', 'validation', {
  budget: 5,
  description: 'Validates required fields and prerequisites'
});

// Verify segment started
const status = flowAuthor.getSegmentStatus();
console.log(`Current segment: ${status.name}`);
console.log(`Budget: ${status.currentComplexity}/${status.budget}`);
```

**Output**:
```
✅ Started segment "Initial_Validation"
   Type: validation
   Budget: 5 points
   Complexity: 0/5 (0%)
```

#### Step 3: Add Elements to Segment

**Natural Language Method** (Recommended):

```bash
/flow-add OpportunityValidationFlow.xml \
  "Add decision: Check if opportunity amount is greater than 10000"

# Output:
# ✅ Element added successfully
# Complexity impact: +2 points
# New total: 2/5 (40%)
```

**JavaScript Method**:
```javascript
const result = await flowAuthor.addElement(
  "Add decision: Check if opportunity amount is greater than 10000",
  { segmentationEnabled: true }
);

console.log(`Complexity impact: +${result.complexityImpact}`);
console.log(`New total: ${result.newComplexity}/${result.budget} (${result.budgetUsage}%)`);

// Check for warnings
if (result.warnings && result.warnings.length > 0) {
  result.warnings.forEach(warning => {
    console.log(`${warning.level}: ${warning.message}`);
  });
}
```

**Tracking Budget Usage**:

```
Budget Usage Indicators:
📊 0-60%   = ✅ Healthy (plenty of room)
📊 60-70%  = ℹ️  Good (approaching caution)
📊 70-90%  = ⚠️  Caution (high usage)
📊 90-100% = 🛑 Warning (near/at limit)
📊 >100%   = ❌ Critical (over budget - blocked)
```

#### Step 4: Monitor Complexity in Real-Time

**Check segment status**:

```bash
/flow-segment-status
```

**Output**:
```
┌─────────────────────────────────────────────┐
│  Current Segment: Initial_Validation        │
├─────────────────────────────────────────────┤
│  Type: validation                            │
│  Budget: 5 points                           │
│  Current: 3 points (60%)                    │
│  Status: ✅ Healthy                          │
├─────────────────────────────────────────────┤
│  Elements Added:                             │
│  - Decision: Check_Amount (2 points)        │
│  - Assignment: Set_Validation_Flag (1 point)│
├─────────────────────────────────────────────┤
│  Remaining Budget: 2 points                 │
│  Recommendation: Continue adding elements   │
└─────────────────────────────────────────────┘
```

#### Step 5: Preview Complexity Before Adding

**Get complexity preview without committing**:

```javascript
const calculator = flowAuthor.getComplexityCalculator();
const preview = await calculator.calculateFromInstruction(
  "Add record lookup: Get account details"
);

console.log(`Estimated complexity: +${preview.score} points`);
console.log(`After addition: ${currentComplexity + preview.score}/${budget}`);
```

**Preview via CLI** (Interactive Mode):
```bash
/flow-interactive-build OpportunityFlow --org production
# Choose option 4: "Preview complexity impact"
# Enter instruction: "Add record lookup: Get account details"

# Output:
# Estimated Complexity: +2 points
# After Addition: 5/5 points (100%)
# Status: AT BUDGET LIMIT
# ⚠️ WARNING: This will reach your budget limit.
```

#### Step 6: Check for Anti-Patterns

**Validate segment incrementally**:

```javascript
const FlowValidator = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator');
const validator = new FlowValidator({ verbose: false });

const flow = await flowAuthor.getFlowXML();
const segment = flowAuthor.segmentManager.currentSegment;

const validation = await validator.validateSegment(flow, segment);

if (!validation.valid) {
  console.log(`❌ Validation errors:`);
  validation.errors.forEach(error => {
    console.log(`   - ${error.message}`);
  });
}
```

**CLI Method**:
```bash
/flow-add OpportunityFlow.xml --check-anti-patterns
```

**Common Anti-Patterns Detected**:
- 🛑 **CRITICAL**: DML inside loop
- 🛑 **CRITICAL**: SOQL inside loop (>100 iterations)
- ⚠️  Missing fault paths on decisions
- ⚠️  Complex nested decision logic
- ⚠️  Record operations in validation segment

#### Step 7: Test Segment (Optional but Recommended)

**Generate test scenarios**:

```javascript
const FlowSegmentTester = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-segment-tester');
const tester = new FlowSegmentTester(flowAuthor, {
  generateReports: true
});

const scenarios = await tester.generateTestScenarios('Initial_Validation', {
  coverageStrategy: 'decision-paths',
  includeEdgeCases: true
});

console.log(`Generated ${scenarios.length} test scenarios`);
```

**Run tests**:
```javascript
const results = await tester.runSegmentTests('Initial_Validation', scenarios);

console.log(`Passed: ${results.passed}/${results.totalTests}`);
console.log(`Failed: ${results.failed}/${results.totalTests}`);
console.log(`Coverage: ${Math.round(results.coverage.percentage)}%`);
```

**CLI Method**:
```bash
/flow-test-segment Initial_Validation \
  --coverage decision-paths \
  --report markdown

# Output:
# Generated 6 test scenarios
# Running tests...
# ✅ Passed: 5/6 (83%)
# ❌ Failed: 1/6
# Coverage: 75%
# Report saved to: ./test-reports/Initial_Validation_20251121.md
```

#### Step 8: Complete Segment

**Complete with validation**:

```bash
/flow-segment-complete \
  --validate \
  --strict-mode

# Output:
# Validating segment...
# ✅ Budget compliance
# ✅ Fault paths present
# ✅ No anti-patterns detected
# ⚠️  Missing exit path (recommended)
#
# Complete segment? [Y/n]: y
#
# ✅ Segment "Initial_Validation" completed successfully
```

**JavaScript Method**:
```javascript
const completionResult = await flowAuthor.completeSegment({
  validate: true,
  strictMode: true
});

if (completionResult.completed) {
  console.log(`✅ Segment completed: ${completionResult.segment.name}`);
  console.log(`   Final complexity: ${completionResult.segment.currentComplexity}/${completionResult.segment.budget}`);
} else {
  console.log(`❌ Completion blocked:`);
  completionResult.warnings.forEach(w => console.log(`   - ${w.message}`));
}
```

#### Step 9: Start Next Segment

**Transition to next segment**:

```javascript
await flowAuthor.startSegment('Enrichment_Logic', 'enrichment', {
  budget: 8,
  description: 'Enriches opportunity with account details and calculations'
});

console.log(`Started new segment: Enrichment_Logic`);
```

**Get recommendations for next segment**:

```javascript
const completedSegments = flowAuthor.segmentManager.segments.filter(s => s.completed);
const completedTypes = completedSegments.map(s => s.type);

// Suggest next segment based on typical flow patterns
if (!completedTypes.includes('validation')) {
  console.log('Recommendation: Start with validation segment');
} else if (!completedTypes.includes('enrichment')) {
  console.log('Recommendation: Follow with enrichment segment');
} else if (!completedTypes.includes('routing')) {
  console.log('Recommendation: Add routing logic');
}
```

#### Step 10: Repeat Until Flow Complete

**Continue segment-by-segment until all logic is implemented**.

**Monitor overall progress**:

```bash
/flow-segment-list

# Output:
# ┌─────────────────────────────────────────────┐
# │  Flow: OpportunityValidationFlow            │
# │  Total Segments: 3                          │
# │  Completed: 2                               │
# │  Total Complexity: 19/42 (45%)              │
# ├─────────────────────────────────────────────┤
# │  Segments:                                   │
# │  1. ✅ Initial_Validation (5/5)              │
# │  2. ✅ Enrichment_Logic (8/8)                │
# │  3. ⏳ Routing_Logic (6/6 - in progress)     │
# └─────────────────────────────────────────────┘
```

---

## 6. Complexity Management

### Understanding Complexity Scores

#### Complexity Formula

```
Total Complexity = Σ (Element Type × Complexity Weight)

Where weights are:
- decisions: 2
- loops: 3
- subflows: 2
- actions: 1
- assignments: 1
- screens: 2
- waits: 2
- recordLookups: 2
- recordUpdates: 1
- recordCreates: 1
- recordDeletes: 2
- approvals: 3
- customApex: 4
- collections: 2
- formulas: 1
```

#### Risk Categories

| Risk Level | Complexity Range | AI Comprehension | Maintenance | Recommendation |
|-----------|------------------|------------------|-------------|----------------|
| **LOW** | 0-6 | Excellent | Easy | Standard authoring OK |
| **MEDIUM** | 7-12 | Good | Moderate | Consider segmentation |
| **HIGH** | 13-20 | Fair | Difficult | Strongly recommend segmentation |
| **CRITICAL** | 21+ | Poor | Very Difficult | Mandatory segmentation |

### Budget Management Strategies

#### Strategy 1: Conservative Budgets (Recommended)

**Use lower end of budget ranges**:
- Validation: 3-4 points (vs 5 max)
- Enrichment: 6-7 points (vs 8 max)
- Routing: 4-5 points (vs 6 max)

**Benefits**:
- ✅ Better AI comprehension
- ✅ Easier testing and maintenance
- ✅ More opportunities for subflow extraction
- ✅ Clearer separation of concerns

**When to use**:
- Complex flows with many purposes
- Flows likely to grow over time
- Flows maintained by multiple developers
- Critical business processes

#### Strategy 2: Flexible Budgets

**Use full budget ranges**:
- Allow segments to reach maximum budgets
- Extract to subflows when exceeding thresholds

**Benefits**:
- ✅ Fewer segments (simpler structure)
- ✅ Less context switching
- ✅ Faster initial development

**When to use**:
- Well-understood flows
- Single-purpose flows
- Short-lived flows (prototypes)
- Solo developer projects

#### Strategy 3: Dynamic Budgets

**Adjust budgets based on segment content**:

```javascript
// Start with default budget
await flowAuthor.startSegment('ProcessingSegment', 'custom', { budget: 7 });

// Adjust if needed
if (requiresComplexLogic) {
  // Increase budget
  flowAuthor.segmentManager.currentSegment.budget = 10;
} else {
  // Decrease for simpler logic
  flowAuthor.segmentManager.currentSegment.budget = 5;
}
```

### Budget Threshold Actions

#### 70% Budget Usage - Caution Zone

**System Response**:
```
ℹ️  INFO: Segment at 70% of budget
   Remaining: 1.5 points
   Recommendation: Plan to complete this segment soon
```

**Your Actions**:
- ✅ Review remaining elements to add
- ✅ Consider if segment purpose is complete
- ✅ Start planning next segment

#### 90% Budget Usage - Warning Zone

**System Response**:
```
⚠️  WARNING: Segment at 90% of budget
   Remaining: 0.5 points
   Recommendation: Complete this segment or remove elements
```

**Your Actions**:
- ✅ **Stop adding complex elements** (decisions, loops, subflows)
- ✅ Only add lightweight elements (assignments, formulas)
- ✅ Prepare to complete segment
- ✅ Consider extracting to subflow if logic incomplete

#### 100% Budget Usage - Critical Zone

**System Response**:
```
🛑 CRITICAL: Segment at 100% of budget
   No remaining budget
   Action Required: Complete segment or reduce complexity
```

**Your Actions**:
- ✅ **STOP - Cannot add more elements**
- ✅ Complete segment immediately
- ✅ OR remove non-essential elements
- ✅ OR extract to subflow

**Override** (use with caution):
```javascript
// Only if absolutely necessary and approved
await flowAuthor.addElement(instruction, {
  allowBudgetOverride: true  // Bypasses budget check
});
```

#### >100% Budget Usage - Over Budget (Blocked by Default)

**System Response**:
```
❌ BLOCKED: Segment exceeds budget (105%)
   Current: 10.5/10 points
   Cannot add more elements without override
```

**Resolution Options**:

**Option 1**: Extract to subflow (recommended)
```javascript
await flowAuthor.extractSegmentAsSubflow('CurrentSegment', {
  threshold: 1.0  // Extract immediately
});
```

**Option 2**: Remove elements
```javascript
// Review operation history
const history = flowAuthor.segmentManager.currentSegment.operations;
console.log('Recent operations:', history);

// Remove last operation if needed
// (Manual XML edit required or use rollback in interactive mode)
```

**Option 3**: Force complete and start new segment
```javascript
await flowAuthor.completeSegment({ force: true });
await flowAuthor.startSegment('ContinuationSegment', 'custom', { budget: 7 });
```

### Complexity Optimization Techniques

#### Technique 1: Extract Complex Decisions to Formulas

**Before** (High Complexity):
```xml
<decisions>
  <name>Check_Complex_Condition</name>
  <rules>
    <conditionLogic>(1 AND 2) OR (3 AND 4 AND 5)</conditionLogic>
    <conditions>...</conditions>
  </rules>
</decisions>
<!-- Complexity: 2 points -->
```

**After** (Lower Complexity):
```xml
<formulas>
  <name>Is_Complex_Condition_Met</name>
  <dataType>Boolean</dataType>
  <expression>
    (Opportunity.Amount &gt; 10000 AND Account.Industry = "Technology")
    OR
    (Opportunity.Stage = "Closed Won" AND ...)
  </expression>
</formulas>
<!-- Complexity: 1 point for formula -->

<decisions>
  <name>Check_Formula_Result</name>
  <rules>
    <conditions>
      <leftValueReference>Is_Complex_Condition_Met</leftValueReference>
      <operator>EqualTo</operator>
      <rightValue><booleanValue>true</booleanValue></rightValue>
    </conditions>
  </rules>
</decisions>
<!-- Complexity: 2 points for decision -->
<!-- Total: 3 points (vs 2), but decision is simpler -->
```

**When to use**: Complex multi-condition decisions

#### Technique 2: Replace Multiple Decisions with Single Decision

**Before** (Multiple Decisions):
```xml
<decisions><name>Check_Amount</name>...</decisions>
<decisions><name>Check_Stage</name>...</decisions>
<decisions><name>Check_Owner</name>...</decisions>
<!-- Complexity: 6 points (3 decisions × 2) -->
```

**After** (Single Decision):
```xml
<decisions>
  <name>Validation_Checks</name>
  <rules>
    <name>All_Checks_Pass</name>
    <conditionLogic>1 AND 2 AND 3</conditionLogic>
    <conditions><!-- Amount check --></conditions>
    <conditions><!-- Stage check --></conditions>
    <conditions><!-- Owner check --></conditions>
  </rules>
</decisions>
<!-- Complexity: 2 points (1 decision) -->
```

**When to use**: Sequential validation checks with same outcome

#### Technique 3: Use Subflows for Repeated Logic

**Before** (Repeated Logic in Main Flow):
```xml
<!-- Segment 1: Opportunity processing -->
<recordLookups>Get_Account</recordLookups>
<decisions>Check_Account_Type</decisions>
<assignments>Calculate_Score</assignments>

<!-- Segment 2: Same logic repeated for different object -->
<recordLookups>Get_Account</recordLookups>
<decisions>Check_Account_Type</decisions>
<assignments>Calculate_Score</assignments>

<!-- Complexity: 10 points (duplicated) -->
```

**After** (Subflow Extraction):
```xml
<!-- Main Flow -->
<subflows>
  <name>Process_Account_Logic</name>
  <!-- Complexity: 2 points -->
</subflows>

<subflows>
  <name>Process_Account_Logic</name>
  <!-- Complexity: 2 points -->
</subflows>

<!-- Total Main Flow: 4 points -->
<!-- Subflow: 5 points (created once, reused) -->
```

**When to use**: Repeated logic patterns, segments >150% of budget

#### Technique 4: Defer Non-Critical Operations

**Strategy**: Move non-critical operations to separate segments or scheduled flows

**Example**:
```
High Priority Segment (Budget: 5):
- Validate required fields ✅
- Check business rules ✅
- Update critical fields ✅

Lower Priority Segment (Budget: 4):
- Send notification email
- Log activity
- Update dashboard metrics

OR Schedule Separately:
- Move notifications to scheduled flow (runs every 15 minutes)
- Reduces real-time flow complexity
```

---

## 7. Testing Segments

### Why Test Segments Individually?

**Benefits**:
- ✅ **Faster Testing** - Test specific logic without full flow execution
- ✅ **Isolated Issues** - Identify exactly which segment has problems
- ✅ **No Deployment Needed** - Test without deploying to Salesforce
- ✅ **Comprehensive Coverage** - Generate test scenarios automatically
- ✅ **Regression Prevention** - Re-test segments after changes

### Testing Framework Overview

**FlowSegmentTester** (`scripts/lib/flow-segment-tester.js`)

**Key Features**:
- Test scenario generation (decision-paths, all-branches, boundary)
- Simulated segment execution
- Assertion framework (equals, contains, decision-path, no-errors)
- Coverage analysis
- Markdown test report generation

### Testing Workflow

#### Step 1: Generate Test Scenarios

**Automatic generation based on segment structure**:

```javascript
const FlowSegmentTester = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-segment-tester');
const tester = new FlowSegmentTester(flowAuthor, {
  verbose: true,
  generateReports: true
});

const scenarios = await tester.generateTestScenarios('ValidationSegment', {
  coverageStrategy: 'decision-paths',  // or 'all-branches', 'boundary'
  includeEdgeCases: true
});

console.log(`Generated ${scenarios.length} test scenarios`);
```

**Coverage Strategies**:

| Strategy | Scenarios Generated | Use Case |
|----------|-------------------|----------|
| **decision-paths** | One per decision path | Basic coverage, happy path + errors |
| **all-branches** | Every decision branch | Comprehensive coverage |
| **boundary** | Edge cases + boundaries | Thorough validation, critical flows |

**Example Generated Scenarios**:
```javascript
[
  {
    name: 'Happy Path - Valid Data',
    inputs: {
      'Opportunity.Amount': 50000,
      'Opportunity.StageName': 'Proposal',
      'Account.Industry': 'Technology'
    },
    expectedOutputs: {
      'ValidationPassed': true,
      'ValidationMessage': null
    },
    assertions: [
      { type: 'equals', path: 'variables.ValidationPassed', expected: true },
      { type: 'decision-path', path: 'Check_Amount', expected: 'true' },
      { type: 'no-errors' }
    ]
  },
  {
    name: 'Null Value Handling',
    inputs: {
      'Opportunity.Amount': null,
      'Opportunity.StageName': 'Proposal',
      'Account.Industry': 'Technology'
    },
    expectedOutputs: {
      'ValidationPassed': false,
      'ValidationMessage': 'Amount is required'
    },
    assertions: [
      { type: 'equals', path: 'variables.ValidationPassed', expected: false },
      { type: 'contains', path: 'variables.ValidationMessage', expected: 'required' }
    ]
  },
  {
    name: 'Boundary Condition - Max Amount',
    inputs: {
      'Opportunity.Amount': 999999999,
      'Opportunity.StageName': 'Proposal',
      'Account.Industry': 'Technology'
    },
    expectedOutputs: {
      'ValidationPassed': true
    },
    assertions: [
      { type: 'equals', path: 'variables.ValidationPassed', expected: true }
    ]
  }
]
```

#### Step 2: Run Tests

**Execute test scenarios against segment**:

```javascript
const results = await tester.runSegmentTests('ValidationSegment', scenarios, {
  stopOnFailure: false  // Continue even if tests fail
});

console.log(`Results:`);
console.log(`  Total: ${results.totalTests}`);
console.log(`  Passed: ${results.passed} (${Math.round(results.passed/results.totalTests*100)}%)`);
console.log(`  Failed: ${results.failed}`);
console.log(`  Coverage: ${Math.round(results.coverage.percentage)}%`);
```

**CLI Method**:
```bash
/flow-test-segment ValidationSegment \
  --coverage decision-paths \
  --stop-on-failure false \
  --report markdown

# Output:
# Generating test scenarios...
# Generated 6 test scenarios
#
# Running tests...
# ✅ Happy Path - Valid Data
# ❌ Null Value Handling
# ✅ Boundary Condition - Max Amount
# ✅ Invalid Stage
# ✅ Missing Required Field
# ✅ Error Condition
#
# Results:
#   Total: 6
#   Passed: 5 (83%)
#   Failed: 1 (17%)
#   Coverage: 75%
#
# Report saved to: ./test-reports/ValidationSegment_20251121.md
```

#### Step 3: Analyze Test Results

**Review failed tests**:

```javascript
const failedTests = results.tests.filter(t => !t.passed);

failedTests.forEach(test => {
  console.log(`\n❌ Failed Test: ${test.scenario.name}`);
  console.log(`   Error: ${test.error || 'Assertion failed'}`);

  if (test.failedAssertions && test.failedAssertions.length > 0) {
    test.failedAssertions.forEach(assertion => {
      console.log(`   - ${assertion.message}`);
      console.log(`     Expected: ${assertion.expected}`);
      console.log(`     Actual: ${assertion.actual}`);
    });
  }
});
```

**Example Failed Test Output**:
```
❌ Failed Test: Null Value Handling
   Error: Assertion failed

   - Variable ValidationPassed should be false
     Expected: false
     Actual: true

   - Variable ValidationMessage should contain "required"
     Expected: "required"
     Actual: null

Recommendation: Add null check before amount comparison
```

#### Step 4: Fix Issues and Retest

**Fix identified issues**:

```javascript
// Add null check to segment
await flowAuthor.addElement(
  "Add decision before Check_Amount: Check if Amount is not null, else set ValidationPassed to false"
);

// Re-run tests
const retestResults = await tester.runSegmentTests('ValidationSegment', scenarios);

console.log(`Retest Results:`);
console.log(`  Passed: ${retestResults.passed}/${retestResults.totalTests}`);
console.log(`  Fixed: ${retestResults.passed - results.passed} issues`);
```

#### Step 5: Generate Test Report

**Markdown report with detailed results**:

```javascript
await tester.generateTestReport('ValidationSegment', results, {
  outputPath: './test-reports/',
  format: 'markdown'
});

console.log('Report generated: ./test-reports/ValidationSegment_20251121.md');
```

**Report Contents**:
```markdown
# Test Report: ValidationSegment

**Date**: November 21, 2025
**Segment**: ValidationSegment
**Type**: validation
**Complexity**: 5/5 points

## Summary

- **Total Tests**: 6
- **Passed**: 5 (83%)
- **Failed**: 1 (17%)
- **Coverage**: 75%

## Test Results

### ✅ Passed Tests (5)

1. **Happy Path - Valid Data**
   - All assertions passed
   - Decision paths: Check_Amount (true), Check_Stage (true)

2. **Boundary Condition - Max Amount**
   - All assertions passed
   - Validated edge case handling

...

### ❌ Failed Tests (1)

1. **Null Value Handling**
   - **Error**: Assertion failed
   - **Failed Assertions**:
     - Variable ValidationPassed should be false (Expected: false, Actual: true)
     - Variable ValidationMessage should contain "required" (Expected: "required", Actual: null)
   - **Recommendation**: Add null check before amount comparison
   - **Location**: Decision "Check_Amount"

## Coverage Analysis

- **Decision Paths Covered**: 3/4 (75%)
- **Uncovered Paths**:
  - Check_Amount: false branch (null handling)

## Recommendations

1. Add null checks for required fields
2. Test additional edge cases (empty strings, negative values)
3. Improve error messages for failed validations
```

### Testing Best Practices

#### 1. Test Early and Often

```javascript
// After adding each major element
await flowAuthor.addElement("Add decision: Check amount");
await tester.runSegmentTests('CurrentSegment', scenarios);  // Test immediately
```

#### 2. Use Appropriate Coverage Strategy

```javascript
// Simple validation segment
scenarios = await tester.generateTestScenarios('ValidationSegment', {
  coverageStrategy: 'decision-paths'  // Basic coverage sufficient
});

// Complex routing segment
scenarios = await tester.generateTestScenarios('RoutingSegment', {
  coverageStrategy: 'all-branches'  // Comprehensive coverage needed
});

// Critical financial calculations
scenarios = await tester.generateTestScenarios('CalculationSegment', {
  coverageStrategy: 'boundary'  // Edge cases critical
});
```

#### 3. Keep Test Scenarios Realistic

```javascript
// ✅ GOOD: Realistic test data
{
  name: 'Standard Enterprise Deal',
  inputs: {
    'Opportunity.Amount': 150000,
    'Account.Industry': 'Technology',
    'Account.AnnualRevenue': 5000000
  }
}

// ❌ BAD: Unrealistic test data
{
  name: 'Test',
  inputs: {
    'Opportunity.Amount': 1,  // Unrealistically low
    'Account.Industry': 'Test'  // Not a real industry
  }
}
```

#### 4. Test Segment Integration Points

```javascript
// Test how segment connects to previous segment
scenarios = await tester.generateTestScenarios('EnrichmentSegment', {
  priorSegmentOutputs: {
    'ValidationPassed': true,  // Output from previous segment
    'ValidationFlags': ['Amount_OK', 'Stage_OK']
  }
});
```

#### 5. Maintain Test History

```javascript
// Save test results for comparison
const testHistory = {
  date: new Date().toISOString(),
  segment: 'ValidationSegment',
  results: results,
  coverage: results.coverage
};

// Save to file
await fs.writeFile(
  `./test-history/${segment.name}_${Date.now()}.json`,
  JSON.stringify(testHistory, null, 2)
);
```

---

## 8. Subflow Extraction

### When to Extract Subflows

**Automatic extraction recommended when**:

| Threshold | Action | Reason |
|-----------|--------|--------|
| >150% of budget | Auto-extract | Exceeds complexity significantly |
| >200% of budget | Mandatory extract | Critical - flow will be unmaintainable |
| Repeated logic | Manual extract | DRY principle - reuse common patterns |
| >100 lines XML | Consider extract | Readability and AI comprehension |

### Extraction Process

#### Step 1: Identify Extraction Candidates

**Automatic identification**:

```javascript
const FlowSubflowExtractor = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-subflow-extractor');
const extractor = new FlowSubflowExtractor(flowAuthor, {
  defaultThreshold: 1.5  // 150% of budget
});

// Check if segment should be extracted
const segment = flowAuthor.segmentManager.currentSegment;
const extractionCheck = extractor.shouldExtract(segment, 1.5);

if (extractionCheck.shouldExtract) {
  console.log(`✅ Extraction recommended`);
  console.log(`   Reason: ${extractionCheck.reason}`);
  console.log(`   Budget usage: ${Math.round(extractionCheck.budgetUsage * 100)}%`);
  console.log(`   Complexity: ${extractionCheck.complexity} points`);
  console.log(`   Recommendation: ${extractionCheck.recommendation}`);
}
```

**Manual identification**:
```bash
/flow-segment-status --check-extraction

# Output:
# Current Segment: Loop_Processing
# Complexity: 15/10 points (150%)
#
# 🔔 EXTRACTION RECOMMENDED
# Reason: Segment exceeds 150% of budget
# Recommendation: Extract to subflow for maintainability
```

#### Step 2: Analyze Variables

**Determine input/output parameters**:

```javascript
// Automatic variable analysis
const variables = await extractor._analyzeSegmentVariables(segment);

console.log(`Input Variables (${variables.inputs.length}):`);
variables.inputs.forEach(v => {
  console.log(`  - ${v.name} (${v.dataType})`);
});

console.log(`Output Variables (${variables.outputs.length}):`);
variables.outputs.forEach(v => {
  console.log(`  - ${v.name} (${v.dataType})`);
});
```

**Example Output**:
```
Input Variables (3):
  - OpportunityId (String)
  - ProcessingMode (String)
  - ThresholdAmount (Currency)

Output Variables (2):
  - ProcessedCount (Number)
  - ErrorMessages (String)
```

#### Step 3: Extract Segment to Subflow

**Automatic extraction**:

```javascript
const extractionResult = await flowAuthor.extractSegmentAsSubflow('Loop_Processing', {
  threshold: 1.5,
  autoRename: true,  // Automatically generate subflow name
  preserveComments: true
});

if (extractionResult.extracted) {
  console.log(`✅ Extraction successful`);
  console.log(`   Subflow name: ${extractionResult.subflowName}`);
  console.log(`   Subflow path: ${extractionResult.subflowPath}`);
  console.log(`   Input parameters: ${extractionResult.variables.inputs.length}`);
  console.log(`   Output parameters: ${extractionResult.variables.outputs.length}`);
  console.log(`   Complexity reduction: -${extractionResult.complexityReduction} points`);
}
```

**CLI Method**:
```bash
/flow-extract-subflow Loop_Processing \
  --threshold 1.5 \
  --name Process_Opportunities_Subflow

# Output:
# Analyzing segment "Loop_Processing"...
# ✅ Variables analyzed: 3 inputs, 2 outputs
#
# Creating subflow: Process_Opportunities_Subflow
# ✅ Subflow created: ./flows/Process_Opportunities_Subflow.xml
#
# Updating parent flow...
# ✅ Parent flow updated with subflow call
#
# Summary:
#   Original complexity: 15 points
#   Subflow complexity: 15 points (extracted)
#   Parent flow reduction: -15 points
#   New parent complexity: 12 points
```

#### Step 4: Verify Extraction

**Test subflow independently**:

```javascript
// Create FlowAuthor for subflow
const subflowAuthor = new FlowAuthor(orgAlias);
await subflowAuthor.loadFlow('./flows/Process_Opportunities_Subflow.xml');

// Run validation
const FlowValidator = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator');
const validator = new FlowValidator();
const validation = await validator.validateFlow(subflowAuthor.getFlowXML());

if (validation.valid) {
  console.log(`✅ Subflow validation passed`);
} else {
  console.log(`❌ Subflow validation failed:`);
  validation.errors.forEach(e => console.log(`   - ${e.message}`));
}
```

**Test parent flow with subflow call**:

```javascript
// Verify subflow call in parent
const parentFlow = await flowAuthor.getFlowXML();
const subflowCalls = parentFlow.match(/<subflows>/g);

console.log(`Subflow calls in parent: ${subflowCalls ? subflowCalls.length : 0}`);
```

#### Step 5: Deploy Both Flows

**Deploy subflow first, then parent**:

```bash
# 1. Deploy subflow
sf project deploy start \
  --source-dir ./flows/Process_Opportunities_Subflow.xml \
  --target-org production

# 2. Verify subflow deployed
sf data query --query "SELECT DeveloperName, ActiveVersionNumber FROM FlowDefinition WHERE DeveloperName = 'Process_Opportunities_Subflow'" --target-org production --use-tooling-api

# 3. Deploy parent flow
sf project deploy start \
  --source-dir ./flows/OpportunityProcessing.xml \
  --target-org production
```

### Extraction Best Practices

#### 1. Extract Early

```javascript
// Don't wait until segment is massive
// Extract as soon as threshold is reached

if (segment.currentComplexity >= segment.budget * 1.5) {
  await flowAuthor.extractSegmentAsSubflow(segment.name);
}
```

#### 2. Name Subflows Descriptively

```javascript
// ✅ GOOD: Clear purpose
await flowAuthor.extractSegmentAsSubflow('Loop_Processing', {
  name: 'Process_Opportunities_In_Renewal_Stage'
});

// ❌ BAD: Generic name
await flowAuthor.extractSegmentAsSubflow('Loop_Processing', {
  name: 'Subflow_1'  // Meaningless name
});
```

#### 3. Document Subflow Purpose

```xml
<description>
  Processes opportunities in Renewal stage.
  Extracted from: OpportunityProcessing (Loop_Processing segment)
  Input: OpportunityId, ProcessingMode, ThresholdAmount
  Output: ProcessedCount, ErrorMessages
  Complexity: 15 points
</description>
```

#### 4. Minimize Parameter Passing

```javascript
// Prefer passing IDs and looking up data in subflow
// vs passing large objects

// ✅ GOOD
inputParameters:
  - OpportunityId (String)

// ❌ BAD (passing entire record)
inputParameters:
  - OpportunityRecord (SObject - 50+ fields)
```

#### 5. Test Subflow Independently

```javascript
const subflowTester = new FlowSegmentTester(subflowAuthor);
const scenarios = await subflowTester.generateTestScenarios('EntireSubflow');
const results = await subflowTester.runSegmentTests('EntireSubflow', scenarios);

console.log(`Subflow test results: ${results.passed}/${results.totalTests} passed`);
```

### Subflow Reusability

**Pattern**: Extract common logic into reusable subflows

```javascript
// Extract validation logic that's used in multiple flows
await flowAuthor.extractSegmentAsSubflow('Account_Validation', {
  name: 'Validate_Account_Standard_Fields',
  makeReusable: true  // Mark for reuse in other flows
});

// Reference in multiple parent flows
// Flow 1: Opportunity Processing
// Flow 2: Case Creation
// Flow 3: Account Update
// All call: Validate_Account_Standard_Fields subflow
```

**Benefits**:
- ✅ DRY principle - Don't Repeat Yourself
- ✅ Consistent validation across flows
- ✅ Single place to update validation logic
- ✅ Reduces total complexity across all flows

---

## 9. Interactive Building Mode

### Overview

**Interactive Building Mode** provides a wizard-style CLI interface for building flows segment-by-segment with real-time guidance, testing, and validation.

### Starting Interactive Mode

```bash
/flow-interactive-build OpportunityRenewalFlow --org production

# Or with options:
/flow-interactive-build OpportunityRenewalFlow \
  --org production \
  --testing-enabled \
  --auto-save \
  --extraction-threshold 1.5
```

### Wizard Stages

#### Stage 1: Flow Initialization

```
┌─────────────────────────────────────────────┐
│  Flow Segmentation Wizard                   │
├─────────────────────────────────────────────┤
│  Flow: OpportunityRenewalFlow               │
│  Org: production                            │
│  Status: New Flow                           │
└─────────────────────────────────────────────┘

Would you like to:
  1. Start a new segment
  2. Load existing flow for segmentation
  3. View segmentation best practices
  4. Exit

Choice [1-4]: 1
```

#### Stage 2: Template Selection

```
┌─────────────────────────────────────────────┐
│  Segment Template Selection                 │
├─────────────────────────────────────────────┤
│  Choose a template for your segment:        │
│                                              │
│  1. 📋 Validation                            │
│     Budget: 5 points | Best for: Input      │
│     validation, data quality checks         │
│                                              │
│  2. 🔄 Enrichment                            │
│     Budget: 8 points | Best for: Data       │
│     lookups, calculations, field updates    │
│                                              │
│  3. 🔀 Routing                               │
│     Budget: 6 points | Best for: Workflow   │
│     branching, decision-based paths         │
│                                              │
│  4. 📧 Notification                          │
│     Budget: 4 points | Best for: Emails,    │
│     alerts, external notifications          │
│                                              │
│  5. 🔁 Loop Processing                       │
│     Budget: 10 points | Best for: Batch     │
│     operations, collection iteration        │
│                                              │
│  6. ⚙️  Custom                               │
│     Budget: 7 points | Best for: Mixed      │
│     logic, specialized workflows            │
│                                              │
│  7. ℹ️  View template details                │
│  8. 🎓 Get template recommendations          │
└─────────────────────────────────────────────┘

Choice [1-8]: 1

Enter segment name: Initial_Validation

✅ Started segment "Initial_Validation" with validation template
```

#### Stage 3: Segment Building

```
┌─────────────────────────────────────────────────────────────┐
│  Building: Initial_Validation                               │
├─────────────────────────────────────────────────────────────┤
│  Budget Usage: ████░░░░░░ 3/5 points (60%)                  │
│  Status: ✅ Healthy                                          │
│  Elements: 2 decisions, 1 assignment                        │
├─────────────────────────────────────────────────────────────┤
│  Recent Operations:                                          │
│  ✅ Added Decision: Check_Opportunity_Stage                  │
│  ✅ Added Assignment: Set_Validation_Flag                    │
├─────────────────────────────────────────────────────────────┤
│  Actions:                                                    │
│  1. Add element (natural language)                          │
│  2. View segment details                                    │
│  3. Check for anti-patterns                                 │
│  4. Preview complexity impact                               │
│  5. Complete this segment                                   │
│  6. Test this segment                                       │
│  7. Get suggestions                                         │
│  8. Rollback last operation                                 │
│  9. Save and exit                                           │
│  0. Cancel segment                                          │
├─────────────────────────────────────────────────────────────┤
│  Tip: You have 2 points remaining. Consider adding fault    │
│  paths for error handling before completing.                │
└─────────────────────────────────────────────────────────────┘

Choice [0-9]: 1
```

#### Stage 4: Element Addition

```
┌─────────────────────────────────────────────┐
│  Add Element to Segment                     │
├─────────────────────────────────────────────┤
│  Describe what you want to add:             │
│                                              │
│  Examples:                                   │
│  - "Add decision: Is opportunity amount     │
│     greater than 10000"                     │
│  - "Add record lookup: Get account owner"   │
│  - "Add assignment: Set renewal flag to     │
│     true"                                    │
│                                              │
│  Type 'back' to return to menu              │
│  Type 'help' for more examples              │
└─────────────────────────────────────────────┘

Your instruction: Add decision: Check if amount is greater than 10000

✅ Element added successfully
Complexity impact: +2 points
New total: 5/5 (100%)

⚠️  WARNING: Segment at 100% of budget
Recommendation: Complete segment or remove elements
```

#### Stage 5: Complexity Preview

```
┌─────────────────────────────────────────────┐
│  Complexity Impact Preview                  │
├─────────────────────────────────────────────┤
│  Instruction: "Add record lookup: Get       │
│  account details"                           │
│                                              │
│  Estimated Complexity: +2 points            │
│                                              │
│  After Addition:                             │
│  • Total: 7/5 points (140%) 🛑              │
│  • Status: OVER BUDGET                       │
│                                              │
│  ⚠️  WARNING: This will exceed your budget   │
│  limit. Consider:                            │
│  • Completing segment before this element   │
│  • Removing non-critical elements           │
│  • Extracting to subflow if needed          │
│                                              │
│  Proceed? [y/N]: n                           │
└─────────────────────────────────────────────┘
```

#### Stage 6: Anti-Pattern Detection

```
┌─────────────────────────────────────────────┐
│  🛑 CRITICAL ANTI-PATTERN DETECTED           │
├─────────────────────────────────────────────┤
│  Type: DML Inside Loop                       │
│                                              │
│  Issue: Record Update operation detected    │
│  inside a loop element.                     │
│                                              │
│  Impact: This will cause governor limit     │
│  errors when processing large datasets.     │
│                                              │
│  Recommendation:                             │
│  • Collect records in collection variable   │
│  • Perform bulk update AFTER loop           │
│  • Use collection-based DML pattern         │
│                                              │
│  Actions:                                    │
│  1. Remove last element and restructure     │
│  2. Get detailed guidance                   │
│  3. Proceed anyway (not recommended)        │
│  4. Exit to fix manually                    │
│                                              │
│  Choice [1-4]: 1                             │
└─────────────────────────────────────────────┘
```

#### Stage 7: Segment Testing

```
┌─────────────────────────────────────────────┐
│  Segment Testing                            │
├─────────────────────────────────────────────┤
│  Generating test scenarios for segment:     │
│  "Initial_Validation"                       │
│                                              │
│  Coverage Strategy: decision-paths          │
│                                              │
│  Generated 6 test scenarios:                │
│  ✅ Happy path - valid data                  │
│  ✅ Null value handling                      │
│  ✅ Boundary condition - max amount          │
│  ✅ Invalid stage                            │
│  ✅ Missing required field                   │
│  ✅ Error condition                          │
│                                              │
│  Run tests? [Y/n]: y                         │
└─────────────────────────────────────────────┘

Running tests...
┌─────────────────────────────────────────────┐
│  Test Results                               │
├─────────────────────────────────────────────┤
│  Passed: 5/6 (83%)                          │
│  Failed: 1/6                                │
│                                              │
│  ❌ Failed: Null value handling              │
│     Expected: No errors                     │
│     Actual: NullPointerException            │
│     Location: Decision "Check_Amount"       │
│                                              │
│  Recommendation: Add null check before      │
│  amount comparison                          │
│                                              │
│  Actions:                                    │
│  1. Fix and retest                          │
│  2. View detailed test report               │
│  3. Continue anyway                         │
│  4. Return to segment building              │
│                                              │
│  Choice [1-4]: 1                             │
└─────────────────────────────────────────────┘
```

#### Stage 8: Segment Completion

```
┌─────────────────────────────────────────────┐
│  Complete Segment?                          │
├─────────────────────────────────────────────┤
│  Segment: Initial_Validation                 │
│  Final Complexity: 5/5 points (100%)        │
│  Elements: 3 decisions, 2 assignments       │
│                                              │
│  Validation Results:                         │
│  ✅ Budget compliance                        │
│  ✅ Fault paths present                      │
│  ✅ No anti-patterns detected                │
│  ⚠️  Missing exit path (recommended)         │
│                                              │
│  Would you like to:                          │
│  1. Complete segment as-is                  │
│  2. Add missing exit path first             │
│  3. Auto-fix validation issues (v3.56.0) ⭐  │
│  4. Test segment before completing          │
│  5. Continue editing                        │
│                                              │
│  Choice [1-5]: 1                             │
└─────────────────────────────────────────────┘

✅ Segment completed successfully
```

#### Stage 9: Segment Transition

```
┌─────────────────────────────────────────────┐
│  Segment Completed ✅                        │
├─────────────────────────────────────────────┤
│  Segment: Initial_Validation                 │
│  Complexity: 5/5 points                     │
│  Status: Valid                              │
│                                              │
│  Flow Progress:                              │
│  • Completed: 1 segment                     │
│  • Total Complexity: 5/42 points (12%)      │
│                                              │
│  Next Steps:                                 │
│  Based on your flow requirements, we        │
│  recommend:                                  │
│                                              │
│  1. Start "Enrichment" segment              │
│     (Best for: Data lookups, calculations)  │
│                                              │
│  2. Start "Routing" segment                 │
│     (Best for: Decision-based branching)    │
│                                              │
│  3. View all segment templates              │
│  4. Save and exit                           │
│                                              │
│  Choice [1-4]: 1                             │
└─────────────────────────────────────────────┘
```

#### Stage 10: Subflow Extraction Recommendation

```
┌─────────────────────────────────────────────┐
│  🔔 Subflow Extraction Recommended           │
├─────────────────────────────────────────────┤
│  Segment: Loop_Processing                   │
│  Complexity: 15/10 points (150%)            │
│                                              │
│  This segment significantly exceeds the     │
│  budget. We recommend extracting it to a    │
│  subflow for better maintainability.        │
│                                              │
│  Benefits:                                   │
│  • Reduces parent flow complexity           │
│  • Improves testability                     │
│  • Enables reusability                      │
│  • Better AI comprehension                  │
│                                              │
│  Extraction Preview:                         │
│  • Subflow: Opportunity_Renewal_Loop        │
│  • Input Parameters: 3 variables            │
│  • Output Parameters: 2 variables           │
│  • Complexity Reduction: -15 points         │
│                                              │
│  Would you like to:                          │
│  1. Auto-extract to subflow now             │
│  2. Extract after completing segment        │
│  3. View extraction details                 │
│  4. Continue without extraction             │
│                                              │
│  Choice [1-4]: 1                             │
└─────────────────────────────────────────────┘

Extracting to subflow...
✅ Segment extracted to subflow: Opportunity_Renewal_Loop
Complexity reduced by 15 points
```

#### Stage 11: Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Flow Summary                                               │
├─────────────────────────────────────────────────────────────┤
│  Flow: OpportunityRenewalFlow                               │
│  Total Segments: 4                                          │
│  Total Complexity: 23/42 points (55%)                       │
│  Status: ✅ Healthy                                          │
├─────────────────────────────────────────────────────────────┤
│  Segments:                                                   │
│  1. ✅ Initial_Validation (5/5) - 100% - Completed           │
│  2. ✅ Enrichment_Logic (8/8) - 100% - Completed             │
│  3. ✅ Routing_Decision (6/6) - 100% - Completed             │
│  4. ✅ Notification_Alerts (4/4) - 100% - Completed          │
├─────────────────────────────────────────────────────────────┤
│  Quality Checks:                                             │
│  ✅ All segments validated                                   │
│  ✅ No anti-patterns detected                                │
│  ✅ All segments tested                                      │
│  ✅ Fault paths present                                      │
│  ✅ Budget compliance                                        │
├─────────────────────────────────────────────────────────────┤
│  Actions:                                                    │
│  1. Deploy flow to org                                      │
│  2. Generate deployment package                             │
│  3. Export segment documentation                            │
│  4. Add another segment                                     │
│  5. View detailed flow report                               │
│  6. Exit without deployment                                 │
│                                                              │
│  Choice [1-6]: 1                                             │
└─────────────────────────────────────────────────────────────┘
```

### Interactive Mode Features

#### Contextual Help

**Available throughout wizard**:

```
help               Show context-specific help
back               Return to previous menu
status             Show current segment status
suggest            Get AI suggestions
examples           Show element examples
best-practices     View best practices
anti-patterns      View anti-patterns to avoid
save               Save and exit gracefully
quit               Exit without saving
```

#### Real-Time Suggestions

```
💡 Smart Suggestions

Based on your current segment structure:

1. Add fault path handling (high priority)
   Your decisions don't have fault paths.
   Add error handling for robustness.

2. Consider adding null checks (medium priority)
   Add validation for fields that might be null.

3. Add exit path (low priority)
   No explicit exit path defined. Add stop element for clarity.

Would you like to:
  1. Apply suggestion #1
  2. Apply suggestion #2
  3. Apply suggestion #3
  4. View more details
  5. Dismiss suggestions
```

#### Rollback Capability

```
Rollback Operation

Recent Operations:
  [3] Added Decision: Check_Renewal_Date
  [2] Added Assignment: Calculate_Discount
  [1] Added Record Lookup: Get_Account

Select operation to rollback [1-3]:
(This will remove the operation and all subsequent operations)

Choice [1-3]: 2

Are you sure you want to rollback operation #2
and all subsequent operations? [y/N]: y

Rollback complete. Removed 2 operations.
Budget freed: 3 points
Current budget usage: 3/5 points (60%)
```

#### Session Persistence

**Sessions are automatically saved**:

```
# Session location:
instances/<org>/<flow>/segments/.interactive-session.json

# Resume with:
/flow-interactive-build OpportunityRenewalFlow --org production --resume

# Output:
✅ Session loaded from November 21, 2025 at 3:45 PM
Resuming from Stage: Segment Building
Current Segment: Enrichment_Logic (5/8 points)
```

### Interactive Mode vs Manual Mode

| Feature | Interactive Mode | Manual Mode |
|---------|------------------|-------------|
| **Learning Curve** | Low - guided wizard | Medium - requires CLI knowledge |
| **Speed** | Slower initially, faster with practice | Faster for experts |
| **Guidance** | Real-time suggestions and warnings | Manual checking required |
| **Error Prevention** | Proactive anti-pattern detection | Reactive validation |
| **Testing** | Integrated test execution | Manual test invocation |
| **Rollback** | Built-in rollback capability | Manual XML editing |
| **Session Resume** | Automatic session persistence | Manual state tracking |
| **Best For** | Learning, complex flows, new developers | Experts, simple flows, scripting |

---

## 10. Best Practices

### Planning Best Practices

#### 1. Plan Segments Before Coding

```
Before starting:
1. List flow requirements
2. Identify logical sections
3. Assign segments to sections
4. Estimate complexity per segment
5. Choose appropriate templates
```

**Example Planning Document**:
```markdown
# OpportunityRenewalFlow - Segment Plan

## Requirements
- Validate opportunity meets renewal criteria
- Enrich with account and product details
- Calculate renewal pricing
- Route for approval if needed
- Send notifications

## Segment Plan

| Segment | Type | Budget | Purpose |
|---------|------|--------|---------|
| 1. Initial_Validation | validation | 5 | Check stage, amount, fields |
| 2. Account_Enrichment | enrichment | 8 | Lookup account, owner, territory |
| 3. Product_Processing | loopProcessing | 10 | Iterate products, calculate totals |
| 4. Pricing_Calculation | enrichment | 6 | Calculate discount, apply rules |
| 5. Approval_Routing | routing | 6 | Route for approval if amount > threshold |
| 6. Notification_Alerts | notification | 4 | Email owner, alert manager |

Total Estimated: 39 points
```

#### 2. Start with Validation

```javascript
// ALWAYS start with validation segment
await flowAuthor.startSegment('Initial_Validation', 'validation');

// Validate:
// - Required fields present
// - Prerequisites met
// - Data quality acceptable

// Set validation flags for downstream use
```

**Why**: Fail fast on invalid data before processing

#### 3. Follow Logical Flow Order

```
Recommended Order:
1. Validation     (check prerequisites)
2. Enrichment     (gather data)
3. Loop Processing (if needed)
4. Routing        (make decisions)
5. Enrichment     (update records)
6. Notification   (alert stakeholders)
```

### Implementation Best Practices

#### 1. Use Descriptive Names

```javascript
// ✅ GOOD: Clear, descriptive names
await flowAuthor.startSegment('Validate_Opportunity_Renewal_Criteria', 'validation');
await flowAuthor.addElement("Add decision called Check_Amount_Threshold: Is amount > 10000");

// ❌ BAD: Generic, unclear names
await flowAuthor.startSegment('Segment1', 'validation');
await flowAuthor.addElement("Add decision: Check");
```

#### 2. Document Segment Purpose

```javascript
await flowAuthor.startSegment('Account_Enrichment', 'enrichment', {
  budget: 8,
  description: `
    Enriches opportunity with account-level data including:
    - Account owner and manager
    - Account territory
    - Account industry and revenue
    - Related products and pricing

    Output Variables:
    - AccountOwner
    - AccountTerritory
    - IndustryCategory
    - PricingTier
  `
});
```

#### 3. Track Dependencies Between Segments

```javascript
// Document what each segment depends on
const segmentDependencies = {
  'Validate_Opportunity': [],  // No dependencies
  'Enrich_Account': ['Validate_Opportunity'],  // Needs validation to pass
  'Calculate_Pricing': ['Enrich_Account'],  // Needs account data
  'Route_Approval': ['Calculate_Pricing'],  // Needs pricing to decide
  'Send_Notifications': ['Route_Approval']  // Needs approval outcome
};
```

#### 4. Use Consistent Naming Conventions

```
Segment Naming:
- <Action>_<Object>_<Purpose>
- Examples:
  - Validate_Opportunity_Renewal_Criteria
  - Enrich_Account_Territory_Information
  - Calculate_Renewal_Pricing_Discounts

Variable Naming:
- <Object><Property> (PascalCase)
- Examples:
  - OpportunityAmount
  - AccountIndustry
  - ValidationPassed

Decision Naming:
- Check_<Condition>
- Is_<State>
- Has_<Attribute>
- Examples:
  - Check_Amount_Threshold
  - Is_Renewal_Eligible
  - Has_Required_Fields
```

#### 5. Validate Incrementally

```javascript
// After each significant addition
await flowAuthor.addElement("Add decision: Check amount");
await flowAuthor.addElement("Add assignment: Set validation flag");

// Validate segment state
const segment = flowAuthor.segmentManager.currentSegment;
const flow = await flowAuthor.getFlowXML();
const validation = await validator.validateSegment(flow, segment);

if (!validation.valid) {
  console.log('⚠️  Validation issues detected - fix before continuing');
}
```

### Testing Best Practices

#### 1. Test Each Segment Before Moving On

```javascript
// Complete testing cycle per segment
await flowAuthor.startSegment('ValidationSegment', 'validation');
// ... add elements ...
await tester.runSegmentTests('ValidationSegment', scenarios);
await flowAuthor.completeSegment();

// Move to next segment only after tests pass
await flowAuthor.startSegment('EnrichmentSegment', 'enrichment');
```

#### 2. Use Appropriate Test Coverage

```javascript
// Simple segments: decision-paths
const validationScenarios = await tester.generateTestScenarios('ValidationSegment', {
  coverageStrategy: 'decision-paths'
});

// Complex segments: all-branches
const routingScenarios = await tester.generateTestScenarios('RoutingSegment', {
  coverageStrategy: 'all-branches'
});

// Critical segments: boundary
const pricingScenarios = await tester.generateTestScenarios('PricingSegment', {
  coverageStrategy: 'boundary',
  includeEdgeCases: true
});
```

#### 3. Maintain Test History

```javascript
// Save test results for regression testing
const testResults = {
  date: new Date().toISOString(),
  segment: 'ValidationSegment',
  results: results,
  coverage: results.coverage.percentage
};

await fs.writeFile(
  `./test-history/ValidationSegment_${Date.now()}.json`,
  JSON.stringify(testResults, null, 2)
);

// Compare with previous results
const previousResults = JSON.parse(await fs.readFile('./test-history/ValidationSegment_latest.json'));
if (results.passed < previousResults.passed) {
  console.log('⚠️  WARNING: Test regression detected');
}
```

### Complexity Management Best Practices

#### 1. Monitor Budget Usage Continuously

```javascript
// Check status after each addition
const status = flowAuthor.getSegmentStatus();
console.log(`Budget: ${status.currentComplexity}/${status.budget} (${Math.round(status.budgetUsage)}%)`);

if (status.budgetUsage >= 0.7) {
  console.log('⚠️  Approaching budget limit - plan to complete soon');
}
```

#### 2. Extract Early, Extract Often

```javascript
// Don't wait until segment is huge
if (segment.currentComplexity >= segment.budget * 1.3) {
  console.log('💡 Consider extracting to subflow');
  const extractionCheck = extractor.shouldExtract(segment, 1.3);

  if (extractionCheck.shouldExtract) {
    await flowAuthor.extractSegmentAsSubflow(segment.name);
  }
}
```

#### 3. Prefer Subflows Over Large Segments

```javascript
// If segment will exceed budget significantly:
// Option 1: Split into multiple segments
await flowAuthor.completeSegment();
await flowAuthor.startSegment('ContinuationSegment', 'custom', { budget: 7 });

// Option 2: Extract to subflow (preferred for reusability)
await flowAuthor.extractSegmentAsSubflow(segment.name);
```

### Maintenance Best Practices

#### 1. Document Segment Structure

```javascript
// Create segment map document
const segmentMap = {
  flow: 'OpportunityRenewalFlow',
  segments: flowAuthor.segmentManager.segments.map(s => ({
    name: s.name,
    type: s.type,
    complexity: s.currentComplexity,
    budget: s.budget,
    purpose: s.description,
    dependencies: s.dependencies || []
  }))
};

await fs.writeFile(
  './documentation/OpportunityRenewalFlow_SegmentMap.json',
  JSON.stringify(segmentMap, null, 2)
);
```

#### 2. Version Segment Configurations

```bash
# Track segment metadata in git
git add instances/production/OpportunityRenewalFlow/segments/
git commit -m "OpportunityRenewalFlow: Complete validation and enrichment segments"
```

#### 3. Keep Segments Focused

```javascript
// If segment is doing too much, split it
// Before: Single large segment
await flowAuthor.startSegment('Process_Everything', 'custom', { budget: 15 });

// After: Two focused segments
await flowAuthor.startSegment('Process_Validation', 'validation', { budget: 5 });
await flowAuthor.completeSegment();
await flowAuthor.startSegment('Process_Enrichment', 'enrichment', { budget: 8 });
```

### Team Collaboration Best Practices

#### 1. Use Consistent Templates

```javascript
// Define team standards
const teamTemplateChoices = {
  'Data Validation': 'validation',
  'Data Enrichment': 'enrichment',
  'Business Logic': 'routing',
  'User Notifications': 'notification',
  'Batch Processing': 'loopProcessing'
};

// All team members use same templates for same purposes
```

#### 2. Review Segment Plans Before Implementation

```markdown
# Segment Review Checklist

- [ ] Segment purpose is clear and focused
- [ ] Template choice is appropriate
- [ ] Budget allocation is reasonable
- [ ] Dependencies are documented
- [ ] Anti-patterns are avoided
- [ ] Test strategy is defined
- [ ] **Auto-fix applied** ⭐ NEW (v3.56.0)
  ```bash
  # Preview auto-fix changes
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run

  # Apply fixes if appropriate
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --auto-fix

  # Validate fixed Flow
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.fixed.xml --checks all
  ```
```

#### 3. Share Reusable Subflows

```bash
# Create shared subflow library
./flows/shared/
  ├── Validate_Account_Standard_Fields.xml
  ├── Calculate_Renewal_Discount.xml
  ├── Route_To_Approval_Queue.xml
  └── Send_Standard_Email_Notification.xml

# Document in README
./flows/shared/README.md
```

---

## 11. Troubleshooting

### Common Issues and Solutions

#### Issue 1: Budget Exceeded Unexpectedly

**Symptom**:
```
❌ BLOCKED: Segment exceeds budget (110%)
Current: 11/10 points
```

**Causes**:
- Underestimated complexity of elements
- Added elements without checking budget
- Template budget too conservative

**Solutions**:

**Solution 1**: Preview complexity before adding
```javascript
const preview = await calculator.calculateFromInstruction(instruction);
console.log(`Will add ${preview.score} points`);
console.log(`New total: ${currentComplexity + preview.score}/${budget}`);

if (currentComplexity + preview.score > budget) {
  console.log('⚠️  Will exceed budget - consider completing segment first');
}
```

**Solution 2**: Extract to subflow
```javascript
await flowAuthor.extractSegmentAsSubflow(segment.name, {
  threshold: 1.0  // Extract immediately
});
```

**Solution 3**: Split into multiple segments
```javascript
await flowAuthor.completeSegment();
await flowAuthor.startSegment('ContinuationSegment', segment.type, {
  budget: segment.budget
});
```

#### Issue 2: Anti-Pattern Detected

**Symptom**:
```
🛑 CRITICAL: DML Inside Loop
Record Update operation detected inside a loop element.
```

**Cause**: Record update placed inside loop (governor limit violation)

**Solution**: Refactor to collection pattern

**Before** (WRONG):
```xml
<loops>
  <name>Loop_Opportunities</name>
  <collectionReference>Opportunities</collectionReference>
  <!-- Loop body -->
  <recordUpdates>
    <name>Update_Opportunity</name>  <!-- ❌ DML in loop -->
  </recordUpdates>
</loops>
```

**After** (CORRECT):
```xml
<assignments>
  <name>Initialize_Collection</name>
  <assignmentItems>
    <assignToReference>OppsToUpdate</assignToReference>
    <operator>Assign</operator>
    <value><elementReference>EmptyCollection</elementReference></value>
  </assignmentItems>
</assignments>

<loops>
  <name>Loop_Opportunities</name>
  <collectionReference>Opportunities</collectionReference>
  <!-- Loop body -->
  <assignments>
    <name>Add_To_Collection</name>
    <assignmentItems>
      <assignToReference>OppsToUpdate</assignToReference>
      <operator>Add</operator>  <!-- ✅ Collect, don't update -->
      <value><elementReference>CurrentOpportunity</elementReference></value>
    </assignmentItems>
  </assignments>
</loops>

<recordUpdates>
  <name>Bulk_Update_Opportunities</name>  <!-- ✅ DML after loop -->
  <inputReference>OppsToUpdate</inputReference>
</recordUpdates>
```

#### Issue 3: Segment Tests Failing

**Symptom**:
```
❌ Failed: Null Value Handling
Expected: No errors
Actual: NullPointerException at Decision "Check_Amount"
```

**Causes**:
- Missing null checks
- Assuming fields are always populated
- Incorrect decision logic

**Solutions**:

**Solution 1**: Add null checks
```javascript
// Add decision before accessing field
await flowAuthor.addElement(
  "Add decision before Check_Amount: Is Amount field not null, else set error flag"
);
```

**Solution 2**: Use formulas with null handling
```xml
<formulas>
  <name>Safe_Amount_Check</name>
  <dataType>Boolean</dataType>
  <expression>
    IF(ISNULL(Opportunity.Amount), false, Opportunity.Amount > 10000)
  </expression>
</formulas>
```

**Solution 3**: Set default values
```xml
<assignments>
  <name>Set_Default_Amount</name>
  <assignmentItems>
    <assignToReference>SafeAmount</assignToReference>
    <operator>Assign</operator>
    <value>
      <elementReference>ISNULL_Amount_Formula</elementReference>
    </value>
  </assignmentItems>
</assignments>

<formulas>
  <name>ISNULL_Amount_Formula</name>
  <dataType>Currency</dataType>
  <expression>
    IF(ISNULL(Opportunity.Amount), 0, Opportunity.Amount)
  </expression>
</formulas>
```

#### Issue 4: Cannot Complete Segment

**Symptom**:
```
⚠️  Cannot complete segment:
- Missing fault paths on decisions
- No exit path defined
```

**Cause**: Validation rules not satisfied

**Solution**: Address validation warnings

```javascript
// Check what's missing
const segment = flowAuthor.segmentManager.currentSegment;
const flow = await flowAuthor.getFlowXML();
const validation = await validator.validateSegment(flow, segment);

// Add missing elements
if (validation.errors.find(e => e.rule === 'requires-fault-paths')) {
  await flowAuthor.addElement("Add fault path to Check_Amount decision leading to Error_Handler");
}

if (validation.errors.find(e => e.rule === 'requires-exit-path')) {
  await flowAuthor.addElement("Add stop element at end of segment");
}

// Retry completion
await flowAuthor.completeSegment();
```

#### Issue 5: Subflow Extraction Failed

**Symptom**:
```
❌ Subflow extraction failed: Cannot determine input parameters
```

**Causes**:
- Complex variable dependencies
- Variables not properly initialized
- Ambiguous variable scope

**Solutions**:

**Solution 1**: Manually specify parameters
```javascript
await extractor.extractSegmentToSubflow('SegmentName', {
  explicitInputs: ['OpportunityId', 'ProcessingMode'],
  explicitOutputs: ['ProcessedCount', 'ErrorMessage']
});
```

**Solution 2**: Simplify variable structure
```javascript
// Before: Complex dependencies
OpportunityData.Account.Owner.Name  // ❌ Nested object access

// After: Flatten to simple variables
AccountOwnerName  // ✅ Simple variable
```

**Solution 3**: Extract manually
```bash
# Create subflow XML manually
# Then update parent flow to call subflow
```

#### Issue 6: Complexity Calculation Inconsistent

**Symptom**:
```
Expected complexity: 5 points
Actual complexity: 7 points
```

**Causes**:
- Formula elements not counted
- Assignments combined into single element
- Natural language parsing ambiguity

**Solution**: Verify element counts

```javascript
const segment = flowAuthor.segmentManager.currentSegment;
const elementCounts = await calculator._countElements(segment.elements);

console.log('Element Counts:');
console.log(`  Decisions: ${elementCounts.decisions}`);
console.log(`  Loops: ${elementCounts.loops}`);
console.log(`  Assignments: ${elementCounts.assignments}`);
console.log(`  Record Lookups: ${elementCounts.recordLookups}`);
console.log(`  Record Updates: ${elementCounts.recordUpdates}`);

const manualComplexity =
  elementCounts.decisions * 2 +
  elementCounts.loops * 3 +
  elementCounts.assignments * 1 +
  elementCounts.recordLookups * 2 +
  elementCounts.recordUpdates * 1;

console.log(`Manual calculation: ${manualComplexity} points`);
console.log(`System calculation: ${segment.currentComplexity} points`);
```

#### Issue 7: Interactive Mode Session Corrupted

**Symptom**:
```
❌ Cannot resume session: Invalid session data
```

**Solution**: Start fresh session

```bash
# Backup corrupted session
cp instances/production/FlowName/segments/.interactive-session.json \
   instances/production/FlowName/segments/.interactive-session.json.backup

# Remove corrupted session
rm instances/production/FlowName/segments/.interactive-session.json

# Start new session
/flow-interactive-build FlowName --org production
```

### Debugging Techniques

#### Technique 1: Enable Verbose Logging

```javascript
const flowAuthor = new FlowAuthor(orgAlias, {
  verbose: true,
  segmentationEnabled: true
});

// Will output:
// - Element addition details
// - Complexity calculations
// - Validation results
// - Segment state changes
```

#### Technique 2: Export Segment State

```javascript
const segment = flowAuthor.segmentManager.currentSegment;
const segmentState = {
  name: segment.name,
  type: segment.type,
  budget: segment.budget,
  currentComplexity: segment.currentComplexity,
  operations: segment.operations,
  elements: segment.elements
};

await fs.writeFile(
  './debug/segment-state.json',
  JSON.stringify(segmentState, null, 2)
);

console.log('Segment state exported for debugging');
```

#### Technique 3: Validate Flow XML Directly

```bash
# Export flow XML
sf data query --query "SELECT FullName, Metadata FROM Flow WHERE DeveloperName = 'FlowName'" \
  --target-org production \
  --use-tooling-api \
  --result-format json > flow-export.json

# Validate with external tool
xmllint --schema FlowDefinition-62.0.xsd flow.xml
```

#### Technique 4: Compare with Working Example

```bash
# Get list of segments from working flow
/flow-segment-list --flow WorkingFlow --org production

# Export segment metadata
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/export-segment-metadata.js WorkingFlow > working-segments.json

# Compare with current flow
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/export-segment-metadata.js CurrentFlow > current-segments.json
diff working-segments.json current-segments.json
```

### Getting Help

#### Community Resources

```bash
# View runbook
/flow-runbook 8  # This runbook

# Search for help
/flow-runbook --search segmentation
/flow-runbook --search complexity

# Get agent assistance
# Invoke flow-segmentation-specialist agent
# It has full knowledge of segmentation system
```

#### Submit Feedback

```bash
/reflect

# Describe issue:
# - What you were trying to do
# - What happened
# - Expected behavior
# - Steps to reproduce
```

---

## 12. Integration with Other Runbooks

### Relationship to Other Runbooks

**This runbook (Runbook 8) integrates with all other runbooks**:

| Runbook | Integration Point | When to Reference |
|---------|-------------------|-------------------|
| [Runbook 1: Authoring](01-authoring-flows-via-xml.md) | XML scaffolding, element templates | When creating segment XML |
| [Runbook 2: Designing](02-designing-flows-for-project-scenarios.md) | Template patterns, use cases | When choosing segment templates |
| [Runbook 3: Tools & Techniques](03-tools-and-techniques.md) | NLP modification, direct XML | When adding elements to segments |
| [Runbook 4: Validation](04-validation-and-best-practices.md) | 11-stage validation, best practices | When validating segments |
| [Runbook 5: Testing & Deployment](05-testing-and-deployment.md) | Testing lifecycle, deployment strategies | When deploying segmented flows |
| [Runbook 6: Monitoring](06-monitoring-maintenance-rollback.md) | Performance monitoring, maintenance | When monitoring segmented flows |
| [Runbook 7: Testing & Diagnostics](07-testing-and-diagnostics.md) | Diagnostic procedures | When troubleshooting segments |

### Combined Workflows

#### Workflow 1: Complete Flow Development with Segmentation

```
1. Plan segments (this runbook)
2. Create flow scaffold (Runbook 1)
3. Choose segment templates (Runbook 2 + this runbook)
4. Build segments incrementally (this runbook + Runbook 3)
5. Validate each segment (Runbook 4 + this runbook)
6. Test segments (Runbook 7 + this runbook)
7. Deploy with appropriate strategy (Runbook 5)
8. Monitor performance (Runbook 6)
```

#### Workflow 2: Refactoring Existing Flow with Segmentation

```
1. Analyze current flow complexity (Runbook 4)
2. Identify logical segments (this runbook)
3. Extract segments from existing flow (this runbook)
4. Test extracted segments (Runbook 7 + this runbook)
5. Validate refactored flow (Runbook 4)
6. Deploy with staged activation (Runbook 5)
7. Monitor for regressions (Runbook 6)
```

### Cross-References

#### From This Runbook to Others

- **Segment element creation** → See Runbook 1 (XML element templates)
- **Template selection** → See Runbook 2 (design patterns)
- **Element modification** → See Runbook 3 (NLP modification)
- **Segment validation** → See Runbook 4 (validation pipeline)
- **Segment testing** → See Runbook 7 (testing procedures)
- **Flow deployment** → See Runbook 5 (deployment strategies)
- **Performance monitoring** → See Runbook 6 (monitoring)

#### From Other Runbooks to This Runbook

- **Runbook 1** → "For large flows, use segmentation (Runbook 8)"
- **Runbook 2** → "Break complex templates into segments (Runbook 8)"
- **Runbook 3** → "Monitor complexity with segmentation (Runbook 8)"
- **Runbook 4** → "Validate segments incrementally (Runbook 8)"
- **Runbook 5** → "Test segments individually (Runbook 8)"
- **Runbook 6** → "Optimize by extracting to subflows (Runbook 8)"

---

## Summary

**Runbook 8: Incremental Segment Building** provides a comprehensive guide to building complex Salesforce Flows using segment-by-segment methodology.

### Key Takeaways

1. **Segmentation prevents AI context overload** for flows >20 complexity points
2. **5 core templates + 1 custom** provide structured patterns for segment types
3. **Real-time complexity tracking** with budget enforcement prevents runaway complexity
4. **Incremental validation** catches issues early before they compound
5. **Isolated segment testing** enables testing without full deployment
6. **Automatic subflow extraction** maintains manageable complexity
7. **Interactive building mode** provides guided, step-by-step assistance

### When to Use Segmentation

✅ **Use segmentation when**:
- Flow complexity > 20 points
- Multiple distinct purposes (validation, enrichment, routing, etc.)
- Complex decision logic or loops
- Team collaboration required
- Long-term maintainability important

❌ **Skip segmentation when**:
- Flow complexity < 10 points
- Single-purpose flows
- Quick prototypes
- Simple notifications or assignments

### Next Steps

1. **Try segmentation** with your next complex flow
2. **Use interactive mode** for guided experience
3. **Establish team standards** for segment templates and budgets
4. **Share reusable subflows** across your organization
5. **Provide feedback** via `/reflect` to improve the system

### Related Documentation

- **Phase Documentation**: `PHASE_4_SEGMENTATION_COMPLETE.md`
- **CLI Commands**: `/flow-segment-start`, `/flow-segment-complete`, `/flow-interactive-build`
- **Scripts**: `scripts/lib/flow-segment-manager.js`, `flow-segment-tester.js`
- **Agent**: `agents/flow-segmentation-specialist.md`
- **Other Runbooks**: Runbooks 1-7 in this series

---

**Version**: v3.46.0
**Last Updated**: November 21, 2025
**Maintained By**: Salesforce Plugin Team
