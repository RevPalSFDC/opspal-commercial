# Salesforce Assignment Rules - User Guide

**Version**: 1.0.0
**Last Updated**: 2025-12-15
**Applies To**: Lead and Case objects (native Assignment Rules API)

---

## Table of Contents

1. [Overview & When to Use](#1-overview--when-to-use)
2. [Quick Start Guide](#2-quick-start-guide)
3. [7-Phase Methodology](#3-7-phase-methodology)
4. [API Reference](#4-api-reference)
5. [Conflict Resolution Patterns](#5-conflict-resolution-patterns)
6. [Template Library](#6-template-library)
7. [CLI Command Reference](#7-cli-command-reference)
8. [Troubleshooting](#8-troubleshooting)
9. [Limitations & Workarounds](#9-limitations--workarounds)
10. [Best Practices](#10-best-practices)

---

## 1. Overview & When to Use

### What are Assignment Rules?

**Assignment Rules** are Salesforce's native automation for automatically assigning record owners when records are created or updated. They are available for **Lead** and **Case** objects only.

**Key Concepts**:
- **Assignment Rule** - Container with one or more rule entries
- **Rule Entry** - Specific criteria + assignee + order number
- **Evaluation Order** - Rules execute in order (first match wins)
- **Assignee Types** - User, Queue, Role (Lead only), Territory (deprecated)
- **Active Status** - Only one active rule per object at a time

### When to Use Assignment Rules

✅ **Use Assignment Rules for**:
- Lead routing by geography, industry, company size
- Case assignment by priority, product, customer tier
- Round-robin simulation via time-based criteria (limited)
- Email notifications on assignment

❌ **Don't Use Assignment Rules for**:
- Account assignment (use Territory Management instead)
- Contact assignment (use custom Apex solution)
- True round-robin assignment (use Appexchange or custom Apex)
- Load balancing (use custom solution with workload tracking)
- Complex business logic (use Flows or Apex)

### Assignment Rules vs Other Tools

| Feature | Assignment Rules | Flow | Apex Trigger | Territory Management |
|---------|------------------|------|--------------|---------------------|
| **Objects** | Lead, Case | All | All | Account (Territory2) |
| **Complexity** | Medium | High | Very High | Medium |
| **Maintenance** | Low | Medium | High | Low |
| **Testing** | Manual | Automated | Automated | Manual |
| **Performance** | Fast | Medium | Fast | Medium |
| **Declarative** | Yes | Yes | No | Yes |

**Recommendation**: Use Assignment Rules for simple owner assignment on Lead/Case. For complex logic, use Flow. For other objects, use custom solutions.

---

## 2. Quick Start Guide

### Prerequisites

1. **Salesforce Org Access** - System Administrator or equivalent
2. **CLI Tools** - Salesforce CLI (`sf`) installed
3. **Org Alias** - Configured org connection: `sf org login web --alias my-org`
4. **Metadata API Access** - Enabled in org (standard in all editions)

### 5-Minute Setup

**Step 1: Query Existing Rules**

```bash
# Check for existing active Lead rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org my-org

# Check for existing active Case rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Case'" --target-org my-org
```

**Step 2: Create Your First Rule**

Use the `sfdc-assignment-rules-manager` agent:

```
Create a Lead assignment rule:
- Industry = Healthcare AND State = CA → Assign to Queue "Healthcare CA Team"
- Industry = Healthcare → Assign to Queue "Healthcare General"
```

The agent will:
1. Validate queue existence and access
2. Generate XML metadata
3. Run pre-deployment validation (30 checks)
4. Deploy to org
5. Verify routing behavior

**Step 3: Test the Rule**

```bash
# Create a test lead (without rule)
sf data create record --sobject Lead --values "FirstName='Test' LastName='User' Company='TestCo' Industry='Healthcare' State='CA'" --target-org my-org

# Note: CLI doesn't trigger assignment rules by default
# Use API call or Apex for proper testing (see API Reference section)
```

### Common First Tasks

**Task A: Replace Manual Lead Assignment**
```
Goal: Auto-assign leads by state
Agent: sfdc-assignment-rules-manager
Prompt: "Create Lead assignment rule by state: CA → Queue X, NY → Queue Y, default → Queue Z"
Result: Rule created with 3 entries, tested, and deployed
```

**Task B: Priority-Based Case Routing**
```
Goal: Route high-priority cases to senior support
Agent: sfdc-assignment-rules-manager
Prompt: "Create Case assignment rule: Priority='High' → User (Senior Support), else → Queue (General Support)"
Result: Rule created with 2 entries, email notification configured
```

**Task C: Detect Conflicts with Existing Automation**
```
Goal: Ensure no conflicts before deploying
Agent: sfdc-automation-auditor
Prompt: "Audit automation including assignment rules for conflicts"
Result: Report with conflict analysis (Pattern 9-16) and recommendations
```

---

## 3. 7-Phase Methodology

The `sfdc-assignment-rules-manager` agent follows a comprehensive 7-phase workflow for all Assignment Rules operations.

### Phase 1: Discovery

**Goal**: Understand current state and identify conflicts

**Activities**:
- Query existing Assignment Rules via SOQL
- Retrieve metadata via Metadata API
- Identify active rules and entry counts
- Document current routing logic
- Check for conflicting automation (Flows, Triggers)

**Commands**:
```bash
# Query Assignment Rules
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule" --target-org my-org

# Retrieve metadata
sf project retrieve start --metadata "AssignmentRules:Lead" --target-org my-org
```

**Agent Invocation**:
```
Discover existing Lead assignment rules and document current routing logic
```

**Output**:
- List of existing rules with active status
- Current entry counts per rule
- Routing logic documentation
- Conflict detection report

---

### Phase 2: Requirements Analysis

**Goal**: Gather and document business requirements

**Activities**:
- Business requirements gathering
- Routing criteria identification (fields, operators, values)
- Assignee mapping (team names → Queue/User IDs)
- Conflict detection with existing rules
- Risk assessment

**Questions to Answer**:
- What fields determine routing? (Industry, State, Priority, etc.)
- What are the assignee teams? (names → Salesforce IDs)
- What is the evaluation order? (most specific first)
- Are there email notifications needed?
- What is the fallback assignee? (default rule)

**Agent Invocation**:
```
Analyze requirements for Lead assignment by Industry and State:
- Healthcare + CA → Team X
- Healthcare + NY → Team Y
- Healthcare (any state) → Team Z (default)
```

**Output**:
- Requirements document
- Field mapping (business terms → API names)
- Assignee mapping (team names → IDs)
- Evaluation order recommendation

---

### Phase 3: Design & Validation

**Goal**: Design rule structure and validate before deployment

**Activities**:
- Rule entry design (criteria + assignee + order)
- Overlap detection and reordering
- Simulation with sample records
- Pre-deployment validation (30 checks)
- Access permission verification

**Design Principles**:
1. **Order Matters** - Most specific criteria first (Industry + State before Industry alone)
2. **Catch-All Entry** - Always include a default/fallback entry
3. **Bulkification** - Rules handle 1-200 records efficiently
4. **Testing** - Simulate with sample records before deployment

**Agent Invocation**:
```
Design and validate Lead assignment rule for Healthcare:
- Entry 1 (Order 1): Industry=Healthcare AND State=CA → Queue 00G1111
- Entry 2 (Order 2): Industry=Healthcare AND State=NY → Queue 00G2222
- Entry 3 (Order 3): Industry=Healthcare → Queue 00G3333 (default)
```

**Validation Checks** (30 total):
- Assignee existence and active status
- Field existence on object
- Operator compatibility with field type
- Picklist value validity
- Overlapping criteria detection
- Order conflicts (duplicate orderNumbers)
- Circular routing detection
- Email template existence (if configured)

**Output**:
- Rule design document
- Validation report (passed/failed checks)
- Conflict resolution recommendations
- Risk score (0-100)

---

### Phase 4: Deployment Planning

**Goal**: Plan deployment strategy with rollback capability

**Activities**:
- Sandbox testing strategy
- Activation plan (deactivate old, activate new)
- Rollback preparation (backup current rule)
- Notification configuration
- Deployment schedule

**Deployment Strategies**:

| Strategy | Risk | Downtime | Use Case |
|----------|------|----------|----------|
| **Direct Activation** | Medium | None | Low-traffic, non-critical |
| **Staged Activation** | Low | None | High-traffic, gradual rollout |
| **Blue-Green** | Very Low | None | Critical, instant rollback |

**Agent Invocation**:
```
Plan deployment for new Lead assignment rule to production:
- Backup existing rule
- Deploy to sandbox first
- Test with sample leads
- Deploy to production with staged activation
```

**Output**:
- Deployment plan document
- Backup XML of current rule
- Rollback procedures
- Test plan with sample data

---

### Phase 5: Execution

**Goal**: Deploy Assignment Rule with validation

**Activities**:
- XML generation and validation
- Metadata API deployment
- Activation (if required)
- Post-deployment verification
- API header testing

**Deployment Commands**:
```bash
# Deploy via CLI
sf project deploy start --metadata-dir ./assignment-rules --target-org my-org

# Activate via agent
```

**Agent Invocation**:
```
Deploy and activate Lead assignment rule "Healthcare_Routing_2025" to production org my-org
```

**Deployment Process**:
1. Generate XML payload from rule definition
2. Create Metadata API package with package.xml
3. Run Gate 0.5 pre-deployment validation
4. Deploy to sandbox (test first)
5. Verify in sandbox
6. Deploy to production (if sandbox passed)
7. Activate rule (deactivates others)
8. Post-deployment verification

**Output**:
- Deployment success/failure status
- Deployment ID for tracking
- Activation confirmation
- Post-deployment test results

---

### Phase 6: Verification

**Goal**: Confirm rule works as expected

**Activities**:
- Test assignment with sample records
- Verify correct routing behavior
- Check assignee access to records
- Monitor for errors
- Generate verification report

**Testing Methods**:

**Method 1: API Call with Header** (Recommended)
```bash
curl -X POST "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{"FirstName": "Test", "LastName": "User", "Company": "TestCo", "Industry": "Healthcare", "State": "CA"}'
```

**Method 2: Apex Execution**
```apex
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
Lead testLead = new Lead(FirstName='Test', LastName='User', Company='TestCo', Industry='Healthcare', State='CA');
testLead.setOptions(dmlOpts);
insert testLead;

// Verify owner
Lead result = [SELECT OwnerId, Owner.Name FROM Lead WHERE Id = :testLead.Id];
System.debug('Owner: ' + result.Owner.Name);  // Should be Healthcare CA Queue
```

**Agent Invocation**:
```
Verify Lead assignment rule with test records:
- Test 1: Industry=Healthcare, State=CA (expect Queue X)
- Test 2: Industry=Healthcare, State=NY (expect Queue Y)
- Test 3: Industry=Healthcare, State=TX (expect Queue Z default)
```

**Verification Checklist**:
- [ ] Rule appears in AssignmentRule SOQL query
- [ ] Active flag correct (if applicable)
- [ ] Test record routes to correct assignee
- [ ] API header triggers rule correctly
- [ ] No errors in debug logs
- [ ] Assignee can access assigned record
- [ ] Email notification sent (if configured)
- [ ] No conflicts with other automation

**Output**:
- Verification report (passed/failed tests)
- Debug log analysis
- Performance metrics
- Recommendations for optimization

---

### Phase 7: Documentation & Monitoring

**Goal**: Maintain documentation and monitor performance

**Activities**:
- Update org runbook with new rule
- Document business logic and criteria
- Set up monitoring (if records unassigned)
- Schedule periodic review
- Track performance metrics

**Documentation Requirements**:
- Rule name and purpose
- Entry details (criteria, assignee, order)
- Business logic explanation
- Test results
- Known issues or exceptions
- Maintenance schedule

**Agent Invocation**:
```
Document new Lead assignment rule "Healthcare_Routing_2025" in org runbook for my-org
```

**Monitoring Recommendations**:
- **Daily**: Check for unassigned records (OwnerId = default)
- **Weekly**: Review assignment distribution (are queues balanced?)
- **Monthly**: Analyze rule performance (execution time, error rate)
- **Quarterly**: Review business logic (still aligned with needs?)

**Output**:
- Updated org runbook
- Monitoring dashboard setup (optional)
- Scheduled review reminders
- Performance baseline metrics

---

## 4. API Reference

### 4.1 SOAP API

**Trigger Assignment Rules via Apex**:

```apex
// Method 1: Use Default Active Rule
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
Lead myLead = new Lead(FirstName='John', LastName='Doe', Company='Acme Inc');
myLead.setOptions(dmlOpts);
insert myLead;

// Method 2: Use Specific Rule by ID
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.assignmentRuleId = '01Q000000000ABC';
Lead myLead = new Lead(FirstName='Jane', LastName='Smith', Company='Widget Co');
myLead.setOptions(dmlOpts);
insert myLead;

// Method 3: Bulk Operations with Assignment
List<Lead> leads = new List<Lead>{
    new Lead(FirstName='Alice', LastName='Brown', Company='Tech Corp'),
    new Lead(FirstName='Bob', LastName='Green', Company='Startup Inc')
};

Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;

for (Lead l : leads) {
    l.setOptions(dmlOpts);
}

insert leads;
```

**Query Assignment Rule ID**:
```apex
// Get active Lead rule
AssignmentRule ar = [SELECT Id FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true LIMIT 1];
System.debug('Active Rule ID: ' + ar.Id);
```

---

### 4.2 REST API

**Trigger Assignment Rules via REST**:

```bash
# Method 1: Use Sforce-Auto-Assign Header
curl -X POST "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{
    "FirstName": "John",
    "LastName": "Doe",
    "Company": "Acme Inc",
    "Industry": "Healthcare",
    "State": "CA"
  }'

# Method 2: Use Specific Assignment Rule ID
curl -X POST "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: 01Q000000000ABC" \
  -d '{
    "FirstName": "Jane",
    "LastName": "Smith",
    "Company": "Widget Co"
  }'
```

**Response**:
```json
{
  "id": "00Q000000000XYZ",
  "success": true,
  "errors": []
}
```

**Query Assigned Owner**:
```bash
curl "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/00Q000000000XYZ?fields=OwnerId,Owner.Name" \
  -H "Authorization: Bearer <access_token>"
```

---

### 4.3 Metadata API

**Retrieve Assignment Rules**:

```bash
# Retrieve all Lead assignment rules
sf project retrieve start --metadata "AssignmentRules:Lead" --target-org my-org

# Retrieve all Case assignment rules
sf project retrieve start --metadata "AssignmentRules:Case" --target-org my-org
```

**Deploy Assignment Rules**:

```bash
# Deploy from directory
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org my-org

# Validate only (dry-run)
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org my-org --dry-run
```

**XML Structure**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <fullName>Healthcare_Routing_2025</fullName>
        <active>false</active>
        <ruleEntry>
            <order>1</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <criteriaItems>
                <field>State</field>
                <operation>equals</operation>
                <value>CA</value>
            </criteriaItems>
            <assignedTo>00G000000000ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
            <template>00X000000000XYZ</template> <!-- Optional: Email template -->
        </ruleEntry>
        <ruleEntry>
            <order>2</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <assignedTo>00G000000000DEF</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>
```

---

### 4.4 Tooling API

**Query Assignment Rules**:

```bash
# Query all assignment rules
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule" --use-tooling-api --target-org my-org

# Query active Lead rule
sf data query --query "SELECT Id, Name FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true" --use-tooling-api --target-org my-org
```

**Note**: The Tooling API only returns metadata about rules, not the full entry criteria. Use Metadata API for complete rule retrieval.

---

## 5. Conflict Resolution Patterns

Assignment Rules can conflict with other automation. The `sfdc-automation-auditor` agent detects **8 conflict patterns** (9-16) specific to Assignment Rules.

### Pattern 9: Overlapping Assignment Criteria

**Description**: Multiple assignment rule entries match the same record

**Risk**: Critical (60-100)

**Example**:
```
Entry 1 (Order 1): Industry=Healthcare AND State=CA → Queue X
Entry 2 (Order 2): State=CA → Queue Y

Problem: Lead with Industry=Healthcare and State=CA matches BOTH entries
Result: Entry 1 wins (first match), but Entry 2 is redundant
```

**Detection**:
```bash
node scripts/lib/assignment-rule-overlap-detector.js <org-alias> <rule-xml>
```

**Resolution**:
1. **Reorder**: Place most specific criteria first (Entry 1 before Entry 2) ✅
2. **Merge**: Combine entries if they should assign to same queue
3. **Refine**: Add additional criteria to make entries mutually exclusive

**Agent Invocation**:
```
Detect overlapping criteria in Lead assignment rule "Healthcare_Routing_2025"
```

---

### Pattern 10: Assignment Rule vs Flow

**Description**: Flow assigns owner AND assignment rule also fires

**Risk**: High (50-80)

**Example**:
```
Flow: On Lead create, if Industry=Healthcare → Set OwnerId = UserX
Assignment Rule: If Industry=Healthcare → Assign to Queue Y

Problem: Both fire, Flow sets owner first, then Assignment Rule overrides
Result: Lead ends up in Queue Y (Assignment Rule wins in order of execution)
```

**Order of Execution**:
1. Before Triggers
2. Validation Rules
3. After Triggers
4. **Assignment Rules** ← Runs here
5. Auto-Response Rules
6. **Workflow Rules / Flow (Record-Triggered)** ← Can conflict

**Resolution**:
1. **Choose One**: Use Flow OR Assignment Rule, not both
2. **Sequence**: If both needed, use Flow to set field, Assignment Rule to assign based on that field
3. **Disable**: Turn off one automation

**Agent Invocation**:
```
Audit automation for conflicts between Lead assignment rules and Flows
```

---

### Pattern 11: Assignment Rule vs Apex Trigger

**Description**: Apex trigger assigns owner before/after assignment rule

**Risk**: High (50-80)

**Example**:
```
Trigger (BeforeInsert): Set lead.OwnerId = UserX if Industry=Healthcare
Assignment Rule: If Industry=Healthcare → Assign to Queue Y

Problem: Trigger sets owner in BeforeInsert, Assignment Rule runs after insert
Result: Depends on trigger logic - may override Assignment Rule
```

**Order of Execution**:
1. **Before Triggers** ← Can set OwnerId here
2. Validation Rules
3. **After Triggers** ← Can set OwnerId here
4. **Assignment Rules** ← Runs here (may override trigger)
5. Workflow Rules

**Resolution**:
1. **Remove Trigger Logic**: Let Assignment Rule handle it
2. **Disable Rule**: Use trigger instead for complex logic
3. **Coordinate**: Trigger sets field, Assignment Rule uses that field for routing

**Agent Invocation**:
```
Check for conflicts between Lead assignment rules and Apex triggers
```

---

### Pattern 12: Circular Assignment Routing

**Description**: Assignment creates loop (User → Queue → Flow → User)

**Risk**: Critical (80-100)

**Example**:
```
Assignment Rule: Lead assigned to Queue X
Queue X has auto-forward to User Y
User Y has auto-forward to Queue X

Problem: Infinite loop of reassignments
Result: Salesforce may block after several iterations
```

**Detection**:
```javascript
// Circular routing detector builds assignment graph
const graph = buildAssignmentGraph(assignmentRules, flows, queues);
const cycles = detectCycles(graph);
```

**Resolution**:
1. **Break Cycle**: Remove one auto-forward in the loop
2. **Simplify**: Assign directly to final owner
3. **Monitor**: Set up alerts for excessive reassignments

**Agent Invocation**:
```
Detect circular routing in Lead assignment configuration
```

---

### Pattern 13: Territory Rule vs Assignment Rule

**Description**: Territory assignment conflicts with owner assignment

**Risk**: Medium (30-50)

**Example**:
```
Territory Rule (Account): Assign Account owner based on State
Custom Assignment Rule (Account): Assign Account owner based on Industry

Problem: Salesforce doesn't support Assignment Rules for Accounts (native)
Confusion: User creates custom solution that conflicts with Territory
```

**Clarification**:
- **Assignment Rules** (native): Lead and Case only
- **Territory Rules**: Account only (Territory2 model)
- **Custom Solutions**: Any object, but require Apex

**Resolution**:
1. **Use Correct Tool**: Territory2 for Accounts, Assignment Rules for Lead/Case
2. **Document**: Clearly document which objects use which assignment method
3. **Don't Mix**: Avoid custom assignment solutions on objects with native support

**Agent Invocation**:
```
Verify Assignment Rules are only used for Lead/Case, not Account
```

---

### Pattern 14: Queue Membership Access

**Description**: User in queue doesn't have access to object

**Risk**: High (60-80)

**Example**:
```
Assignment Rule: Lead assigned to "Support Queue"
Queue Members: User X, User Y
Problem: User X has no "Edit" permission on Lead object

Result: Lead assigned to queue, but User X can't work on it
```

**Detection**:
```bash
# Get queue members
sf data query --query "SELECT UserOrGroupId FROM GroupMember WHERE GroupId = '00G...'" --target-org my-org

# Check object access per user (requires profile/permission set query)
node scripts/lib/validators/assignee-access-validator.js <org-alias> <rule-xml>
```

**Resolution**:
1. **Grant Access**: Give queue members "Edit" permission on object via permission set
2. **Change Queue**: Use different queue with proper access
3. **Audit**: Regular audits of queue membership and permissions

**Agent Invocation**:
```
Validate queue members have access to Lead object for all queues in assignment rule
```

---

### Pattern 15: Record Type Assignment Mismatch

**Description**: Assignment rule doesn't account for record types

**Risk**: Medium (30-50)

**Example**:
```
Lead Record Types: "Partner Lead", "Direct Lead"
Assignment Rule: Industry=Healthcare → Partner Queue

Problem: "Direct Lead" records with Healthcare industry go to Partner Queue (wrong)
Result: Incorrect routing based on record type
```

**Resolution**:
1. **Add RecordTypeId**: Include RecordTypeId in assignment criteria
2. **Separate Rules**: Create separate rules per record type
3. **Profile Assignment**: Use Profile-based record type visibility to control

**Agent Invocation**:
```
Check if Lead assignment rule accounts for record types
```

---

### Pattern 16: Field Dependency in Criteria

**Description**: Assignment criteria references field that doesn't exist

**Risk**: Critical (80-100)

**Example**:
```
Assignment Rule Criteria: Custom_Field__c = 'Value'
Problem: Custom_Field__c was deleted or doesn't exist in target org

Result: Deployment fails with "Field not found" error
```

**Detection**:
```javascript
// Validate field existence
const objectDescribe = await sf.sobject('Lead').describe();
const fields = objectDescribe.fields.map(f => f.name);

criteriaFields.forEach(field => {
  if (!fields.includes(field)) {
    errors.push({ type: 'missing_field', field });
  }
});
```

**Resolution**:
1. **Fix Criteria**: Update criteria to use existing field
2. **Create Field**: Create missing field before deploying rule
3. **Pre-Deployment Validation**: Always run field validation before deploy

**Agent Invocation**:
```
Validate all fields in Lead assignment rule exist in target org my-org
```

---

### Conflict Detection Commands

```bash
# Detect all conflicts
node scripts/lib/assignment-rule-overlap-detector.js <org-alias> <rule-xml>

# Run comprehensive automation audit (includes Assignment Rules)
/audit-automation
```

**Agent Invocation**:
```
Run comprehensive automation audit including Assignment Rules conflict detection for org my-org
```

---

## 6. Template Library

Pre-built templates for common Assignment Rule patterns.

### Template 1: Lead Assignment by Industry & Geography

**Use Case**: Route leads to regional teams based on industry and location

**Template**:
```xml
<assignmentRule>
    <fullName>Lead_Assign_Industry_Geography</fullName>
    <active>false</active>
    <ruleEntry>
        <order>1</order>
        <criteriaItems>
            <field>Industry</field>
            <operation>equals</operation>
            <value>Healthcare</value>
        </criteriaItems>
        <criteriaItems>
            <field>State</field>
            <operation>equals</operation>
            <value>CA</value>
        </criteriaItems>
        <assignedTo>00G1234567890ABC</assignedTo> <!-- Healthcare CA Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>2</order>
        <criteriaItems>
            <field>Industry</field>
            <operation>equals</operation>
            <value>Healthcare</value>
        </criteriaItems>
        <criteriaItems>
            <field>State</field>
            <operation>equals</operation>
            <value>NY</value>
        </criteriaItems>
        <assignedTo>00G2234567890ABC</assignedTo> <!-- Healthcare NY Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>3</order>
        <criteriaItems>
            <field>Industry</field>
            <operation>equals</operation>
            <value>Healthcare</value>
        </criteriaItems>
        <assignedTo>00G3234567890ABC</assignedTo> <!-- Healthcare Default Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
</assignmentRule>
```

**Agent Invocation**:
```
Apply Lead assignment template for Industry + Geography routing:
- Healthcare + CA → Queue X (00G...)
- Healthcare + NY → Queue Y (00G...)
- Healthcare (default) → Queue Z (00G...)
```

---

### Template 2: Case Assignment by Priority

**Use Case**: Route high-priority cases to senior support

**Template**:
```xml
<assignmentRule>
    <fullName>Case_Assign_Priority</fullName>
    <active>false</active>
    <ruleEntry>
        <order>1</order>
        <criteriaItems>
            <field>Priority</field>
            <operation>equals</operation>
            <value>High</value>
        </criteriaItems>
        <assignedTo>0051234567890ABC</assignedTo> <!-- Senior Support User -->
        <assignedToType>User</assignedToType>
        <template>00X1234567890ABC</template> <!-- High Priority Email Template -->
    </ruleEntry>
    <ruleEntry>
        <order>2</order>
        <criteriaItems>
            <field>Priority</field>
            <operation>equals</operation>
            <value>Medium</value>
        </criteriaItems>
        <assignedTo>00G1234567890ABC</assignedTo> <!-- General Support Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>3</order>
        <criteriaItems>
            <field>Priority</field>
            <operation>equals</operation>
            <value>Low</value>
        </criteriaItems>
        <assignedTo>00G2234567890ABC</assignedTo> <!-- Low Priority Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
</assignmentRule>
```

**Agent Invocation**:
```
Apply Case assignment template for Priority routing:
- High → User (Senior Support) with email notification
- Medium → Queue (General Support)
- Low → Queue (Low Priority)
```

---

### Template 3: Lead Assignment by Company Size

**Use Case**: Route enterprise leads to account executives, SMB to inside sales

**Template**:
```xml
<assignmentRule>
    <fullName>Lead_Assign_Company_Size</fullName>
    <active>false</active>
    <ruleEntry>
        <order>1</order>
        <criteriaItems>
            <field>NumberOfEmployees</field>
            <operation>greaterOrEqual</operation>
            <value>1000</value>
        </criteriaItems>
        <assignedTo>00G1234567890ABC</assignedTo> <!-- Enterprise Sales Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>2</order>
        <criteriaItems>
            <field>NumberOfEmployees</field>
            <operation>greaterOrEqual</operation>
            <value>100</value>
        </criteriaItems>
        <criteriaItems>
            <field>NumberOfEmployees</field>
            <operation>lessThan</operation>
            <value>1000</value>
        </criteriaItems>
        <assignedTo>00G2234567890ABC</assignedTo> <!-- Mid-Market Sales Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>3</order>
        <criteriaItems>
            <field>NumberOfEmployees</field>
            <operation>lessThan</operation>
            <value>100</value>
        </criteriaItems>
        <assignedTo>00G3234567890ABC</assignedTo> <!-- SMB Sales Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
</assignmentRule>
```

**Agent Invocation**:
```
Apply Lead assignment template for Company Size routing:
- 1000+ employees → Enterprise Sales Queue
- 100-999 employees → Mid-Market Sales Queue
- <100 employees → SMB Sales Queue
```

---

### Template 4: Case Assignment by Product & Customer Tier

**Use Case**: Route cases based on product and customer tier

**Template**:
```xml
<assignmentRule>
    <fullName>Case_Assign_Product_Tier</fullName>
    <active>false</active>
    <ruleEntry>
        <order>1</order>
        <criteriaItems>
            <field>Product__c</field>
            <operation>equals</operation>
            <value>Premium Product</value>
        </criteriaItems>
        <criteriaItems>
            <field>Account.Customer_Tier__c</field>
            <operation>equals</operation>
            <value>Tier 1</value>
        </criteriaItems>
        <assignedTo>00G1234567890ABC</assignedTo> <!-- Premium Tier 1 Queue -->
        <assignedToType>Queue</assignedToType>
        <template>00X1234567890ABC</template> <!-- Premium Customer Email -->
    </ruleEntry>
    <ruleEntry>
        <order>2</order>
        <criteriaItems>
            <field>Product__c</field>
            <operation>equals</operation>
            <value>Premium Product</value>
        </criteriaItems>
        <assignedTo>00G2234567890ABC</assignedTo> <!-- Premium General Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>3</order>
        <criteriaItems>
            <field>Product__c</field>
            <operation>equals</operation>
            <value>Standard Product</value>
        </criteriaItems>
        <assignedTo>00G3234567890ABC</assignedTo> <!-- Standard Support Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
</assignmentRule>
```

**Note**: Relationship field references (`Account.Customer_Tier__c`) are supported in Assignment Rules.

**Agent Invocation**:
```
Apply Case assignment template for Product + Customer Tier routing:
- Premium Product + Tier 1 → Premium Tier 1 Queue with email
- Premium Product (any tier) → Premium General Queue
- Standard Product → Standard Support Queue
```

---

### Template 5: Lead Assignment by Lead Source & Rating

**Use Case**: Route qualified leads to sales, unqualified to marketing

**Template**:
```xml
<assignmentRule>
    <fullName>Lead_Assign_Source_Rating</fullName>
    <active>false</active>
    <ruleEntry>
        <order>1</order>
        <criteriaItems>
            <field>LeadSource</field>
            <operation>equals</operation>
            <value>Referral</value>
        </criteriaItems>
        <criteriaItems>
            <field>Rating</field>
            <operation>equals</operation>
            <value>Hot</value>
        </criteriaItems>
        <assignedTo>0051234567890ABC</assignedTo> <!-- Top Sales Rep -->
        <assignedToType>User</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>2</order>
        <criteriaItems>
            <field>Rating</field>
            <operation>equals</operation>
            <value>Hot</value>
        </criteriaItems>
        <assignedTo>00G1234567890ABC</assignedTo> <!-- Sales Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>3</order>
        <criteriaItems>
            <field>Rating</field>
            <operation>equals</operation>
            <value>Cold</value>
        </criteriaItems>
        <assignedTo>00G2234567890ABC</assignedTo> <!-- Marketing Nurture Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>4</order>
        <assignedTo>00G3234567890ABC</assignedTo> <!-- Default Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
</assignmentRule>
```

**Agent Invocation**:
```
Apply Lead assignment template for Source + Rating routing:
- Referral + Hot → Top Sales Rep (direct assignment)
- Hot (any source) → Sales Queue
- Cold → Marketing Nurture Queue
- Default → General Queue
```

---

### Template 6: Case Assignment by Time & Escalation

**Use Case**: Escalate cases to manager after business hours

**Template**:
```xml
<assignmentRule>
    <fullName>Case_Assign_Time_Escalation</fullName>
    <active>false</active>
    <ruleEntry>
        <order>1</order>
        <criteriaItems>
            <field>Priority</field>
            <operation>equals</operation>
            <value>High</value>
        </criteriaItems>
        <criteriaItems>
            <field>CreatedDate</field>
            <operation>greaterThan</operation>
            <value>TODAY</value>
        </criteriaItems>
        <formulaCriteria>HOUR(CreatedDate) &lt; 8 || HOUR(CreatedDate) &gt; 17</formulaCriteria>
        <assignedTo>0051234567890ABC</assignedTo> <!-- On-Call Manager -->
        <assignedToType>User</assignedToType>
        <template>00X1234567890ABC</template> <!-- After Hours Email -->
    </ruleEntry>
    <ruleEntry>
        <order>2</order>
        <criteriaItems>
            <field>Priority</field>
            <operation>equals</operation>
            <value>High</value>
        </criteriaItems>
        <assignedTo>00G1234567890ABC</assignedTo> <!-- High Priority Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
    <ruleEntry>
        <order>3</order>
        <assignedTo>00G2234567890ABC</assignedTo> <!-- General Support Queue -->
        <assignedToType>Queue</assignedToType>
    </ruleEntry>
</assignmentRule>
```

**Note**: Formula criteria supports date/time functions for time-based routing.

**Agent Invocation**:
```
Apply Case assignment template for Time + Escalation routing:
- High Priority + After Hours (before 8am or after 5pm) → On-Call Manager with email
- High Priority (business hours) → High Priority Queue
- Default → General Support Queue
```

---

### Using Templates

**Step 1: Choose Template**
```
List available Assignment Rule templates
```

**Step 2: Customize**
```
Apply template [name] with parameters:
- Queue IDs: [list]
- User IDs: [list]
- Field values: [list]
```

**Step 3: Deploy**
```
Deploy customized Assignment Rule from template [name] to org [alias]
```

---

## 7. CLI Command Reference

### Query Assignment Rules

```bash
# List all Lead assignment rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org my-org

# List all Case assignment rules
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Case'" --target-org my-org

# Get active rule
sf data query --query "SELECT Id, Name FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true" --use-tooling-api --target-org my-org
```

### Retrieve Assignment Rules

```bash
# Retrieve Lead rules
sf project retrieve start --metadata "AssignmentRules:Lead" --target-org my-org

# Retrieve Case rules
sf project retrieve start --metadata "AssignmentRules:Case" --target-org my-org
```

### Deploy Assignment Rules

```bash
# Deploy from directory
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org my-org

# Validate only (dry-run)
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org my-org --dry-run

# Check deployment status
sf project deploy report --job-id <deployment-id> --target-org my-org
```

### Validation & Testing

```bash
# Run pre-deployment validation
node scripts/lib/validators/assignment-rule-validator.js my-org ./assignment-rule.xml

# Detect overlapping rules
node scripts/lib/assignment-rule-overlap-detector.js my-org ./assignment-rule.xml

# Validate assignee access
node scripts/lib/validators/assignee-access-validator.js my-org ./assignment-rule.xml

# Simulate rule evaluation
node scripts/lib/criteria-evaluator.js my-org ./assignment-rule.xml ./sample-leads.json
```

### Debug & Troubleshooting

```bash
# Check queue members
sf data query --query "SELECT UserOrGroupId, User.Name FROM GroupMember WHERE GroupId = '00G...'" --target-org my-org

# Verify user active status
sf data query --query "SELECT Id, Name, IsActive FROM User WHERE Id = '005...'" --target-org my-org

# Check queue type
sf data query --query "SELECT Id, DeveloperName, Type FROM Group WHERE Id = '00G...'" --target-org my-org
```

---

## 8. Troubleshooting

### Issue 1: Rule Not Firing

**Symptoms**:
- Record created but not assigned via rule
- Owner remains default user
- No error messages

**Possible Causes**:
1. **Rule not active** - Check `Active = true` in metadata
2. **API header not set** - `Sforce-Auto-Assign` header missing
3. **Criteria don't match** - Record doesn't meet criteria
4. **Wrong object** - Rule applies to Lead, but testing on Case

**Resolution Steps**:
```bash
# Step 1: Check active status
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org my-org

# Step 2: Test with API header
curl -X POST "https://instance.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer <token>" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{"FirstName": "Test", "LastName": "User", "Company": "TestCo"}'

# Step 3: Check criteria match
node scripts/lib/criteria-evaluator.js my-org ./assignment-rule.xml ./test-data.json

# Step 4: Enable debug logs and check execution
sf apex log tail --target-org my-org
```

---

### Issue 2: Wrong Assignee

**Symptoms**:
- Record assigned but to wrong user/queue
- Expected Queue X, got Queue Y

**Possible Causes**:
1. **Order conflicts** - Duplicate orderNumbers causing unexpected evaluation
2. **Overlapping criteria** - Multiple rules match, first wins
3. **Circular routing** - Assignment loops through multiple queues

**Resolution Steps**:
```bash
# Step 1: Check for overlapping criteria
node scripts/lib/assignment-rule-overlap-detector.js my-org ./assignment-rule.xml

# Step 2: Verify evaluation order
# Parse XML and check orderNumbers are sequential without duplicates
grep "<order>" force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml

# Step 3: Check for circular routing
node scripts/lib/assignment-rule-overlap-detector.js my-org ./assignment-rule.xml --check-circular

# Step 4: Test with sample data
node scripts/lib/criteria-evaluator.js my-org ./assignment-rule.xml ./sample-data.json
```

---

### Issue 3: Deployment Failure

**Symptoms**:
- Deployment fails with error message
- Common errors: "Field not found", "Assignee not found", "Multiple active rules"

**Possible Causes**:
1. **Missing field** - Criteria references non-existent field
2. **Invalid assignee** - User/Queue doesn't exist or inactive
3. **Activation conflict** - Multiple active rules for same object
4. **Entry limit exceeded** - More than 3000 entries (practical ~300)

**Resolution Steps**:
```bash
# Step 1: Run pre-deployment validation
node scripts/lib/validators/assignment-rule-validator.js my-org ./assignment-rule.xml

# Step 2: Check specific errors

# Field existence
sf sobject describe Lead --target-org my-org | grep -i "CustomField"

# Assignee existence
sf data query --query "SELECT Id, Name, IsActive FROM User WHERE Id = '005...'" --target-org my-org
sf data query --query "SELECT Id, DeveloperName FROM Group WHERE Id = '00G...'" --target-org my-org

# Active rule conflict
sf data query --query "SELECT Id, Name FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true" --use-tooling-api --target-org my-org

# Entry count
grep -c "<ruleEntry>" force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml

# Step 3: Fix and redeploy
# Edit XML to fix errors, then:
sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org my-org
```

---

### Issue 4: Assignee Can't Access Record

**Symptoms**:
- Record assigned to queue/user
- Assignee can't view or edit record
- "Insufficient Privileges" error

**Possible Causes**:
1. **Missing object permissions** - Assignee lacks "Edit" on object
2. **Record type access** - Assignee can't access record type
3. **FLS restrictions** - Field-level security blocks access

**Resolution Steps**:
```bash
# Step 1: Check object permissions
node scripts/lib/validators/assignee-access-validator.js my-org ./assignment-rule.xml

# Step 2: Check profile/permission sets manually
sf data query --query "SELECT PermissionsCreate, PermissionsRead, PermissionsEdit FROM ObjectPermissions WHERE ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '005...') AND SobjectType = 'Lead'" --target-org my-org

# Step 3: Grant permissions
# Create permission set with Lead Edit access and assign to user

# Step 4: Verify access
# Test as user in Salesforce UI or via Apex
System.runAs(user) {
    Lead testLead = [SELECT Id FROM Lead LIMIT 1];
    System.debug('Can access: ' + testLead != null);
}
```

---

### Issue 5: Performance Issues

**Symptoms**:
- Slow record creation
- Timeouts on bulk operations
- Governor limit errors

**Possible Causes**:
1. **Too many entries** - More than 300 entries slows evaluation
2. **Complex formulas** - Formula criteria with nested logic
3. **Inefficient criteria** - Non-indexed fields in criteria
4. **Circular routing** - Multiple reassignments per record

**Resolution Steps**:
```bash
# Step 1: Check entry count
grep -c "<ruleEntry>" force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml

# Step 2: Simplify criteria
# Review XML for complex formulaCriteria elements
# Prefer simple criteriaItems over formulaCriteria

# Step 3: Use indexed fields
# Prefer standard fields (Industry, State) over custom fields
# Add custom field indexes if needed (requires Salesforce support)

# Step 4: Monitor performance
# Enable debug logs and check execution time
sf apex log tail --target-org my-org | grep "ASSIGNMENT_RULE"
```

---

### Common Error Messages

| Error | Cause | Resolution |
|-------|-------|------------|
| "Field: Industry does not exist" | Field doesn't exist on object | Create field or fix criteria |
| "Assignee 005... not found" | User/Queue deleted or doesn't exist | Update assignee or create user/queue |
| "Only one active rule allowed" | Multiple active rules | Deactivate old rule before activating new |
| "Formula too long (>3900 chars)" | Formula criteria exceeds limit | Simplify formula or split into multiple entries |
| "Invalid operation for field type" | Operator not compatible with field | Fix operator (e.g., can't use 'contains' on number) |
| "Insufficient Privileges" | Assignee lacks object access | Grant permissions via permission set |

---

## 9. Limitations & Workarounds

### Platform Limits

| Limit | Value | Workaround |
|-------|-------|------------|
| Max entries per rule | 3000 (practical ~300) | Simplify criteria, consolidate entries |
| Active rules per object | 1 | Use order/criteria to handle multiple scenarios |
| Objects supported | Lead, Case only | Use Territory2 (Account), custom Apex (others) |
| Formula criteria length | 3900 characters | Split into multiple entries |
| Relationship depth | 5 levels | Use formulas or Flow for deeper relationships |

### Workarounds for Common Needs

#### Account Assignment

**Need**: Auto-assign Account owners

**Limitation**: Assignment Rules don't support Account

**Workarounds**:
1. **Territory Management** (Recommended) - Use Territory2 model for geographic/account-based assignment
2. **Custom Apex** - Create trigger with metadata-driven rules
3. **Flow** - Use Record-Triggered Flow to assign owner on create/update

**Agent Invocation**:
```
Set up Territory2 management for Account assignment by State
```

---

#### Contact Assignment

**Need**: Auto-assign Contact owners

**Limitation**: Assignment Rules don't support Contact

**Workarounds**:
1. **Custom Apex** - Trigger with metadata-driven rules
2. **Flow** - Record-Triggered Flow on Contact create/update
3. **Inherit from Account** - Use Flow to copy Account owner to Contact

**Agent Invocation**:
```
Create Flow to assign Contact owner based on Account territory
```

---

#### Round-Robin Assignment

**Need**: Distribute leads evenly across team members

**Limitation**: Assignment Rules don't support true round-robin

**Workarounds**:
1. **Appexchange Package** (Recommended) - "Lead Assignment and Round Robin" app
2. **Custom Apex** - Counter object tracking last-assigned user
3. **Pseudo Round-Robin** - Time-based criteria (hour of day → different users)

**Example Pseudo Round-Robin**:
```xml
<ruleEntry>
    <order>1</order>
    <formulaCriteria>HOUR(CreatedDate) &lt; 8</formulaCriteria>
    <assignedTo>005111...</assignedTo> <!-- User 1 -->
</ruleEntry>
<ruleEntry>
    <order>2</order>
    <formulaCriteria>HOUR(CreatedDate) &gt;= 8 &amp;&amp; HOUR(CreatedDate) &lt; 16</formulaCriteria>
    <assignedTo>005222...</assignedTo> <!-- User 2 -->
</ruleEntry>
<ruleEntry>
    <order>3</order>
    <formulaCriteria>HOUR(CreatedDate) &gt;= 16</formulaCriteria>
    <assignedTo>005333...</assignedTo> <!-- User 3 -->
</ruleEntry>
```

---

#### Load Balancing

**Need**: Assign to user with least workload

**Limitation**: Assignment Rules can't query current workload

**Workarounds**:
1. **Custom Apex** (Recommended) - Query open records per user, assign to min
2. **Scheduled Job** - Periodic rebalancing of assignments
3. **External Service** - Webhook to external service that returns optimal user

**Example Custom Apex**:
```apex
public static Id getLowestWorkloadUser(List<Id> userIds) {
    Map<Id, Integer> workloadMap = new Map<Id, Integer>();
    for (Id userId : userIds) {
        Integer count = [SELECT COUNT() FROM Lead WHERE OwnerId = :userId AND Status != 'Closed'];
        workloadMap.put(userId, count);
    }

    Id lowestUser = null;
    Integer lowestCount = 999999;
    for (Id userId : workloadMap.keySet()) {
        if (workloadMap.get(userId) < lowestCount) {
            lowestUser = userId;
            lowestCount = workloadMap.get(userId);
        }
    }
    return lowestUser;
}
```

---

#### Multi-Object Assignment

**Need**: Assign based on related object criteria (e.g., Lead based on Campaign)

**Limitation**: Assignment Rules support limited relationship traversal

**Workarounds**:
1. **Formula Fields** (Recommended) - Create formula on Lead that references Campaign, use in criteria
2. **Flow** - Use Flow to copy Campaign field to Lead, then Assignment Rule uses Lead field
3. **Custom Apex** - Trigger that queries related object and assigns

**Example Formula Field**:
```
Campaign.Type  // Create formula field on Lead
```

Then use in Assignment Rule:
```xml
<criteriaItems>
    <field>Campaign_Type__c</field> <!-- Formula field -->
    <operation>equals</operation>
    <value>Partner</value>
</criteriaItems>
```

---

#### Time-Based Assignment

**Need**: Assign differently based on day of week or time of day

**Limitation**: Assignment Rules don't support date/time functions well

**Workarounds**:
1. **Formula Criteria** (Recommended) - Use `HOUR()`, `DAY()`, `WEEKDAY()` functions
2. **Flow + Field Update** - Flow sets "Business Hours" field, Assignment Rule uses it
3. **Custom Apex** - Trigger with time logic

**Example Formula Criteria**:
```xml
<formulaCriteria>
    (WEEKDAY(CreatedDate) &gt;= 2 &amp;&amp; WEEKDAY(CreatedDate) &lt;= 6) &amp;&amp;
    (HOUR(CreatedDate) &gt;= 9 &amp;&amp; HOUR(CreatedDate) &lt; 17)
</formulaCriteria>
```

---

### Assignment Rules vs Custom Solutions

| Scenario | Best Approach | Rationale |
|----------|---------------|-----------|
| Simple Lead routing by geography | Assignment Rules | Native, fast, easy maintenance |
| Account assignment | Territory2 Management | Native support for Accounts |
| Complex multi-step logic | Flow | Better for workflows with decisions |
| Performance-critical (>10k records/day) | Apex Trigger | Fastest execution |
| Round-robin assignment | Custom Apex + Counter | Only reliable round-robin method |
| Load balancing | Custom Apex with query | Requires real-time workload data |
| Multi-object dependencies | Flow + Assignment Rules | Flows handle complexity, rules handle assignment |

---

## 10. Best Practices

### Design Principles

1. **Order Matters** - Place most specific criteria first
   ```xml
   <!-- ✅ CORRECT -->
   <ruleEntry>
       <order>1</order>
       <!-- Industry=Healthcare AND State=CA -->
   </ruleEntry>
   <ruleEntry>
       <order>2</order>
       <!-- Industry=Healthcare -->
   </ruleEntry>

   <!-- ❌ WRONG - Order 2 will never match -->
   <ruleEntry>
       <order>1</order>
       <!-- Industry=Healthcare -->
   </ruleEntry>
   <ruleEntry>
       <order>2</order>
       <!-- Industry=Healthcare AND State=CA -->
   </ruleEntry>
   ```

2. **Always Include Catch-All** - Last entry with no criteria as default
   ```xml
   <ruleEntry>
       <order>999</order>
       <assignedTo>00G9999...</assignedTo> <!-- Default Queue -->
   </ruleEntry>
   ```

3. **Test in Sandbox First** - Never deploy directly to production
   ```bash
   # Deploy to sandbox
   sf project deploy start --metadata-dir ./assignment-rules --target-org my-sandbox

   # Test with sample data
   # ...

   # Deploy to production after validation
   sf project deploy start --metadata-dir ./assignment-rules --target-org my-prod
   ```

4. **One Active Rule Per Object** - Deactivate old before activating new
   ```bash
   # Check active rules
   sf data query --query "SELECT Id, Name FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true" --use-tooling-api --target-org my-org

   # Deploy new rule with active=false first
   # Then activate via UI or API
   ```

5. **Document Business Logic** - Maintain rule documentation
   ```markdown
   # Lead Assignment Rule: Healthcare_Routing_2025

   ## Business Logic
   - Entry 1: Healthcare + CA → Healthcare CA Team
   - Entry 2: Healthcare + NY → Healthcare NY Team
   - Entry 3: Healthcare (other states) → Healthcare General Team

   ## Assignee Mapping
   - Healthcare CA Team: Queue 00G1111 (5 members)
   - Healthcare NY Team: Queue 00G2222 (3 members)
   - Healthcare General Team: Queue 00G3333 (10 members)

   ## Last Modified: 2025-01-15
   ## Last Reviewed: 2025-01-15
   ```

6. **Monitor Unassigned Records** - Create catch-all entry to track missed assignments
   ```xml
   <ruleEntry>
       <order>999</order>
       <assignedTo>00G9999...</assignedTo> <!-- "Review Queue" -->
       <template>00X9999...</template> <!-- Alert email -->
   </ruleEntry>
   ```

7. **Version Control** - Track rule changes in Git
   ```bash
   git add force-app/main/default/assignmentRules/
   git commit -m "feat: Add Healthcare_Routing_2025 Lead assignment rule"
   git push
   ```

8. **Regular Audits** - Run automation auditor quarterly
   ```
   Run comprehensive automation audit including Assignment Rules for org my-org
   ```

9. **Access Validation** - Ensure assignees can own records
   ```bash
   node scripts/lib/validators/assignee-access-validator.js my-org ./assignment-rule.xml
   ```

10. **Email Notifications** - Include email templates for visibility
    ```xml
    <ruleEntry>
        <order>1</order>
        <!-- ... criteria ... -->
        <assignedTo>00G1111...</assignedTo>
        <template>00X1111...</template> <!-- Email template -->
    </ruleEntry>
    ```

### Performance Optimization

1. **Limit Entries** - Keep under 300 entries for best performance
2. **Use Indexed Fields** - Prefer standard fields (Industry, State) over custom
3. **Avoid Complex Formulas** - Keep formula criteria under 1000 characters
4. **Batch Testing** - Test with 200 records to simulate bulk operations
5. **Monitor Execution Time** - Check debug logs for slow evaluation

### Security & Governance

1. **Least Privilege** - Grant only necessary permissions to assignees
2. **Regular Reviews** - Quarterly review of rule logic and effectiveness
3. **Change Management** - Document all rule changes in runbook
4. **Audit Trail** - Use Field History Tracking on OwnerId field
5. **Rollback Plan** - Always backup current rule before changes

### Common Mistakes to Avoid

❌ **Wrong Order** - General criteria before specific
❌ **No Catch-All** - Leads go unassigned if no criteria match
❌ **Multiple Active** - More than one active rule causes conflict
❌ **Missing Access** - Assignee can't access object
❌ **No Testing** - Deploy to production without sandbox validation
❌ **Hard-Coded IDs** - Use DeveloperName instead of IDs in documentation
❌ **Overlapping Criteria** - Multiple entries match same record
❌ **Inactive Assignees** - Assign to inactive users or empty queues
❌ **Field Dependencies** - Criteria field doesn't exist in target org
❌ **No Documentation** - Future users don't understand business logic

---

## Additional Resources

### Documentation
- **Skill Reference**: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/SKILL.md`
- **Conflict Detection Rules**: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/conflict-detection-rules.md`
- **CLI Command Reference**: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/cli-command-reference.md`
- **Template Library**: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/template-library.json`

### Scripts
- **Parser**: `scripts/lib/assignment-rule-parser.js`
- **Validator**: `scripts/lib/validators/assignment-rule-validator.js`
- **Overlap Detector**: `scripts/lib/assignment-rule-overlap-detector.js`
- **Deployer**: `scripts/lib/assignment-rule-deployer.js`

### Agents
- **sfdc-assignment-rules-manager** - Master orchestrator for all Assignment Rules operations
- **sfdc-automation-auditor** - Comprehensive automation audit including Assignment Rules
- **sfdc-deployment-manager** - Enhanced deployment with 30-point validation
- **sfdc-sales-operations** - Simple lead routing (delegates complex to assignment-rules-manager)

### Support
- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Reflection System: Use `/reflect` to submit feedback

---

**Version**: 1.0.0
**Last Updated**: 2025-12-15
**Maintained By**: RevPal Engineering
