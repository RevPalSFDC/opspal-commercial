# Runbook 4: Validation and Best Practices for XML Flow Development

**Version**: 1.0.0
**Last Updated**: 2025-11-12
**Audience**: Salesforce Agents, Flow Developers
**Prerequisite Reading**: Runbook 1 (Authoring), Runbook 2 (Designing), Runbook 3 (Tools and Techniques)

---

## Overview

Validation is **non-negotiable** in Flow XML development. Invalid Flows cause deployment failures, runtime errors, and data corruption. This runbook covers the comprehensive 12-stage validation pipeline and production-grade best practices.

### Validation Pipeline Stages

1. **Syntax Validation** - Well-formed XML structure
2. **Metadata Validation** - Required fields and valid values
3. **Formula Validation** - Salesforce formula syntax
4. **Logic Validation** - Reachable elements, connector integrity
5. **Best Practices Validation** - Bulkification, fault paths, naming
6. **Governor Limits** - DML operations, SOQL queries, CPU time
7. **Security & Permissions** - Field-level security, sharing rules
8. **Performance** - Query optimization, collection size
9. **Deployment Readiness** - Package.xml, API version
10. **Org-Specific** - Custom fields exist, objects accessible
11. **Regression** - Compare against previous version
12. **Auto-Fix and Remediation** (v3.56.0) - Automatic issue remediation

### When to Use This Runbook

Use this runbook when you need to:
- Validate Flow XML before deployment
- Troubleshoot validation failures
- Ensure compliance with best practices
- Optimize Flow performance
- Prepare for production deployment
- Review peer-developed Flows

---

## Stage 1: Syntax Validation

### Overview

Syntax validation ensures XML is well-formed and conforms to Salesforce Flow schema.

### Validation Checks

| Check | Description | Severity | Common Causes |
|-------|-------------|----------|---------------|
| Well-formed XML | Proper opening/closing tags, attribute quoting | CRITICAL | Manual editing errors |
| Valid schema | Elements match Salesforce Flow metadata schema | CRITICAL | Incorrect element names |
| Namespace correct | `xmlns="http://soap.sforce.com/2006/04/metadata"` | CRITICAL | Missing or incorrect namespace |
| API version | Valid Salesforce API version (current: 62.0) | WARNING | Outdated API version |
| Character encoding | UTF-8 encoding declaration | WARNING | Copy-paste from non-UTF-8 sources |

### CLI Validation

```bash
# Basic syntax check
flow validate MyFlow.flow-meta.xml --checks syntax

# Output:
#  XML well-formed
#  Valid Flow schema
#  Namespace correct
#  API version: 62.0
#  Character encoding: UTF-8
#
# Status: PASSED
```

### Common Syntax Errors

#### Error 1: Unclosed Element

**Error Message**:
```
XML parsing error: End tag 'decisions' not found (line 45)
```

**Cause**: Missing closing tag
```xml
<!-- L WRONG -->
<decisions>
    <name>Status_Check</name>
    <label>Status Check</label>
<!-- Missing </decisions> -->
```

**Fix**:
```xml
<!--  CORRECT -->
<decisions>
    <name>Status_Check</name>
    <label>Status Check</label>
</decisions>
```

#### Error 2: Unquoted Attribute

**Error Message**:
```
XML parsing error: Attribute value must be quoted (line 23)
```

**Cause**: Missing quotes around attribute value
```xml
<!-- L WRONG -->
<locationX>176</locationX>
```

**Fix**: Flow XML doesn't use attributes for data - use elements instead
```xml
<!--  CORRECT -->
<locationX>176</locationX>
```

#### Error 3: Invalid Character

**Error Message**:
```
XML parsing error: Invalid character in element content (line 67)
```

**Cause**: Unescaped special characters in values
```xml
<!-- L WRONG -->
<stringValue>Revenue < 1000000 & Status = "Active"</stringValue>
```

**Fix**: Use character entities
```xml
<!--  CORRECT -->
<stringValue>Revenue &lt; 1000000 &amp; Status = &quot;Active&quot;</stringValue>
```

### Syntax Best Practices

1. **Use XML formatter** - Run `flow format` after every edit
2. **Validate incrementally** - Check syntax after each modification
3. **Use IDE with XML support** - VS Code with Salesforce extensions
4. **Consistent indentation** - 4 spaces (not tabs)
5. **Line breaks** - One element per line for readability

---

## Stage 2: Metadata Validation

### Overview

Metadata validation ensures all required Flow fields are present and values are valid.

### Required Metadata Fields

| Field | Required | Valid Values | Default |
|-------|----------|--------------|---------|
| `apiVersion` | Yes | 30.0-62.0 | 62.0 |
| `label` | Yes | String (max 255 chars) | - |
| `processType` | Yes | AutoLaunchedFlow, Workflow | AutoLaunchedFlow |
| `status` | Yes | Active, Draft, Obsolete | Draft |
| `description` | No | String | - |
| `start` | Yes | Start element | - |

### Element-Specific Metadata

#### Decisions

```xml
<decisions>
    <name>Status_Check</name>           <!-- Required: Unique name -->
    <label>Status Check</label>         <!-- Required: Display label -->
    <locationX>176</locationX>          <!-- Required: X coordinate -->
    <locationY>150</locationY>          <!-- Required: Y coordinate -->
    <defaultConnector>                  <!-- Optional: Default path -->
        <targetReference>Default_Path</targetReference>
    </defaultConnector>
    <rules>                             <!-- Required: At least one rule -->
        <name>Is_Active</name>
        <conditionLogic>and</conditionLogic>
        <conditions>...</conditions>
        <connector>...</connector>
    </rules>
</decisions>
```

#### Record Lookups

```xml
<recordLookups>
    <name>Get_Account</name>            <!-- Required -->
    <label>Get Account</label>          <!-- Required -->
    <locationX>176</locationX>          <!-- Required -->
    <locationY>350</locationY>          <!-- Required -->
    <object>Account</object>            <!-- Required: Valid object API name -->
    <outputReference>AccountRecord</outputReference> <!-- Required if getFirstRecordOnly=true -->
    <queriedFields>Name</queriedFields> <!-- Optional but recommended -->
    <queriedFields>Industry</queriedFields>
</recordLookups>
```

### CLI Validation

```bash
flow validate MyFlow.flow-meta.xml --checks metadata

# Output:
#  Required fields present
#  Valid processType: AutoLaunchedFlow
#  Valid status: Draft
#  All elements have required metadata
#  locationX/locationY are multiples of 50
#
# Status: PASSED
```

### Common Metadata Errors

#### Error 1: Missing Required Field

**Error Message**:
```
Metadata validation failed: Element 'decisions' missing required field 'label'
```

**Fix**: Add missing label
```xml
<decisions>
    <name>Status_Check</name>
    <label>Status Check</label>  <!-- Add this -->
    <!-- ... -->
</decisions>
```

#### Error 2: Invalid processType

**Error Message**:
```
Invalid processType value: 'RecordTriggered'. Valid values: AutoLaunchedFlow, Workflow
```

**Fix**: Use correct processType (always `AutoLaunchedFlow` for modern Flows)
```xml
<processType>AutoLaunchedFlow</processType>
```

#### Error 3: Invalid Location Values

**Error Message**:
```
Location values must be multiples of 50 (locationX=173, locationY=147)
```

**Fix**: Round to nearest 50
```xml
<locationX>150</locationX>  <!-- Was 173 -->
<locationY>150</locationY>  <!-- Was 147 -->
```

---

## Stage 3: Formula Validation

### Overview

Formula validation checks Salesforce formula syntax within Flow formulas and conditions.

### Formula Syntax Rules

1. **Function names**: Must be valid Salesforce functions (ISBLANK, IF, TEXT, etc.)
2. **Field references**: Use `{!VariableName}` or `{!$Record.FieldName}`
3. **Operators**: `+`, `-`, `*`, `/`, `=`, `<>`, `<`, `>`, `<=`, `>=`, `&&`, `||`
4. **Data types**: Must match operation (can't add Text + Number)
5. **Parentheses**: Must be balanced

### Common Formula Patterns

#### Text Manipulation

```xml
<formulas>
    <name>Full_Name</name>
    <dataType>String</dataType>
    <expression>
        {!FirstName} &amp; " " &amp; {!LastName}
    </expression>
</formulas>
```

#### Date Calculations

```xml
<formulas>
    <name>Days_Until_Close</name>
    <dataType>Number</dataType>
    <scale>0</scale>
    <expression>
        {!$Record.CloseDate} - TODAY()
    </expression>
</formulas>
```

#### Conditional Logic

```xml
<formulas>
    <name>Discount_Percentage</name>
    <dataType>Number</dataType>
    <scale>2</scale>
    <expression>
        IF({!$Record.AnnualRevenue} > 10000000, 0.20,
        IF({!$Record.AnnualRevenue} > 1000000, 0.10,
        0.05))
    </expression>
</formulas>
```

### Formula Validation Errors

#### Error 1: Invalid Function

**Error Message**:
```
Formula error: Unknown function 'ISNULL'. Did you mean 'ISBLANK'?
```

**Cause**: Using database function instead of formula function
```xml
<!-- L WRONG -->
<expression>ISNULL({!$Record.Status__c})</expression>
```

**Fix**: Use ISBLANK for formula fields
```xml
<!--  CORRECT -->
<expression>ISBLANK(TEXT({!$Record.Status__c}))</expression>
```

#### Error 2: Data Type Mismatch

**Error Message**:
```
Formula error: Cannot compare Text with Number (line 3)
```

**Cause**: Comparing incompatible types
```xml
<!-- L WRONG -->
<expression>{!$Record.Status__c} > 1000</expression>
```

**Fix**: Convert types or fix comparison
```xml
<!--  CORRECT -->
<expression>VALUE(TEXT({!$Record.Status__c})) > 1000</expression>
```

#### Error 3: Unbalanced Parentheses

**Error Message**:
```
Formula error: Unbalanced parentheses (expected 3 closing, found 2)
```

**Cause**: Missing closing parenthesis
```xml
<!-- L WRONG -->
<expression>IF({!Amount} > 1000, "High", IF({!Amount} > 500, "Medium", "Low")</expression>
```

**Fix**: Add missing parenthesis
```xml
<!--  CORRECT -->
<expression>IF({!Amount} > 1000, "High", IF({!Amount} > 500, "Medium", "Low"))</expression>
```

### CLI Formula Validation

```bash
flow validate MyFlow.flow-meta.xml --checks formulas --verbose

# Output:
# Validating formulas...
#  Formula 'Full_Name': Text concatenation valid
#  Formula 'Days_Until_Close': Date arithmetic valid
#  Formula 'Discount_Percentage': Unbalanced parentheses
#
# Status: FAILED (1 formula error)
```

---

## Stage 4: Logic Validation

### Overview

Logic validation ensures Flow execution paths are valid and all elements are reachable.

### Logic Checks

| Check | Description | Severity | Impact |
|-------|-------------|----------|--------|
| Unreachable elements | Elements not connected to any path | WARNING | Dead code, confusion |
| Connector cycles | Infinite loops in connectors | CRITICAL | Flow never completes |
| Terminal elements | At least one path reaches end | CRITICAL | Flow hangs |
| Missing connectors | Elements without next steps | WARNING | Flow stops unexpectedly |
| Orphaned variables | Variables defined but never used | WARNING | Clutter, performance |

### Connector Validation

**Valid Connector Pattern**:
```xml
<start>
    <connector>
        <targetReference>First_Element</targetReference>
    </connector>
    <!-- ... -->
</start>

<decisions>
    <name>First_Element</name>
    <rules>
        <connector>
            <targetReference>Second_Element</targetReference>
        </connector>
    </rules>
    <defaultConnector>
        <targetReference>Third_Element</targetReference>
    </defaultConnector>
</decisions>
```

**Invalid: Cycle Detected**:
```xml
<!-- L WRONG: Element_A � Element_B � Element_A (infinite loop) -->
<decisions>
    <name>Element_A</name>
    <connector><targetReference>Element_B</targetReference></connector>
</decisions>

<assignments>
    <name>Element_B</name>
    <connector><targetReference>Element_A</targetReference></connector>
</assignments>
```

**Fix**: Add terminal condition
```xml
<!--  CORRECT: Add counter and exit condition -->
<loops>
    <name>Loop_With_Counter</name>
    <collectionReference>Items</collectionReference>
    <nextValueConnector><targetReference>Process_Item</targetReference></nextValueConnector>
    <noMoreValuesConnector><targetReference>End</targetReference></noMoreValuesConnector>
</loops>
```

### CLI Logic Validation

```bash
flow validate MyFlow.flow-meta.xml --checks logic

# Output:
# Analyzing Flow logic...
#  All elements reachable from start
#  No connector cycles detected
#  At least one terminal path exists
#  Warning: Variable 'TempValue' defined but never used
#
# Status: PASSED (1 warning)
```

---

## Stage 5: Best Practices Validation

### Overview

Best practices validation checks for production-ready patterns including bulkification, fault handling, and naming conventions.

### Critical Best Practices

#### 1. No DML Inside Loops

**L ANTI-PATTERN**:
```xml
<loops>
    <name>Loop_Accounts</name>
    <collectionReference>AccountList</collectionReference>
    <nextValueConnector>
        <targetReference>Update_Single_Account</targetReference>
    </nextValueConnector>
</loops>

<recordUpdates>
    <name>Update_Single_Account</name>
    <inputReference>Loop_Accounts</inputReference>  <!-- DML IN LOOP! -->
    <connector><targetReference>Loop_Accounts</targetReference></connector>
</recordUpdates>
```

**Impact**: Hits governor limits (150 DML statements per transaction)

** CORRECT PATTERN**:
```xml
<loops>
    <name>Loop_Accounts</name>
    <collectionReference>AccountList</collectionReference>
    <nextValueConnector>
        <targetReference>Add_To_Collection</targetReference>
    </nextValueConnector>
    <noMoreValuesConnector>
        <targetReference>Bulk_Update</targetReference>
    </noMoreValuesConnector>
</loops>

<assignments>
    <name>Add_To_Collection</name>
    <assignmentItems>
        <assignToReference>UpdatedAccounts</assignToReference>
        <operator>Add</operator>
        <value><elementReference>Loop_Accounts</elementReference></value>
    </assignmentItems>
    <connector><targetReference>Loop_Accounts</targetReference></connector>
</assignments>

<recordUpdates>
    <name>Bulk_Update</name>
    <inputReference>UpdatedAccounts</inputReference>  <!-- Single DML! -->
</recordUpdates>
```

#### 2. Fault Paths on All DML

**L MISSING FAULT PATH**:
```xml
<recordUpdates>
    <name>Update_Account</name>
    <inputReference>$Record</inputReference>
    <!-- No faultConnector! -->
</recordUpdates>
```

**Impact**: Silent failures, no error logging

** WITH FAULT PATH**:
```xml
<recordUpdates>
    <name>Update_Account</name>
    <inputReference>$Record</inputReference>
    <faultConnector>
        <targetReference>Log_Update_Error</targetReference>
    </faultConnector>
</recordUpdates>

<assignments>
    <name>Log_Update_Error</name>
    <assignmentItems>
        <assignToReference>ErrorLog</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Update failed: {!$Flow.FaultMessage}</stringValue>
        </value>
    </assignmentItems>
</assignments>
```

#### 3. One Flow Per Trigger Context

**L ANTI-PATTERN**: Single Flow handles Before-Save + After-Save
```xml
<start>
    <object>Account</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordBeforeSave</triggerType>
    <!-- Can't also be RecordAfterSave! -->
</start>
```

**Impact**: Confusion, difficult to maintain, performance issues

** CORRECT**: Separate Flows
```
Account_Before_Save.flow-meta.xml  (Before-Save validations)
Account_After_Save.flow-meta.xml   (After-Save updates, notifications)
```

#### 4. Meaningful Naming Conventions

**L POOR NAMES**:
```xml
<decisions>
    <name>Decision1</name>
    <rules><name>Rule1</name></rules>
</decisions>
```

** DESCRIPTIVE NAMES**:
```xml
<decisions>
    <name>Territory_Assignment_Check</name>
    <rules><name>West_Coast_High_Revenue</name></rules>
</decisions>
```

### Best Practices Checklist

```bash
flow validate MyFlow.flow-meta.xml --checks bestpractices

# Output:
# Checking best practices...
#  No DML inside loops
#  All DML operations have fault paths
#  One trigger context per Flow
#  Descriptive element names
#  Warning: 3 elements exceed recommended complexity (cyclomatic > 10)
#  Warning: Flow has 8 DML operations (recommended max: 5)
#
# Status: PASSED (2 warnings)
```

---

## Stage 6: Governor Limits Validation

### Overview

Salesforce enforces governor limits on Flow operations. Pre-deployment validation catches limit violations before deployment.

### Flow Governor Limits

| Resource | Per-Transaction Limit | Per-Flow Limit | Recommendation |
|----------|----------------------|----------------|----------------|
| DML statements | 150 | - | < 5 per Flow |
| SOQL queries | 100 | - | < 3 per Flow |
| Records retrieved by SOQL | 50,000 | - | Use filters |
| Records processed by DMLs | 10,000 | - | Batch large operations |
| CPU time | 10,000 ms (sync), 60,000 ms (async) | - | Optimize formulas |
| Heap size | 6 MB (sync), 12 MB (async) | - | Limit collection size |
| Flow elements | - | 2,000 | Keep Flows focused |
| Active Flows per object | - | 2,000 | Archive obsolete Flows |

### Validation Checks

#### DML Count Check

```bash
flow validate MyFlow.flow-meta.xml --checks governorlimits

# Output:
# Analyzing governor limits...
#  DML operations: 3 (recommended: < 5)
#  SOQL queries: 2 (recommended: < 3)
#  Warning: Record Update on line 145 could process > 10,000 records
#   Recommendation: Add entry criteria to limit record volume
#
# Status: PASSED (1 warning)
```

#### CPU Time Estimation

```bash
flow validate MyFlow.flow-meta.xml --checks governorlimits --verbose

# Output:
# Estimated CPU time (sync): 450 ms
# Breakdown:
# - Decision elements: 50 ms (5 decisions � 10 ms)
# - Formulas: 150 ms (3 complex formulas � 50 ms)
# - SOQL queries: 200 ms (2 queries � 100 ms)
# - DML operations: 50 ms (1 update � 50 ms)
#
# Status: Within limits (< 10,000 ms)
```

### Optimization Strategies

#### 1. Reduce SOQL Queries

**Before (3 queries)**:
```xml
<recordLookups>
    <name>Get_Account</name>
    <object>Account</object>
    <queriedFields>Name</queriedFields>
</recordLookups>

<recordLookups>
    <name>Get_Account_Industry</name>
    <object>Account</object>
    <queriedFields>Industry</queriedFields>
</recordLookups>

<recordLookups>
    <name>Get_Account_Owner</name>
    <object>Account</object>
    <queriedFields>OwnerId</queriedFields>
</recordLookups>
```

**After (1 query)**:
```xml
<recordLookups>
    <name>Get_Account</name>
    <object>Account</object>
    <queriedFields>Name</queriedFields>
    <queriedFields>Industry</queriedFields>
    <queriedFields>OwnerId</queriedFields>
</recordLookups>
```

#### 2. Bulkify DML Operations

**Before (Loop with DML - hits limit at 150 records)**:
```xml
<loops>
    <name>Loop_Accounts</name>
    <nextValueConnector>
        <targetReference>Update_Account</targetReference>
    </nextValueConnector>
</loops>

<recordUpdates>
    <name>Update_Account</name>
    <inputReference>Loop_Accounts</inputReference>
</recordUpdates>
```

**After (Collection DML - handles 10,000 records)**:
```xml
<loops>
    <name>Loop_Accounts</name>
    <nextValueConnector>
        <targetReference>Add_To_Collection</targetReference>
    </nextValueConnector>
    <noMoreValuesConnector>
        <targetReference>Bulk_Update</targetReference>
    </noMoreValuesConnector>
</loops>

<assignments>
    <name>Add_To_Collection</name>
    <assignmentItems>
        <assignToReference>UpdatedAccounts</assignToReference>
        <operator>Add</operator>
        <value><elementReference>Loop_Accounts</elementReference></value>
    </assignmentItems>
</assignments>

<recordUpdates>
    <name>Bulk_Update</name>
    <inputReference>UpdatedAccounts</inputReference>
</recordUpdates>
```

---

## Stage 7: Security & Permissions Validation

### Overview

Security validation checks field-level security, object permissions, and sharing rules.

### Security Checks

| Check | Description | Risk Level |
|-------|-------------|------------|
| Object access | User can read/edit target object | HIGH |
| Field-level security | User can read/edit all referenced fields | HIGH |
| Sharing rules | Record access respects sharing model | MEDIUM |
| System mode | Flow runs in system context vs user context | LOW |

### Validation Pattern

```bash
flow validate MyFlow.flow-meta.xml --checks security --org production

# Output:
# Checking security and permissions...
#  Object 'Account' accessible by all profiles
#  Field 'Account.Territory__c' not accessible by 'Sales User' profile
#  Field 'Account.Annual_Contract_Value__c' restricted by FLS
#
# Recommendations:
# - Grant 'Sales User' profile read access to Territory__c
# - Update Flow to run in System Mode or grant FLS access
#
# Status: FAILED
```

### Running in System Mode

To bypass field-level security, configure Flow to run in System Mode:

**In Flow Builder UI**:
1. Open Flow
2. Click gear icon � Settings
3. "How should this process run?" � Select "Run As: System"

**Note**: Cannot set via XML - must configure in Flow Builder UI after deployment

---

## Stage 8: Performance Validation

### Overview

Performance validation identifies bottlenecks and optimization opportunities.

### Performance Metrics

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Total elements | < 50 | 50-100 | > 100 |
| Decision complexity | < 5 rules | 5-10 rules | > 10 rules |
| Collection size | < 200 items | 200-1,000 | > 1,000 |
| Formula complexity | < 3 nested IFs | 3-5 | > 5 |
| Execution time (est.) | < 500 ms | 500-2,000 ms | > 2,000 ms |

### CLI Performance Check

```bash
flow validate MyFlow.flow-meta.xml --checks performance --profile

# Output:
# Performance analysis...
#  Total elements: 23 (optimal)
#  Decision 'Territory_Check': 3 rules (optimal)
#  Decision 'Complex_Scoring': 12 rules (high complexity)
#   Recommendation: Split into multiple decisions or use formula
#  Collection 'AllAccounts': ~5,000 items (high volume)
#   Recommendation: Add filters to reduce collection size
#
# Estimated execution time: 1,450 ms
# Breakdown:
# - Decisions: 350 ms (35%)
# - SOQL queries: 600 ms (41%)
# - Formulas: 400 ms (28%)
# - DML operations: 100 ms (7%)
```

### Optimization Techniques

#### 1. Simplify Complex Decisions

**Before (12 rules - hard to maintain)**:
```xml
<decisions>
    <name>Territory_Assignment</name>
    <rules><name>CA_Tech_Large</name></rules>
    <rules><name>CA_Tech_Medium</name></rules>
    <rules><name>CA_Finance_Large</name></rules>
    <!-- ... 9 more rules ... -->
</decisions>
```

**After (Use formula for complexity)**:
```xml
<formulas>
    <name>Territory_Code</name>
    <expression>
        IF({!State} = "CA" &amp;&amp; {!Industry} = "Technology" &amp;&amp; {!Revenue} > 10000000, "CA_TECH_L",
        IF({!State} = "CA" &amp;&amp; {!Industry} = "Technology" &amp;&amp; {!Revenue} > 1000000, "CA_TECH_M",
        <!-- ... other conditions ... -->
        "DEFAULT"))
    </expression>
</formulas>

<decisions>
    <name>Territory_Assignment</name>
    <rules>
        <name>Route_By_Code</name>
        <conditions>
            <leftValueReference>Territory_Code</leftValueReference>
            <operator>NotEqualTo</operator>
            <rightValue><stringValue>DEFAULT</stringValue></rightValue>
        </conditions>
    </rules>
</decisions>
```

#### 2. Filter Collections Early

**Before (Process all, filter later)**:
```xml
<recordLookups>
    <name>Get_All_Accounts</name>
    <object>Account</object>
    <getFirstRecordOnly>false</getFirstRecordOnly>
    <!-- No filters! Returns 10,000+ records -->
</recordLookups>

<loops>
    <name>Loop_Accounts</name>
    <!-- Process all accounts -->
</loops>
```

**After (Filter in SOQL)**:
```xml
<recordLookups>
    <name>Get_Active_Large_Accounts</name>
    <object>Account</object>
    <filterLogic>and</filterLogic>
    <filters>
        <field>Status__c</field>
        <operator>EqualTo</operator>
        <value><stringValue>Active</stringValue></value>
    </filters>
    <filters>
        <field>AnnualRevenue</field>
        <operator>GreaterThan</operator>
        <value><numberValue>1000000</numberValue></value>
    </filters>
    <getFirstRecordOnly>false</getFirstRecordOnly>
    <!-- Now returns ~200 records -->
</recordLookups>
```

---

## Pre-Deployment Checklist

Before deploying any Flow to production, complete this checklist:

### Functional Validation

- [ ] All test scenarios pass
- [ ] Edge cases handled (null values, empty collections, etc.)
- [ ] Error messages are user-friendly
- [ ] Fault paths tested and working

### Technical Validation

- [ ] XML syntax valid
- [ ] No validation errors or warnings
- [ ] Best practices followed (no DML in loops, fault paths, etc.)
- [ ] Governor limits within safe thresholds
- [ ] Performance optimized (< 500ms execution time)

### Security & Permissions

- [ ] Field-level security checked
- [ ] Object permissions verified
- [ ] Sharing rules respected
- [ ] System/User mode configured correctly

### Documentation

- [ ] Flow description populated
- [ ] Element labels descriptive
- [ ] Complex logic commented
- [ ] Deployment notes prepared

### Deployment Prep

- [ ] Tested in sandbox matching production
- [ ] Rollback plan prepared
- [ ] Stakeholders notified
- [ ] Deployment window scheduled (if needed)
- [ ] Monitoring plan in place

### Post-Deployment

- [ ] Verify Flow activated successfully
- [ ] Monitor debug logs for first 24 hours
- [ ] Check error rates (should be < 1%)
- [ ] Validate business outcomes

---

## Common Validation Failures and Fixes

### Failure: "Element not found"

**Error**:
```
Validation error: Element 'Update_Account_Status' referenced by 'Territory_Check' not found
```

**Cause**: Broken connector reference

**Fix**: Verify element name matches exactly (case-sensitive)
```xml
<!-- Ensure this matches -->
<decisions>
    <name>Territory_Check</name>
    <connector>
        <targetReference>Update_Account_Status</targetReference>  <!-- Must match element name exactly -->
    </connector>
</decisions>

<recordUpdates>
    <name>Update_Account_Status</name>  <!-- Name must match reference -->
</recordUpdates>
```

### Failure: "Cyclomatic complexity too high"

**Error**:
```
Best practice violation: Decision 'Complex_Router' has 15 rules (recommended max: 10)
```

**Fix**: Split into multiple decisions or use formula
```xml
<!-- Split complex decision -->
<decisions>
    <name>Industry_Check</name>
    <rules>
        <name>Tech_Industry</name>
        <connector><targetReference>Tech_Territory_Check</targetReference></connector>
    </rules>
</decisions>

<decisions>
    <name>Tech_Territory_Check</name>
    <!-- Nested decision for tech-specific logic -->
</decisions>
```

### Failure: "DML inside loop"

**Error**:
```
Best practice violation: Record Update 'Update_Account' is inside loop 'Loop_Accounts' (DML in loop)
```

**Fix**: Use collection pattern (see Stage 5, Best Practice #1)

---

## Stage 12: Auto-Fix and Remediation (v3.56.0)

### Overview

Auto-fix automatically remediates 8 common Flow violation patterns, reducing manual correction time by 70-80%.

### Supported Fix Patterns

| Pattern | Auto-Fix Action | Safety | Example |
|---------|----------------|--------|---------|
| Hard-coded IDs | Convert to formula variables | ✅ Safe | `001xx000000XXXX` → `{!Account.Id}` |
| Missing descriptions | Add template descriptions | ✅ Safe | Empty → "Automated Flow: {FlowName}" |
| Outdated API versions | Update to v62.0 | ✅ Safe | `<apiVersion>50.0` → `<apiVersion>62.0` |
| Missing fault paths | Add default error handlers | ⚠️ Review | No faultConnector → ErrorScreen added |
| Copy naming | Rename to descriptive | ⚠️ Review | `Copy_of_Flow` → Prompts for rename |
| Unused variables | Remove from metadata | ✅ Safe | Variable declared but never used → Removed |
| Unconnected elements | Remove orphaned elements | ⚠️ Review | Element not in Flow path → Removed |
| Trigger order | Set to 1000 (default) | ✅ Safe | No trigger order → Set to 1000 |

### CLI Usage

#### Basic Auto-Fix Workflow
```bash
# Step 1: Preview fixes (dry-run)
flow validate MyFlow.xml --auto-fix --dry-run

# Output:
# 🔧 Auto-Fix Preview: MyFlow.xml
# ────────────────────────────────────────────────────────────
# 1. Hard-coded ID detected (line 45)
#    Fix: Convert to formula variable {!Account.Id}
#    Safety: ✅ Safe
#
# 2. Unused variable 'loopAsset' (line 12)
#    Fix: Remove variable from metadata
#    Safety: ✅ Safe
#
# 3. Missing fault path on recordUpdate (line 87)
#    Fix: Add ErrorScreen with default error handler
#    Safety: ⚠️ Review recommended
#
# Would fix 3 issue(s). Run without --dry-run to apply.

# Step 2: Apply fixes
flow validate MyFlow.xml --auto-fix

# Output:
# ✅ Applied 3 fix(es)
# 💾 Saved to: MyFlow.fixed.flow-meta.xml
```

#### Batch Auto-Fix
```bash
# Fix all Flows in directory
for flow in flows/*.xml; do
  flow validate "$flow" --auto-fix
done
```

### Configuration (.flow-validator.yml)

Create `.flow-validator.yml` for org-specific rules:

```yaml
rules:
  # Enable/disable auto-fix patterns
  HardcodedId:
    severity: warning
    auto-fix: true

  UnusedVariable:
    severity: warning
    auto-fix: true

exceptions:
  # Flow-specific exceptions
  flows:
    Legacy_Account_Update:
      - HardcodedId  # Known business-critical ID

  # Global exceptions
  global:
    UnusedVariable:
      - loopAsset  # Kept for future use
```

### Common Scenarios

#### Scenario 1: Pre-Deployment Auto-Fix
**Use Case**: Fix all validation issues before deploying to production

```bash
# 1. Run full validation
flow validate MyFlow.xml --checks all --best-practices

# 2. Auto-fix what's fixable
flow validate MyFlow.xml --auto-fix

# 3. Manually fix remaining issues
# (issues that require architectural changes)

# 4. Final validation
flow validate MyFlow.fixed.xml --checks all
```

#### Scenario 2: Legacy Flow Cleanup
**Use Case**: Clean up old Flows with accumulated tech debt

```bash
# 1. Preview all fixes
flow validate LegacyFlow.xml --auto-fix --dry-run

# 2. Review proposed fixes carefully
# (legacy Flows may have intentional patterns)

# 3. Apply fixes incrementally
flow validate LegacyFlow.xml --auto-fix

# 4. Test in sandbox
# (verify no behavior changes)
```

#### Scenario 3: CI/CD Integration
**Use Case**: Auto-fix in CI/CD pipeline

```yaml
# .github/workflows/flow-validation.yml
- name: Auto-Fix Flows
  run: |
    flow validate flows/*.xml --auto-fix
    git add flows/*.fixed.xml

- name: Generate SARIF
  run: |
    flow validate flows/*.xml --sarif --output report.sarif

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: report.sarif
```

### Safety Considerations

**✅ Always Safe** (apply without review):
- Hard-coded IDs → Formula variables
- Missing descriptions
- Outdated API versions
- Unused variables
- Trigger order

**⚠️ Review Recommended**:
- Missing fault paths (verify error handling logic)
- Copy naming (ensure new name is appropriate)
- Unconnected elements (verify element is truly orphaned)

**Best Practice**: Always use `--dry-run` first to preview fixes before applying.

### Performance Impact

- **Auto-fix processing**: 200-500ms per Flow
- **Total overhead**: <5% of validation duration
- **Time savings**: 70-80% reduction in manual correction time

### Documentation

- **Comprehensive Guide**: `docs/FLOW_SCANNER_INTEGRATION.md`
- **Quick Reference**: `docs/FLOW_SCANNER_QUICK_REFERENCE.md`
- **Configuration Template**: `templates/.flow-validator.yml`

---

## Summary

**Validation is mandatory** - Never deploy without full validation:

1. **Syntax** - Well-formed XML
2. **Metadata** - Required fields present
3. **Formulas** - Valid Salesforce formulas
4. **Logic** - No unreachable elements or cycles
5. **Best Practices** - Bulkification, fault paths, naming
6. **Governor Limits** - Within Salesforce limits
7. **Security** - FLS and sharing rules
8. **Performance** - Optimized execution

**Recommendation**: Use automated validation pipeline
```bash
flow validate MyFlow.flow-meta.xml --checks all --fix-auto
```

---

## Next Steps

- **Runbook 5**: Testing and Deployment strategies
- **Runbook 6**: Monitoring, Maintenance, and Rollback procedures

---

## Related Documentation

- **Runbook 1**: Authoring Flows via XML
- **Runbook 2**: Designing Flows for Project Scenarios
- **Runbook 3**: Tools and Techniques
- **Validation Pipeline**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js`
- **Best Practices Guide**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/docs/FLOW_DESIGN_BEST_PRACTICES.md`

---

**Questions or Issues?** Submit feedback via `/reflect` command to help improve this runbook.
