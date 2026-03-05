# Salesforce Flow Elements Reference

**Last Updated**: 2025-10-24
**Version**: 1.0.0
**Status**: Production Ready
**API Version**: 62.0

## Table of Contents

1. [Overview](#overview)
2. [Interaction Elements](#interaction-elements)
3. [Logic Elements](#logic-elements)
4. [Data Elements](#data-elements)
5. [Resource Types](#resource-types)
6. [Metadata API Reference](#metadata-api-reference)
7. [Quick Reference Table](#quick-reference-table)

---

## Overview

### Purpose

This reference provides a comprehensive dictionary of all standard Flow elements available in Salesforce Flow Builder, organized by category with usage guidance and Metadata API mappings.

### Element Categories

| Category | Purpose | Element Count |
|----------|---------|---------------|
| **Interaction** | User interaction and external actions | 3 |
| **Logic** | Conditional logic and data manipulation | 5 |
| **Data** | Create, read, update, delete records | 5 |
| **Resources** | Variables, formulas, and constants | 6 |

### When to Use This Reference

- Building Flows via UI or API
- Understanding element capabilities
- Mapping UI elements to Metadata API
- Troubleshooting Flow logic
- Training new Flow builders

---

## Interaction Elements

Interaction elements handle user interaction (screens) or invoke external functionality (actions, subflows).

### 1. Screen

**Purpose**: Display information to users and collect input in Screen Flows.

**Use Cases**:
- Gather user input (text, picklist, checkboxes)
- Display confirmation messages
- Show dynamic data
- Guide users through multi-step processes

**Limitations**:
- Only available in Screen Flows
- Cannot be used in record-triggered or scheduled flows
- Requires user interaction (blocking)

**Metadata API Element**: `<screens>`

**Example XML**:
```xml
<screens>
    <name>Gather_Information</name>
    <label>Gather Information</label>
    <fields>
        <name>input_Name</name>
        <dataType>String</dataType>
        <fieldType>InputField</fieldType>
        <isRequired>true</isRequired>
        <label>Enter Your Name</label>
    </fields>
    <fields>
        <name>display_Message</name>
        <fieldType>DisplayText</fieldType>
        <fieldText>
            <![CDATA[
            <p>Welcome to the Flow!</p>
            ]]>
        </fieldText>
    </fields>
    <showFooter>true</showFooter>
    <showHeader>true</showHeader>
</screens>
```

**Screen Field Types**:
- `InputField` - Text input
- `DisplayText` - Show formatted text/HTML
- `DropdownBox` - Single-select picklist
- `RadioButtons` - Single-select radio group
- `Checkboxes` - Multi-select checkboxes
- `LookupField` - Record lookup
- `DateField` - Date picker
- `NumberField` - Number input
- `CurrencyField` - Currency input with formatting

**Best Practices**:
✅ Use clear, descriptive field labels
✅ Mark required fields
✅ Add help text for complex inputs
✅ Validate input with Decision elements after screen
✅ Use Display Text for instructions
❌ Don't overload screens with too many fields (max 5-7 per screen)

---

### 2. Action

**Purpose**: Execute pre-built actions such as sending emails, posting to Chatter, or calling Apex invocable methods.

**Use Cases**:
- Send email alerts
- Post to Chatter
- Submit for approval
- Quick actions
- Invocable Apex methods
- Invocable Flows

**Available Standard Actions**:
- `emailSimple` - Send email
- `chatterPost` - Post to Chatter feed
- `customNotificationAction` - Send custom notification
- `submit` - Submit record for approval
- `quipCreateDocument` - Create Quip document
- Custom Apex invocable methods

**Metadata API Element**: `<actionCalls>`

**Example XML (Send Email)**:
```xml
<actionCalls>
    <name>Send_Approval_Email</name>
    <label>Send Approval Email</label>
    <actionName>emailSimple</actionName>
    <actionType>emailSimple</actionType>
    <inputParameters>
        <name>emailBody</name>
        <value>
            <elementReference>var_EmailBody</elementReference>
        </value>
    </inputParameters>
    <inputParameters>
        <name>emailSubject</name>
        <value>
            <stringValue>Opportunity Approved</stringValue>
        </value>
    </inputParameters>
    <inputParameters>
        <name>emailAddresses</name>
        <value>
            <elementReference>$Record.Owner.Email</elementReference>
        </value>
    </inputParameters>
</actionCalls>
```

**Example XML (Call Apex)**:
```xml
<actionCalls>
    <name>Call_Calculate_Discount</name>
    <label>Call Calculate Discount</label>
    <actionName>CalculateDiscountInvocable</actionName>
    <actionType>apex</actionType>
    <inputParameters>
        <name>opportunityId</name>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </inputParameters>
    <outputParameters>
        <assignToReference>var_CalculatedDiscount</assignToReference>
        <name>discountAmount</name>
    </outputParameters>
</actionCalls>
```

**Best Practices**:
✅ Use Apex invocable for complex logic
✅ Handle action failures with fault paths
✅ Pass only necessary data to actions
✅ Test actions in all environments
❌ Don't call actions inside loops (performance)

---

### 3. Subflow

**Purpose**: Launch another flow (autolaunched flow) from the current flow, enabling modularization and reusability.

**Use Cases**:
- Reusable validation logic
- Standardized data transformations
- Common notification patterns
- Shared calculation logic
- Modular architecture

**Requirements**:
- Subflow must be an **Autolaunched Flow**
- Define input/output variables clearly
- Handle errors in subflow OR parent flow

**Metadata API Element**: `<subflows>`

**Example XML**:
```xml
<subflows>
    <name>Validate_Email_Address</name>
    <label>Validate Email Address</label>
    <flowName>Email_Validation_Subflow</flowName>
    <inputAssignments>
        <name>input_Email</name>
        <value>
            <elementReference>$Record.Email</elementReference>
        </value>
    </inputAssignments>
    <outputAssignments>
        <assignToReference>var_IsValidEmail</assignToReference>
        <name>output_IsValid</name>
    </outputAssignments>
</subflows>
```

**Subflow Definition (Autolaunched Flow)**:
```xml
<variables>
    <name>input_Email</name>
    <dataType>String</dataType>
    <isInput>true</isInput>
</variables>

<variables>
    <name>output_IsValid</name>
    <dataType>Boolean</dataType>
    <isOutput>true</isOutput>
</variables>
```

**Best Practices**:
✅ Use subflows for logic needed in 3+ places
✅ Define clear input/output contracts
✅ Document subflow purpose and usage
✅ Version subflows carefully (affects all parents)
✅ Test subflows independently
❌ Don't nest subflows > 3 levels deep
❌ Don't use subflows for single-use logic

---

## Logic Elements

Logic elements implement conditional branching, data manipulation, iteration, and collection operations.

### 1. Assignment

**Purpose**: Set variable values, perform calculations, and manipulate data within the flow.

**Use Cases**:
- Store query results
- Calculate derived values
- Build collections (add/remove items)
- Increment counters
- Store intermediate results

**Supported Operations**:
- `Assign` - Set value
- `Add` - Append to collection
- `Subtract` - Mathematical subtraction
- `Multiply` - Mathematical multiplication
- `Divide` - Mathematical division

**Metadata API Element**: `<assignments>`

**Example XML (Simple Assignment)**:
```xml
<assignments>
    <name>Set_Status</name>
    <label>Set Status to Active</label>
    <assignmentItems>
        <assignToReference>var_Status</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Active</stringValue>
        </value>
    </assignmentItems>
</assignments>
```

**Example XML (Add to Collection)**:
```xml
<assignments>
    <name>Add_To_Update_Collection</name>
    <label>Add Account to Update Collection</label>
    <assignmentItems>
        <assignToReference>accounts_ToUpdate</assignToReference>
        <operator>Add</operator>
        <value>
            <elementReference>currentItem</elementReference>
        </value>
    </assignmentItems>
</assignments>
```

**Example XML (Mathematical Calculation)**:
```xml
<assignments>
    <name>Calculate_Discount</name>
    <label>Calculate 15% Discount</label>
    <assignmentItems>
        <assignToReference>var_DiscountAmount</assignToReference>
        <operator>Assign</operator>
        <value>
            <elementReference>var_TotalAmount</elementReference>
        </value>
    </assignmentItems>
    <assignmentItems>
        <assignToReference>var_DiscountAmount</assignToReference>
        <operator>Multiply</operator>
        <value>
            <numberValue>0.15</numberValue>
        </value>
    </assignmentItems>
</assignments>
```

**Best Practices**:
✅ Use descriptive variable names
✅ Group related assignments in single element
✅ Use formulas for complex calculations (not multiple assignments)
✅ Initialize variables before first use
❌ Don't assign inside loops unless building collections
❌ Don't use assignments when direct field update is possible

---

### 2. Decision

**Purpose**: Branch flow execution based on conditions (if-else logic).

**Use Cases**:
- Conditional logic (if record meets criteria)
- Multiple outcome branching
- Validation checks
- Route to different paths based on data

**Supported Operators**:
- `EqualTo` - Equals
- `NotEqualTo` - Not equals
- `GreaterThan` - Greater than
- `LessThan` - Less than
- `GreaterThanOrEqualTo` - Greater than or equal
- `LessThanOrEqualTo` - Less than or equal
- `StartsWith` - String starts with
- `EndsWith` - String ends with
- `Contains` - String contains
- `IsNull` - Is null/blank
- `IsChanged` - Field changed (record-triggered only)
- `WasSelected` - Picklist value selected (record-triggered only)

**Metadata API Element**: `<decisions>`

**Example XML (Simple Decision)**:
```xml
<decisions>
    <name>Check_Amount</name>
    <label>Check if High Value</label>
    <rules>
        <name>High_Value</name>
        <conditions>
            <leftValueReference>$Record.Amount</leftValueReference>
            <operator>GreaterThan</operator>
            <rightValue>
                <numberValue>100000</numberValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>Create_Executive_Task</targetReference>
        </connector>
        <label>Amount > $100k</label>
    </rules>
    <defaultConnector>
        <targetReference>Standard_Processing</targetReference>
    </defaultConnector>
    <defaultConnectorLabel>Otherwise</defaultConnectorLabel>
</decisions>
```

**Example XML (Multiple Conditions with AND)**:
```xml
<decisions>
    <name>Check_Criteria</name>
    <label>Check Approval Criteria</label>
    <rules>
        <name>Requires_Approval</name>
        <conditions>
            <leftValueReference>$Record.Amount</leftValueReference>
            <operator>GreaterThan</operator>
            <rightValue>
                <numberValue>50000</numberValue>
            </rightValue>
        </conditions>
        <conditions>
            <leftValueReference>$Record.StageName</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue>
                <stringValue>Negotiation</stringValue>
            </rightValue>
        </conditions>
        <conditionLogic>AND</conditionLogic>
        <label>Needs Approval</label>
    </rules>
</decisions>
```

**Example XML (Complex Logic with OR)**:
```xml
<decisions>
    <name>Check_Priority</name>
    <label>Check Priority</label>
    <rules>
        <name>High_Priority</name>
        <conditions>
            <leftValueReference>$Record.Amount</leftValueReference>
            <operator>GreaterThan</operator>
            <rightValue>
                <numberValue>100000</numberValue>
            </rightValue>
        </conditions>
        <conditions>
            <leftValueReference>$Record.IsStrategicAccount__c</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue>
                <booleanValue>true</booleanValue>
            </rightValue>
        </conditions>
        <conditionLogic>1 OR 2</conditionLogic>
        <label>High Priority</label>
    </rules>
</decisions>
```

**Best Practices**:
✅ Use meaningful rule names
✅ Add descriptions explaining criteria
✅ Always have default connector
✅ Group related conditions with AND
✅ Use custom logic (1 OR 2 AND 3) for complex criteria
✅ Prefer formulas for very complex logic
❌ Don't nest decisions > 3 levels (use formulas instead)
❌ Don't create decisions with > 10 outcomes

---

### 3. Loop

**Purpose**: Iterate over a collection of items, processing each item individually.

**Use Cases**:
- Process query results one by one
- Transform collection items
- Filter collection by complex criteria
- Accumulate values from collection

**Loop Variables**:
- `collectionReference` - The collection to iterate
- `iterationOrder` - Asc or Desc
- `assignNextValueToReference` - Variable for current item

**Critical Rule**: **NEVER perform DML inside loops**. Use loops to build collections, then perform bulk DML outside loop.

**Metadata API Element**: `<loops>`

**Example XML (Build Collection for Bulk Update)**:
```xml
<loops>
    <name>Loop_Accounts</name>
    <label>Loop Through Accounts</label>
    <collectionReference>accounts_AllQueried</collectionReference>
    <iterationOrder>Asc</iterationOrder>
    <nextValueConnector>
        <targetReference>Check_Status</targetReference>
    </nextValueConnector>
    <noMoreValuesConnector>
        <targetReference>Update_Accounts_Bulk</targetReference>
    </noMoreValuesConnector>
    <assignNextValueToReference>currentAccount</assignNextValueToReference>
</loops>

<!-- Inside loop: modify and add to collection -->
<assignments>
    <name>Set_Account_Status</name>
    <label>Set Account Status</label>
    <assignmentItems>
        <assignToReference>currentAccount.Status__c</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Active</stringValue>
        </value>
    </assignmentItems>
    <assignmentItems>
        <assignToReference>accounts_ToUpdate</assignToReference>
        <operator>Add</operator>
        <value>
            <elementReference>currentAccount</elementReference>
        </value>
    </assignmentItems>
</assignments>

<!-- Outside loop: bulk update -->
<recordUpdates>
    <name>Update_Accounts_Bulk</name>
    <label>Update Accounts (Bulk)</label>
    <inputReference>accounts_ToUpdate</inputReference>
</recordUpdates>
```

**Best Practices**:
✅ Use loops to build collections, not perform DML
✅ Set iteration order explicitly
✅ Use descriptive names for current item variable
✅ Always have noMoreValuesConnector
✅ Consider Collection Filter before using loops
❌ NEVER update/create/delete inside loops
❌ Don't nest loops (performance)
❌ Don't loop if Collection Filter can do the job

---

### 4. Collection Sort

**Purpose**: Sort a collection by a field or value in ascending or descending order.

**Use Cases**:
- Order records by date
- Sort by priority/importance
- Organize for display
- Prepare data for processing

**Metadata API Element**: `<collectionProcessors>` (type: SortCollectionProcessor)

**Example XML**:
```xml
<collectionProcessors>
    <name>Sort_By_Amount</name>
    <label>Sort Opportunities by Amount</label>
    <collectionReference>opportunities</collectionReference>
    <conditionLogic>AND</conditionLogic>
    <processorType>SortCollectionProcessor</processorType>
    <sortOptions>
        <doesPutEmptyStringAndNullFirst>false</doesPutEmptyStringAndNullFirst>
        <sortOrder>Desc</sortOrder>
        <sortValue>
            <elementReference>opportunities.Amount</elementReference>
        </sortValue>
    </sortOptions>
</collectionProcessors>
```

**Best Practices**:
✅ Sort before looping if order matters
✅ Use Desc for "top N" scenarios
✅ Handle null values appropriately
❌ Don't sort large collections unnecessarily

---

### 5. Collection Filter

**Purpose**: Filter a collection to a subset based on conditions.

**Use Cases**:
- Get only records matching criteria
- Remove null/empty values
- Pre-filter before looping
- Extract subset for processing

**Advantage**: More efficient than looping and checking each item manually.

**Metadata API Element**: `<collectionProcessors>` (type: FilterCollectionProcessor)

**Example XML**:
```xml
<collectionProcessors>
    <name>Filter_Active_Only</name>
    <label>Filter Active Accounts Only</label>
    <collectionReference>accounts</collectionReference>
    <conditionLogic>AND</conditionLogic>
    <conditions>
        <leftValueReference>accounts.Status__c</leftValueReference>
        <operator>EqualTo</operator>
        <rightValue>
            <stringValue>Active</stringValue>
        </rightValue>
    </conditions>
    <processorType>FilterCollectionProcessor</processorType>
    <assignNextValueToReference>accounts_Filtered</assignNextValueToReference>
</collectionProcessors>
```

**Best Practices**:
✅ Use Collection Filter instead of Loop + Decision when possible
✅ Filter early to reduce processing
✅ Chain filters for multiple criteria
❌ Don't use Collection Filter if Get Records can do it (query filters are faster)

---

## Data Elements

Data elements create, retrieve, update, or delete Salesforce records.

### 1. Get Records

**Purpose**: Query Salesforce for records matching specified conditions.

**Use Cases**:
- Retrieve related records
- Look up parent data
- Check if record exists
- Get records to update

**Retrieval Options**:
- Get first record only
- Get all records (up to 50,000 per transaction)
- Get records based on conditions

**Metadata API Element**: `<recordLookups>`

**Example XML (Get Related Records)**:
```xml
<recordLookups>
    <name>Get_Related_Contacts</name>
    <label>Get Related Contacts</label>
    <object>Contact</object>
    <assignNullValuesIfNoRecordsFound>false</assignNullValuesIfNoRecordsFound>
    <filters>
        <field>AccountId</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </filters>
    <filters>
        <field>Status__c</field>
        <operator>EqualTo</operator>
        <value>
            <stringValue>Active</stringValue>
        </value>
    </filters>
    <getFirstRecordOnly>false</getFirstRecordOnly>
    <queriedFields>Id</queriedFields>
    <queriedFields>FirstName</queriedFields>
    <queriedFields>LastName</queriedFields>
    <queriedFields>Email</queriedFields>
    <storeOutputAutomatically>true</storeOutputAutomatically>
</recordLookups>
```

**Example XML (Get Single Record)**:
```xml
<recordLookups>
    <name>Get_Account_Owner</name>
    <label>Get Account Owner</label>
    <object>User</object>
    <filters>
        <field>Id</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>$Record.OwnerId</elementReference>
        </value>
    </filters>
    <getFirstRecordOnly>true</getFirstRecordOnly>
    <queriedFields>Id</queriedFields>
    <queriedFields>Name</queriedFields>
    <queriedFields>Email</queriedFields>
    <storeOutputAutomatically>true</storeOutputAutomatically>
</recordLookups>
```

**Best Practices**:
✅ Query only fields you need
✅ Use filters to limit results
✅ Use getFirstRecordOnly when appropriate
✅ Handle "no records found" with Decision
✅ Add fault path for query errors
❌ DON'T query the triggering record (use $Record)
❌ DON'T query inside loops
❌ DON'T query all fields (specify queriedFields)

---

### 2. Create Records

**Purpose**: Insert new records into Salesforce (equivalent to INSERT DML).

**Use Cases**:
- Create related records
- Create tasks/events
- Create log records
- Generate new data

**Supports**: Single record or collection of records (bulk)

**Metadata API Element**: `<recordCreates>`

**Example XML (Create Single Record)**:
```xml
<recordCreates>
    <name>Create_Contact</name>
    <label>Create Contact</label>
    <object>Contact</object>
    <inputAssignments>
        <field>FirstName</field>
        <value>
            <elementReference>var_FirstName</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>LastName</field>
        <value>
            <elementReference>var_LastName</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>AccountId</field>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>Email</field>
        <value>
            <elementReference>var_Email</elementReference>
        </value>
    </inputAssignments>
</recordCreates>
```

**Example XML (Create Collection - Bulk)**:
```xml
<recordCreates>
    <name>Create_Tasks_Bulk</name>
    <label>Create Tasks (Bulk)</label>
    <inputReference>tasks_ToCreate</inputReference>
</recordCreates>
```

**Best Practices**:
✅ Set required fields
✅ Use collections for bulk creates (outside loops)
✅ Add fault path for validation errors
✅ Store record ID in variable if needed later
❌ DON'T create inside loops
❌ DON'T forget required fields
❌ DON'T create without checking if record exists (use Get first)

---

### 3. Update Records

**Purpose**: Modify existing Salesforce records (equivalent to UPDATE DML).

**Update Methods**:
1. **Use sObject Reference** - Update records already in variables/collections
2. **Specify Field Values** - Update by criteria (like SOQL WHERE clause)

**Metadata API Element**: `<recordUpdates>`

**Example XML (Update Using Reference)**:
```xml
<recordUpdates>
    <name>Update_Account</name>
    <label>Update Account</label>
    <inputReference>$Record</inputReference>
    <inputAssignments>
        <field>Status__c</field>
        <value>
            <stringValue>Active</stringValue>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>LastModifiedByFlow__c</field>
        <value>
            <booleanValue>true</booleanValue>
        </value>
    </inputAssignments>
</recordUpdates>
```

**Example XML (Update Collection - Bulk)**:
```xml
<recordUpdates>
    <name>Update_Contacts_Bulk</name>
    <label>Update Contacts (Bulk)</label>
    <inputReference>contacts_ToUpdate</inputReference>
</recordUpdates>
```

**Example XML (Update By Criteria)**:
```xml
<recordUpdates>
    <name>Update_Related_Opps</name>
    <label>Update Related Opportunities</label>
    <filters>
        <field>AccountId</field>
        <operator>EqualTo</operator>
        <value>
            <elementReference>$Record.Id</elementReference>
        </value>
    </filters>
    <filters>
        <field>StageName</field>
        <operator>EqualTo</operator>
        <value>
            <stringValue>Prospecting</stringValue>
        </value>
    </filters>
    <inputAssignments>
        <field>NextStep</field>
        <value>
            <stringValue>Updated by Flow</stringValue>
        </value>
    </inputAssignments>
    <object>Opportunity</object>
</recordUpdates>
```

**Best Practices**:
✅ Use collections for bulk updates
✅ Use sObject reference when possible (avoids extra query)
✅ Use criteria method for updating many records at once
✅ Add fault path for validation errors
❌ DON'T update inside loops
❌ DON'T query then immediately update (use reference)
❌ DON'T update triggering record in After-Save (use Before-Save)

---

### 4. Delete Records

**Purpose**: Remove records from Salesforce (equivalent to DELETE DML). Records go to Recycle Bin.

**Use Cases**:
- Remove child records when parent deleted
- Clean up temporary data
- Remove invalid records
- Cascade deletes

**Metadata API Element**: `<recordDeletes>`

**Example XML (Delete Using Reference)**:
```xml
<recordDeletes>
    <name>Delete_Old_Tasks</name>
    <label>Delete Old Tasks</label>
    <inputReference>tasks_ToDelete</inputReference>
</recordDeletes>
```

**Example XML (Delete By Criteria)**:
```xml
<recordDeletes>
    <name>Delete_Expired_Records</name>
    <label>Delete Expired Records</label>
    <filters>
        <field>ExpirationDate__c</field>
        <operator>LessThan</operator>
        <value>
            <elementReference>$Flow.CurrentDate</elementReference>
        </value>
    </filters>
    <object>TempData__c</object>
</recordDeletes>
```

**Best Practices**:
✅ Confirm delete is necessary (cannot undo via Flow)
✅ Use collections for bulk deletes
✅ Add fault path for errors
✅ Consider soft delete (update Status instead) for audit trails
❌ DON'T delete inside loops
❌ DON'T delete without confirmation (Screen Flows)
❌ DON'T delete parent if children exist (cascading rules)

---

### 5. Roll Back Records

**Purpose**: Cancel all pending DML changes in the current transaction and optionally throw an error.

**Use Cases**:
- Abort transaction on critical error
- Undo all changes when validation fails
- Prevent partial saves
- Maintain data integrity

**Behavior**:
- Undoes ALL DML in transaction (Flow and Apex)
- Marks Flow interview as failed
- No records are committed
- User sees error message

**Metadata API Element**: `<recordRollbacks>`

**Example XML**:
```xml
<recordRollbacks>
    <name>Rollback_Transaction</name>
    <label>Rollback Transaction</label>
    <connector>
        <targetReference>Display_Error_Screen</targetReference>
    </connector>
    <faultConnector>
        <targetReference>Log_Rollback_Error</targetReference>
    </faultConnector>
</recordRollbacks>
```

**Use Case Example**:
```xml
<!-- Try to create Account and Contact -->
<recordCreates>
    <name>Create_Account</name>
    <object>Account</object>
    <!-- ... -->
</recordCreates>

<recordCreates>
    <name>Create_Contact</name>
    <object>Contact</object>
    <!-- ... -->
</recordCreates>

<!-- If Contact creation fails, rollback Account too -->
<decisions>
    <name>Check_Contact_Created</name>
    <rules>
        <name>Contact_Failed</name>
        <conditions>
            <leftValueReference>Create_Contact</leftValueReference>
            <operator>IsNull</operator>
            <rightValue>
                <booleanValue>true</booleanValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>Rollback_Transaction</targetReference>
        </connector>
    </rules>
</decisions>
```

**Best Practices**:
✅ Use for critical validation failures
✅ Display user-friendly error message
✅ Log why rollback occurred
✅ Use to maintain data consistency
❌ DON'T use for normal error handling (use fault paths)
❌ DON'T use frequently (performance impact)
❌ DON'T use in production without thorough testing

---

## Resource Types

Resources are not canvas elements but are essential components of Flows that store data and values.

### 1. Variable (Single Value)

**Purpose**: Store a single value of a specific data type.

**Data Types**:
- String (text)
- Number (decimal)
- Currency
- Boolean (true/false)
- Date
- DateTime
- Picklist
- sObject (e.g., Account, Contact)

**Metadata XML**:
```xml
<variables>
    <name>var_TotalAmount</name>
    <dataType>Currency</dataType>
    <isInput>false</isInput>
    <isOutput>false</isOutput>
    <value>
        <numberValue>0</numberValue>
    </value>
</variables>
```

**Best Practices**:
✅ Use `var_` prefix for clarity
✅ Initialize with default value
✅ Use descriptive names

---

### 2. Collection Variable (Multiple Values)

**Purpose**: Store a list of values of the same data type.

**Use Cases**:
- Store query results
- Build list for bulk DML
- Store multiple selections

**Metadata XML**:
```xml
<variables>
    <name>accounts_ToUpdate</name>
    <dataType>SObject</dataType>
    <isCollection>true</isCollection>
    <objectType>Account</objectType>
</variables>
```

---

### 3. Formula

**Purpose**: Calculate values using a formula expression (like Salesforce formulas).

**Use Cases**:
- Derive values
- Complex calculations
- String concatenation
- Date arithmetic

**Metadata XML**:
```xml
<formulas>
    <name>formula_DiscountAmount</name>
    <dataType>Currency</dataType>
    <expression>{!$Record.Amount} * 0.15</expression>
</formulas>
```

---

### 4. Constant

**Purpose**: Store a value that never changes within the Flow.

**Use Cases**:
- Configuration values
- Thresholds
- Standard messages

**Metadata XML**:
```xml
<constants>
    <name>const_MaxDiscount</name>
    <dataType>Currency</dataType>
    <value>
        <numberValue>10000</numberValue>
    </value>
</constants>
```

---

### 5. Text Template

**Purpose**: Build formatted text with merge fields (emails, notifications).

**Metadata XML**:
```xml
<textTemplates>
    <name>template_EmailBody</name>
    <text>Dear {!$Record.FirstName},

Your opportunity "{!$Record.Name}" has been approved.

Amount: {!$Record.Amount}
Close Date: {!$Record.CloseDate}

Best regards,
Sales Team</text>
</textTemplates>
```

---

### 6. Stage

**Purpose**: Organize Flow elements into visual stages for clarity.

**Note**: Stages are UI-only and don't affect execution logic.

**Metadata XML**:
```xml
<stages>
    <name>stage_Validation</name>
    <label>Validation</label>
    <isActive>true</isActive>
</stages>
```

---

## Metadata API Reference

### Element Mapping Table

| UI Element | Metadata API Element | Category |
|------------|----------------------|----------|
| Screen | `<screens>` | Interaction |
| Action | `<actionCalls>` | Interaction |
| Subflow | `<subflows>` | Interaction |
| Assignment | `<assignments>` | Logic |
| Decision | `<decisions>` | Logic |
| Loop | `<loops>` | Logic |
| Collection Sort | `<collectionProcessors>` (SortCollectionProcessor) | Logic |
| Collection Filter | `<collectionProcessors>` (FilterCollectionProcessor) | Logic |
| Get Records | `<recordLookups>` | Data |
| Create Records | `<recordCreates>` | Data |
| Update Records | `<recordUpdates>` | Data |
| Delete Records | `<recordDeletes>` | Data |
| Roll Back Records | `<recordRollbacks>` | Data |
| Variable | `<variables>` | Resource |
| Formula | `<formulas>` | Resource |
| Constant | `<constants>` | Resource |
| Text Template | `<textTemplates>` | Resource |

---

## Quick Reference Table

### When to Use Which Element

| I Need To... | Use This Element | Category |
|--------------|------------------|----------|
| Show user a screen | Screen | Interaction |
| Send an email | Action (emailSimple) | Interaction |
| Call Apex code | Action (apex) | Interaction |
| Reuse logic from another flow | Subflow | Interaction |
| Store a value | Assignment | Logic |
| Make a decision (if-else) | Decision | Logic |
| Process each item in a list | Loop | Logic |
| Sort a list | Collection Sort | Logic |
| Filter a list | Collection Filter | Logic |
| Query for records | Get Records | Data |
| Create new records | Create Records | Data |
| Modify existing records | Update Records | Data |
| Remove records | Delete Records | Data |
| Cancel all changes | Roll Back Records | Data |
| Calculate a value | Formula | Resource |
| Store unchanging value | Constant | Resource |
| Build formatted text | Text Template | Resource |

---

## Related Documentation

- [Flow Version Management](./FLOW_VERSION_MANAGEMENT.md) - Version lifecycle
- [Flow Design Best Practices](./FLOW_DESIGN_BEST_PRACTICES.md) - Design patterns
- [Salesforce Order of Operations](./SALESFORCE_ORDER_OF_OPERATIONS.md) - Deployment patterns
- [Salesforce Tooling API Flow Objects](./SALESFORCE_TOOLING_API_FLOW_OBJECTS.md) - API reference

---

## References

1. [Salesforce Flow Builder Guide](https://help.salesforce.com/s/articleView?id=sf.flow_builder.htm)
2. [Flow Elements Reference](https://developer.salesforce.com/docs/atlas.en-us.flow.meta/flow/flow_ref_elements.htm)
3. [Flow Metadata API](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flow.htm)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-24 | Initial elements reference created |

---

**Maintainer**: RevPal Engineering
**Review Frequency**: Quarterly or when Salesforce releases new Flow elements
