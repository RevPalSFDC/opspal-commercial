---
name: assignment-rules-framework
description: Seven-phase framework for Salesforce Lead/Case assignment rule design, validation, deployment, and conflict prevention.
usage: Use when creating, auditing, or optimizing Salesforce assignment rule automation.
---

# Salesforce Assignment Rules Framework

**Version**: 1.0.0
**Last Updated**: 2025-12-15

## Overview

The Assignment Rules Framework provides a comprehensive 7-phase methodology for managing Salesforce Lead and Case assignment rules. This skill enables automated owner assignment based on criteria, with conflict detection, pre-deployment validation, and automation integration.

## When to Use This Skill

Use this skill when:
- Creating or modifying Lead or Case assignment rules
- Auditing assignment automation conflicts
- Optimizing routing logic for leads or cases
- Resolving assignment rule issues
- Coordinating assignment rules with other automation (Flows, Triggers)
- Planning assignment strategies for sales or support teams

**Objects Supported**: Lead, Case (native Assignment Rules API only)

**Not for**: Accounts, Contacts, Custom Objects (use Territory Management or custom solutions)

## Core Concepts

### Assignment Rule Structure

```
AssignmentRule (Container)
└─ Rule Entries (Array) - Evaluated in order
   ├─ Order (Integer) - Evaluation sequence (1, 2, 3...)
   ├─ Criteria Items (Array) - AND logic between items
   │  ├─ Field (String) - Object field API name
   │  ├─ Operator (String) - equals, notEqual, lessThan, contains, etc.
   │  └─ Value (String) - Comparison value
   ├─ Assigned To (ID) - User/Queue/Role/Territory ID
   ├─ Assigned To Type (String) - User, Queue, Role, Territory
   └─ Email Template (ID) - Optional notification template
```

### Evaluation Order

**First Match Wins**: Assignment rules evaluate entries in ascending order (1, 2, 3...) and stop at the first matching entry. This is critical for rule design - place specific rules before general catch-alls.

**Example**:
```
Entry 1: Industry = Healthcare AND State = CA → Healthcare CA Queue
Entry 2: State = CA → General CA Queue
Entry 3: Industry = Healthcare → Healthcare Queue
Entry 4: (No criteria) → Default Queue
```

A lead with Industry=Healthcare and State=CA will match Entry 1 and stop. Entry 2 will never be evaluated for that lead.

### Assignee Types

Assignment rules can assign ownership to four types of entities:

| Type | ID Prefix | Entity | Access Requirements |
|------|-----------|--------|---------------------|
| User | 005 | Individual user | User must be Active, have Edit access to object |
| Queue | 00G | Group of users | Queue must have object enabled, members must have access |
| Role | 00E | User role | Assigns to role holder, role must exist |
| Territory | 0TM | Territory2 record | Territory must be active, assignment rules must be enabled |

### Active vs Inactive Rules

**Critical Constraint**: Only ONE assignment rule can be active per object at a time.

- Activating a new rule automatically deactivates the current active rule
- Inactive rules can exist but won't fire automatically
- API calls can specify which rule to use (active or specific ID)

### API Triggers

Assignment rules do not fire automatically on all record creation:

**Automatic Triggers**:
- Web-to-Lead form submissions
- Web-to-Case form submissions
- Email-to-Case

**Require API Header**:
- SOAP API: `AssignmentRuleHeader.useDefaultRule = true`
- REST API: `Sforce-Auto-Assign: TRUE`
- Apex: `Database.DMLOptions.assignmentRuleHeader`

## 7-Phase Methodology

### Phase 1: Discovery

**Objective**: Understand current assignment rule state and existing automation

**Tasks**:
1. Query existing assignment rules
2. Retrieve metadata for active rules
3. Identify rule entry counts and criteria
4. Document current routing logic
5. Map assignee entities (Users, Queues)
6. Identify conflicts with other automation

**Tools & Commands**:

```bash
# Query assignment rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org [org]

# Get rule details via Tooling API
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule WHERE Id = '01Q...'" --use-tooling-api --target-org [org]

# Retrieve metadata
sf project retrieve start --metadata AssignmentRules:Lead --target-org [org]

# Parse rule structure
node scripts/lib/assignment-rule-parser.js force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
```

**Discovery Script**:
```javascript
const parser = require('./assignment-rule-parser');
const fs = require('fs');

// Parse existing rule
const xmlContent = fs.readFileSync('Lead.assignmentRules-meta.xml', 'utf8');
const parsed = parser.parseRuleMetadata(xmlContent);

console.log(`Object: ${parsed.objectType}`);
console.log(`Rules: ${parsed.assignmentRules.length}`);

parsed.assignmentRules.forEach(rule => {
  console.log(`\nRule: ${rule.name} (${rule.active ? 'Active' : 'Inactive'})`);
  console.log(`  Entries: ${rule.entries.length}`);

  rule.entries.forEach(entry => {
    console.log(`  Entry ${entry.order}: ${entry.criteriaItems.length} criteria → ${entry.assignedTo}`);
  });
});
```

**Deliverables**:
- Current rule inventory (active/inactive)
- Entry count and complexity assessment
- Assignee mapping (IDs to names)
- Existing automation audit (Flows, Triggers)

---

### Phase 2: Requirements Analysis

**Objective**: Define business requirements and routing criteria

**Tasks**:
1. Gather business requirements for routing
2. Identify routing criteria (fields and values)
3. Map teams/individuals to assignees (Queue IDs, User IDs)
4. Define evaluation order priorities
5. Identify edge cases and catch-all logic
6. Document notification requirements

**Business Questions**:
- What criteria determine owner assignment? (Geography, Industry, Priority, etc.)
- Who should be assigned? (Users, Queues, Teams)
- What is the evaluation priority? (Most specific to most general)
- Should notifications be sent? (Email templates)
- What happens if no criteria match? (Default assignee, leave unassigned)
- Are there time-based or workload-based considerations?

**Assignee Mapping Example**:
```
Business Team → Salesforce Entity
------------------------------------
Healthcare CA Sales Team → Healthcare_CA_Queue (00G1234567890ABC)
General CA Sales Team → CA_Sales_Queue (00G2345678901BCD)
Healthcare Global Team → Healthcare_Queue (00G3456789012CDE)
Default Assignment → Sales_Admin (0051234567890ABC)
```

**Criteria Identification**:
```
High Priority Criteria (Specific):
- Industry = Healthcare AND State = CA
- Industry = Technology AND State = NY
- Priority = High AND Type = Critical

Medium Priority Criteria (General):
- State = CA
- State = NY
- Industry = Healthcare

Low Priority Criteria (Catch-all):
- (No criteria) - Default assignment
```

**Deliverables**:
- Business requirements document
- Criteria-to-assignee mapping
- Evaluation order priorities
- Edge case handling plan

---

### Phase 3: Design & Validation

**Objective**: Design rule entries, detect conflicts, and validate feasibility

**Tasks**:
1. Design rule entries with criteria and assignees
2. Determine evaluation order
3. Detect overlapping criteria
4. Check for circular routing
5. Validate assignee existence and access
6. Simulate routing with sample records
7. Run pre-deployment validation

**Design Pattern**:

```javascript
const ruleDesign = {
  name: "Lead_Assignment_Healthcare_CA",
  active: false,  // Don't activate until tested
  objectType: "Lead",
  entries: [
    {
      order: 1,
      criteria: [
        { field: "Industry", operator: "equals", value: "Healthcare" },
        { field: "State", operator: "equals", value: "CA" }
      ],
      assignTo: "00G1234567890ABC",  // Healthcare CA Queue
      assignToType: "Queue",
      emailTemplate: null  // Or template ID
    },
    {
      order: 2,
      criteria: [
        { field: "State", operator: "equals", value: "CA" }
      ],
      assignTo: "00G2345678901BCD",  // General CA Queue
      assignToType: "Queue",
      emailTemplate: null
    },
    {
      order: 3,
      criteria: [],  // Catch-all
      assignTo: "00G3456789012CDE",  // Default Queue
      assignToType: "Queue",
      emailTemplate: null
    }
  ]
};
```

**Overlap Detection**:
```bash
# Detect overlapping criteria
node scripts/lib/assignment-rule-overlap-detector.js detect \
  --rule-file rule-design.json

# Output: Overlapping entries, risk scores, reordering suggestions
```

**Conflict Detection**:
```javascript
const detector = require('./assignment-rule-overlap-detector');

const conflicts = detector.detectOverlappingRules(ruleDesign.entries);

conflicts.forEach(conflict => {
  console.log(`${conflict.severity.toUpperCase()}: ${conflict.message}`);
  console.log(`  Resolution: ${conflict.resolution}`);
  console.log(`  Risk Score: ${conflict.riskScore}`);
});
```

**Assignee Validation**:
```bash
# Validate all assignees exist and are active
node scripts/lib/assignee-validator.js batch-validate \
  --assignees "00G1234567890ABC,00G2345678901BCD,00G3456789012CDE" \
  --org [org-alias]
```

**Simulation**:
```bash
# Simulate routing with sample data
node scripts/lib/criteria-evaluator.js \
  rule-design.xml \
  sample-leads.json

# sample-leads.json format:
# [
#   { "Industry": "Healthcare", "State": "CA" },
#   { "Industry": "Technology", "State": "NY" }
# ]
```

**Pre-Deployment Validation**:
```bash
# Run 20-point validation checklist
node scripts/lib/validators/assignment-rule-validator.js validate \
  --rule-file rule-design.json \
  --org [org-alias]
```

**Deliverables**:
- Rule entry design (JSON)
- Conflict detection report
- Assignee validation report
- Simulation results
- Pre-deployment validation report

---

### Phase 4: Deployment Planning

**Objective**: Plan sandbox testing, activation, and rollback strategy

**Tasks**:
1. Identify sandbox for testing
2. Plan activation sequence (deactivate old, activate new)
3. Prepare rollback plan (backup current rule)
4. Configure notifications (email templates)
5. Document deployment steps
6. Identify verification tests

**Deployment Strategies**:

**Strategy 1: Direct Replacement** (Recommended for new orgs)
1. Deploy new rule (inactive)
2. Test with sample records
3. Deactivate old rule
4. Activate new rule
5. Verify

**Strategy 2: Gradual Rollout** (Recommended for production orgs)
1. Deploy new rule to sandbox (inactive)
2. Test extensively in sandbox
3. Deploy to production (inactive)
4. Test in production with inactive rule (via API header specifying rule ID)
5. Activate when confident
6. Monitor for issues

**Strategy 3: Blue-Green** (For critical orgs)
1. Deploy new rule (inactive)
2. Run both old and new rules in parallel (via API testing)
3. Compare results
4. Switch when results match
5. Keep old rule as backup

**Rollback Plan**:
```bash
# Backup current rule before changes
sf project retrieve start --metadata AssignmentRules:Lead --target-org [org]
cp force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml \
   backups/Lead.assignmentRules-backup-$(date +%Y%m%d).xml

# Rollback command (if needed)
sf project deploy start --metadata-dir backups/ --target-org [org]
```

**Verification Tests**:
1. Create test lead with criteria matching Entry 1 → Verify assigned to correct owner
2. Create test lead with criteria matching Entry 2 → Verify assigned to correct owner
3. Create test lead with no matching criteria → Verify default assignment
4. Test API header triggering: `Sforce-Auto-Assign: TRUE`
5. Verify email notifications sent (if configured)

**Deliverables**:
- Deployment plan document
- Rollback procedure
- Backup of current rule
- Verification test cases

---

### Phase 5: Execution

**Objective**: Deploy rule to target org and activate (if required)

**Tasks**:
1. Generate XML metadata
2. Create deployment package
3. Deploy to sandbox first
4. Run verification tests in sandbox
5. Deploy to production
6. Activate rule (if needed)
7. Test API header functionality

**XML Generation**:
```bash
# Generate XML from design JSON
node scripts/lib/assignment-rule-deployer.js build-xml \
  --design rule-design.json \
  --output force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
```

**Deployment Package Structure**:
```
force-app/main/default/
└── assignmentRules/
    └── Lead.assignmentRules-meta.xml

package.xml:
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Lead</members>
        <name>AssignmentRules</name>
    </types>
    <version>62.0</version>
</Package>
```

**Sandbox Deployment**:
```bash
# Deploy to sandbox
sf project deploy start --metadata-dir force-app --target-org sandbox-alias

# Or use deployer script
node scripts/lib/assignment-rule-deployer.js deploy \
  --rule-xml force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml \
  --org sandbox-alias
```

**Activation** (Only ONE rule can be active per object):
```bash
# Activate via Metadata API
node scripts/lib/assignment-rule-deployer.js activate \
  --rule-name "Lead_Assignment_Healthcare_CA" \
  --object Lead \
  --org [org-alias]

# This will:
# 1. Query current active rule
# 2. Deactivate current active rule
# 3. Activate specified rule
```

**API Header Testing**:

SOAP API Test:
```apex
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;  // Use active rule
// OR
dmlOpts.assignmentRuleHeader.assignmentRuleId = '01Q...';  // Specific rule

Lead testLead = new Lead(
    FirstName = 'Test',
    LastName = 'User',
    Company = 'TestCo',
    Industry = 'Healthcare',
    State = 'CA'
);
testLead.setOptions(dmlOpts);
insert testLead;

// Verify owner
Lead result = [SELECT OwnerId FROM Lead WHERE Id = :testLead.Id];
System.debug('Owner: ' + result.OwnerId);  // Should match expected assignee
```

REST API Test:
```bash
curl -X POST "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{
    "FirstName": "Test",
    "LastName": "User",
    "Company": "TestCo",
    "Industry": "Healthcare",
    "State": "CA"
  }'

# Response includes Id, then query to verify owner
curl -X GET "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/{Id}?fields=OwnerId" \
  -H "Authorization: Bearer {token}"
```

**Deliverables**:
- Deployed rule (sandbox + production)
- Activation confirmation
- API header test results
- Deployment logs

---

### Phase 6: Verification

**Objective**: Verify correct routing behavior and assignee access

**Tasks**:
1. Create test records for each entry
2. Verify correct owner assignment
3. Check assignee can access records
4. Verify email notifications (if configured)
5. Monitor for errors in debug logs
6. Test edge cases and catch-all logic

**Verification Checklist**:

```bash
# 1. Verify rule appears in queries
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead' AND Name = 'Lead_Assignment_Healthcare_CA'" --target-org [org]

# 2. Create test records (via API or UI)
# Entry 1 test: Healthcare + CA
# Entry 2 test: CA only
# Entry 3 test: No matching criteria

# 3. Query assigned owners
sf data query --query "SELECT Id, FirstName, LastName, Industry, State, OwnerId FROM Lead WHERE LastName = 'Test*' ORDER BY CreatedDate DESC LIMIT 10" --target-org [org]

# 4. Verify owner IDs match expected assignees

# 5. Check assignee access
node scripts/lib/validators/assignee-access-validator.js check-access \
  --assignee-id [OwnerId] \
  --object Lead \
  --org [org-alias]
```

**Test Matrix**:

| Test Case | Industry | State | Expected Owner | Result |
|-----------|----------|-------|----------------|--------|
| Entry 1 Match | Healthcare | CA | Healthcare CA Queue | ✓ Pass |
| Entry 2 Match | Technology | CA | General CA Queue | ✓ Pass |
| Entry 3 Match | Manufacturing | NY | Default Queue | ✓ Pass |
| No Match | - | - | Default Queue | ✓ Pass |
| API Header | Healthcare | CA | Healthcare CA Queue | ✓ Pass |

**Debug Log Review**:
```bash
# Enable debug logs
sf apex log get --number 5 --target-org [org]

# Look for assignment rule execution
grep "AssignmentRule" debug.log
```

**Error Scenarios to Test**:
1. Assignee queue member has no access → Should fail gracefully
2. Circular routing (User → Queue → User) → Should detect and prevent
3. Invalid criteria field → Pre-deployment validation should catch
4. Inactive assignee → Validation should catch

**Deliverables**:
- Verification test results (pass/fail matrix)
- Owner assignment confirmations
- Access validation report
- Debug log analysis

---

### Phase 7: Documentation & Monitoring

**Objective**: Document implementation and establish ongoing monitoring

**Tasks**:
1. Update org runbook with new rule details
2. Document business logic and criteria
3. Create troubleshooting guide
4. Set up monitoring for unassigned records
5. Schedule quarterly review
6. Document known issues or exceptions

**Runbook Update**:
```bash
# Update org-specific runbook
node scripts/lib/org-context-manager.js update [org-alias] \
  --assessment assignment-rules \
  --summary "Deployed Lead assignment rule: Healthcare CA routing logic" \
  --details "Entry 1: Healthcare + CA → Healthcare CA Queue; Entry 2: CA → General CA Queue; Entry 3: Default → Default Queue"
```

**Documentation Template**:
```markdown
# Assignment Rules: Lead

## Active Rule: Lead_Assignment_Healthcare_CA

**Business Purpose**: Route healthcare industry leads in California to specialized team

**Activation Date**: 2025-12-15

**Entries**:
1. **Entry 1** (Order: 1):
   - Criteria: `Industry = Healthcare AND State = CA`
   - Assignee: Healthcare CA Queue (00G1234567890ABC)
   - Notification: None

2. **Entry 2** (Order: 2):
   - Criteria: `State = CA`
   - Assignee: General CA Queue (00G2345678901BCD)
   - Notification: None

3. **Entry 3** (Order: 3):
   - Criteria: (None - Catch-all)
   - Assignee: Default Queue (00G3456789012CDE)
   - Notification: None

**Assignee Validation**:
- Healthcare CA Queue: 5 members, all have Lead Edit access ✓
- General CA Queue: 8 members, all have Lead Edit access ✓
- Default Queue: 3 members, all have Lead Edit access ✓

**Testing**:
- Test Lead 1: John Doe, Healthcare, CA → Correctly assigned to Healthcare CA Queue ✓
- Test Lead 2: Jane Smith, Technology, CA → Correctly assigned to General CA Queue ✓
- Test Lead 3: Bob Jones, Manufacturing, NY → Correctly assigned to Default Queue ✓
- API Header: `Sforce-Auto-Assign: TRUE` working ✓

**Conflicts**: None detected (Last audit: 2025-12-15 via sfdc-automation-auditor)

**Known Issues**: None

**Rollback**: Previous rule version stored in `backups/Lead.assignmentRules-backup-20251215.xml`

**Maintenance Schedule**:
- Quarterly review: Q1 2026 (April 2026)
- Next audit: 2026-03-15

**Change History**:
- 2025-12-15: Initial deployment by [User Name]
```

**Monitoring Setup**:

Create a report for unassigned records:
```bash
# Query leads without owners (potential assignment failures)
sf data query --query "SELECT Id, Name, Industry, State, CreatedDate FROM Lead WHERE OwnerId = NULL AND CreatedDate = TODAY" --target-org [org]

# Dashboard alert: "Leads without owners in last 24 hours"
```

**Scheduled Review**:
- **Quarterly**: Review rule effectiveness, assignee changes, criteria updates
- **Annual**: Full audit with sfdc-automation-auditor for conflicts
- **Ad-hoc**: When business logic changes

**Deliverables**:
- Updated runbook entry
- Business logic documentation
- Monitoring reports/dashboards
- Maintenance schedule

---

## API Reference

### SOAP API

**Trigger Assignment Rule on Insert**:

```apex
Database.DMLOptions dmlOpts = new Database.DMLOptions();

// Use active rule
dmlOpts.assignmentRuleHeader.useDefaultRule = true;

// OR use specific rule ID
dmlOpts.assignmentRuleHeader.assignmentRuleId = '01Q1234567890ABC';

Lead lead = new Lead(
    FirstName = 'John',
    LastName = 'Doe',
    Company = 'Acme Inc',
    Industry = 'Healthcare',
    State = 'CA'
);
lead.setOptions(dmlOpts);
insert lead;
```

**Trigger on Update** (requires "Do Not Reassign Owner" = false):

```apex
Lead lead = [SELECT Id, Industry FROM Lead WHERE Id = '00Q...' LIMIT 1];
lead.Industry = 'Healthcare';

Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
lead.setOptions(dmlOpts);

update lead;
```

### REST API

**Header**: `Sforce-Auto-Assign: TRUE`

**Example**:

```bash
curl -X POST "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{
    "FirstName": "John",
    "LastName": "Doe",
    "Company": "Acme Inc",
    "Industry": "Healthcare",
    "State": "CA"
  }'
```

**Response**:
```json
{
  "id": "00Q1234567890ABC",
  "success": true,
  "errors": []
}
```

### Metadata API

**Retrieve Assignment Rules**:

```bash
# Via Salesforce CLI
sf project retrieve start --metadata AssignmentRules:Lead --target-org [org]

# Via package.xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Lead</members>
        <members>Case</members>
        <name>AssignmentRules</name>
    </types>
    <version>62.0</version>
</Package>
```

**Deploy Assignment Rules**:

```bash
sf project deploy start --metadata-dir force-app --target-org [org]

# With validation only (test deployment)
sf project deploy start --metadata-dir force-app --target-org [org] --dry-run
```

**XML Structure**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <assignmentRule>
        <fullName>Lead</fullName>
        <active>false</active>
        <ruleEntry>
            <assignedTo>user@company.com</assignedTo>
            <assignedToType>User</assignedToType>
            <criteriaItems>
                <field>Lead.Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <criteriaItems>
                <field>Lead.State</field>
                <operation>equals</operation>
                <value>CA</value>
            </criteriaItems>
            <emailTemplate>Lead_Notification</emailTemplate>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>
```

### Tooling API

**Query Assignment Rules**:

```bash
# Get assignment rules
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule" --use-tooling-api --target-org [org]

# Get specific rule
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule WHERE Id = '01Q...'" --use-tooling-api --target-org [org]
```

**Note**: Tooling API provides read-only access to AssignmentRule metadata. Use Metadata API for CRUD operations.

---

## Conflict Detection Rules

### 8 Core Conflict Patterns

#### Pattern 1: Overlapping Assignment Criteria

**Description**: Multiple assignment rule entries match the same record

**Risk**: Critical (60-100)

**Detection**:
```javascript
function detectOverlappingCriteria(entry1, entry2) {
  // Check if entry2 criteria is a superset of entry1
  const entry1Fields = entry1.criteriaItems.map(c => c.field);
  const entry2Fields = entry2.criteriaItems.map(c => c.field);

  const isSubset = entry2Fields.every(field => entry1Fields.includes(field));

  if (isSubset) {
    return {
      type: 'overlapping_criteria',
      severity: 'critical',
      entries: [entry1, entry2],
      message: `Entry ${entry2.order} criteria is more general than Entry ${entry1.order}`,
      resolution: `Ensure Entry ${entry1.order} has lower orderNumber than Entry ${entry2.order}`,
      riskScore: 80
    };
  }

  return null;
}
```

**Example**:
- Entry 1: `Industry = Healthcare AND State = CA` → Team X
- Entry 2: `State = CA` → Team Y
- **Issue**: Both match when Industry=Healthcare and State=CA
- **Fix**: Entry 1 must have lower orderNumber (e.g., 1 vs 2)

---

#### Pattern 2: Duplicate Order Numbers

**Description**: Multiple entries have the same orderNumber

**Risk**: Critical (80-100)

**Detection**:
```javascript
function detectDuplicateOrders(entries) {
  const orderCounts = {};
  entries.forEach(entry => {
    orderCounts[entry.order] = (orderCounts[entry.order] || 0) + 1;
  });

  const duplicates = Object.entries(orderCounts)
    .filter(([order, count]) => count > 1)
    .map(([order, count]) => ({
      type: 'duplicate_order',
      severity: 'critical',
      order: parseInt(order),
      count: count,
      message: `Order ${order} is used by ${count} entries`,
      resolution: 'Assign unique sequential order numbers',
      riskScore: 90
    }));

  return duplicates;
}
```

**Example**:
- Entry A: Order 1
- Entry B: Order 1
- **Issue**: Evaluation order undefined
- **Fix**: Assign unique orders (1, 2, 3...)

---

#### Pattern 3: Circular Assignment Routing

**Description**: Assignment creates a loop (User → Queue → Flow → User)

**Risk**: Critical (80-100)

**Detection**:
```javascript
function detectCircularRouting(assignmentChain) {
  const visited = new Set();
  const stack = [];

  function hasCycle(node) {
    if (stack.includes(node)) {
      return {
        type: 'circular_routing',
        severity: 'critical',
        path: [...stack, node],
        message: `Circular routing detected: ${[...stack, node].join(' → ')}`,
        resolution: 'Break cycle by changing one assignment target',
        riskScore: 95
      };
    }

    if (visited.has(node)) {
      return null;
    }

    visited.add(node);
    stack.push(node);

    const nextNodes = getNextAssignments(node);
    for (const next of nextNodes) {
      const cycle = hasCycle(next);
      if (cycle) return cycle;
    }

    stack.pop();
    return null;
  }

  return hasCycle(assignmentChain.start);
}
```

**Example**:
- Lead assigned to Queue A
- Queue A members include User X
- User X has auto-forward to Queue A
- **Issue**: Infinite loop
- **Fix**: Remove auto-forward or change queue membership

---

#### Pattern 4: Assignment Rule vs. Flow

**Description**: Flow assigns owner AND assignment rule also fires

**Risk**: High (50-80)

**Detection**:
```sql
-- Find Flows that assign owner on same object
SELECT Id, Label, ProcessType, RecordTriggerType
FROM FlowVersionView
WHERE Status = 'Active'
  AND ProcessType = 'AutolaunchedFlow'
  AND (RecordTriggerType = 'Create' OR RecordTriggerType = 'Update')
  AND DeveloperName LIKE '%Lead%'

-- Then check Flow metadata for OwnerId assignment
```

**Example**:
- Flow sets owner on Lead insert
- Assignment rule also runs
- **Issue**: Assignment rule overrides Flow (order of execution)
- **Fix**: Choose one approach or sequence properly

---

#### Pattern 5: Assignment Rule vs. Apex Trigger

**Description**: Apex trigger assigns owner before/after assignment rule

**Risk**: High (50-80)

**Detection**:
```sql
-- Find triggers on Lead/Case
SELECT Name, UsageBeforeInsert, UsageAfterInsert
FROM ApexTrigger
WHERE TableEnumOrId IN ('Lead', 'Case')

-- Parse trigger code for OwnerId assignments
```

**Example**:
- Trigger sets owner in BeforeInsert
- Assignment rule runs after
- **Issue**: Assignment rule may override trigger
- **Fix**: Remove trigger logic or disable assignment rule

---

#### Pattern 6: Assignee Lacks Object Access

**Description**: User or Queue member doesn't have Edit access to object

**Risk**: High (60-80)

**Detection**:
```bash
# Check user access
node scripts/lib/validators/assignee-access-validator.js check-user-access \
  --user-id [userId] \
  --object Lead \
  --org [org-alias]

# Check queue member access
node scripts/lib/validators/assignee-access-validator.js check-queue-access \
  --queue-id [queueId] \
  --object Lead \
  --org [org-alias]
```

**Example**:
- Lead assigned to Support Queue
- Queue member has no Lead Edit permission
- **Issue**: Member can't access assigned records
- **Fix**: Grant queue members Edit access via permission set

---

#### Pattern 7: Record Type Assignment Mismatch

**Description**: Assignment rule doesn't account for record types

**Risk**: Medium (30-50)

**Detection**:
```javascript
function checkRecordTypeHandling(rule, objectDescribe) {
  const hasRecordTypes = objectDescribe.recordTypeInfos.length > 1;

  if (!hasRecordTypes) {
    return null;  // No issue if only one record type
  }

  const criteriaIncludesRecordType = rule.entries.some(entry =>
    entry.criteriaItems.some(c => c.field === 'RecordTypeId')
  );

  if (!criteriaIncludesRecordType) {
    return {
      type: 'record_type_mismatch',
      severity: 'warning',
      message: 'Object has multiple record types but assignment rule does not filter by RecordTypeId',
      resolution: 'Add RecordTypeId to criteria or create separate rules per record type',
      riskScore: 40
    };
  }

  return null;
}
```

**Example**:
- Object has Partner Lead and Direct Lead record types
- Assignment rule doesn't check RecordTypeId
- **Issue**: Partner leads assigned to direct sales team
- **Fix**: Add RecordTypeId to criteria

---

#### Pattern 8: Field Dependency in Criteria

**Description**: Assignment criteria references field that doesn't exist

**Risk**: Critical (80-100)

**Detection**:
```javascript
function validateFieldExistence(criteria, objectDescribe) {
  const fields = objectDescribe.fields.map(f => f.name);
  const errors = [];

  criteria.forEach((criteriaItem, index) => {
    if (!fields.includes(criteriaItem.field)) {
      errors.push({
        type: 'missing_field',
        severity: 'critical',
        field: criteriaItem.field,
        criteriaIndex: index,
        message: `Field '${criteriaItem.field}' does not exist on object`,
        resolution: 'Update criteria to use existing field or create missing field',
        riskScore: 90
      });
    }
  });

  return errors;
}
```

**Example**:
- Criteria uses `Custom_Field__c`
- Field was deleted
- **Issue**: Deployment will fail
- **Fix**: Update criteria or recreate field

---

## Templates

### Template 1: Lead Assignment by Industry & Geography

**Use Case**: Route leads to regional/industry-specific teams

```json
{
  "name": "Lead_Assign_Industry_Geography",
  "active": false,
  "objectType": "Lead",
  "entries": [
    {
      "order": 1,
      "criteria": [
        { "field": "Industry", "operator": "equals", "value": "Healthcare" },
        { "field": "State", "operator": "equals", "value": "CA" }
      ],
      "assignTo": "00G1234567890ABC",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 2,
      "criteria": [
        { "field": "Industry", "operator": "equals", "value": "Technology" },
        { "field": "State", "operator": "equals", "value": "NY" }
      ],
      "assignTo": "00G2345678901BCD",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 3,
      "criteria": [
        { "field": "State", "operator": "equals", "value": "CA" }
      ],
      "assignTo": "00G3456789012CDE",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 4,
      "criteria": [],
      "assignTo": "00G4567890123DEF",
      "assignToType": "Queue",
      "emailTemplate": null
    }
  ]
}
```

**Configuration**:
1. Replace Queue IDs with your org's queue IDs
2. Adjust industries and states to match your business
3. Add more specific entries before general ones

---

### Template 2: Case Assignment by Priority

**Use Case**: Route high-priority cases to specialized support team

```json
{
  "name": "Case_Assign_Priority",
  "active": false,
  "objectType": "Case",
  "entries": [
    {
      "order": 1,
      "criteria": [
        { "field": "Priority", "operator": "equals", "value": "High" }
      ],
      "assignTo": "0051234567890ABC",
      "assignToType": "User",
      "emailTemplate": "00X1234567890ABC"
    },
    {
      "order": 2,
      "criteria": [
        { "field": "Priority", "operator": "equals", "value": "Medium" }
      ],
      "assignTo": "00G2345678901BCD",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 3,
      "criteria": [],
      "assignTo": "00G3456789012CDE",
      "assignToType": "Queue",
      "emailTemplate": null
    }
  ]
}
```

**Configuration**:
1. Replace User/Queue IDs
2. Add email template ID for high-priority notifications
3. Adjust priority values if using custom picklist values

---

### Template 3: Lead Assignment by Source & Rating

**Use Case**: Route high-quality leads from specific sources to senior reps

```json
{
  "name": "Lead_Assign_Source_Rating",
  "active": false,
  "objectType": "Lead",
  "entries": [
    {
      "order": 1,
      "criteria": [
        { "field": "LeadSource", "operator": "equals", "value": "Referral" },
        { "field": "Rating", "operator": "equals", "value": "Hot" }
      ],
      "assignTo": "0051234567890ABC",
      "assignToType": "User",
      "emailTemplate": "00X1234567890ABC"
    },
    {
      "order": 2,
      "criteria": [
        { "field": "Rating", "operator": "equals", "value": "Hot" }
      ],
      "assignTo": "00G2345678901BCD",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 3,
      "criteria": [
        { "field": "LeadSource", "operator": "equals", "value": "Referral" }
      ],
      "assignTo": "00G3456789012CDE",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 4,
      "criteria": [],
      "assignTo": "00G4567890123DEF",
      "assignToType": "Queue",
      "emailTemplate": null
    }
  ]
}
```

---

### Template 4: Case Assignment by Type & Origin

**Use Case**: Route cases based on type and origin channel

```json
{
  "name": "Case_Assign_Type_Origin",
  "active": false,
  "objectType": "Case",
  "entries": [
    {
      "order": 1,
      "criteria": [
        { "field": "Type", "operator": "equals", "value": "Technical" },
        { "field": "Origin", "operator": "equals", "value": "Web" }
      ],
      "assignTo": "00G1234567890ABC",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 2,
      "criteria": [
        { "field": "Origin", "operator": "equals", "value": "Phone" }
      ],
      "assignTo": "00G2345678901BCD",
      "assignToType": "Queue",
      "emailTemplate": null
    },
    {
      "order": 3,
      "criteria": [],
      "assignTo": "00G3456789012CDE",
      "assignToType": "Queue",
      "emailTemplate": null
    }
  ]
}
```

---

### Template 5: Round-Robin Pattern (Pseudo)

**Note**: True round-robin requires custom Apex. This template simulates rotation using time-based criteria.

**Alternative Solution**: Use AppExchange package or custom Apex with rotation tracking.

```apex
// Custom Apex approach (not Assignment Rules)
public class RoundRobinAssignment {
    private static Integer lastAssignedIndex = 0;
    private static List<Id> userIds = new List<Id>{
        '0051111111111111',
        '0052222222222222',
        '0053333333333333'
    };

    public static void assignLeads(List<Lead> leads) {
        for (Lead lead : leads) {
            lead.OwnerId = userIds[lastAssignedIndex];
            lastAssignedIndex = Math.mod(lastAssignedIndex + 1, userIds.size());
        }
    }
}
```

---

## CLI Commands

### Query Assignment Rules

```bash
# List all Lead rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org [org]

# List all Case rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Case'" --target-org [org]

# Query rule details (requires Tooling API)
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule WHERE Id = '01Q...'" --use-tooling-api --target-org [org]

# List all assignment rules (all objects)
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule ORDER BY SobjectType, Name" --use-tooling-api --target-org [org]
```

### Retrieve via Metadata API

```bash
# Retrieve Lead assignment rules
sf project retrieve start --metadata AssignmentRules:Lead --target-org [org]

# Retrieve Case assignment rules
sf project retrieve start --metadata AssignmentRules:Case --target-org [org]

# Retrieve all assignment rules
sf project retrieve start --metadata AssignmentRules --target-org [org]

# Specify output directory
sf project retrieve start --metadata AssignmentRules:Lead --output-dir ./rules --target-org [org]
```

### Deploy via Metadata API

```bash
# Deploy assignment rules
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org [org]

# Dry-run (validate only)
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org [org] --dry-run

# With specific manifest
sf project deploy start --manifest package.xml --target-org [org]
```

### Script Commands

```bash
# Parse rule XML
node scripts/lib/assignment-rule-parser.js <xml-file>

# Validate assignees
node scripts/lib/assignee-validator.js batch-validate --assignees "00G...,005..." --org [org]

# Detect conflicts
node scripts/lib/assignment-rule-overlap-detector.js detect --rule-file <json-file>

# Simulate routing
node scripts/lib/criteria-evaluator.js <xml-file> <sample-data-json>

# Validate pre-deployment
node scripts/lib/validators/assignment-rule-validator.js validate --rule-file <json-file> --org [org]

# Deploy rule
node scripts/lib/assignment-rule-deployer.js deploy --rule-xml <xml-file> --org [org]

# Activate rule
node scripts/lib/assignment-rule-deployer.js activate --rule-name "<name>" --object <Lead|Case> --org [org]
```

### Test Assignment

```bash
# Create test lead with assignment rule (API call required)
# CLI doesn't support Sforce-Auto-Assign header directly

# Use Apex script
echo "Lead lead = new Lead(FirstName='Test', LastName='User', Company='TestCo', Industry='Healthcare', State='CA');
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
lead.setOptions(dmlOpts);
insert lead;
System.debug('Owner: ' + [SELECT OwnerId FROM Lead WHERE Id = :lead.Id].OwnerId);" | sf apex run --file /dev/stdin --target-org [org]
```

---

## Limitations & Workarounds

### Platform Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max entries per rule | 3000 | Practical limit ~300 for performance |
| Max rules per object | Unlimited | Only one active at a time |
| Objects supported | Lead, Case only | Native Assignment Rules |
| Formula criteria length | 3900 characters | Per entry |
| Active rules per object | 1 | Enforced by platform |

### Workarounds

#### Account Assignment

**Problem**: Assignment Rules don't support Accounts

**Solution 1**: Territory Management (Territory2)
- Use Territory2 for geographic/account-based routing
- See Territory Management skill

**Solution 2**: Custom Apex Trigger
```apex
trigger AccountAssignment on Account (before insert, before update) {
    for (Account acc : Trigger.new) {
        if (acc.Industry == 'Healthcare' && acc.BillingState == 'CA') {
            acc.OwnerId = '00G1234567890ABC';  // Healthcare CA Queue
        } else if (acc.BillingState == 'CA') {
            acc.OwnerId = '00G2345678901BCD';  // General CA Queue
        }
    }
}
```

---

#### Contact Assignment

**Problem**: Assignment Rules don't support Contacts

**Solution**: Custom Apex Trigger with metadata-driven rules
```apex
trigger ContactAssignment on Contact (before insert, before update) {
    // Query custom metadata for assignment rules
    List<Contact_Assignment_Rule__mdt> rules = [
        SELECT Criteria_Field__c, Criteria_Value__c, Assignee_Id__c, Order__c
        FROM Contact_Assignment_Rule__mdt
        ORDER BY Order__c
    ];

    for (Contact con : Trigger.new) {
        for (Contact_Assignment_Rule__mdt rule : rules) {
            if (matches(con, rule)) {
                con.OwnerId = rule.Assignee_Id__c;
                break;  // First match wins
            }
        }
    }
}
```

---

#### Round-Robin Assignment

**Problem**: Assignment Rules can't do true round-robin

**Solution 1**: AppExchange Package
- Search for "Round Robin" on AppExchange
- Example: "Salesforce Round Robin Lead Assignment"

**Solution 2**: Custom Apex with Rotation Tracking
```apex
public class RoundRobinAssignment {
    // Store last assigned index in custom setting
    public static void assignLeads(List<Lead> leads) {
        Round_Robin_State__c state = Round_Robin_State__c.getInstance();
        Integer lastIndex = (Integer)state.Last_Assigned_Index__c;

        List<Id> userIds = getUsersForRoundRobin();

        for (Lead lead : leads) {
            lastIndex = Math.mod(lastIndex + 1, userIds.size());
            lead.OwnerId = userIds[lastIndex];
        }

        state.Last_Assigned_Index__c = lastIndex;
        update state;
    }
}
```

---

#### Load Balancing Assignment

**Problem**: Assignment Rules can't consider current workload

**Solution**: Custom Apex with Workload Query
```apex
public class LoadBalancedAssignment {
    public static void assignLeads(List<Lead> leads) {
        // Query current open lead counts per user
        List<AggregateResult> workloads = [
            SELECT OwnerId, COUNT(Id) openLeads
            FROM Lead
            WHERE Status != 'Converted'
            GROUP BY OwnerId
        ];

        Map<Id, Integer> userWorkloads = new Map<Id, Integer>();
        for (AggregateResult ar : workloads) {
            userWorkloads.put((Id)ar.get('OwnerId'), (Integer)ar.get('openLeads'));
        }

        for (Lead lead : leads) {
            // Assign to user with least workload
            Id leastLoadedUser = findLeastLoadedUser(userWorkloads);
            lead.OwnerId = leastLoadedUser;
            userWorkloads.put(leastLoadedUser, userWorkloads.get(leastLoadedUser) + 1);
        }
    }
}
```

---

### Known Issues

#### Issue 1: Assignment Rules Run AFTER Triggers

**Problem**: Order of execution means triggers execute before assignment rules

**Workaround**:
- Use assignment rules OR triggers, not both
- If using triggers, disable assignment rules
- If using assignment rules, remove owner assignment from triggers

**Order of Execution**:
1. Before triggers
2. System validation rules
3. Custom validation rules
4. **Assignment Rules** ← Happens here
5. After triggers
6. Workflow rules

---

#### Issue 2: "Do Not Reassign Owner" Flag Doesn't Work on Updates

**Problem**: In some API versions, assignment rules don't respect this flag on updates

**Workaround**:
- Only use assignment rules on insert
- Use workflows or flows for update-based reassignment

---

#### Issue 3: Formula Criteria Limited to 3900 Characters

**Problem**: Complex formulas exceed character limit

**Workaround**:
- Split into multiple entries
- Use simpler criteria
- Create a custom field with formula result and use in criteria

---

#### Issue 4: Email Notifications May Not Fire

**Problem**: Email template missing or assignee doesn't have email

**Workaround**:
- Validate email template exists before deployment
- Test notifications in sandbox
- Use alternative notification method (Flow email alert)

---

## Integration Points

### With Other Automation

#### Flows

**Integration**: Use "Submit for Approval" action to trigger assignment rules

```xml
<!-- Flow action -->
<actionCalls>
    <name>Trigger_Assignment_Rule</name>
    <label>Trigger Assignment Rule</label>
    <actionName>submit</actionName>
    <actionType>submit</actionType>
    <inputParameters>
        <name>objectId</name>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </inputParameters>
</actionCalls>
```

**Note**: Standard "Submit for Approval" doesn't trigger assignment rules. Use custom Apex invocable action:

```apex
@InvocableMethod(label='Trigger Assignment Rule' description='Triggers assignment rule on record')
public static void triggerAssignmentRule(List<Id> recordIds) {
    List<Lead> leads = [SELECT Id FROM Lead WHERE Id IN :recordIds];

    Database.DMLOptions dmlOpts = new Database.DMLOptions();
    dmlOpts.assignmentRuleHeader.useDefaultRule = true;

    for (Lead lead : leads) {
        lead.setOptions(dmlOpts);
    }

    update leads;
}
```

---

#### Process Builder

**Limitation**: Process Builder cannot directly trigger assignment rules

**Workaround**: Call Apex invocable method (above)

---

#### Apex Triggers

**Control Assignment Rules from Trigger**:

```apex
trigger LeadTrigger on Lead (before insert) {
    Database.DMLOptions dmlOpts = new Database.DMLOptions();
    dmlOpts.assignmentRuleHeader.useDefaultRule = true;

    for (Lead lead : Trigger.new) {
        lead.setOptions(dmlOpts);
    }
}
```

---

#### Workflow Rules

**Order**: Workflow rules run AFTER assignment rules

**Integration**: Workflows can send notifications after assignment, but cannot trigger assignment rules

---

### With Territory Management

**Difference**:
- **Territory Assignment Rules** (Account) - Assign accounts to territories
- **Owner Assignment Rules** (Lead/Case) - Assign owner to leads/cases

**Compatibility**: Both can coexist but target different objects

**API Trigger**: Both use `Sforce-Auto-Assign: TRUE` header

---

## Troubleshooting

### Common Issues

#### 1. Rule Not Firing

**Symptoms**: Record created but owner not assigned

**Diagnosis**:
```bash
# Check if rule is active
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org [org]

# Check if API header used (for API-created records)
# Look in debug logs for "AssignmentRule" keyword
sf apex log get --number 5 --target-org [org] | grep "AssignmentRule"
```

**Common Causes**:
- Rule is inactive
- API header not set (`Sforce-Auto-Assign: TRUE`)
- Record created via unsupported method (Bulk API without header)
- Object type doesn't support assignment rules (not Lead/Case)

**Fix**:
- Activate rule via Metadata API
- Add API header to API calls
- Use supported creation method

---

#### 2. Wrong Assignee

**Symptoms**: Record assigned to incorrect owner

**Diagnosis**:
```bash
# Check rule evaluation order
node scripts/lib/assignment-rule-parser.js Lead.assignmentRules-meta.xml

# Simulate with sample data
node scripts/lib/criteria-evaluator.js Lead.assignmentRules-meta.xml sample-leads.json
```

**Common Causes**:
- Overlapping criteria with wrong order
- Criteria not matching as expected (case sensitivity, data type)
- Catch-all entry before specific entries

**Fix**:
- Reorder entries (specific before general)
- Verify criteria logic
- Check field data types and values

---

#### 3. Assignment Fails

**Symptoms**: Error on record creation

**Diagnosis**:
```bash
# Validate assignee active and accessible
node scripts/lib/validators/assignee-access-validator.js check-user-access \
  --user-id [userId] \
  --object Lead \
  --org [org-alias]

# Check assignee access
sf data query --query "SELECT Id, Name, IsActive FROM User WHERE Id = '[userId]'" --target-org [org]
```

**Common Causes**:
- Assignee (User) is inactive
- Assignee doesn't have Edit access to object
- Queue doesn't have object enabled
- Circular routing detected

**Fix**:
- Activate user
- Grant Edit access via permission set
- Add object to queue settings
- Break circular routing loop

---

#### 4. Circular Routing

**Symptoms**: Assignment loops or records unassigned

**Diagnosis**:
```bash
# Detect circular routing
node scripts/lib/assignment-rule-overlap-detector.js detect \
  --rule-file rule-design.json \
  --check-circular
```

**Common Causes**:
- User auto-forwards to queue, queue members include that user
- Queue A → User X → Queue B → User X

**Fix**:
- Remove auto-forward rules
- Change queue membership
- Assign to different entity

---

#### 5. Performance Issues

**Symptoms**: Slow record creation, timeouts

**Diagnosis**:
```bash
# Check entry count
node scripts/lib/assignment-rule-parser.js Lead.assignmentRules-meta.xml | grep "Entries:"

# Review criteria complexity
node scripts/lib/assignment-rule-overlap-detector.js analyze \
  --rule-file rule-design.json \
  --complexity
```

**Common Causes**:
- Too many entries (>300)
- Complex formula criteria
- Cross-object field references

**Fix**:
- Reduce entry count
- Simplify criteria
- Use indexed fields
- Split into multiple simpler rules

---

### Debug Commands

```bash
# Check active rule
sf data query --query "SELECT Id, Name FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true" --target-org [org]

# Verify assignee exists and is active
sf data query --query "SELECT Id, Name, IsActive FROM User WHERE Id = '005...'" --target-org [org]

# Check queue configuration
sf data query --query "SELECT Id, DeveloperName, Type FROM Group WHERE Type = 'Queue' AND Id = '00G...'" --target-org [org]

# Query queue members
sf data query --query "SELECT UserOrGroupId FROM GroupMember WHERE GroupId = '00G...'" --target-org [org]

# Check lead owner
sf data query --query "SELECT Id, OwnerId, Owner.Name FROM Lead WHERE Id = '00Q...'" --target-org [org]

# Review debug logs
sf apex log get --number 5 --target-org [org]
```

---

## Best Practices

### 1. Order Matters

**Rule**: Place specific rules before general catch-alls

**Example**:
```
✅ CORRECT:
1. Industry = Healthcare AND State = CA
2. State = CA
3. (Catch-all)

❌ WRONG:
1. State = CA
2. Industry = Healthcare AND State = CA  ← Will never match
3. (Catch-all)
```

---

### 2. Test in Sandbox

**Always test before production deployment:**

1. Deploy to sandbox (inactive)
2. Test with sample records
3. Verify correct routing
4. Check assignee access
5. Test API header functionality
6. Deploy to production
7. Monitor for issues

---

### 3. One Active Rule

**Platform Constraint**: Only one rule can be active per object

**Best Practice**:
- Keep backup rule inactive
- Document why multiple rules exist
- Use descriptive names (e.g., `Lead_Assignment_v2_2025`)

---

### 4. Document Business Logic

**Maintain clear documentation:**

- Why each entry exists
- Business owner for each entry
- Last review date
- Known exceptions

**Example**:
```
Entry 1: Healthcare CA
- Purpose: Route healthcare leads in CA to specialized team
- Owner: Sales VP (Jane Doe)
- Last Reviewed: 2025-Q4
- Exception: Referral leads go to senior reps (handled by Entry 0)
```

---

### 5. Monitor Unassigned Records

**Create catch-all entry**:
- Last entry with no criteria
- Assigns to review queue
- Prevents unassigned records

**Dashboard Alert**:
```sql
SELECT Id, Name, Industry, State, CreatedDate
FROM Lead
WHERE OwnerId = NULL
  AND CreatedDate = TODAY
```

---

### 6. Version Control

**Track rule changes in Git:**

```bash
# Before changes
git add force-app/main/default/assignmentRules/
git commit -m "feat: Update Lead assignment rule - add Healthcare CA routing"

# Tag major versions
git tag -a lead-assignment-v2.0 -m "Lead Assignment v2.0 - Geographic routing"
```

---

### 7. Conflict Audit

**Run automation auditor before major changes:**

```bash
# Comprehensive automation audit
/audit-automation [org-alias]

# Check for assignment rule conflicts specifically
node scripts/lib/assignment-rule-overlap-detector.js detect \
  --rule-file rule-design.json \
  --check-all
```

---

### 8. Access Validation

**Verify assignee can own records:**

```bash
# Before deployment
node scripts/lib/validators/assignee-access-validator.js audit-access-levels \
  --rule-file rule-design.json \
  --org [org-alias]
```

**Requirements**:
- User: Active, Edit access to object
- Queue: Object enabled, members have Edit access
- Role: Role exists, holder has Edit access

---

### 9. Email Templates

**Include notifications for visibility:**

- High-priority assignments
- Assignments requiring immediate action
- Escalations

**Best Practice**:
- Test email template exists before deployment
- Use consistent template naming
- Include relevant record details in email

---

### 10. Rollback Plan

**Keep previous rule version for quick revert:**

```bash
# Backup before deployment
cp force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml \
   backups/Lead.assignmentRules-backup-$(date +%Y%m%d).xml

# Rollback command
sf project deploy start --metadata-dir backups/ --target-org [org]
```

**Rollback Criteria**:
- Assignment failures increase significantly
- Wrong routing detected
- Performance degradation
- Business requirements change

---

## Summary

The Salesforce Assignment Rules Framework provides a comprehensive methodology for managing Lead and Case assignment automation. By following the 7-phase approach (Discovery → Requirements → Design → Deployment Planning → Execution → Verification → Documentation), you ensure robust, conflict-free assignment rules that correctly route records to the right owners.

**Key Takeaways**:
- Only ONE active rule per object
- First match wins - order matters
- Test in sandbox first
- Validate assignee access
- Document business logic
- Monitor unassigned records
- Plan for rollback

**Tools Available**:
- `assignment-rule-parser.js` - Parse rule XML
- `assignee-validator.js` - Validate assignees
- `assignment-rule-overlap-detector.js` - Detect conflicts
- `criteria-evaluator.js` - Simulate routing
- `assignment-rule-deployer.js` - Deploy rules
- `validators/assignment-rule-validator.js` - Pre-deployment validation
- `validators/assignee-access-validator.js` - Access checks

**For Support**:
- Consult `sfdc-assignment-rules-manager` agent for orchestration
- Delegate to `sfdc-automation-auditor` for conflict detection
- Use `sfdc-deployment-manager` for production deployments
- Reference conflict detection rules in automation-audit-framework

---

**Version**: 1.0.0
**Last Updated**: 2025-12-15
**Maintained By**: RevPal Engineering
