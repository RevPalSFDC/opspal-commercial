# Runbook 1: Authoring Salesforce Flows via XML

**Version**: 1.0.0
**Last Updated**: 2025-11-12
**Audience**: Expert-level agents with XML and Salesforce metadata expertise

---

## Overview

This runbook guides agents through creating new Flows or updating existing ones using XML-based methods and the salesforce domain package tool ecosystem. We focus on **Record-Triggered Flows** (which run on record create/update) and **Auto-Launched Flows** (invocable flows without direct triggers), as these are the most common in automation projects. Scheduled Flows (for batch operations) are also covered where relevant.

### When to Use This Runbook

- Creating a new Flow from scratch
- Converting business requirements into Flow XML structure
- Understanding Flow metadata structure and elements
- Scaffolding Flows using CLI tools
- Applying element templates for rapid development

### Prerequisites

- Salesforce CLI (`sf`) installed and authenticated
- Node.js environment with salesforce domain package installed
- Understanding of Salesforce Flow concepts (elements, connectors, variables)
- Basic XML knowledge

---

## Step 1: Choose the Flow Type and Trigger

Before authoring, determine the appropriate Flow type based on automation requirements:

### Flow Type Decision Matrix

| Flow Type | When to Use | Common Use Cases | Trigger Configuration |
|-----------|-------------|------------------|----------------------|
| **Record-Triggered** | Automation should run automatically when records are created/updated | Lead assignment, Opportunity validation, Case escalation | Object, trigger timing (before/after save), entry conditions |
| **Auto-Launched** | Background process or subflow invoked by Apex/another Flow | Task reminders, data enrichment, complex calculations | No trigger - invoked programmatically |
| **Scheduled** | Batch operations that run on a schedule | Nightly data cleanup, weekly reporting, monthly rollups | Schedule configuration (frequency, start time) |
| **Screen** | Interactive user input during a guided process | Wizard experiences, data collection forms | User-initiated (button, quick action) |

### Best Practice: Flow Type Selection

**One Flow Per Object Per Trigger Context**: For Record-Triggered Flows, create separate Flows for before-save vs after-save contexts to avoid conflicts and governor limit issues.

**Example**:
-  `Account_Before_Save_Validation` (before-save trigger)
-  `Account_After_Save_Enrichment` (after-save trigger)
- L Single Flow trying to handle both contexts

**Reference**: See [FLOW_DESIGN_BEST_PRACTICES.md](../../FLOW_DESIGN_BEST_PRACTICES.md) for detailed guidance on Flow organization.

---

## Step 2: Generate Flow Template via CLI

Use the Flow Authoring CLI to scaffold the initial Flow XML structure.

### CLI Command Syntax

```bash
flow create <FlowName> --type <FlowType> --object <ObjectAPIName>
```

### Examples

#### Create Record-Triggered Flow

```bash
# Create Record-Triggered Flow on Account
flow create Account_Territory_Assignment --type Record-Triggered --object Account

# Output: Account_Territory_Assignment.flow-meta.xml created
```

#### Create Auto-Launched Flow

```bash
# Create Auto-Launched Flow for data enrichment
flow create Data_Enrichment_Helper --type Auto-Launched

# Output: Data_Enrichment_Helper.flow-meta.xml created
```

#### Create Scheduled Flow

```bash
# Create Scheduled Flow for nightly cleanup
flow create Nightly_Data_Cleanup --type Scheduled

# Output: Nightly_Data_Cleanup.flow-meta.xml created
```

### What the CLI Generates

The `flow create` command uses **flow-author.js** to generate:

1. **Base XML structure** with proper `<?xml version>` declaration
2. **Metadata envelope** (`<Flow xmlns="http://soap.sforce.com/2006/04/metadata">`)
3. **Flow properties**:
   - `apiVersion` (current API version, e.g., 62.0)
   - `status` (Active or Draft)
   - `processType` (AutoLaunchedFlow, Workflow, etc.)
4. **Trigger configuration** (for Record-Triggered):
   - `triggerType` (RecordBeforeSave, RecordAfterSave)
   - `object` (API name of the triggering object)
5. **Start element** with proper connector structure

### Generated XML Example (Record-Triggered)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <description>Automatically assign Accounts to territories based on billing state</description>
    <label>Account Territory Assignment</label>
    <processMetadataValues>
        <name>BuilderType</name>
        <value>
            <stringValue>LightningFlowBuilder</stringValue>
        </value>
    </processMetadataValues>
    <processMetadataValues>
        <name>CanvasMode</name>
        <value>
            <stringValue>FREE_FORM_CANVAS</stringValue>
        </value>
    </processMetadataValues>
    <processType>AutoLaunchedFlow</processType>
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference><!-- First element will go here --></targetReference>
        </connector>
        <object>Account</object>
        <recordTriggerType>CreateAndUpdate</recordTriggerType>
        <triggerType>RecordAfterSave</triggerType>
    </start>
    <status>Draft</status>
</Flow>
```

**Key Elements**:
- `<start>`: Defines trigger configuration
- `<recordTriggerType>`: When Flow runs (Create, Update, CreateAndUpdate, Delete)
- `<triggerType>`: Before-save (RecordBeforeSave) or after-save (RecordAfterSave)
- `<connector>`: Links to the first Flow element
- `<status>`: Draft (for testing) or Active (for production)

---

## Step 3: Apply Element Templates (If Available)

The salesforce domain package provides a library of common Flow element templates via **flow-element-templates.js**. These templates insert pre-built XML snippets with proper structure and defaults.

### Available Element Templates

The template system includes patterns for:

| Template Type | Description | Use Case |
|---------------|-------------|----------|
| **Decision** | If/Then logic with multiple outcomes | Routing, validation, conditional branching |
| **Assignment** | Set field values or variables | Update record fields, calculate values |
| **Record Lookup** | Query records from database | Find existing records, check for duplicates |
| **Record Create** | Insert new records | Create related records, log activities |
| **Record Update** | Modify existing records | Bulk updates, field modifications |
| **Loop** | Iterate over collections | Process multiple records, batch operations |
| **Subflow** | Call another Flow | Modular design, reusable logic |
| **Email Alert** | Send email notifications | Alerts, confirmations, notifications |

### Using Templates Programmatically

```javascript
const templates = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-element-templates');

// Create Decision element
const decisionXml = templates.createDecision('Status_Check', {
    conditions: [
        { field: 'Status', operator: 'EqualTo', value: 'Active' }
    ],
    defaultConnector: 'Continue_Path'
});

// Create Assignment element
const assignmentXml = templates.createAssignment('Set_Priority', {
    assignments: [
        { field: 'Priority__c', operator: 'Assign', value: 'High' }
    ]
});

// Create Record Lookup
const lookupXml = templates.createRecordLookup('Find_Existing_Contact', {
    object: 'Contact',
    filters: [
        { field: 'Email', operator: 'EqualTo', value: '{!$Record.Email}' }
    ],
    queriedFields: ['Id', 'Name', 'Email'],
    getFirstRecordOnly: true
});
```

### CLI Template Application

If using the CLI, templates can be applied after Flow creation:

```bash
# List available templates
flow template list --category core

# Show template details
flow template show lead-assignment

# Apply template with parameters
flow template apply lead-assignment \
  --name CA_Lead_Assignment \
  --params "assignmentField=State,assignmentValue=California,ownerUserId=005xx000000XXXX"
```

**Reference**: See [Runbook 3: Tools and Techniques](03-tools-and-techniques.md) for detailed template usage patterns.

---

## Step 4: Customize Flow Logic

After scaffolding the base Flow, customize its logic to meet project requirements. Agents have **three methods** for customization:

### Method 1: Natural Language CLI Modifications (Recommended for Quick Changes)

Use **flow-nlp-modifier.js** via CLI for rapid element addition/modification.

#### Syntax

```bash
flow add <FlowFile> "<Instruction>"
```

#### Examples

```bash
# Add a Decision element
flow add Account_Territory_Assignment.flow-meta.xml \
  "Add a decision called Status_Check where Status equals 'Active', then continue path A"

# Add an Assignment element
flow add Account_Territory_Assignment.flow-meta.xml \
  "Add an assignment to set Territory__c to 'West Coast'"

# Add a Record Lookup
flow add Account_Territory_Assignment.flow-meta.xml \
  "Add a Get Records to find Contacts where AccountId equals the triggering Account"
```

#### What NLP Modifier Does

The NLP modifier:
1. **Parses** the natural language instruction
2. **Maps** it to Flow element structure (Decision, Assignment, etc.)
3. **Generates** well-formed XML using templates
4. **Inserts** the XML into the Flow at the appropriate location
5. **Updates connectors** to maintain Flow continuity

**Limitations**: NLP works best for straightforward additions. Complex multi-step modifications or intricate formulas may require direct XML editing.

**Reference**: See [Runbook 3: Tools and Techniques](03-tools-and-techniques.md) for advanced NLP usage patterns.

### Method 2: Direct XML Editing (For Fine-Grained Control)

For ultimate control, edit the Flow XML directly in a text editor or IDE.

#### When to Use Direct Editing

- Complex formula expressions (REGEX, nested IF statements)
- Extensive reordering of elements
- Adding fault paths for error handling
- Configuring advanced element properties not supported by NLP
- Bulk modifications across multiple elements

#### Best Practices for Direct XML Editing

1. **Use XML-aware editor** with syntax highlighting (VS Code, IntelliJ, Sublime)
2. **Validate XML structure** after edits using `flow-xml-parser.js`
3. **Maintain proper indentation** (4 spaces per level recommended)
4. **Comment complex sections** using XML comments (`<!-- Comment -->`)
5. **Test incrementally** - make small changes, validate, test, repeat

#### Example: Adding a Decision with Complex Formula

```xml
<decisions>
    <name>Check_Revenue_Tier</name>
    <label>Check Revenue Tier</label>
    <locationX>176</locationX>
    <locationY>158</locationY>
    <defaultConnectorLabel>Default Outcome</defaultConnectorLabel>
    <defaultConnector>
        <targetReference>Standard_Processing</targetReference>
    </defaultConnector>
    <rules>
        <name>Enterprise_Tier</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.AnnualRevenue</leftValueReference>
            <operator>GreaterThanOrEqualTo</operator>
            <rightValue>
                <numberValue>1000000.0</numberValue>
            </rightValue>
        </conditions>
        <conditions>
            <leftValueReference>$Record.Type</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue>
                <stringValue>Customer</stringValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>Enterprise_Assignment</targetReference>
        </connector>
        <label>Enterprise Tier</label>
    </rules>
</decisions>
```

**Key XML Structures**:
- `<leftValueReference>`: Field or variable to evaluate
- `<operator>`: Comparison operator (EqualTo, GreaterThan, Contains, etc.)
- `<rightValue>`: Value to compare against (with type: numberValue, stringValue, booleanValue)
- `<conditionLogic>`: How to combine conditions (and, or, custom formula)
- `<connector>`: Where Flow goes if condition is true
- `<defaultConnector>`: Where Flow goes if no conditions match

**Reference**: See [FLOW_ELEMENTS_REFERENCE.md](../../FLOW_ELEMENTS_REFERENCE.md) for complete element structure documentation.

### Method 3: Programmatic Generation (For Complex or Repeated Patterns)

For complex Flows or when generating many similar Flows, use **flow-author.js** API programmatically.

#### Example: Programmatic Flow Construction

```javascript
const FlowAuthor = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-author');

// Initialize Flow Author
const flow = new FlowAuthor('Account_Routing', {
    type: 'Record-Triggered',
    object: 'Account',
    triggerType: 'RecordAfterSave',
    recordTriggerType: 'CreateAndUpdate'
});

// Add Decision element
flow.addDecision('Check_Industry', {
    conditions: [
        { field: '$Record.Industry', operator: 'EqualTo', value: 'Technology' }
    ],
    trueConnector: 'Tech_Assignment',
    falseConnector: 'Standard_Assignment'
});

// Add Assignment for Tech industry
flow.addAssignment('Tech_Assignment', {
    assignments: [
        { field: '$Record.Owner', operator: 'Assign', value: '005xx000000TechOwner' },
        { field: '$Record.Priority__c', operator: 'Assign', value: 'High' }
    ],
    nextConnector: 'End'
});

// Add Assignment for other industries
flow.addAssignment('Standard_Assignment', {
    assignments: [
        { field: '$Record.Owner', operator: 'Assign', value: '005xx000000StdOwner' }
    ],
    nextConnector: 'End'
});

// Save Flow XML
flow.save('./flows/Account_Routing.flow-meta.xml');
```

**Benefits of Programmatic Generation**:
- **Consistency**: Same patterns applied across multiple Flows
- **Scalability**: Generate dozens of Flows from configuration
- **Maintainability**: Update logic in one place, regenerate all Flows
- **Testing**: Easier to unit test Flow logic before XML generation

**Reference**: See flow-author.js API documentation in `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-author.js`

---

## Step 5: Incorporate Best-Practice Patterns

While authoring, follow Salesforce Flow best practices to ensure maintainability, performance, and reliability.

### Best Practice Checklist

#### 1. One Flow Per Object Per Trigger Context

 **Do**: Create separate Flows for before-save and after-save
```
Account_Before_Save_Validation.flow-meta.xml
Account_After_Save_Enrichment.flow-meta.xml
```

L **Don't**: Mix before-save and after-save logic in one Flow
```
Account_All_Triggers.flow-meta.xml  // Antipattern!
```

**Reason**: Salesforce processes before-save and after-save triggers separately. Combining them can cause unexpected behavior and deployment issues.

#### 2. Use Subflows for Modularity

 **Do**: Break large Flows into reusable subflows
```
Main Flow ’ calls ’ Calculate_Territory (subflow)
Main Flow ’ calls ’ Send_Notification (subflow)
```

L **Don't**: Create monolithic Flows with 50+ elements
```
Account_Master_Flow.flow-meta.xml  // 127 elements - too complex!
```

**Reason**: Subflows improve maintainability, enable reuse, and make debugging easier.

#### 3. Avoid DML Inside Loops

 **Do**: Collect records in a collection variable, then perform bulk DML outside the loop
```xml
<loops><!-- Iterate over records, add to collection --></loops>
<recordUpdates><!-- Bulk update the collection --></recordUpdates>
```

L **Don't**: Update/create records inside a loop
```xml
<loops>
    <!-- Loop iteration -->
    <recordUpdates><!-- Update inside loop - ANTIPATTERN! --></recordUpdates>
</loops>
```

**Reason**: Hits governor limits quickly. Salesforce limits you to 150 DML statements per transaction.

#### 4. Add Fault Paths for Error Handling

 **Do**: Add fault connectors to catch and handle errors
```xml
<recordUpdates>
    <name>Update_Account</name>
    <faultConnector>
        <targetReference>Error_Handler</targetReference>
    </faultConnector>
    <!-- update logic -->
</recordUpdates>
```

L **Don't**: Ignore error handling
```xml
<recordUpdates>
    <!-- No fault connector - errors will fail silently -->
</recordUpdates>
```

**Reason**: Graceful error handling prevents user-facing errors and enables logging for troubleshooting.

#### 5. Use Clear, Descriptive Names

 **Do**: Use descriptive names for all elements
```xml
<decisions>
    <name>Check_If_Account_Is_Enterprise_Customer</name>
    <label>Check If Account Is Enterprise Customer</label>
</decisions>
```

L **Don't**: Use generic names
```xml
<decisions>
    <name>Decision_1</name>
    <label>Decision 1</label>
</decisions>
```

**Reason**: Clear names improve readability and make maintenance easier.

**Reference**: Complete best practices in [FLOW_DESIGN_BEST_PRACTICES.md](../../FLOW_DESIGN_BEST_PRACTICES.md)

---

## Step 6: Save and Review the XML

Once the Flow structure is authored, perform a final review before moving to validation.

### Pre-Validation Sanity Check

#### 1. XML Well-Formedness

Verify basic XML structure:

```bash
# Use flow-xml-parser.js to check XML syntax
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-xml-parser.js validate Account_Territory_Assignment.flow-meta.xml
```

**Common XML Errors**:
- Unclosed tags (`<decision>` without `</decision>`)
- Missing required attributes (`<connector>` without `<targetReference>`)
- Invalid characters in element names (spaces, special characters)

#### 2. Required Attributes Present

For **Record-Triggered Flows**, verify:
-  `<triggerType>` is set (RecordBeforeSave or RecordAfterSave)
-  `<object>` specifies the triggering object API name
-  `<recordTriggerType>` defines when to run (Create, Update, CreateAndUpdate, Delete)

For **Auto-Launched Flows**, verify:
-  `<processType>` is set to AutoLaunchedFlow
-  Input/output variables are defined if Flow is invocable

For **Scheduled Flows**, verify:
-  `<processType>` is set to AutoLaunchedFlow
-  Schedule configuration will be set during deployment (not in XML)

#### 3. Element References Are Consistent

Verify all connector references point to valid elements:

```bash
# Use flow-diff-checker.js to identify orphaned connectors
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diff-checker.js check-connectors Account_Territory_Assignment.flow-meta.xml
```

**Common Connector Errors**:
- `<targetReference>NonExistent_Element</targetReference>` - Element doesn't exist
- Missing connector in `<start>` element
- Circular references (Element A ’ Element B ’ Element A)

#### 4. Field API Names Match Org Metadata

Verify that all field references use correct API names:

```bash
# Query org to verify field exists
sf data query --query "SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' AND QualifiedApiName = 'Territory__c'" --use-tooling-api
```

**Common Field Reference Errors**:
- Using label instead of API name (`Territory` vs `Territory__c`)
- Typos in field names (`Teritory__c` - missing 'r')
- Referencing fields that don't exist in target org

---

## Quick Reference: Flow XML Structure

### Minimal Record-Triggered Flow Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Minimal Record-Triggered Flow</label>
    <processType>AutoLaunchedFlow</processType>

    <!-- Start Element (Trigger Configuration) -->
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>First_Element</targetReference>
        </connector>
        <object>Account</object>
        <recordTriggerType>CreateAndUpdate</recordTriggerType>
        <triggerType>RecordAfterSave</triggerType>
    </start>

    <!-- Your Flow Elements Go Here -->
    <!-- <decisions>, <assignments>, <recordLookups>, etc. -->

    <status>Draft</status>
</Flow>
```

### Minimal Auto-Launched Flow Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <label>Minimal Auto-Launched Flow</label>
    <processType>AutoLaunchedFlow</processType>

    <!-- Input Variables (if needed) -->
    <variables>
        <name>inputAccountId</name>
        <dataType>String</dataType>
        <isInput>true</isInput>
        <isOutput>false</isOutput>
    </variables>

    <!-- Start Element -->
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>First_Element</targetReference>
        </connector>
    </start>

    <!-- Your Flow Elements Go Here -->

    <status>Draft</status>
</Flow>
```

---

## Tool Integration Reference

### CLI Commands Used in This Runbook

| Command | Purpose | Documentation |
|---------|---------|---------------|
| `flow create` | Generate base Flow XML | [CLI Reference](../../../cli/flow-cli.js) |
| `flow template list` | List available templates | [Template Specialist Agent](../../../agents/flow-template-specialist.md) |
| `flow template apply` | Apply template to Flow | [Template Specialist Agent](../../../agents/flow-template-specialist.md) |
| `flow add` | Add elements via NLP | [Runbook 3](03-tools-and-techniques.md) |

### Scripts Referenced

| Script | Purpose | Location |
|--------|---------|----------|
| **flow-author.js** | Programmatic Flow construction | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-author.js` |
| **flow-element-templates.js** | Element template library | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-element-templates.js` |
| **flow-nlp-modifier.js** | Natural language modification | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-nlp-modifier.js` |
| **flow-xml-parser.js** | XML parsing and validation | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-xml-parser.js` |
| **flow-diff-checker.js** | Compare and validate Flow versions | `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diff-checker.js` |

---

## Real-World Example: Lead Assignment Flow

### Requirement

Create a Record-Triggered Flow that automatically assigns Leads to the appropriate owner based on State:
- California (CA) ’ Assigned to West Coast team
- New York (NY) ’ Assigned to East Coast team
- All others ’ Assigned to National team

### Implementation Steps

#### 1. Create Base Flow

```bash
flow create Lead_State_Based_Assignment --type Record-Triggered --object Lead
```

#### 2. Add Decision for State Check

```bash
flow add Lead_State_Based_Assignment.flow-meta.xml \
  "Add a decision called Check_Lead_State with three outcomes: CA leads, NY leads, and Other"
```

#### 3. Add Assignments for Each Outcome

```bash
# California assignment
flow add Lead_State_Based_Assignment.flow-meta.xml \
  "Add an assignment called Assign_West_Coast to set OwnerId to 005xx000000WestCoast"

# New York assignment
flow add Lead_State_Based_Assignment.flow-meta.xml \
  "Add an assignment called Assign_East_Coast to set OwnerId to 005xx000000EastCoast"

# Default assignment
flow add Lead_State_Based_Assignment.flow-meta.xml \
  "Add an assignment called Assign_National to set OwnerId to 005xx000000National"
```

#### 4. Review Generated XML (Excerpt)

```xml
<decisions>
    <name>Check_Lead_State</name>
    <label>Check Lead State</label>
    <locationX>176</locationX>
    <locationY>158</locationY>
    <defaultConnectorLabel>Other</defaultConnectorLabel>
    <defaultConnector>
        <targetReference>Assign_National</targetReference>
    </defaultConnector>
    <rules>
        <name>CA_Leads</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.State</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue>
                <stringValue>CA</stringValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>Assign_West_Coast</targetReference>
        </connector>
        <label>CA Leads</label>
    </rules>
    <rules>
        <name>NY_Leads</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>$Record.State</leftValueReference>
            <operator>EqualTo</operator>
            <rightValue>
                <stringValue>NY</stringValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>Assign_East_Coast</targetReference>
        </connector>
        <label>NY Leads</label>
    </rules>
</decisions>

<assignments>
    <name>Assign_West_Coast</name>
    <label>Assign West Coast</label>
    <locationX>176</locationX>
    <locationY>278</locationY>
    <assignmentItems>
        <assignToReference>$Record.OwnerId</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>005xx000000WestCoast</stringValue>
        </value>
    </assignmentItems>
</assignments>

<!-- Additional assignments for East Coast and National... -->
```

#### 5. Validate and Test

```bash
# Validate Flow
flow validate Lead_State_Based_Assignment.flow-meta.xml --best-practices

# Deploy to sandbox for testing
flow deploy Lead_State_Based_Assignment.flow-meta.xml --target sandbox
```

---

## Troubleshooting Common Authoring Issues

### Issue 1: "Start element missing trigger configuration"

**Symptoms**: Flow XML missing `<object>`, `<triggerType>`, or `<recordTriggerType>`

**Cause**: Incomplete scaffold generation or manual editing error

**Fix**: Add required trigger elements to `<start>`:

```xml
<start>
    <object>Account</object>
    <recordTriggerType>CreateAndUpdate</recordTriggerType>
    <triggerType>RecordAfterSave</triggerType>
    <connector>
        <targetReference>First_Element</targetReference>
    </connector>
</start>
```

### Issue 2: "Connector references non-existent element"

**Symptoms**: Validation error about `<targetReference>` pointing to missing element

**Cause**: Typo in element name or element was deleted but connector wasn't updated

**Fix**: Verify element exists and update connector:

```xml
<!-- Before (broken) -->
<connector>
    <targetReference>NonExistent_Element</targetReference>
</connector>

<!-- After (fixed) -->
<connector>
    <targetReference>Actual_Element_Name</targetReference>
</connector>
```

### Issue 3: "NLP modifier couldn't parse instruction"

**Symptoms**: `flow add` command fails with "Could not interpret instruction"

**Cause**: Instruction too complex or ambiguous for NLP parser

**Fix**: Either simplify instruction or use direct XML editing:

```bash
# Too complex for NLP
flow add MyFlow.xml "Add a decision with three nested conditions using custom formula logic"

# Better: Break into steps or use direct XML
flow add MyFlow.xml "Add a decision called Complex_Check"
# Then manually edit XML to add complex formula
```

---

## Next Steps

After authoring your Flow XML:

1. **Validate Flow**: Proceed to [Runbook 4: Validation and Best Practices](04-validation-and-best-practices.md)
2. **Deploy Flow**: See [Runbook 5: Testing and Deployment](05-testing-and-deployment.md)
3. **Learn Advanced Techniques**: Review [Runbook 3: Tools and Techniques](03-tools-and-techniques.md)

---

## Related Documentation

- [FLOW_ELEMENTS_REFERENCE.md](../../FLOW_ELEMENTS_REFERENCE.md) - Complete element structure reference
- [FLOW_DESIGN_BEST_PRACTICES.md](../../FLOW_DESIGN_BEST_PRACTICES.md) - Design patterns and anti-patterns
- [FLOW_VERSION_MANAGEMENT.md](../../FLOW_VERSION_MANAGEMENT.md) - Version control and lifecycle
- [Flow CLI Documentation](../../../cli/flow-cli.js) - Complete CLI command reference

---

**Runbook Maintainer**: Salesforce Plugin Team
**Feedback**: Submit via `/reflect` command or GitHub issues
