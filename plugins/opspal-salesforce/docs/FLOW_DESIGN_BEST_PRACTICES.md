# Salesforce Flow Design Best Practices

**Last Updated**: 2025-10-24
**Version**: 1.0.0
**Status**: Production Ready

## Table of Contents

1. [Overview](#overview)
2. [Planning and Design](#planning-and-design)
3. [Minimizing Unnecessary Elements](#minimizing-unnecessary-elements)
4. [Bulkification and Performance](#bulkification-and-performance)
5. [Subflows for Reusability](#subflows-for-reusability)
6. [Avoiding Hard-Coding](#avoiding-hard-coding)
7. [Error Handling](#error-handling)
8. [Testing Strategies](#testing-strategies)
9. [Context-Aware Design](#context-aware-design)
10. [Advanced Patterns](#advanced-patterns)
11. [Flow Consolidation](#flow-consolidation)
12. [Documentation Standards](#documentation-standards)

---

## Overview

### Purpose

This guide ensures Flows are **efficient**, **maintainable**, and **robust** by following Salesforce-recommended patterns and avoiding common anti-patterns that lead to performance issues or runtime errors.

### Core Philosophy

> **"Flows should be as simple as possible to achieve requirements"**

Complexity is the enemy of maintainability. Every element added to a Flow increases:
- Debugging time
- Maintenance burden
- Risk of errors
- Governor limit consumption

---

## Planning and Design

### Step 1: Plan Before Building

**Before creating any Flow**:
1. **Document requirements** - Write out what the Flow needs to do
2. **Consider alternatives** - Is Flow the right tool, or should this be Apex?
3. **Draw a flowchart** - Visualize logic before implementation
4. **Identify data needs** - What records/fields are required?
5. **Plan for errors** - What could go wrong?

**Decision Tree**: Flow vs Apex

```
Is the logic simple and declarative?
    ├── YES → Use Flow
    └── NO → Consider Apex
        ├── > 10 decision points? → Apex
        ├── Complex data transformations? → Apex
        ├── External callouts with retries? → Apex
        └── Otherwise → Flow with complexity monitoring
```

**Complexity Score Calculator**:
```javascript
// Use flow-validator.js to calculate complexity
node scripts/lib/flow-validator.js --analyze --flow-name My_Flow --org my-org

// Complexity Score Thresholds:
// 0-3: Simple (good for Flow)
// 4-6: Moderate (acceptable)
// 7-9: Complex (consider refactoring)
// 10+: Very Complex (strongly recommend Apex)
```

### Step 2: Use Descriptive Naming

**Flow Naming Convention**:
```
[Object]_[TriggerType]_[Purpose]

Examples:
✅ Account_AfterSave_UpdateContacts
✅ Opportunity_BeforeSave_DefaultFields
✅ Case_Scheduled_CloseStale
✅ LeadConversion_Screen_GatherInfo

❌ MyFlow
❌ Flow1
❌ NewFlow_Copy
```

**Element Naming Convention**:
```
[Action]_[Target]_[Detail]

Examples:
✅ Get_Related_Contacts
✅ Update_Account_Status
✅ Decision_Is_High_Value
✅ Loop_Through_Opportunities

❌ Get1
❌ Update
❌ Decision
```

### Step 3: Add Descriptions

**Flow Description** (Required):
```
Purpose: Update all child Contacts when Account status changes
Trigger: Account, After Save
Entry Criteria: Status changed from any value to 'Inactive'
Actions: Set Contact.AccountStatus__c = 'Inactive' for all related Contacts
Owned by: Sales Operations
Last Updated: 2024-10-24
```

**Element Descriptions** (For complex logic):
```xml
<description>
Check if Opportunity Amount exceeds $100,000 to determine if
this requires executive approval per the Q4 2024 approval matrix.
</description>
```

---

## Minimizing Unnecessary Elements

### Critical Rule: Avoid Redundant Get Records

**❌ ANTI-PATTERN: Fetching Data You Already Have**

```
Trigger: Account AfterSave (you have $Record with all fields)
    ├── Get Records: Query Account by Id = $Record.Id
    │   └── WHY? You already have the Account!
    └── Update Related Contacts (using Get Records result)
```

**This happens because**:
- Agents/developers forget trigger context provides the record
- UI confusion about what's available in $Record
- Copy-paste from examples that needed the Get

**✅ CORRECT PATTERN: Use Existing Data**

```
Trigger: Account AfterSave
    ├── Get Records: Query Contacts WHERE AccountId = $Record.Id
    │   └── This IS necessary (related records)
    └── Update Contacts using $Record.Status__c
        └── Use $Record directly, no second query needed
```

### When to Use Get Records

**Use Get Records ONLY when**:
✅ You need related records (parent → children)
✅ You need parent data (child → parent via lookup)
✅ You need to query unrelated records by criteria
✅ You need to check if a record exists

**DON'T Use Get Records when**:
❌ You already have the triggering record ($Record)
❌ You just queried the data in a previous Get Records
❌ The data is in a variable from earlier in the Flow
❌ You can pass the data as a parameter from parent Flow

### Consolidate Similar Actions

**❌ ANTI-PATTERN: Multiple Update Elements**

```
Update Opportunity
    ├── Set StageName = 'Closed Won'
Update Opportunity (again)
    ├── Set CloseDate = TODAY()
Update Opportunity (yet again)
    ├── Set Amount = $TotalAmount
```

**✅ CORRECT: Single Update**

```
Update Opportunity
    ├── Set StageName = 'Closed Won'
    ├── Set CloseDate = TODAY()
    └── Set Amount = $TotalAmount
```

**Benefits**:
- 1 DML operation instead of 3
- Faster execution
- Easier to debug
- Lower governor limit consumption

### Use Assignment Before Update (When Needed)

**When to use Assignment**:
✅ Building complex values (formulas, concatenation)
✅ Storing intermediate calculations
✅ Preparing multiple field values before single Update

**❌ ANTI-PATTERN: Assignment for Every Field**

```
Assignment: Set var_Name = $Record.Name
Assignment: Set var_Status = 'Active'
Assignment: Set var_Date = TODAY()
Update: Use var_Name, var_Status, var_Date
```

**✅ CORRECT: Direct Update**

```
Update Account
    ├── Set Name = $Record.Name (direct reference)
    ├── Set Status__c = 'Active' (literal)
    └── Set Date__c = TODAY() (formula)
```

**✅ WHEN Assignment IS Useful**:

```
Assignment: Calculate var_Discount
    ├── Formula: {!$Record.Amount} * 0.15
Decision: Is Discount > $10,000?
    ├── YES → Set var_FinalDiscount = 10000 (cap at max)
    └── NO → Set var_FinalDiscount = var_Discount
Update Opportunity
    └── Set DiscountAmount__c = {!var_FinalDiscount}
```

---

## Bulkification and Performance

### Fundamental Rule: Never DML in Loops

**❌ ANTI-PATTERN: DML Inside Loop** (WILL FAIL IN PRODUCTION)

```
Get Records: Query all Opportunities (could return 200)
Loop Through Opportunities
    ├── Current Item: opp
    ├── Update opp.StageName = 'Updated'  ← 200 DML operations!
    └── Next Iteration
```

**Result**: Exceeds governor limit (150 DML per transaction)

**✅ CORRECT: Collect and Bulk Update**

```
Get Records: Query all Opportunities → Store in opps (collection)
Loop Through Opportunities
    ├── Current Item: opp
    ├── Assignment: Set opp.StageName = 'Updated'
    ├── Assignment: Add opp to opps_ToUpdate (collection)
    └── Next Iteration
Update Records: Update opps_ToUpdate (1 DML operation, 200 records)
```

**Benefits**:
- 1 DML operation regardless of record count
- Handles up to 10,000 records per transaction
- Production-safe

### Use Collections

**Collection Variable Types**:
- `Record Collection` - List of sObjects (Account, Contact, etc.)
- `Text Collection` - List of strings
- `Number Collection` - List of numbers
- `Boolean Collection` - List of true/false values

**Collection Operations**:
- **Add** - Append item to collection
- **Remove** - Remove item by index
- **Sort** - Order by field value
- **Filter** - Subset by criteria

**Example: Building a Collection**:

```xml
<variables>
    <name>accounts_ToUpdate</name>
    <dataType>SObject</dataType>
    <isCollection>true</isCollection>
    <objectType>Account</objectType>
</variables>

<loops>
    <name>Loop_Accounts</name>
    <iterationOrder>Asc</iterationOrder>
    <collectionReference>accounts_AllQueried</collectionReference>
    <assignmentItems>
        <assignToReference>currentItem.Status__c</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Active</stringValue>
        </value>
    </assignmentItems>
    <assignmentItems>
        <assignToReference>accounts_ToUpdate</assignToReference>
        <operator>Add</operator>
        <value>
            <elementReference>currentItem</elementReference>
        </value>
    </assignmentItems>
</loops>

<recordUpdates>
    <name>Update_Accounts_Bulk</name>
    <inputReference>accounts_ToUpdate</inputReference>
</recordUpdates>
```

### Optimize Get Records Queries

**Use Filters to Limit Results**:

```xml
<recordLookups>
    <name>Get_High_Value_Opps</name>
    <object>Opportunity</object>
    <filterLogic>AND</filterLogic>
    <filters>
        <field>AccountId</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </filters>
    <filters>
        <field>Amount</field>
        <operator>GreaterThan</operator>
        <value>
            <numberValue>100000</numberValue>
        </value>
    </filters>
    <getFirstRecordOnly>false</getFirstRecordOnly>
    <storeOutputAutomatically>true</storeOutputAutomatically>
</recordLookups>
```

**Query Only Fields You Need**:

```xml
<!-- ❌ BAD: Get all fields (slow, large payload) -->
<getFirstRecordOnly>false</getFirstRecordOnly>
<storeOutputAutomatically>true</storeOutputAutomatically>

<!-- ✅ GOOD: Get specific fields -->
<getFirstRecordOnly>false</getFirstRecordOnly>
<queriedFields>Id</queriedFields>
<queriedFields>Name</queriedFields>
<queriedFields>Amount</queriedFields>
<queriedFields>StageName</queriedFields>
```

### Limit Record Processing

**Use `getFirstRecordOnly` When Appropriate**:

```xml
<!-- If you only need one record -->
<getFirstRecordOnly>true</getFirstRecordOnly>
```

**Use LIMIT in Advanced**:

```xml
<limit>10</limit> <!-- Only get first 10 records -->
```

---

## Subflows for Reusability

### When to Create a Subflow

**Create subflows for**:
✅ Logic used in 3+ places
✅ Complex validation rules
✅ API callouts
✅ Reusable calculations
✅ Standard data transformations

**Example Subflows**:
- `Validate_Email_Address` (used by multiple parent flows)
- `Calculate_Discount` (reused across Opportunity, Quote, Order flows)
- `Send_Notification` (standardized messaging)

### Subflow Design

**Define Clear Interface**:

```xml
<variables>
    <!-- INPUT -->
    <name>input_EmailAddress</name>
    <dataType>String</dataType>
    <isInput>true</isInput>
</variables>

<variables>
    <!-- OUTPUT -->
    <name>output_IsValid</name>
    <dataType>Boolean</dataType>
    <isOutput>true</isOutput>
</variables>
```

**Call Subflow**:

```xml
<subflows>
    <name>Validate_Email</name>
    <flowName>Validate_Email_Address</flowName>
    <inputAssignments>
        <name>input_EmailAddress</name>
        <value>
            <elementReference>$Record.Email</elementReference>
        </value>
    </inputAssignments>
    <outputAssignments>
        <assignToReference>var_EmailIsValid</assignToReference>
        <name>output_IsValid</name>
    </outputAssignments>
</subflows>
```

### Subflow vs Apex

**Use Subflow when**:
✅ Logic is declarative
✅ No complex data structures needed
✅ Can be built by admins

**Use Apex Invocable when**:
✅ Complex algorithms
✅ External API calls
✅ Heavy data transformation
✅ Need robust error handling

---

## Avoiding Hard-Coding

### Never Hard-Code IDs

**❌ ANTI-PATTERN**:

```xml
<filters>
    <field>OwnerId</field>
    <operator>EqualTo</operator>
    <value>
        <stringValue>00558000000ABCD</stringValue> <!-- Hard-coded User ID -->
    </value>
</filters>
```

**Why This Fails**:
- IDs are org-specific
- Breaks when deploying to other orgs
- Changes when records are deleted/recreated

**✅ SOLUTION 1: Use Custom Metadata**

```xml
<!-- Create Custom Metadata Type: Flow_Config__mdt -->
<!-- Field: Default_Owner_Username__c = 'integration@company.com' -->

<recordLookups>
    <name>Get_Config</name>
    <object>Flow_Config__mdt</object>
    <queriedFields>Default_Owner_Username__c</queriedFields>
</recordLookups>

<recordLookups>
    <name>Get_Owner_User</name>
    <object>User</object>
    <filters>
        <field>Username</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>Get_Config.Default_Owner_Username__c</elementReference>
        </value>
    </filters>
    <getFirstRecordOnly>true</getFirstRecordOnly>
</recordLookups>

<!-- Now use Get_Owner_User.Id (dynamic) -->
```

**✅ SOLUTION 2: Use Platform Variables**

```xml
<!-- For current user -->
<value>
    <elementReference>$User.Id</elementReference>
</value>

<!-- For record owner -->
<value>
    <elementReference>$Record.OwnerId</elementReference>
</value>
```

### Use Custom Labels for Text

**❌ ANTI-PATTERN**:

```xml
<actionCalls>
    <name>Send_Email</name>
    <label>Send Email</label>
    <actionName>emailSimple</actionName>
    <inputParameters>
        <name>emailBody</name>
        <value>
            <stringValue>Your opportunity has been approved!</stringValue>
        </value>
    </inputParameters>
</actionCalls>
```

**✅ SOLUTION: Use Custom Labels**:

```xml
<!-- Create Custom Label: Opp_Approval_Email_Body = "Your opportunity has been approved!" -->

<actionCalls>
    <name>Send_Email</name>
    <actionName>emailSimple</actionName>
    <inputParameters>
        <name>emailBody</name>
        <value>
            <elementReference>$Label.Opp_Approval_Email_Body</elementReference>
        </value>
    </inputParameters>
</actionCalls>
```

**Benefits**:
- Easy to change text without modifying Flow
- Multi-language support
- Centralized content management

---

## Error Handling

### Always Use Fault Paths

**Every DML and Get Records element can fail**. Handle failures gracefully.

**❌ ANTI-PATTERN: No Fault Handling**

```
Get Records: Query Contact by Email
    └── Update Contact.Status = 'Active'
```

**What if**:
- No Contact found? (Null reference error)
- Query fails? (Database error)
- Update fails? (Validation rule)

**✅ CORRECT: Fault Paths**

```xml
<recordLookups>
    <name>Get_Contact</name>
    <object>Contact</object>
    <filters>
        <field>Email</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>input_Email</elementReference>
        </value>
    </filters>
    <getFirstRecordOnly>true</getFirstRecordOnly>
    <storeOutputAutomatically>true</storeOutputAutomatically>
</recordLookups>

<!-- FAULT PATH -->
<faults>
    <name>Get_Contact_Fault</name>
    <connector>
        <targetReference>Error_Screen_Or_Log</targetReference>
    </connector>
    <faultConnector>
        <targetReference>Log_Error</targetReference>
    </faultConnector>
</faults>
```

### Log Errors

**Create Error Logging Element**:

```xml
<recordCreates>
    <name>Log_Error</name>
    <object>Flow_Error_Log__c</object>
    <inputAssignments>
        <field>Flow_Name__c</field>
        <value>
            <stringValue>Account_AfterSave_UpdateContacts</stringValue>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>Error_Message__c</field>
        <value>
            <elementReference>$Flow.FaultMessage</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>Record_Id__c</field>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>User_Id__c</field>
        <value>
            <elementReference>$User.Id</elementReference>
        </value>
    </inputAssignments>
</recordCreates>
```

### User-Friendly Error Messages

**For Screen Flows**:

```xml
<screens>
    <name>Error_Screen</name>
    <label>Error</label>
    <fields>
        <name>Error_Message</name>
        <fieldType>DisplayText</fieldType>
        <fieldText>
            <![CDATA[
            <p style="color:red;">
            <b>An error occurred:</b><br/>
            We couldn't update your contact information. Please contact support with error code: {!$Flow.CurrentDateTime}
            </p>
            ]]>
        </fieldText>
    </fields>
</screens>
```

### Platform Event for Critical Errors

**Send to monitoring system**:

```xml
<recordCreates>
    <name>Publish_Error_Event</name>
    <object>Flow_Error__e</object>
    <inputAssignments>
        <field>FlowName__c</field>
        <value>
            <stringValue>Critical_Flow</stringValue>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>ErrorDetails__c</field>
        <value>
            <elementReference>$Flow.FaultMessage</elementReference>
        </value>
    </inputAssignments>
</recordCreates>
```

---

## Testing Strategies

### Use Flow Debugger

**Steps**:
1. Open Flow in Builder
2. Click "Debug"
3. Provide test data
4. Step through execution
5. Inspect variable values
6. Verify logic branches

### Test Edge Cases

**Minimum Test Scenarios**:
✅ Happy path (everything works)
✅ Null values (missing data)
✅ Zero records found (Get Records returns nothing)
✅ Maximum records (200 records in bulk)
✅ Boundary conditions (e.g., Amount = exactly $100,000)
✅ Error conditions (validation rule failures)

### Bulk Testing (CRITICAL)

**Record-Triggered Flows MUST handle bulk**:

```apex
@isTest
static void testBulkUpdate() {
    List<Account> accounts = new List<Account>();
    for(Integer i = 0; i < 200; i++) {
        accounts.add(new Account(Name = 'Test ' + i, Status__c = 'New'));
    }

    Test.startTest();
    insert accounts;

    // Update to trigger Flow
    for(Account acc : accounts) {
        acc.Status__c = 'Active';
    }
    update accounts;
    Test.stopTest();

    // Assert Flow executed correctly for all 200
    accounts = [SELECT Id, ProcessedBy__c FROM Account WHERE Id IN :accounts];
    for(Account acc : accounts) {
        System.assertEquals('Flow', acc.ProcessedBy__c, 'Flow should process all 200 accounts');
    }
}
```

### Create Test Data

**Use Apex to set up**:

```apex
@TestSetup
static void setup() {
    Account acc = new Account(Name = 'Test Account');
    insert acc;

    List<Contact> contacts = new List<Contact>();
    for(Integer i = 0; i < 10; i++) {
        contacts.add(new Contact(
            FirstName = 'Test',
            LastName = 'Contact ' + i,
            AccountId = acc.Id
        ));
    }
    insert contacts;
}
```

---

## Context-Aware Design

### Before-Save vs After-Save

**Before-Save Flows** (Fast Field Updates):

**Use for**:
✅ Setting/updating fields on the SAME record that triggered the flow
✅ Field defaults and derivations
✅ Validation logic that blocks save

**Benefits**:
✅ 10x faster (no extra DML)
✅ Doesn't count against DML limits
✅ Atomic with the record save

**Limitations**:
❌ Can ONLY update the triggering record
❌ Cannot create related records
❌ Cannot query related records
❌ Cannot call external services

**Example**:

```xml
<processMetadataValues>
    <name>triggerType</name>
    <value>
        <stringValue>RecordBeforeSave</stringValue>
    </value>
</processMetadataValues>

<!-- Update $Record fields directly -->
<recordUpdates>
    <name>Set_Defaults</name>
    <inputAssignments>
        <field>Status__c</field>
        <value>
            <stringValue>New</stringValue>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>CreatedByFlow__c</field>
        <value>
            <booleanValue>true</booleanValue>
        </value>
    </inputAssignments>
    <inputReference>$Record</inputReference>
</recordUpdates>
```

**After-Save Flows**:

**Use for**:
✅ Creating/updating related records
✅ Calling external APIs
✅ Complex queries
✅ Multi-object operations
✅ Sending emails/notifications

**Example**:

```xml
<processMetadataValues>
    <name>triggerType</name>
    <value>
        <stringValue>RecordAfterSave</stringValue>
    </value>
</processMetadataValues>

<!-- Can query and update related records -->
<recordLookups>
    <name>Get_Related_Contacts</name>
    <object>Contact</object>
    <filters>
        <field>AccountId</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </filters>
</recordLookups>
```

### Decision: When to Use Each

```
Need to update same record?
    ├── YES → Before-Save (fast!)
    └── NO → After-Save
        ├── Related records? → After-Save
        ├── External callout? → After-Save (async path)
        ├── Heavy processing? → After-Save (async path)
        └── Simple logic? → After-Save
```

---

## Advanced Patterns

### Asynchronous Paths

**Use async paths for**:
✅ External API calls
✅ Heavy processing (large loops)
✅ Non-time-sensitive actions
✅ Actions that can be delayed

**Example**:

```xml
<processMetadataValues>
    <name>triggerType</name>
    <value>
        <stringValue>RecordAfterSave</stringValue>
    </value>
</processMetadataValues>

<!-- Main path: Fast, immediate actions -->
<recordUpdates>
    <name>Update_Record_Status</name>
    <inputReference>$Record</inputReference>
</recordUpdates>

<!-- Async path: Slow, can be delayed -->
<forks>
    <name>Async_Fork</name>
    <processMetadataValues>
        <name>pathType</name>
        <value>
            <stringValue>AsyncPath</stringValue>
        </value>
    </processMetadataValues>
    <connector>
        <targetReference>Call_External_API</targetReference>
    </connector>
</forks>
```

### Scheduled Paths

**Use scheduled paths for**:
✅ Time-based reminders (e.g., 7 days after)
✅ Follow-up actions (e.g., send email if no response)
✅ Expiration logic (e.g., close Cases after 30 days)

**Example**:

```xml
<scheduledPaths>
    <name>Send_Reminder_7_Days</name>
    <label>Send Reminder After 7 Days</label>
    <offsetNumber>7</offsetNumber>
    <offsetUnit>Days</offsetUnit>
    <recordField>CreatedDate</recordField>
    <connector>
        <targetReference>Send_Reminder_Email</targetReference>
    </connector>
</scheduledPaths>
```

---

## Flow Consolidation

### One Flow Per Object Per Trigger Type

**Rule**: Consolidate logic into a single master Flow per object/trigger combination.

**❌ ANTI-PATTERN: Multiple Flows**:

```
Account, After Save:
    ├── Account_Update_Contacts (Flow 1)
    ├── Account_Send_Email (Flow 2)
    ├── Account_Create_Tasks (Flow 3)
    └── Account_Log_Change (Flow 4)
```

**Problems**:
- Execution order is unpredictable
- Difficult to debug
- Potential recursive triggers
- Performance overhead

**✅ CORRECT: Single Master Flow**:

```
Account_AfterSave_Master:
    ├── Decision: What Changed?
    │   ├── Status Changed → Update Related Contacts
    │   ├── Owner Changed → Send Email to New Owner
    │   ├── High Value → Create Task for Executive
    │   └── Always → Log Change
```

**Benefits**:
- Predictable execution order
- Single point of maintenance
- Easier debugging
- Better performance

### When to Split Flows

**Justifiable Splits**:
✅ Different trigger types (Before-Save vs After-Save)
✅ Different objects (Account vs Contact)
✅ Completely unrelated logic domains
✅ Performance isolation (async path)

**Not Justifiable**:
❌ Different teams own different logic (consolidate anyway)
❌ "This is new logic" (add to existing Flow)
❌ "Original Flow was too big" (refactor with subflows)

---

## Documentation Standards

### Flow-Level Documentation

**Required Fields**:
```
API Name: Account_AfterSave_Master
Label: Account After Save - Master Flow
Description:
    Purpose: Handles all Account after-save automation
    Trigger: Account, After Save
    Entry Criteria: None (open for extensibility)
    Actions:
        - Update related Contacts when Account status changes
        - Send notification when Account owner changes
        - Create executive task for high-value Accounts
        - Log all changes for audit
    Owner: Sales Operations
    Last Updated: 2024-10-24
    Version: 5
    Change Log:
        v5: Added high-value Account task creation
        v4: Fixed bulk update for Contacts
        v3: Added owner change notification
```

### Element-Level Documentation

**Add descriptions to**:
✅ Decision elements (explain criteria)
✅ Complex formulas (explain calculation)
✅ Get Records (explain why query is needed)
✅ Loops (explain iteration purpose)

**Example**:

```xml
<decisions>
    <name>Check_High_Value</name>
    <label>Check if High Value Account</label>
    <description>
        Determines if Account requires executive oversight based on
        Q4 2024 high-value criteria: Amount > $100,000 OR
        Customer since > 5 years. Per Sales Ops policy doc v2.3.
    </description>
</decisions>
```

### Version Descriptions

**When saving new version**:
```
Version 5: Added high-value Account executive task creation
    - New decision element: Check_High_Value
    - New task creation for Accounts > $100k or 5+ year customers
    - Tested with 200 bulk records
    - Deployed to production 2024-10-24
```

---

## Related Documentation

- [Flow Version Management](./FLOW_VERSION_MANAGEMENT.md) - Version lifecycle
- [Flow Elements Reference](./FLOW_ELEMENTS_REFERENCE.md) - Element dictionary
- [Salesforce Order of Operations](./SALESFORCE_ORDER_OF_OPERATIONS.md) - Deployment patterns
- [Bulk Operations Best Practices](./BULK_OPERATIONS_BEST_PRACTICES.md) - Performance optimization

---

## References

1. [Salesforce Flow Best Practices](https://help.salesforce.com/s/articleView?id=sf.flow_prep_bestpractices.htm)
2. [Flow Design Guidelines](https://developer.salesforce.com/docs/atlas.en-us.flow.meta/flow/)
3. [Governor Limits](https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-24 | Initial best practices guide created |

---

**Maintainer**: RevPal Engineering
**Review Frequency**: Quarterly or when Salesforce releases major Flow updates
