# Runbook 3: Tools and Techniques for XML Flow Development

**Version**: 1.0.0
**Last Updated**: 2025-11-12
**Audience**: Salesforce Agents, Flow Developers
**Prerequisite Reading**: Runbook 1 (Authoring Flows via XML), Runbook 2 (Designing Flows for Project Scenarios)

---

## Overview

This runbook covers the four primary methods for developing and modifying Salesforce Flows via XML:

1. **Template-Driven Generation** - Start from production-ready patterns
2. **Natural Language Modification** - Add elements using conversational instructions
3. **Direct XML Editing** - Manual XML manipulation for complex requirements
4. **Auto-Fix and Remediation** (v3.56.0) - Automated correction of common validation issues

Each method has strengths and optimal use cases. Mature Flow development typically uses all four in a **multi-modal workflow**.

### When to Use This Runbook

Use this runbook when you need to:
- Choose the most efficient Flow development method for your scenario
- Understand the capabilities and limitations of each technique
- Implement hybrid workflows combining multiple methods
- Troubleshoot method-specific issues
- Optimize development speed while maintaining quality

---

## Method 1: Template-Driven Flow Generation

### Overview

The Template Library provides 6 production-ready Flow patterns that handle 70-80% of common automation scenarios. Templates include pre-configured elements, best practice patterns (bulkification, fault paths), and parameterization for customization.

### Available Templates

| Template | Category | Use Case | Complexity |
|----------|----------|----------|------------|
| `lead-assignment` | Process Automation | Route leads based on criteria | Low |
| `opportunity-validation` | Process Automation | Validate data at stage gates | Low |
| `account-enrichment` | Data Quality | Auto-segment accounts | Medium |
| `case-escalation` | Process Automation | Escalate cases by priority/age | Low |
| `task-reminder` | Process Automation | Send reminders for tasks | Low |
| `contact-deduplication` | Data Quality | Detect duplicate contacts | High |

**Location**: `.claude-plugins/opspal-salesforce/templates/flows/`

### CLI Commands

#### List Available Templates

```bash
flow template list --category core

# Output:
# Core Templates (6 available):
# - lead-assignment: Auto-assign leads based on criteria
# - opportunity-validation: Validate opportunity data at stage gates
# - account-enrichment: Enrich account data on create/update
# - case-escalation: Auto-escalate cases by priority and age
# - task-reminder: Send reminders for overdue/upcoming tasks
# - contact-deduplication: Detect and flag duplicate contacts
```

#### Show Template Details

```bash
flow template show lead-assignment

# Output:
# Template: lead-assignment
# Category: core
# Description: Auto-assign leads based on criteria
#
# Parameters:
# - assignmentField (required): Field to evaluate (e.g., State, Industry)
# - assignmentValue (required): Value to match (e.g., California)
# - ownerUserId (required): User ID to assign to (005...)
#
# Elements Included:
# - Entry conditions (Status = 'Open - Not Contacted')
# - Decision: Assignment_Criteria
# - Assignment: Set_New_Owner
# - Record Update: Update_Lead_Owner
# - Fault path with error logging
```

#### Apply Template with Parameters

```bash
flow template apply lead-assignment \
  --name CA_Lead_Assignment \
  --params "assignmentField=State,assignmentValue=California,ownerUserId=005xx000000XXXX" \
  --output-dir ./flows

# Creates: flows/CA_Lead_Assignment.flow-meta.xml
```

### Programmatic Template Usage

For agents and scripts, use the `TemplateRegistry` class:

```javascript
const { TemplateRegistry } = require('./scripts/lib/flow-template-registry');
const registry = new TemplateRegistry();

// Get template metadata
const template = registry.getTemplate('lead-assignment');
console.log(`Parameters: ${template.parameters.map(p => p.name).join(', ')}`);

// Apply template with parameters
const flowPath = await registry.applyTemplate('lead-assignment', 'CA_Lead_Assignment', {
  assignmentField: 'State',
  assignmentValue: 'California',
  ownerUserId: '005xx000000XXXX'
}, {
  outputDir: './flows',
  activateOnDeploy: false
});

console.log(`Flow created: ${flowPath}`);
```

### Template Customization Workflow

**Recommended Pattern**: Apply template � Customize via NLP � Fine-tune with XML editing

```bash
# Step 1: Apply base template
flow template apply account-enrichment \
  --name Account_Territory_Assignment \
  --params "industryMapping=Tech:West,Finance:East,revenueThreshold=1000000" \
  --output-dir ./flows

# Step 2: Add custom logic via NLP
flow add Account_Territory_Assignment.flow-meta.xml \
  "After the industry assignment, add a decision called High_Value_Check. If Annual Revenue is greater than 5000000 then set High_Value_Account to true"

# Step 3: Review generated XML and fine-tune if needed
code flows/Account_Territory_Assignment.flow-meta.xml
```

### When to Use Templates

** Use Templates When**:
- The scenario matches a template pattern (70-80% match)
- You need a fast starting point with best practices built-in
- The team is new to Flow XML development
- Consistency across similar Flows is important

**L Avoid Templates When**:
- The scenario is highly custom (< 50% match)
- You need precise control over every element detail
- The template would require removing more elements than you keep
- Performance optimization requires non-standard patterns

### Template Best Practices

1. **Always review generated XML** - Templates are starting points, not final solutions
2. **Validate parameters** - Use `flow template show` to check required parameters
3. **Test before deploy** - Templates are production-ready but must be tested in your org context
4. **Document customizations** - If you modify a template extensively, document changes
5. **Version control** - Commit template-generated Flows immediately to track customizations

---

## Method 2: Natural Language Modification

### Overview

The NLP Flow Modifier (`flow-nlp-modifier.js`) allows you to add Flow elements using conversational instructions. It translates natural language into valid Flow XML, reducing the need for manual XML editing.

**Best For**: Adding elements to existing Flows, iterative development, prototyping

### Supported Operations

| Operation | Syntax Pattern | Example |
|-----------|---------------|---------|
| Add Decision | `"Add a decision called {Name} if {condition} then {outcome}"` | `"Add a decision called Status_Check if Status equals Active then Continue"` |
| Add Assignment | `"Set {variable} to {value}"` | `"Set IsProcessed to true"` |
| Add Record Lookup | `"Get {object} where {condition}"` | `"Get Account where Id equals AccountId"` |
| Add Record Update | `"Update {object} set {field} to {value}"` | `"Update Account set Status to Active"` |
| Add Subflow | `"Call subflow {name} with {inputs}"` | `"Call subflow Calculate_Commission with OpportunityId"` |
| Add Loop | `"Loop through {collection}"` | `"Loop through AccountsToUpdate"` |

### CLI Usage

```bash
flow add <flow-file> "<instruction>" [options]

# Options:
#   --dry-run         Show what would be added without modifying file
#   --verbose         Show detailed parsing and generation logs
#   --validate-after  Run validation after modification
```

#### Example: Add Decision

```bash
flow add Lead_Assignment.flow-meta.xml \
  "Add a decision called Industry_Check. If Industry equals Technology then route to Tech_Queue, if Industry equals Finance then route to Finance_Queue, otherwise route to General_Queue"

# Output:
#  Parsed instruction successfully
#  Generated Decision element: Industry_Check
#  Added 3 rules: Technology, Finance, Default
#  Inserted at optimal position (after entry conditions)
#  Updated connectors
#  Validated Flow syntax
#
# Flow updated: Lead_Assignment.flow-meta.xml
```

#### Example: Add Assignment with Multiple Fields

```bash
flow add Account_Enrichment.flow-meta.xml \
  "Set Segment to Enterprise and Priority to High and Last_Enriched_Date to TODAY"

# Generates Assignment element with 3 assignmentItems
```

#### Example: Add Record Lookup with Filters

```bash
flow add Opportunity_Validation.flow-meta.xml \
  "Get OpportunityLineItems where OpportunityId equals RecordId and Product_Family equals Hardware"

# Generates Record Lookup with:
# - object: OpportunityLineItem
# - filters: OpportunityId = {!RecordId} AND Product_Family__c = 'Hardware'
# - getFirstRecordOnly: false (returns collection)
```

### Programmatic Usage

```javascript
const FlowNLPModifier = require('./scripts/lib/flow-nlp-modifier');
const modifier = new FlowNLPModifier();

// Add element to existing Flow
const result = await modifier.addElement(
  './flows/Lead_Assignment.flow-meta.xml',
  "Add a decision called Revenue_Check if Annual Revenue is greater than 1000000 then Assign_Enterprise_Rep otherwise Assign_Standard_Rep"
);

if (result.success) {
  console.log(`Added ${result.elementType}: ${result.elementName}`);
  console.log(`Updated ${result.connectorsModified} connectors`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

### NLP Parsing Rules

The NLP modifier uses pattern matching and keyword recognition:

1. **Condition Parsing**:
   - `equals`, `is`, `=` � EqualTo
   - `not equals`, `is not`, `!=` � NotEqualTo
   - `greater than`, `>` � GreaterThan
   - `less than`, `<` � LessThan
   - `contains` � Contains
   - `starts with` � StartsWith

2. **Operator Parsing**:
   - `and` � AND logic
   - `or` � OR logic
   - Defaults to AND if not specified

3. **Data Type Inference**:
   - Numbers � numberValue
   - `true`/`false` � booleanValue
   - `TODAY`, `NOW` � dateTimeValue with formula
   - Quotes � stringValue
   - Field references � elementReference

4. **Variable Reference Detection**:
   - `RecordId`, `Record.Field` � `{!$Record.Field}`
   - Known global constants � `{!$System.Today}`
   - Custom variables preserved as-is

### Limitations and Workarounds

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Complex formula expressions | Cannot parse multi-line formulas | Use direct XML editing for formulas |
| Nested loops | Cannot generate loop within loop | Create subflow for inner loop |
| Screen elements | Limited screen field support | Use direct XML for complex screens |
| Fault path configuration | Cannot add fault handlers via NLP | Add fault paths manually in XML |
| Element positioning | Uses heuristic placement | Adjust locationX/Y in XML if needed |
| Bulk operations | May not optimize for bulkification | Review generated XML for DML in loops |

**Workaround Pattern**: Use NLP for 80% of element structure, then direct XML edit for the remaining 20%

### NLP Best Practices

1. **Start simple** - Add one element per instruction for clarity
2. **Use explicit field names** - `"Set Account.Status__c to Active"` vs `"Set status to active"`
3. **Review generated XML** - Always verify the output matches your intent
4. **Dry-run first** - Use `--dry-run` flag to preview changes
5. **Iterative approach** - Add elements incrementally and validate after each addition
6. **Fault paths** - Add manually after NLP generates core logic
7. **Formatting** - Run `flow format` after NLP modifications to ensure consistent indentation

### Common NLP Patterns

**Pattern 1: Decision with Multiple Rules**
```bash
flow add MyFlow.flow-meta.xml \
  "Add a decision called Priority_Router. If Case Priority equals Critical then Escalate_Immediately, if Priority equals High then Notify_Manager, if Priority equals Medium then Add_To_Queue, otherwise Standard_Processing"
```

**Pattern 2: Assignment with Calculations**
```bash
flow add MyFlow.flow-meta.xml \
  "Set Total_Value to Quantity multiplied by Unit_Price"
# Generates formula: {!Quantity} * {!Unit_Price}
```

**Pattern 3: Conditional Record Update**
```bash
# Step 1: Add decision
flow add MyFlow.flow-meta.xml \
  "Add a decision called Should_Update if Last_Modified_Date is older than 30 days"

# Step 2: Add update on success path
flow add MyFlow.flow-meta.xml \
  "Update Account set Last_Reviewed_Date to TODAY"
```

---

## Method 3: Direct XML Editing

### Overview

Direct XML editing provides complete control over Flow structure, element properties, and metadata. Essential for complex scenarios, performance optimization, and troubleshooting.

**Best For**: Complex logic, formula manipulation, precise element positioning, performance tuning

### When to Use Direct XML Editing

** Use Direct XML When**:
- Implementing complex formulas with multiple nested functions
- Optimizing bulkification patterns (collections, DML outside loops)
- Fine-tuning element positioning for Flow Builder visualization
- Adding fault paths and error handling
- Implementing advanced features (scheduled paths, wait conditions)
- Troubleshooting NLP-generated XML
- Migrating from other automation tools (precise control needed)

**L Avoid Direct XML When**:
- Simple element additions (use NLP instead)
- Starting from scratch (use templates first)
- You're unfamiliar with Flow XML structure (risk of syntax errors)

### IDE Setup for XML Editing

**Recommended**: Visual Studio Code with Salesforce Extensions

#### VS Code Extensions

1. **Salesforce Extension Pack** (salesforce.salesforcedx-vscode)
   - Syntax highlighting for `.flow-meta.xml`
   - Schema validation
   - Auto-completion for Flow elements

2. **XML Tools** (DotJoshJohnson.xml)
   - Format XML (`Shift+Alt+F`)
   - XPath evaluation
   - XML to text conversion

3. **Salesforce Flow Extension** (ajinkya-hingne.salesforce-flow-helper)
   - Flow element snippets
   - Quick navigation between elements
   - Connector validation

#### VS Code Settings

```json
{
  "xml.format.splitAttributes": true,
  "xml.format.preserveSpace": ["label", "description"],
  "files.associations": {
    "*.flow-meta.xml": "xml"
  },
  "editor.formatOnSave": true,
  "editor.tabSize": 4
}
```

### XML Structure Deep Dive

#### Element Hierarchy

```
Flow (root)
   apiVersion
   label
   description
   processType
   start (entry point)
      locationX, locationY
      connector (first element)
      object (Record-Triggered only)
      recordTriggerType (Record-Triggered only)
      triggerType (Record-Triggered only)
      filterLogic (entry conditions)
      filters[] (entry conditions)
   decisions[]
   assignments[]
   recordLookups[]
   recordCreates[]
   recordUpdates[]
   recordDeletes[]
   loops[]
   subflows[]
   screens[]
   waits[]
   variables[]
   status (Active, Draft, Obsolete)
```

#### Critical Attributes

**locationX, locationY**: Canvas positioning (multiples of 50)
```xml
<locationX>176</locationX>
<locationY>0</locationY>
```

**connector**: Links elements together
```xml
<connector>
    <targetReference>Next_Element_Name</targetReference>
</connector>
```

**faultConnector**: Error handling path
```xml
<faultConnector>
    <targetReference>Error_Handler</targetReference>
</faultConnector>
```

### Common XML Editing Patterns

#### Pattern 1: Add Fault Path to Element

Before (no fault handling):
```xml
<recordUpdates>
    <name>Update_Account</name>
    <inputReference>AccountsToUpdate</inputReference>
</recordUpdates>
```

After (with fault path):
```xml
<recordUpdates>
    <name>Update_Account</name>
    <inputReference>AccountsToUpdate</inputReference>
    <faultConnector>
        <targetReference>Log_Update_Error</targetReference>
    </faultConnector>
</recordUpdates>

<!-- Add error logging assignment -->
<assignments>
    <name>Log_Update_Error</name>
    <label>Log Update Error</label>
    <locationX>176</locationX>
    <locationY>500</locationY>
    <assignmentItems>
        <assignToReference>ErrorMessage</assignToReference>
        <operator>Assign</operator>
        <value>
            <elementReference>$Flow.FaultMessage</elementReference>
        </value>
    </assignmentItems>
</assignments>
```

#### Pattern 2: Convert to Bulkified Pattern

Before (DML inside loop - BAD):
```xml
<loops>
    <name>Loop_Accounts</name>
    <collectionReference>AccountList</collectionReference>
    <iterationOrder>Asc</iterationOrder>
    <nextValueConnector>
        <targetReference>Update_Single_Account</targetReference>
    </nextValueConnector>
    <noMoreValuesConnector>
        <targetReference>End</targetReference>
    </noMoreValuesConnector>
</loops>

<recordUpdates>
    <name>Update_Single_Account</name>
    <inputReference>Loop_Accounts</inputReference>
    <connector>
        <targetReference>Loop_Accounts</targetReference>
    </connector>
</recordUpdates>
```

After (Bulk DML outside loop - GOOD):
```xml
<loops>
    <name>Loop_Accounts</name>
    <collectionReference>AccountList</collectionReference>
    <iterationOrder>Asc</iterationOrder>
    <nextValueConnector>
        <targetReference>Process_Account</targetReference>
    </nextValueConnector>
    <noMoreValuesConnector>
        <targetReference>Bulk_Update_Accounts</targetReference>
    </noMoreValuesConnector>
</loops>

<assignments>
    <name>Process_Account</name>
    <assignmentItems>
        <assignToReference>Loop_Accounts.Status__c</assignToReference>
        <operator>Assign</operator>
        <value><stringValue>Processed</stringValue></value>
    </assignmentItems>
    <assignmentItems>
        <assignToReference>UpdatedAccountCollection</assignToReference>
        <operator>Add</operator>
        <value><elementReference>Loop_Accounts</elementReference></value>
    </assignmentItems>
    <connector>
        <targetReference>Loop_Accounts</targetReference>
    </connector>
</assignments>

<!-- Single DML operation after loop completes -->
<recordUpdates>
    <name>Bulk_Update_Accounts</name>
    <inputReference>UpdatedAccountCollection</inputReference>
</recordUpdates>
```

#### Pattern 3: Add Scheduled Path (Time-Based Automation)

```xml
<start>
    <locationX>50</locationX>
    <locationY>0</locationY>
    <connector>
        <targetReference>Initial_Check</targetReference>
    </connector>
    <object>Opportunity</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>
    <!-- Add scheduled path -->
    <scheduledPaths>
        <name>Reminder_7_Days_Before_Close</name>
        <connector>
            <targetReference>Send_Reminder_Email</targetReference>
        </connector>
        <label>7 Days Before Close Date</label>
        <offsetNumber>-7</offsetNumber>
        <offsetUnit>Days</offsetUnit>
        <timeSource>RecordField</timeSource>
        <timeSourceField>CloseDate</timeSourceField>
    </scheduledPaths>
</start>
```

### XML Editing Best Practices

1. **Validate after every change** - Run `flow validate` after manual edits
2. **Use consistent formatting** - Run `flow format` to maintain readability
3. **Comment complex logic** - Use `<description>` tags liberally
4. **Test incrementally** - Don't make 10 changes then test; test after each significant change
5. **Backup before editing** - Always keep a working copy before manual XML changes
6. **Use version control** - Commit after each logical change
7. **Follow naming conventions** - Element names: `PascalCase`, Variables: `camelCase`

### Troubleshooting XML Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Element <X> references non-existent element <Y>` | Broken connector | Verify targetReference matches actual element name |
| `Invalid Flow XML: Duplicate element name` | Two elements with same name | Rename one element |
| `Required field missing: processType` | Missing metadata | Add `<processType>AutoLaunchedFlow</processType>` |
| `Location values must be multiples of 50` | Invalid coordinates | Round locationX/Y to nearest 50 |
| `Connector cycle detected` | Infinite loop | Check connector paths, ensure terminal elements |

---

## Choosing the Right Approach

### Decision Matrix

Use this matrix to select the optimal method for your task:

| Scenario | Recommended Method | Rationale |
|----------|-------------------|-----------|
| New Flow matching template pattern | Template + NLP customization | Fast start, best practices included |
| Adding 3-5 standard elements | NLP only | Quick, low risk of syntax errors |
| Complex formula with nested functions | Direct XML | NLP cannot parse complex formulas |
| Bulkification optimization needed | Direct XML | Requires precise collection handling |
| Migration from Workflow/Process Builder | Template + Direct XML | Template structure, XML for migration specifics |
| Prototype/POC development | NLP + dry-run validation | Fast iteration, easy changes |
| Production-critical Flow | Template + Direct XML + full testing | Maximum control and quality |
| Adding fault paths | Direct XML | NLP doesn't support fault connectors |
| Screen Flow with complex UI | Direct XML | Screen elements too complex for NLP |
| Scheduled paths or wait conditions | Direct XML | Advanced features not in NLP |

### Hybrid Workflow Example

**Scenario**: Create Account Territory Assignment Flow with complex scoring logic

**Step 1: Template (30 seconds)**
```bash
flow template apply account-enrichment \
  --name Account_Territory_Assignment \
  --params "industryMapping=Tech:West,Finance:East" \
  --output-dir ./flows
```

**Step 2: NLP Additions (2 minutes)**
```bash
# Add decision for revenue-based routing
flow add Account_Territory_Assignment.flow-meta.xml \
  "Add a decision called Revenue_Tier if Annual Revenue is greater than 10000000 then Enterprise_Tier, if greater than 1000000 then Mid_Market_Tier, otherwise SMB_Tier"

# Add assignment for territory score
flow add Account_Territory_Assignment.flow-meta.xml \
  "Set Territory_Score to 0"
```

**Step 3: Direct XML for Complex Formula (5 minutes)**
```xml
<!-- Open in VS Code and add complex scoring formula -->
<assignments>
    <name>Calculate_Territory_Score</name>
    <assignmentItems>
        <assignToReference>Territory_Score</assignToReference>
        <operator>Assign</operator>
        <value>
            <elementReference>Calculate_Score_Formula</elementReference>
        </value>
    </assignmentItems>
</assignments>

<formulas>
    <name>Calculate_Score_Formula</name>
    <dataType>Number</dataType>
    <scale>2</scale>
    <expression>
        (IF({!$Record.AnnualRevenue} > 10000000, 50, 0)) +
        (IF({!$Record.NumberOfEmployees} > 1000, 30, 0)) +
        (IF({!$Record.Industry} = "Technology", 20, 0))
    </expression>
</formulas>
```

**Step 4: Direct XML for Fault Paths (2 minutes)**
```xml
<!-- Add faultConnector to record updates -->
<recordUpdates>
    <name>Update_Account_Territory</name>
    <inputReference>$Record</inputReference>
    <faultConnector>
        <targetReference>Territory_Update_Failed</targetReference>
    </faultConnector>
</recordUpdates>
```

**Total Time**: ~10 minutes vs 30+ minutes for pure XML editing

---

## Tool Integration Reference

### Flow Author Scripts

**Primary Script**: `flow-author.js`
```bash
node scripts/lib/flow-author.js create \
  --name "Account_Validation" \
  --type "Record-Triggered" \
  --object "Account" \
  --trigger "RecordBeforeSave"
```

**Capabilities**:
- Scaffold new Flows with proper structure
- Apply templates programmatically
- Validate Flow XML syntax
- Generate Flow documentation

### Flow NLP Modifier

**Primary Script**: `flow-nlp-modifier.js`
```bash
node scripts/lib/flow-nlp-modifier.js \
  --flow "./flows/MyFlow.flow-meta.xml" \
  --instruction "Add a decision called Status_Check if Status equals Active" \
  --dry-run
```

**Capabilities**:
- Parse natural language instructions
- Generate Flow XML elements
- Update connector paths
- Validate modifications

### Flow Validator

**Primary Script**: `flow-validator.js`
```bash
node scripts/lib/flow-validator.js \
  --flow "./flows/MyFlow.flow-meta.xml" \
  --checks "syntax,metadata,formulas,logic,bestpractices"
```

**Validation Checks**:
- XML syntax (well-formed, valid structure)
- Metadata completeness (required fields)
- Formula syntax (valid Salesforce formulas)
- Logic errors (unreachable elements, connector cycles)
- Best practices (bulkification, fault paths, naming)

### Template Registry

**Primary Class**: `TemplateRegistry`
```javascript
const { TemplateRegistry } = require('./scripts/lib/flow-template-registry');
const registry = new TemplateRegistry();

// List templates by category
const coreTemplates = registry.listTemplates('core');

// Get template details
const template = registry.getTemplate('lead-assignment');
console.log(template.parameters);

// Apply template
const flowPath = await registry.applyTemplate('lead-assignment', 'MyFlow', params);
```

### Deployment Manager

**Primary Script**: `flow-deployment-manager.js`
```bash
node scripts/lib/flow-deployment-manager.js deploy \
  --flows "./flows/*.flow-meta.xml" \
  --org "production" \
  --activate
```

**Capabilities**:
- Pre-deployment validation
- Batch deployment
- Activation on deploy
- Rollback on failure

---

## Example Workflow: Contact Validation Flow

Let's build a complete Contact validation Flow using all three methods.

### Requirement

**Business Need**: Validate Contact data before save
- Check for duplicate email addresses
- Ensure required fields are populated
- Set Territory based on State
- Log validation results

### Step 1: Template Foundation (Method 1)

Since there's no exact template match, start with the closest pattern:

```bash
# No direct template - start from scratch with CLI
flow create Contact_Validation \
  --type Record-Triggered \
  --object Contact \
  --trigger RecordBeforeSave
```

Generated XML structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Contact Validation</label>
    <processType>AutoLaunchedFlow</processType>
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <object>Contact</object>
        <recordTriggerType>Create</recordTriggerType>
        <triggerType>RecordBeforeSave</triggerType>
    </start>
    <status>Draft</status>
</Flow>
```

### Step 2: Add Core Logic with NLP (Method 2)

```bash
# Add duplicate check
flow add Contact_Validation.flow-meta.xml \
  "Get Contact where Email equals Email and Id not equals RecordId"

# Add decision for duplicate handling
flow add Contact_Validation.flow-meta.xml \
  "Add a decision called Duplicate_Check if Get_Contact has records then Block_Save otherwise Continue_Validation"

# Add required field check
flow add Contact_Validation.flow-meta.xml \
  "Add a decision called Required_Fields_Check if LastName is blank or Email is blank then Block_Save otherwise Continue_Validation"

# Add territory assignment decision
flow add Contact_Validation.flow-meta.xml \
  "Add a decision called Territory_Assignment if MailingState equals CA then West, if MailingState in TX,AZ,NM then Southwest, otherwise Default_Territory"
```

### Step 3: Refine with Direct XML (Method 3)

Open in VS Code and add:

**1. Complex formula for email validation**:
```xml
<formulas>
    <name>Is_Valid_Email</name>
    <dataType>Boolean</dataType>
    <expression>
        AND(
            NOT(ISBLANK({!$Record.Email})),
            CONTAINS({!$Record.Email}, "@"),
            CONTAINS({!$Record.Email}, "."),
            NOT(CONTAINS({!$Record.Email}, " "))
        )
    </expression>
</formulas>
```

**2. Error messages for screen**:
```xml
<assignments>
    <name>Set_Duplicate_Error</name>
    <assignmentItems>
        <assignToReference>$Record.addError</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>A Contact with this email address already exists.</stringValue>
        </value>
    </assignmentItems>
</assignments>

<assignments>
    <name>Set_Invalid_Email_Error</name>
    <assignmentItems>
        <assignToReference>$Record.addError</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Please enter a valid email address.</stringValue>
        </value>
    </assignmentItems>
</assignments>
```

**3. Fault paths on all DML operations**:
```xml
<recordUpdates>
    <name>Update_Territory</name>
    <inputReference>$Record</inputReference>
    <faultConnector>
        <targetReference>Territory_Update_Failed</targetReference>
    </faultConnector>
</recordUpdates>

<assignments>
    <name>Territory_Update_Failed</name>
    <assignmentItems>
        <assignToReference>ValidationLog</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Territory update failed: {!$Flow.FaultMessage}</stringValue>
        </value>
    </assignmentItems>
</assignments>
```

**4. Optimize connector positioning**:
```xml
<!-- Adjust locationX and locationY for clean Flow Builder visualization -->
<decisions>
    <name>Duplicate_Check</name>
    <locationX>176</locationX>
    <locationY>150</locationY>
    <!-- ... -->
</decisions>

<decisions>
    <name>Required_Fields_Check</name>
    <locationX>176</locationX>
    <locationY>350</locationY>
    <!-- ... -->
</decisions>

<decisions>
    <name>Territory_Assignment</name>
    <locationX>176</locationX>
    <locationY>550</locationY>
    <!-- ... -->
</decisions>
```

### Step 4: Validate and Deploy

```bash
# Validate syntax, logic, and best practices
flow validate Contact_Validation.flow-meta.xml --best-practices

# Deploy to sandbox for testing
flow deploy Contact_Validation.flow-meta.xml --org sandbox --activate

# After testing, deploy to production
flow deploy Contact_Validation.flow-meta.xml --org production --activate
```

---

## Method 4: Auto-Fix and Remediation (v3.56.0)

### Overview

Auto-fix automatically remediates 8 common validation patterns, providing the fastest path from validation issues to working Flow. This method leverages the Flow Scanner Integration to eliminate manual correction time for common issues.

**When this method excels**: Legacy Flow cleanup, pre-deployment preparation, batch remediation, API version standardization, unused variable removal.

**Time savings**: 70-80% reduction in manual correction time for supported patterns.

### When to Use Auto-Fix

**✅ Use Auto-Fix When**:
- Cleaning up legacy Flows with accumulated tech debt
- Preparing Flows for production deployment
- Batch-fixing common issues across multiple Flows
- Standardizing API versions and naming conventions
- Removing unused variables and orphaned elements
- Adding missing fault paths to improve error handling
- Fixing hard-coded IDs before moving between environments

**❌ Avoid Auto-Fix When**:
- Flow requires architectural changes (infinite loops, security contexts)
- Uncertainty about whether element is truly unused
- Legacy Flow with intentional non-standard patterns (document exceptions instead)
- First time working with a Flow (understand it first)
- Complex business logic that requires manual review

**Decision Criteria**: If the issue is a syntax/structure problem with a clear fix pattern, use auto-fix. If it requires business logic understanding, fix manually.

### Quick Start

**Basic Auto-Fix Workflow**:
```bash
# Step 1: Preview fixes (ALWAYS dry-run first)
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run

# Output shows:
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

# Step 2: Review the proposed fixes

# Step 3: Apply fixes
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix

# Output:
# ✅ Applied 3 fix(es)
# 💾 Saved to: MyFlow.fixed.flow-meta.xml

# Step 4: Validate fixed Flow
node scripts/lib/flow-validator.js MyFlow.fixed.flow-meta.xml --checks all
```

### Supported Fix Patterns

| Pattern | Auto-Fix Action | Safety | Example | Time Savings |
|---------|----------------|--------|---------|--------------|
| Hard-coded IDs | Convert to formula variables | ✅ Safe | `001xx000000XXXX` → `{!Account.Id}` | 5-10 min/Flow |
| Missing descriptions | Add template descriptions | ✅ Safe | Empty → "Automated Flow: {FlowName}" | 1-2 min/Flow |
| Outdated API versions | Update to v62.0 | ✅ Safe | `<apiVersion>50.0` → `<apiVersion>62.0` | 1 min/Flow |
| Missing fault paths | Add default error handlers | ⚠️ Review | No faultConnector → ErrorScreen added | 5-10 min/Flow |
| Copy naming | Rename to descriptive | ⚠️ Review | `Copy_of_Flow` → Prompts for rename | 2-3 min/Flow |
| Unused variables | Remove from metadata | ✅ Safe | Variable declared but never used → Removed | 2-5 min/Flow |
| Unconnected elements | Remove orphaned elements | ⚠️ Review | Element not in Flow path → Removed | 3-5 min/Flow |
| Trigger order | Set to 1000 (default) | ✅ Safe | No trigger order → Set to 1000 | 1 min/Flow |

**Safety Levels**:
- ✅ **Safe**: Apply without review (deterministic, no business logic impact)
- ⚠️ **Review**: Preview and validate before applying (structural changes)

**Average Time Savings**: 20-45 minutes per Flow (70-80% reduction)

### Advanced Usage

#### Selective Auto-Fix (Pattern-Specific)
```bash
# Fix only specific pattern types (when available in future versions)
node scripts/lib/flow-validator.js MyFlow.xml \
  --auto-fix-type HardcodedId,UnusedVariable
```

#### Configuration-Driven Auto-Fix
Create `.flow-validator.yml` to customize auto-fix behavior:
```yaml
auto-fix:
  enabled: true
  patterns:
    - HardcodedId
    - UnusedVariable
    - MissingDescription
    - OutdatedAPIVersion

  # Disable specific patterns
  disabled-patterns:
    - MissingFaultPath  # Review manually for this org

exceptions:
  flows:
    Legacy_Account_Update:
      - HardcodedId  # Known business-critical ID
```

#### Batch Auto-Fix
Fix multiple Flows in parallel:
```bash
# Preview all fixes
for flow in flows/*.xml; do
  echo "=== $flow ==="
  node scripts/lib/flow-validator.js "$flow" --auto-fix --dry-run
done

# Apply fixes to all Flows
for flow in flows/*.xml; do
  node scripts/lib/flow-validator.js "$flow" --auto-fix
done

# Or use batch operations for parallel processing
# (See flow-batch-operator agent for advanced batch operations)
```

### Integration with Other Methods

Auto-fix **complements** other development methods:

#### Template-Driven → Auto-Fix
```bash
# 1. Generate from template
node scripts/lib/flow-template-registry.js apply lead-assignment \
  --name CA_Lead_Assignment \
  --params "assignmentField=State,assignmentValue=California"

# 2. Auto-fix generated Flow
node scripts/lib/flow-validator.js CA_Lead_Assignment.xml --auto-fix

# Benefit: Ensures template-generated Flows meet all current standards
```

#### NLP Modification → Auto-Fix
```bash
# 1. Modify with natural language
node scripts/lib/flow-nlp-modifier.js \
  --flow MyFlow.xml \
  --instruction "Add decision called Status_Check if Status equals Active then Continue"

# 2. Auto-fix modifications
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix

# Benefit: Cleans up any issues introduced by NLP modifications
```

#### Direct XML → Auto-Fix
```bash
# 1. Edit XML directly
vim MyFlow.xml

# 2. Fix any issues introduced
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix

# Benefit: Safety net for manual XML editing
```

**Recommended Workflow**:
```
[Any Method] → Auto-Fix → Validate → Deploy
```

Auto-fix as a **final cleanup step** before deployment ensures all Flows meet current standards regardless of authoring method.

### Best Practices

**1. Always Dry-Run First**
```bash
# ALWAYS preview before applying
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run
```

**Why**: Preview shows exactly what will change, preventing unexpected modifications.

**2. Review High-Impact Fixes**
Focus manual review on:
- Fault path additions (verify error handling logic)
- Copy naming (ensure new name is appropriate)
- Unconnected element removals (verify element is truly orphaned)

**3. Test in Sandbox**
```bash
# Apply fixes in sandbox first
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix

# Deploy to sandbox
flow deploy MyFlow.fixed.xml --org sandbox --activate

# Test thoroughly
flow test MyFlow --org sandbox

# Deploy to production only after sandbox testing
flow deploy MyFlow.fixed.xml --org production --activate
```

**4. Version Control Everything**
```bash
# Commit before auto-fix
git add flows/MyFlow.xml
git commit -m "feat: MyFlow before auto-fix"

# Apply fixes
node scripts/lib/flow-validator.js flows/MyFlow.xml --auto-fix

# Commit after auto-fix
git add flows/MyFlow.fixed.xml
git commit -m "fix: Auto-fix validation issues in MyFlow"
```

**5. Use Configuration Files for Org-Specific Rules**
Create `.flow-validator.yml` to:
- Disable patterns that don't apply to your org
- Document known exceptions with comments
- Customize severity levels based on risk tolerance

**Example**:
```yaml
rules:
  HardcodedId:
    severity: warning  # Lower severity for this org

  MissingFaultPath:
    severity: error    # Higher severity (critical for this org)

exceptions:
  flows:
    Legacy_Flow:
      - HardcodedId  # Known business-critical ID, documented in ADR-0023
```

### Performance Comparison

| Method | Time to Fix 10 Issues | Best For | Scalability |
|--------|---------------------|----------|-------------|
| **Manual Editing** | 30-60 minutes | Complex architectural changes | Does not scale |
| **Auto-Fix** | 2-5 minutes | Common validation issues | Highly scalable |
| **Template-Driven** | 5-10 minutes | New Flows from scratch | Medium scale |
| **NLP Modification** | 10-15 minutes | Incremental element addition | Medium scale |

**Auto-fix is 10-20x faster** for common validation issues.

**Scalability Comparison**:
- **Manual Editing**: 50 Flows × 45 min = 37.5 hours
- **Auto-Fix**: 50 Flows × 3 min = 2.5 hours (15x faster)

### Real-World Example: Legacy Flow Cleanup

**Scenario**: Clean up 20 legacy Flows (v50.0) with accumulated tech debt before production deployment.

**Without Auto-Fix** (Manual):
- 20 Flows × 45 min average = 15 hours
- High error risk from manual edits
- Inconsistent fixes across Flows

**With Auto-Fix**:
```bash
# Preview all issues
for flow in legacy-flows/*.xml; do
  echo "=== $flow ==="
  node scripts/lib/flow-validator.js "$flow" --auto-fix --dry-run
done

# Review summary of proposed fixes
# (Takes ~30 minutes for all 20 Flows)

# Apply fixes
for flow in legacy-flows/*.xml; do
  node scripts/lib/flow-validator.js "$flow" --auto-fix
done

# Validate all fixed Flows
for flow in legacy-flows/*.fixed.xml; do
  node scripts/lib/flow-validator.js "$flow" --checks all
done
```

**Results**:
- **Time**: 1 hour total (vs 15 hours manual)
- **Consistency**: Same fixes applied to all Flows
- **Error Rate**: Near-zero (automated fixes are deterministic)

**ROI**: 14 hours saved, 93% time reduction

### Common Use Cases

**Use Case 1: Pre-Deployment Cleanup**
```bash
# Before deploying to production
node scripts/lib/flow-validator.js MyFlow.xml --checks all --best-practices
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix
node scripts/lib/flow-validator.js MyFlow.fixed.xml --checks all
```

**Use Case 2: API Version Standardization**
```bash
# Standardize all Flows to v62.0
for flow in flows/*.xml; do
  node scripts/lib/flow-validator.js "$flow" --auto-fix
done
```

**Use Case 3: Environment Migration**
```bash
# Before moving from sandbox to production
# (Removes sandbox-specific IDs, adds fault paths)
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run
# Review, then apply
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix
```

**Use Case 4: CI/CD Integration**
```yaml
# .github/workflows/flow-validation.yml
- name: Auto-Fix Flows
  run: |
    for flow in flows/*.xml; do
      node scripts/lib/flow-validator.js "$flow" --auto-fix
    done

- name: Validate Fixed Flows
  run: |
    for flow in flows/*.fixed.xml; do
      node scripts/lib/flow-validator.js "$flow" --checks all --sarif --output report.sarif
    done

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: report.sarif
```

### Documentation

- **Comprehensive Guide**: `docs/FLOW_SCANNER_INTEGRATION.md` (600+ lines)
- **Quick Reference**: `docs/FLOW_SCANNER_QUICK_REFERENCE.md` (400+ lines)
- **Configuration Template**: `templates/.flow-validator.yml` (173 lines)
- **Validation Best Practices**: Runbook 4, Stage 12

---

## Summary

**Multi-Modal Development** combines the strengths of all four methods:

1. **Templates** - Fast start with production patterns
2. **NLP** - Quick additions with low syntax risk
3. **Direct XML** - Precise control for complex logic
4. **Auto-Fix** (v3.56.0) - 70-80% faster remediation of common issues

**Recommended Workflow**:
```
Template (if available) → NLP for standard elements → Direct XML for complex features → Auto-Fix → Validate → Deploy
```

**Time Savings**: Multi-modal approach reduces development time by 60-70% vs pure XML editing, and auto-fix eliminates 70-80% of manual correction time for supported patterns.

---

## Next Steps

- **Runbook 4**: Validation and Best Practices for XML Flow Development
- **Runbook 5**: Testing and Deployment strategies
- **Runbook 6**: Monitoring, Maintenance, and Rollback procedures

---

## Related Documentation

- **Runbook 1**: Authoring Flows via XML (Flow type selection, scaffolding)
- **Runbook 2**: Designing Flows for Project Scenarios (10 production patterns)
- **Flow CLI Reference**: `.claude-plugins/opspal-salesforce/docs/FLOW_CLI_REFERENCE.md`
- **Template Library**: `.claude-plugins/opspal-salesforce/templates/flows/README.md`
- **NLP Modifier Guide**: `.claude-plugins/opspal-salesforce/scripts/lib/flow-nlp-modifier.md`

---

**Questions or Issues?** Submit feedback via `/reflect` command to help improve this runbook.
