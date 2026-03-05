# Runbook 2: Designing Flows for Common Project Scenarios

**Version**: 1.0.0
**Last Updated**: 2025-11-12
**Audience**: Expert-level agents designing Flows for specific business scenarios

---

## Overview

This runbook provides guidance on designing Flows for typical project categories handled by agents. Rather than just understanding XML structure, this runbook maps **business requirements to concrete Flow designs** with proven patterns, element selection strategies, and implementation considerations.

### Project Categories Covered

1. **Process Automation Projects** - Streamline business processes
2. **Data Quality & Enrichment Projects** - Clean and enhance data
3. **Migration & Consolidation Projects** - Convert legacy automation
4. **Assessment & Remediation Projects** - Implement audit recommendations

### When to Use This Runbook

- Starting a new automation project
- Converting business requirements into Flow architecture
- Selecting appropriate Flow patterns for use cases
- Understanding which Flow elements fit specific scenarios

---

## Category A: Process Automation Projects

**Goal**: Streamline business processes by automating record handling, routing, validation, and notifications.

### Common Process Automation Patterns

| Pattern | Flow Type | Key Elements | Typical Trigger |
|---------|-----------|--------------|-----------------|
| **Lead Routing** | Record-Triggered | Decision, Assignment | After-save on Lead create |
| **Opportunity Validation** | Record-Triggered | Decision, Validation Rule | Before-save or After-save on Opportunity update |
| **Case Escalation** | Record-Triggered + Scheduled Path | Decision, Assignment, Record Update | After-save on Case + Time-based |
| **Approval Routing** | Record-Triggered | Decision, Subflow (Submit for Approval) | After-save when conditions met |

---

### Pattern 1: Lead Routing and Assignment

**Business Requirement**: Automatically assign Leads to appropriate owners based on attributes (geography, product interest, lead source).

#### Flow Design Strategy

**Flow Type**: Record-Triggered (After-Save)
- **Object**: Lead
- **Trigger**: CreateAndUpdate
- **Timing**: RecordAfterSave (allows access to Lead Id after creation)

**Element Structure**:
1. **Decision**: Check lead attributes (State, Industry, Lead Source)
2. **Assignment** (per outcome): Set OwnerId to appropriate user/queue
3. **Record Create** (optional): Create Task for follow-up
4. **Email Alert** (optional): Notify new owner

#### Implementation Considerations

**Entry Conditions**: Add entry criteria to prevent unnecessary executions
```xml
<start>
    <filterLogic>and</filterLogic>
    <filters>
        <field>Status</field>
        <operator>EqualTo</operator>
        <value>
            <stringValue>Open - Not Contacted</stringValue>
        </value>
    </filters>
    <!-- Only run for new, uncontacted leads -->
</start>
```

**Decision Logic**: Use priority-based routing (most specific first)
```xml
<decisions>
    <name>Route_Lead</name>
    <rules>
        <name>Enterprise_West_Coast</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.AnnualRevenue</leftValueReference>
            <operator>GreaterThanOrEqualTo</operator>
            <rightValue><numberValue>1000000</numberValue></rightValue>
        </conditions>
        <conditions>
            <leftValueReference>$Record.State</leftValueReference>
            <operator>In</operator>
            <rightValue><stringValue>CA,OR,WA</stringValue></rightValue>
        </conditions>
        <connector><targetReference>Assign_Enterprise_West</targetReference></connector>
    </rules>
    <!-- Additional rules for other segments -->
    <defaultConnector><targetReference>Assign_Default_Queue</targetReference></defaultConnector>
</decisions>
```

**Best Practice**: Use **queues** instead of individual users for scalability
```xml
<assignments>
    <name>Assign_Enterprise_West</name>
    <assignmentItems>
        <assignToReference>$Record.OwnerId</assignToReference>
        <operator>Assign</operator>
        <value>
            <elementReference>Get_Enterprise_West_Queue.Id</elementReference>
        </value>
    </assignmentItems>
</assignments>
```

**Template Available**: `lead-assignment` template in template library

---

### Pattern 2: Opportunity Stage Validation

**Business Requirement**: Enforce data quality gates when Opportunities progress through stages (e.g., require Close Date and Amount before moving to "Proposal" stage).

#### Flow Design Strategy

**Flow Type**: Record-Triggered (Before-Save or After-Save)
- **Before-Save**: Can prevent record save with validation error
- **After-Save**: Can create task/alert but record already saved

**Element Structure** (Before-Save):
1. **Decision**: Check if Stage changed AND required fields missing
2. **Assignment** (validation failure): Set error message variable
3. **Error Element**: Display validation error to user (stops save)

**Element Structure** (After-Save):
1. **Decision**: Check if Stage changed AND required fields missing
2. **Record Create**: Create Task for rep to fix data
3. **Email Alert**: Notify manager of incomplete opportunity

#### Implementation Example (Before-Save)

```xml
<start>
    <object>Opportunity</object>
    <recordTriggerType>Update</recordTriggerType>
    <triggerType>RecordBeforeSave</triggerType>
    <filterLogic>and</filterLogic>
    <filters>
        <field>StageName</field>
        <operator>IsChanged</operator>
        <value><booleanValue>true</booleanValue></value>
    </filters>
</start>

<decisions>
    <name>Check_Stage_Requirements</name>
    <rules>
        <name>Proposal_Stage_Missing_Data</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.StageName</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue><stringValue>Proposal</stringValue></rightValue>
        </conditions>
        <conditions>
            <leftValueReference>$Record.Amount</leftValueReference>
            <operator>IsNull</operator>
            <rightValue><booleanValue>true</booleanValue></rightValue>
        </conditions>
        <connector><targetReference>Validation_Error</targetReference></connector>
    </rules>
</decisions>

<recordUpdates>
    <name>Validation_Error</name>
    <inputAssignments>
        <field>StageName</field>
        <value>
            <elementReference>$Record__Prior.StageName</elementReference>
        </value>
    </inputAssignments>
    <inputReference>$Record</inputReference>
    <validationError>
        <errorMessage>Cannot move to Proposal stage without Amount. Please enter Amount before progressing.</errorMessage>
    </validationError>
</recordUpdates>
```

**Best Practice**: Use `$Record__Prior` to revert field changes when validation fails

**Template Available**: `opportunity-validation` template

---

### Pattern 3: Case Escalation Workflows

**Business Requirement**: Automatically escalate high-priority cases that remain unresolved for specified time periods.

#### Flow Design Strategy

**Flow Type**: Record-Triggered (After-Save) with **Scheduled Paths**
- **Immediate Path**: Initial case handling
- **Scheduled Path**: Time-based escalation check

**Element Structure**:
1. **Decision**: Check case priority and status
2. **Scheduled Path**: Wait until escalation time (e.g., 4 hours for Priority = High)
3. **Decision** (scheduled): Re-check if case still unresolved
4. **Assignment**: Increment escalation level
5. **Record Update**: Update Case owner to escalation queue
6. **Email Alert**: Notify escalation team

#### Implementation Example

```xml
<start>
    <object>Case</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>
    <scheduledPaths>
        <name>Escalate_After_4_Hours</name>
        <connector><targetReference>Check_Still_Open</targetReference></connector>
        <label>Escalate After 4 Hours</label>
        <offsetNumber>4</offsetNumber>
        <offsetUnit>Hours</offsetUnit>
        <recordField>CreatedDate</recordField>
        <timeSource>RecordField</timeSource>
    </scheduledPaths>
</start>

<decisions>
    <name>Check_Still_Open</name>
    <rules>
        <name>Case_Still_Unresolved</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.IsClosed</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue><booleanValue>false</booleanValue></rightValue>
        </conditions>
        <conditions>
            <leftValueReference>$Record.Priority</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue><stringValue>High</stringValue></rightValue>
        </conditions>
        <connector><targetReference>Escalate_Case</targetReference></connector>
    </rules>
</decisions>

<assignments>
    <name>Escalate_Case</name>
    <assignmentItems>
        <assignToReference>$Record.Escalation_Level__c</assignToReference>
        <operator>Add</operator>
        <value><numberValue>1</numberValue></value>
    </assignmentItems>
    <assignmentItems>
        <assignToReference>$Record.OwnerId</assignToReference>
        <operator>Assign</operator>
        <value><stringValue>00G5e000000EscalationQueue</stringValue></value>
    </assignmentItems>
    <connector><targetReference>Update_Case_Record</targetReference></connector>
</assignments>
```

**Best Practice**: Always re-check conditions in scheduled path (record state may have changed)

**Template Available**: `case-escalation` template

---

## Category B: Data Quality & Enrichment Projects

**Goal**: Clean, validate, and enhance data to maintain database integrity and usefulness.

### Common Data Quality Patterns

| Pattern | Flow Type | Key Elements | Frequency |
|---------|-----------|--------------|-----------|
| **Account Segmentation** | Auto-Launched or Scheduled | Loop, Decision, Assignment | Nightly/Weekly |
| **Contact Deduplication** | Record-Triggered | Record Lookup, Decision | On create/update |
| **Data Validation** | Record-Triggered (Before-Save) | Decision, Validation Error | Real-time |
| **Field Standardization** | Record-Triggered | Assignment, Text Formula | On create/update |

---

### Pattern 4: Account Segmentation and Enrichment

**Business Requirement**: Automatically categorize Accounts into segments (Enterprise, Mid-Market, SMB) based on revenue, employee count, and activity, then enrich with additional metadata.

#### Flow Design Strategy

**Flow Type**: Scheduled Flow (for batch processing) or Auto-Launched (for on-demand)
- **Schedule**: Run nightly to process all Accounts
- **Entry**: No trigger - processes all or filtered Accounts

**Element Structure**:
1. **Record Lookup**: Get Accounts needing segmentation
2. **Loop**: Iterate through Accounts collection
3. **Decision** (inside loop): Determine segment based on criteria
4. **Assignment** (inside loop): Build collection of updated Accounts
5. **Record Update** (outside loop): Bulk update all Accounts

#### Implementation Example

```xml
<recordLookups>
    <name>Get_Accounts_To_Segment</name>
    <filterLogic>and</filterLogic>
    <filters>
        <field>Segment__c</field>
        <operator>IsNull</operator>
        <value><booleanValue>true</booleanValue></value>
    </filters>
    <filters>
        <field>AnnualRevenue</field>
        <operator>IsNull</operator>
        <value><booleanValue>false</booleanValue></value>
    </filters>
    <object>Account</object>
    <outputReference>AccountsToSegment</outputReference>
    <queriedFields>Id</queriedFields>
    <queriedFields>AnnualRevenue</queriedFields>
    <queriedFields>NumberOfEmployees</queriedFields>
</recordLookups>

<loops>
    <name>Loop_Through_Accounts</name>
    <collectionReference>AccountsToSegment</collectionReference>
    <iterationOrder>Asc</iterationOrder>
    <nextValueConnector><targetReference>Determine_Segment</targetReference></nextValueConnector>
</loops>

<decisions>
    <name>Determine_Segment</name>
    <rules>
        <name>Enterprise</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>Loop_Through_Accounts.AnnualRevenue</leftValueReference>
            <operator>GreaterThanOrEqualTo</operator>
            <rightValue><numberValue>10000000</numberValue></rightValue>
        </conditions>
        <connector><targetReference>Set_Enterprise_Segment</targetReference></connector>
    </rules>
    <rules>
        <name>Mid_Market</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>Loop_Through_Accounts.AnnualRevenue</leftValueReference>
            <operator>GreaterThanOrEqualTo</operator>
            <rightValue><numberValue>1000000</numberValue></rightValue>
        </conditions>
        <connector><targetReference>Set_MidMarket_Segment</targetReference></connector>
    </rules>
    <defaultConnector><targetReference>Set_SMB_Segment</targetReference></defaultConnector>
</decisions>

<assignments>
    <name>Set_Enterprise_Segment</name>
    <assignmentItems>
        <assignToReference>Loop_Through_Accounts.Segment__c</assignToReference>
        <operator>Assign</operator>
        <value><stringValue>Enterprise</stringValue></value>
    </assignmentItems>
    <assignmentItems>
        <assignToReference>UpdatedAccounts</assignToReference>
        <operator>Add</operator>
        <value><elementReference>Loop_Through_Accounts</elementReference></value>
    </assignmentItems>
    <connector><targetReference>Loop_Through_Accounts</targetReference></connector>
</assignments>

<!-- After loop completes -->
<recordUpdates>
    <name>Bulk_Update_Accounts</name>
    <inputReference>UpdatedAccounts</inputReference>
</recordUpdates>
```

**Critical Best Practice**: NEVER put DML (Record Create/Update/Delete) inside loops. Always collect records in a variable, then bulk update outside loop.

**Template Available**: `account-enrichment` template

---

### Pattern 5: Contact Deduplication

**Business Requirement**: Detect duplicate Contacts when new ones are created or updated, and flag or merge them.

#### Flow Design Strategy

**Flow Type**: Record-Triggered (After-Save)
- **Object**: Contact
- **Trigger**: CreateAndUpdate
- **Timing**: RecordAfterSave

**Element Structure**:
1. **Record Lookup**: Find potential duplicates (match on Email or Name+Company)
2. **Decision**: Check if duplicates found
3. **Assignment**: Flag record as potential duplicate
4. **Record Update**: Update Contact with duplicate flag
5. **Record Create**: Create Task for data steward to review

#### Implementation Example

```xml
<recordLookups>
    <name>Find_Duplicate_Contacts</name>
    <filterLogic>and</filterLogic>
    <filters>
        <field>Email</field>
        <operator>EqualTo</operator>
        <value><elementReference>$Record.Email</elementReference></value>
    </filters>
    <filters>
        <field>Id</field>
        <operator>NotEqualTo</operator>
        <value><elementReference>$Record.Id</elementReference></value>
    </filters>
    <object>Contact</object>
    <outputReference>DuplicateContacts</outputReference>
    <queriedFields>Id</queriedFields>
    <queriedFields>Name</queriedFields>
    <queriedFields>Email</queriedFields>
</recordLookups>

<decisions>
    <name>Check_Duplicates_Found</name>
    <rules>
        <name>Duplicates_Exist</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>DuplicateContacts</leftValueReference>
            <operator>IsNull</operator>
            <rightValue><booleanValue>false</booleanValue></rightValue>
        </conditions>
        <connector><targetReference>Flag_As_Duplicate</targetReference></connector>
    </rules>
</decisions>

<assignments>
    <name>Flag_As_Duplicate</name>
    <assignmentItems>
        <assignToReference>$Record.Potential_Duplicate__c</assignToReference>
        <operator>Assign</operator>
        <value><booleanValue>true</booleanValue></value>
    </assignmentItems>
    <connector><targetReference>Update_Contact_Flag</targetReference></connector>
</assignments>

<recordUpdates>
    <name>Update_Contact_Flag</name>
    <inputReference>$Record</inputReference>
    <connector><targetReference>Create_Review_Task</targetReference></connector>
</recordUpdates>

<recordCreates>
    <name>Create_Review_Task</name>
    <inputAssignments>
        <field>Subject</field>
        <value><stringValue>Review Duplicate Contact</stringValue></value>
    </inputAssignments>
    <inputAssignments>
        <field>WhoId</field>
        <value><elementReference>$Record.Id</elementReference></value>
    </inputAssignments>
    <inputAssignments>
        <field>OwnerId</field>
        <value><stringValue>00G5e000000DataStewardQueue</stringValue></value>
    </inputAssignments>
    <object>Task</object>
</recordCreates>
```

**Best Practice**: Use **exact matching** (Email) for duplicates, not fuzzy matching (avoid false positives)

**Template Available**: `contact-deduplication` template

---

## Category C: Migration & Consolidation Projects

**Goal**: Convert legacy automation (Workflow Rules, Process Builder) to Flows, or consolidate multiple Flows into streamlined versions.

### Common Migration Patterns

| Pattern | Source | Target | Tools |
|---------|--------|--------|-------|
| **Workflow ’ Flow** | Workflow Rule | Record-Triggered Flow | flow-pattern-migrator.js |
| **Process Builder ’ Flow** | Process Builder | Record-Triggered Flow | Manual conversion |
| **Flow Consolidation** | Multiple Flows | Single Flow + Subflows | flow-consolidation-validator.sh |

---

### Pattern 6: Workflow Rule ’ Flow Migration

**Business Requirement**: Migrate Workflow Rules to Flows (Salesforce is retiring Workflow Rules in future releases).

#### Migration Strategy

**Step 1**: Extract Workflow Rule logic
- **Criteria**: ’ Decision element in Flow
- **Field Update**: ’ Assignment + Record Update in Flow
- **Email Alert**: ’ Email Alert action in Flow
- **Task Creation**: ’ Record Create (Task) in Flow

**Step 2**: Map trigger behavior
- **Workflow Evaluation**: Created, Created/Edited ’ RecordTriggerType
- **Rule Criteria**: ’ Entry conditions or Decision element
- **Time-Based Actions**: ’ Scheduled Paths in Flow

#### Implementation Example

**Original Workflow Rule**:
- Object: Opportunity
- Evaluation: Created/Edited
- Criteria: `StageName = "Closed Won"`
- Action: Field Update (Set `Renewal_Date__c` = `CloseDate + 365`)

**Migrated Flow**:

```xml
<start>
    <object>Opportunity</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>
    <filterLogic>and</filterLogic>
    <filters>
        <field>StageName</field>
        <operator>EqualTo</operator>
        <value><stringValue>Closed Won</stringValue></value>
    </filters>
</start>

<formulas>
    <name>Calculate_Renewal_Date</name>
    <dataType>Date</dataType>
    <expression>{!$Record.CloseDate} + 365</expression>
</formulas>

<assignments>
    <name>Set_Renewal_Date</name>
    <assignmentItems>
        <assignToReference>$Record.Renewal_Date__c</assignToReference>
        <operator>Assign</operator>
        <value><elementReference>Calculate_Renewal_Date</elementReference></value>
    </assignmentItems>
    <connector><targetReference>Update_Opportunity</targetReference></connector>
</assignments>

<recordUpdates>
    <name>Update_Opportunity</name>
    <inputReference>$Record</inputReference>
</recordUpdates>
```

**Tool Support**: Use `flow-pattern-migrator.js` for automated conversion:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js --type workflow --input WorkflowRule.xml --output MigratedFlow.flow-meta.xml
```

**Reference**: See [FLOW_API_VERSION_COMPATIBILITY.md](../../FLOW_API_VERSION_COMPATIBILITY.md) for deprecated patterns

---

### Pattern 7: Process Builder ’ Flow Conversion

**Business Requirement**: Convert Process Builders to Flows for better maintainability and performance.

#### Migration Strategy

**Process Builder Structure** ’ **Flow Equivalent**:
- **Criteria Node**: ’ Decision element
- **Immediate Actions**: ’ Elements in connector path
- **Scheduled Actions**: ’ Scheduled Paths
- **Invocable Actions**: ’ Action elements

**Implementation Approach**:

1. **Export Process Builder** (if possible) or document logic
2. **Create Record-Triggered Flow** with same trigger object/timing
3. **Convert each criteria node** to Decision element
4. **Migrate actions** to appropriate Flow elements
5. **Test thoroughly** (Process Builder and Flows have subtle differences)

**Example Process Builder**:
- Object: Lead
- Criteria 1: `Status = "Qualified"` ’ Create Opportunity
- Criteria 2: `Rating = "Hot"` ’ Assign to senior rep

**Migrated Flow**:

```xml
<start>
    <object>Lead</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>
</start>

<decisions>
    <name>Check_Lead_Status_and_Rating</name>
    <rules>
        <name>Qualified_Lead</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.Status</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue><stringValue>Qualified</stringValue></rightValue>
        </conditions>
        <connector><targetReference>Create_Opportunity</targetReference></connector>
    </rules>
    <rules>
        <name>Hot_Lead</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.Rating</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue><stringValue>Hot</stringValue></rightValue>
        </conditions>
        <connector><targetReference>Assign_To_Senior_Rep</targetReference></connector>
    </rules>
</decisions>
```

**Critical Consideration**: Process Builder allows multiple criteria to execute in order. Flows require explicit branching. Use subflows if needed to preserve execution order.

---

### Pattern 8: Flow Consolidation

**Business Requirement**: Merge multiple Flows on same object to reduce complexity and improve performance.

#### Consolidation Strategy

**When to Consolidate**:
-  Multiple Flows on same object with same trigger type
-  Flows with similar or overlapping logic
-  Flows causing order of execution issues

**When NOT to Consolidate**:
- L Before-save and after-save Flows (keep separate)
- L Flows with completely independent logic
- L Flows maintained by different teams

**Implementation Approach**:

1. **Analyze existing Flows** with `flow-consolidation-validator.sh`
2. **Create master Flow** with clear decision branches
3. **Extract common logic** into subflows
4. **Preserve all functionality** from original Flows
5. **Test each scenario** from original Flows
6. **Deactivate originals** only after thorough testing

**Tool Support**:

```bash
# Analyze consolidation opportunities
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-consolidation-validator.sh Account

# Output: Recommendations for which Flows to merge
```

---

## Category D: Assessment & Remediation Projects

**Goal**: Implement recommendations from CPQ assessments, RevOps audits, or automation audits.

### Common Assessment Patterns

| Assessment Type | Common Flow Needs | Complexity |
|-----------------|-------------------|------------|
| **CPQ Assessment** | Pricing calculation, approval routing, quote generation | High |
| **RevOps Audit** | Renewal opportunity creation, forecast tracking | Medium |
| **Automation Audit** | Error handling, consolidation, optimization | Medium |

---

### Pattern 9: CPQ Assessment Remediation

**Business Requirement**: Implement complex CPQ logic (discount approval, pricing tiers, bundle validation) based on assessment findings.

#### Flow Design Strategy

**Flow Type**: Mix of Record-Triggered and Auto-Launched
- **Record-Triggered**: Quote/Opportunity validation
- **Auto-Launched**: Complex pricing calculations (invoked by Apex or other Flows)

**Element Structure** (Price Approval Flow):
1. **Decision**: Check discount percentage against approval thresholds
2. **Subflow**: Call approval routing logic
3. **Record Update**: Lock Quote for approval
4. **Email Alert**: Notify approver

#### Implementation Considerations

- **Use Apex for complex math**: Flow formulas have limits
- **Invocable Actions**: Call CPQ managed package actions
- **Error Handling**: Add fault paths for all CPQ API calls

```xml
<decisions>
    <name>Check_Discount_Approval_Needed</name>
    <rules>
        <name>Requires_VP_Approval</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.Discount_Percent__c</leftValueReference>
            <operator>GreaterThan</operator>
            <rightValue><numberValue>20</numberValue></rightValue>
        </conditions>
        <connector><targetReference>Submit_For_VP_Approval</targetReference></connector>
    </rules>
    <rules>
        <name>Requires_Manager_Approval</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.Discount_Percent__c</leftValueReference>
            <operator>GreaterThan</operator>
            <rightValue><numberValue>10</numberValue></rightValue>
        </conditions>
        <connector><targetReference>Submit_For_Manager_Approval</targetReference></connector>
    </rules>
</decisions>
```

**Reference**: Use `flow-decision-logic-analyzer.js` to validate complex CPQ decision trees

---

### Pattern 10: RevOps Audit - Renewal Opportunity Creation

**Business Requirement**: Automatically create renewal Opportunities 90 days before contract end date.

#### Flow Design Strategy

**Flow Type**: Scheduled Flow
- **Schedule**: Run daily
- **Scope**: Process contracts expiring in 90 days

**Element Structure**:
1. **Record Lookup**: Get Contracts expiring in 90 days without renewal Opportunity
2. **Loop**: Iterate through Contracts
3. **Decision**: Check if renewal already exists
4. **Record Create**: Create renewal Opportunity
5. **Assignment**: Add to collection
6. **Record Update** (outside loop): Link Contracts to new Opportunities

```xml
<recordLookups>
    <name>Get_Expiring_Contracts</name>
    <filterLogic>and</filterLogic>
    <filters>
        <field>EndDate</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>Calculate_90_Days_From_Now</elementReference>
        </value>
    </filters>
    <filters>
        <field>Renewal_Opportunity__c</field>
        <operator>IsNull</operator>
        <value><booleanValue>true</booleanValue></value>
    </filters>
    <object>Contract</object>
    <outputReference>ExpiringContracts</outputReference>
</recordLookups>

<loops>
    <name>Loop_Expiring_Contracts</name>
    <collectionReference>ExpiringContracts</collectionReference>
    <iterationOrder>Asc</iterationOrder>
    <nextValueConnector><targetReference>Create_Renewal_Opportunity</targetReference></nextValueConnector>
</loops>

<recordCreates>
    <name>Create_Renewal_Opportunity</name>
    <inputAssignments>
        <field>Name</field>
        <value>
            <stringValue>{!Loop_Expiring_Contracts.Account.Name} - Renewal</stringValue>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>AccountId</field>
        <value><elementReference>Loop_Expiring_Contracts.AccountId</elementReference></value>
    </inputAssignments>
    <inputAssignments>
        <field>CloseDate</field>
        <value><elementReference>Loop_Expiring_Contracts.EndDate</elementReference></value>
    </inputAssignments>
    <inputAssignments>
        <field>Amount</field>
        <value><elementReference>Loop_Expiring_Contracts.Annual_Value__c</elementReference></value>
    </inputAssignments>
    <inputAssignments>
        <field>StageName</field>
        <value><stringValue>Renewal Identified</stringValue></value>
    </inputAssignments>
    <inputAssignments>
        <field>Type</field>
        <value><stringValue>Renewal</stringValue></value>
    </inputAssignments>
    <object>Opportunity</object>
    <outputReference>NewRenewalOpportunity</outputReference>
</recordCreates>
```

**Best Practice**: Always check for existing renewals to prevent duplicates

---

## Design Decision Framework

Use this framework to choose the right Flow design for any project:

### Decision Tree

```
1. When should automation run?
     When record changes ’ Record-Triggered Flow
     On a schedule ’ Scheduled Flow
     Invoked by code/Flow ’ Auto-Launched Flow
     User-initiated ’ Screen Flow

2. What does automation do?
     Validate/prevent ’ Before-Save Record-Triggered
     Update/create records ’ After-Save Record-Triggered
     Process multiple records ’ Loop (with bulk DML outside loop)
     Complex logic ’ Break into subflows

3. How complex is the logic?
     Simple (1-5 elements) ’ Single Flow
     Medium (5-20 elements) ’ Single Flow with clear sections
     Complex (20+ elements) ’ Master Flow + Subflows

4. What's the performance requirement?
     Real-time (< 1 sec) ’ Before-Save or After-Save
     Near-real-time (< 5 min) ’ After-Save
     Batch (nightly/weekly) ’ Scheduled Flow
```

---

## Tool Integration Reference

### Scripts for Project Scenarios

| Script | Use Case | Documentation |
|--------|----------|---------------|
| **flow-pattern-migrator.js** | Workflow Rule ’ Flow migration | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js` |
| **flow-consolidation-validator.sh** | Identify consolidation opportunities | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-consolidation-validator.sh` |
| **flow-decision-logic-analyzer.js** | Validate complex decision trees | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-decision-logic-analyzer.js` |
| **flow-conflict-analyzer.js** | Detect conflicting Flows | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-conflict-analyzer.js` |

### Templates for Project Scenarios

| Template | Scenario | Parameters |
|----------|----------|------------|
| **lead-assignment** | Lead routing | assignmentField, assignmentValue, ownerUserId |
| **opportunity-validation** | Stage validation | requiredStage, requiredField, errorMessage |
| **account-enrichment** | Data enrichment | industryMapping, segmentValue, revenueThreshold |
| **case-escalation** | Case escalation | priorityLevel, ageThresholdHours, escalationQueueId |
| **contact-deduplication** | Duplicate detection | matchField, duplicateFlagField, autoMerge |
| **task-reminder** | Task reminders | reminderDaysBefore, taskStatus, emailTemplate |

---

## Next Steps

After designing your Flow for the project scenario:

1. **Implement Flow**: Use [Runbook 1: Authoring Flows via XML](01-authoring-flows-via-xml.md) to build
2. **Choose Tools**: Review [Runbook 3: Tools and Techniques](03-tools-and-techniques.md) for implementation approach
3. **Validate Design**: Proceed to [Runbook 4: Validation and Best Practices](04-validation-and-best-practices.md)

---

## Related Documentation

- [FLOW_DESIGN_BEST_PRACTICES.md](../../FLOW_DESIGN_BEST_PRACTICES.md) - Comprehensive design patterns
- [FLOW_ELEMENTS_REFERENCE.md](../../FLOW_ELEMENTS_REFERENCE.md) - Element structure reference
- [Template Registry Documentation](../../../agents/flow-template-specialist.md) - Available templates

---

**Runbook Maintainer**: Salesforce Plugin Team
**Feedback**: Submit via `/reflect` command or GitHub issues
