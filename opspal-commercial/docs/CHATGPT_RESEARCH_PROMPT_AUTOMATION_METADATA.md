# ChatGPT Research Prompt: Salesforce Automation Metadata Extraction

**Copy and paste this entire prompt into ChatGPT to get comprehensive API guidance**

---

## Context

I'm building a comprehensive Salesforce automation audit system that analyzes Flows, Apex Triggers, Apex Classes, and Workflow Rules. The goal is to generate:

1. **Master Automation Inventory** - Complete catalog with columns:
   - Name, Type, Status, Object(s), Trigger Events, Entry Conditions, Purpose/Description, Risk Score, Conflicts Detected, Severity, Last Modified, API Version, Namespace, Package Type, Automation ID

2. **Cascade Analysis** - Automation chains showing which automations trigger other automations

3. **Conflict Analysis** - Detection of automation conflicts with specific details:
   - Which fields are modified by multiple automations
   - Overlapping trigger events and conditions
   - Execution order issues
   - Governor limit pressure points

## Research Parameters

**IMPORTANT - Please follow these constraints when providing guidance:**

### 1. API Methods (Official APIs ONLY)
- ✅ **USE**: Tooling API queries via Salesforce CLI
- ✅ **USE**: Metadata API retrieval via `sf project retrieve start`
- ✅ **USE**: Standard REST API queries (if applicable)
- ❌ **DO NOT USE**: UI scraping, browser automation, or unofficial APIs
- ❌ **DO NOT USE**: Undocumented endpoints or workarounds

**Why**: This is a programmatic audit system that must be reliable, supportable, and compliant with Salesforce API policies.

### 2. Code Examples (Node.js Required)
Please provide all code examples using:
- **Language**: Node.js (ES6+ syntax acceptable)
- **Salesforce CLI**: `sf` commands via `execSync()` (not `sfdx` legacy commands)
- **XML Parsing**: `xml2js` library (already in use)
- **JSON Parsing**: Native `JSON.parse()` on CLI output

**Example of our current pattern**:
```javascript
const { execSync } = require('child_process');

// Tooling API query
const query = "SELECT Id, Name FROM ApexTrigger";
const cmd = `sf data query --query "${query}" --use-tooling-api --target-org myorg --json`;
const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
const triggers = result.result.records;

// Metadata API retrieve
const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org myorg --json`;
const retrieveResult = JSON.parse(execSync(retrieveCmd, { encoding: 'utf8' }));
```

### 3. Output Format (Consolidated Report with Implementation Details)
Please structure your response as:

**Part A: Quick Reference Tables**
- API field mapping tables (e.g., "Data Needed → API Object → Field Path")
- Comparison tables (e.g., "FlowDefinitionView vs FlowDefinition vs Metadata API")

**Part B: Complete SOQL/API Examples**
- Full queries ready to test (not partial snippets)
- Expected output structure (sample JSON)
- Error handling patterns

**Part C: Implementation Code Snippets**
- Node.js functions for each extraction task
- XML parsing examples using `xml2js`
- CSV generation examples (how to format complex data for CSV columns)

**Part D: Best Practices & Gotchas**
- Performance considerations (batch sizes, API limits)
- Edge cases (inactive flows, managed packages, no entry criteria)
- API version differences

**Goal**: I should be able to copy your code examples, adapt them to my codebase, and have working extraction within 1-2 hours.

## What I'm Currently Extracting

### Apex Triggers (Working Well ✅)
- **API**: ApexTrigger object via Tooling API
- **Query**: `SELECT Id, Name, TableEnumOrId, Status, Body, ApiVersion, LastModifiedDate FROM ApexTrigger`
- **What I Get**: Full source code (Body field), basic metadata, trigger object
- **Entry Conditions**: Extracted via regex pattern matching in Apex code (Trigger.isInsert, RecordType checks, field value checks)
- **Purpose/Description**: Extracted from JavaDoc comments in source code

### Apex Classes (Working Well ✅)
- **API**: ApexClass object via Tooling API
- **Query**: `SELECT Id, Name, Status, Body, ApiVersion, LastModifiedDate FROM ApexClass`
- **What I Get**: Full source code (Body field), basic metadata
- **Purpose/Description**: Extracted from JavaDoc comments

### Flows (PARTIAL - Gaps Below ❌)
- **Primary API**: FlowDefinitionView via Tooling API
- **Query**: `SELECT DurableId, ActiveVersionId, LatestVersionId, ProcessType, DeveloperName, NamespacePrefix, LastModifiedDate FROM FlowDefinitionView WHERE IsActive = true`
- **Fallback API**: Metadata API retrieve + XML parsing of `.flow-meta.xml` files
- **What I Get**: Name, ProcessType, Status, basic metadata
- **What I'm MISSING**:
  - ❌ Trigger object (which sObject the flow runs on)
  - ❌ Trigger type (RecordAfterSave, RecordBeforeSave, Scheduled, etc.)
  - ❌ Record trigger type (Create, Update, Delete)
  - ❌ Complete entry criteria (formulas, filter conditions, filter logic)
  - ❌ Which fields the flow modifies (field assignments in RecordUpdate elements)

### Workflow Rules (Working Well ✅)
- **API**: WorkflowRule object
- **Query**: Works via Metadata API
- **Entry Conditions**: Successfully extracted

## Critical Gaps I Need Help With

### Gap 1: Complete Flow Trigger Metadata 🔴

**Current Output in Master Inventory CSV:**
```csv
Name,Type,Status,Object(s),Trigger Events,Entry Conditions,Purpose/Description
MyAccountFlow,Flow,Active,N/A,N/A,Not Available,Flow for account updates
```

**What I Need:**
```csv
Name,Type,Status,Object(s),Trigger Events,Entry Conditions,Purpose/Description
MyAccountFlow,Flow,Active,Account,RecordAfterSave: Create/Update,Formula: Type = 'Customer' AND Rating != null,Updates related opportunities
```

**Questions:**
1. What is the best API/object to query to get:
   - Flow trigger object (sObject API name)
   - Trigger type (RecordAfterSave, RecordBeforeSave, Scheduled, etc.)
   - Record trigger type (Create, Update, Delete, or combination)

2. Is this data available in:
   - FlowDefinition object (vs FlowDefinitionView)?
   - Flow object via Tooling API?
   - Flow Metadata API (requires XML parsing)?

3. What are the exact field names/paths to query?

4. Are there version differences (e.g., API 62.0 vs older versions)?

### Gap 2: Flow Entry Criteria Details 🔴

**Current State:**
I'm extracting basic entry criteria from `.flow-meta.xml` parsing:
```javascript
// From flow.start element
triggerType: "RecordAfterSave"
recordTriggerType: "Update"
```

**What I'm Missing:**
1. **Complete formula-based entry criteria**
   - Example: `AND(ISCHANGED(StageName), TEXT(Type) = 'Customer', Amount > 10000)`
   - How to extract from XML or API query?

2. **Filter-based entry criteria** (criteriaItems)
   - Individual filter items (field, operator, value)
   - Filter logic (e.g., "1 AND (2 OR 3)")
   - How to query and structure this data?

3. **Entry criteria vs. filter criteria distinction**
   - What's the difference in the metadata?
   - Which API fields contain what?

**Questions:**
1. What XML element(s) in `.flow-meta.xml` contain entry criteria formulas?
2. Is there a Tooling API query that returns entry criteria without XML parsing?
3. How are filter criteria structured (JSON? XML array? Nested object)?
4. Best practice for representing complex entry criteria in CSV format (200 char limit)?

### Gap 3: Field Operations in Flows 🔴

**Current State:**
I have NO visibility into which fields a Flow modifies.

**What I Need:**
For each Flow, extract:
1. Which fields are assigned values (RecordUpdate elements)
2. Whether fields are read vs written
3. Field formulas used in assignments

**Questions:**
1. How to extract field assignments from Flow metadata?
   - Is this in the XML structure under `<recordUpdates>`?
   - API query that returns field operations?

2. What's the structure of RecordUpdate elements in `.flow-meta.xml`?
   ```xml
   <recordUpdates>
     <name>Update_Account</name>
     <inputAssignments>
       <field>Rating</field>
       <value>
         <stringValue>Hot</stringValue>
       </value>
     </inputAssignments>
   </recordUpdates>
   ```

3. Best practice for querying and parsing this at scale (100+ flows)?

### Gap 4: Conflict Analysis Specificity 🔴

**Current Conflict Detection (What I Have):**
```javascript
{
  conflictId: "MULTI_TRIGGER_1",
  severity: "HIGH",
  rule: "MULTI_TRIGGER_SAME_EVENT",
  object: "Account",
  event: "after insert",
  triggerCount: 3,
  involved: ["AccountTrigger1", "AccountTrigger2", "AccountTrigger3"],
  recommendation: "Consolidate triggers into single Handler pattern"
}
```

**What's Missing:**
- ❌ Which SPECIFIC fields are being modified by each trigger/flow
- ❌ Whether the field modifications conflict (e.g., both set Rating to different values)
- ❌ Exact overlap in entry conditions (e.g., both check RecordType = 'Customer')

**What I Need:**
```javascript
{
  conflictId: "FIELD_COLLISION_1",
  severity: "CRITICAL",
  rule: "FIELD_WRITE_COLLISION",
  object: "Account",
  field: "Rating",
  automations: [
    {
      name: "AccountTrigger1",
      type: "ApexTrigger",
      operation: "Sets Rating = 'Hot' when Type = 'Customer'",
      timing: "after insert"
    },
    {
      name: "AccountFlowUpdate",
      type: "Flow",
      operation: "Sets Rating = 'Warm' when Annual Revenue > 1M",
      timing: "RecordAfterSave on create/update"
    }
  ],
  specificConflict: "Both automations write to Rating field with different conditions - execution order will determine final value",
  recommendation: "Consolidate rating logic into single automation with combined criteria"
}
```

**Questions:**
1. How to programmatically extract field write operations from:
   - Apex trigger source code (regex patterns? AST parsing?)
   - Flow metadata (which XML elements?)
   - Workflow field updates (API query?)

2. Best approach to detect field-level conflicts:
   - Parse all field assignments across all automations
   - Build field write map (field → list of automations)
   - Detect overlaps where multiple automations write same field on same object/event?

3. How to extract the specific VALUES being assigned to fields:
   - From Apex: `account.Rating = 'Hot';`
   - From Flow RecordUpdate elements?
   - From Workflow FieldUpdate metadata?

## Specific API Questions

### Question 1: Flow Metadata Completeness
Which API provides the MOST complete Flow metadata without requiring Metadata API retrieval + XML parsing?

Options I know:
- FlowDefinitionView (Tooling API) - lightweight but missing trigger details
- FlowDefinition (Standard API) - ?
- Flow (Tooling API) - ?
- Metadata API `.flow-meta.xml` - most complete but requires retrieve operation

**What I need to know:**
1. Does FlowDefinition have trigger object/type fields?
2. Is there a Tooling API endpoint that includes entry criteria?
3. Performance comparison for 100+ flows?

### Question 2: Entry Criteria Structure
For record-triggered flows, entry criteria can be:
- Formula-based (single formula string)
- Filter-based (list of criteriaItems + filterLogic)
- Combination of both?

**What I need to know:**
1. XML structure of both types
2. API field names for both types
3. How to determine which type a flow uses
4. Edge cases (no entry criteria, complex nested logic)

### Question 3: Execution Order
For conflict analysis, I need to know execution order:

**Apex Triggers:**
- I know: No guaranteed order, all same-event triggers execute
- I need: Any API field that hints at order? CreatedDate as proxy?

**Flows:**
- I know: TriggerOrder field exists (per Salesforce docs)
- I need: How to query it? FlowDefinitionView.TriggerOrder? FlowDefinition.TriggerOrder?

**Workflow Rules:**
- I know: No guaranteed order
- I need: Confirmation + any workarounds

### Question 4: Field Update Metadata
For Workflow Rules, how to query field updates?

**What I need:**
```javascript
WorkflowRule "Update_Account_Rating"
  ↓
  WorkflowFieldUpdate records (1-N relationship)
    - Field: "Rating"
    - Value: "Hot"
    - Formula: "IF(AnnualRevenue > 1000000, 'Hot', 'Warm')"
```

**Questions:**
1. Is WorkflowFieldUpdate a queryable object?
2. Relationship field to WorkflowRule?
3. How to get formula-based field updates vs. literal values?

## What I'm Looking For

Please provide:

1. **API Field Reference Table**
   ```
   | Data Needed | API Object | Query Field Path | Example Value | API Version |
   |-------------|-----------|------------------|---------------|-------------|
   | Flow trigger object | Flow | ??? | Account | 62.0 |
   | Flow trigger type | Flow | ??? | RecordAfterSave | 62.0 |
   ```

2. **Complete SOQL Query Examples**
   - Best query to get ALL Flow metadata in one call
   - How to query Flow entry criteria
   - How to query Workflow field updates
   - How to get Apex trigger timing (before/after/events)

3. **XML Structure Examples**
   - Entry criteria in `.flow-meta.xml`
   - RecordUpdate elements
   - FilterLogic structure

4. **Code Parsing Patterns**
   - Regex patterns for Apex field assignments: `object.Field__c = value;`
   - How to handle complex assignments: `object.Field__c = someMethod(param);`

5. **Best Practices**
   - Should I stick with FlowDefinitionView + Metadata API fallback?
   - Or is there a better single API that gets everything?
   - Performance considerations for 500+ automation pieces

6. **Edge Cases & Gotchas**
   - Inactive flows (should I still audit them?)
   - Namespaced flows from managed packages
   - API version differences
   - Governor limits (how many Flows can I query at once?)

## Success Criteria

Your response is successful if I can:

1. ✅ Query complete Flow trigger metadata (object, type, events) via API
2. ✅ Extract full entry criteria (formulas AND filter items) from Flows
3. ✅ Identify which fields each automation modifies
4. ✅ Generate specific conflict reports showing exact field collisions
5. ✅ Populate all 15 columns in my Master Automation Inventory CSV with real data (not "N/A")

## Additional Context

- **Current Tech Stack**: Node.js, Salesforce CLI (sf), execSync for API queries
- **Org Types**: Testing on Developer Edition and Enterprise Edition orgs
- **API Version**: Targeting 62.0 but need backward compatibility to 58.0+
- **Scale**: Typical org has 50-200 automations across all types
- **Output Format**: CSV (for Master Inventory), JSON (for Cascade/Conflict analysis), Markdown (for client reports)

---

**Please provide comprehensive guidance on the 4 critical gaps, specific API queries, and code examples where applicable. Include links to Salesforce documentation for each API/field referenced.**
