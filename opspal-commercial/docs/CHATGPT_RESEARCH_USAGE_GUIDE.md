# How to Use the ChatGPT Research Prompt

## Quick Start

1. **Open the prompt file:**
   ```bash
   cat docs/CHATGPT_RESEARCH_PROMPT_AUTOMATION_METADATA.md
   ```

2. **Copy the entire contents** (from "# ChatGPT Research Prompt" to the end)

3. **Paste into ChatGPT** (GPT-4 recommended for technical accuracy)

4. **Wait for comprehensive response** covering all 4 gap areas

## What You'll Get Back

ChatGPT should provide:

### 1. API Field Reference Table
Complete mapping of what to query for Flow metadata:
- Trigger object field path
- Trigger type field path
- Entry criteria field path
- Record trigger type field path

### 2. Complete SOQL Queries
Ready-to-use queries like:
```sql
SELECT DurableId, DeveloperName, ProcessType,
       TriggerObjectOrEvent.QualifiedApiName,
       TriggerType, RecordTriggerType, ...
FROM FlowDefinition
WHERE ActiveVersion.Status = 'Active'
```

### 3. XML Structure Examples
How entry criteria look in `.flow-meta.xml`:
```xml
<start>
  <triggerType>RecordAfterSave</triggerType>
  <object>Account</object>
  <recordTriggerType>CreateAndUpdate</recordTriggerType>
  <filterLogic>1 AND 2</filterLogic>
  <filters>
    <field>Type</field>
    <operator>EqualTo</operator>
    <value><stringValue>Customer</stringValue></value>
  </filters>
</start>
```

### 4. Code Parsing Patterns
Regex patterns for field extraction:
```javascript
// Apex field assignments
const fieldAssignmentPattern = /(\w+)\.(\w+__c|\w+)\s*=\s*([^;]+);/g;

// Flow RecordUpdate elements
const recordUpdatePattern = /<recordUpdates>[\s\S]*?<field>(\w+)<\/field>/g;
```

### 5. Best Practice Recommendations
- Which API to use (likely: Metadata API for complete data)
- Performance optimization tips
- Batch size recommendations
- Error handling patterns

## What to Do With the Results

### Step 1: Update Your Extractors

Based on ChatGPT's response, you'll likely need to update:

**1. `flow-metadata-retriever.js`**
- Add new fields to FlowDefinitionView query OR
- Switch to FlowDefinition/Flow query if better
- Add entry criteria extraction

**2. `flow-xml-parser.js`**
- Update `extractTriggerInfo()` to get trigger object
- Update `extractEntryCriteria()` to parse formula vs filter-based criteria
- Add `extractFieldOperations()` to get RecordUpdate elements

**3. `automation-audit-v2-orchestrator.js`**
- Update Flow CSV generation (lines 1549-1609)
- Replace "N/A" placeholders with real data
- Add field operations to conflict analysis

**4. `automation-conflict-engine.js`**
- Enhance `detectFieldWriteCollisions()` with specific field names
- Add field-level conflict details to conflict objects
- Include execution order analysis if API provides it

### Step 2: Test Queries

**Create a test script** (`scripts/lib/test-flow-metadata-extraction.js`):
```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');

// Test the new query from ChatGPT's response
const query = `
  SELECT DurableId, DeveloperName,
         [NEW FIELDS FROM CHATGPT]
  FROM [OBJECT FROM CHATGPT]
  WHERE ActiveVersion.Status = 'Active'
`;

const cmd = `sf data query --query "${query}" --use-tooling-api --json`;
const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

console.log('Sample Flow Record:');
console.log(JSON.stringify(result.result.records[0], null, 2));
```

Run against test org:
```bash
ORG=your-test-org node scripts/lib/test-flow-metadata-extraction.js
```

### Step 3: Update Master Inventory CSV Generation

**Goal**: Replace these lines in orchestrator:
```javascript
// BEFORE (Current - lines 1596-1598)
Object: 'N/A', // Object determination would require flow metadata
Trigger Events: 'N/A',
Entry Conditions: entryConditions, // Limited to basic metadata

// AFTER (With ChatGPT's API guidance)
Object: flow.TriggerObject || 'N/A',
Trigger Events: this.formatFlowTriggerEvents(flow.TriggerType, flow.RecordTriggerType),
Entry Conditions: this.formatEntryCriteria(flow.entryCriteria) || 'None',
```

### Step 4: Enhance Conflict Analysis

**Add field-level collision detection** in `automation-conflict-engine.js`:

```javascript
// NEW METHOD (based on ChatGPT's field extraction guidance)
detectFieldLevelCollisions() {
  const fieldWriteMap = new Map(); // field -> list of automations

  // Extract field writes from Triggers
  for (const trigger of this.getTriggers()) {
    const fields = this.extractFieldWrites(trigger.Body, 'ApexTrigger');
    fields.forEach(field => {
      if (!fieldWriteMap.has(field)) {
        fieldWriteMap.set(field, []);
      }
      fieldWriteMap.get(field).push({
        automation: trigger,
        operation: 'write',
        timing: trigger.events
      });
    });
  }

  // Extract field writes from Flows
  for (const flow of this.getFlows()) {
    const fields = this.extractFlowFieldWrites(flow.recordUpdates);
    fields.forEach(field => {
      if (!fieldWriteMap.has(field)) {
        fieldWriteMap.set(field, []);
      }
      fieldWriteMap.get(field).push({
        automation: flow,
        operation: 'write',
        timing: flow.TriggerType
      });
    });
  }

  // Detect collisions (multiple automations writing same field)
  const collisions = [];
  for (const [field, automations] of fieldWriteMap) {
    if (automations.length > 1) {
      collisions.push({
        field: field,
        automations: automations,
        severity: this.calculateCollisionSeverity(automations),
        specificConflict: this.describeFieldCollision(field, automations)
      });
    }
  }

  return collisions;
}
```

### Step 5: Validate Results

Run full audit on test org and verify:

```bash
# Run enhanced audit
node scripts/lib/automation-audit-v2-orchestrator.js test-org /tmp/test-audit

# Check Master Inventory CSV
cat /tmp/test-audit/MASTER_AUTOMATION_INVENTORY.csv | grep "Flow" | head -5

# Should see:
# MyFlow,Flow,Active,Account,RecordAfterSave: Create/Update,"Type='Customer' AND Rating!=null",Updates opportunities,...
```

**Success Criteria:**
- ✅ No "N/A" in Object(s) column for record-triggered flows
- ✅ No "N/A" in Trigger Events column for flows
- ✅ Entry Conditions shows real formulas/filters (not "Not Available")
- ✅ Conflict analysis includes field-level details

## Troubleshooting

### If ChatGPT says "Field X doesn't exist in FlowDefinitionView"

**Solution**: Use Metadata API fallback (you already have this)
```javascript
// In flow-metadata-retriever.js
try {
  const flows = await this.queryFlowsViaTooling(); // Try Tooling API first
} catch (error) {
  const flows = await this.retrieveFlowsViaMetadata(); // Fall back to XML parsing
}
```

### If Entry Criteria is too complex for CSV

**Solution**: Truncate with details in JSON output
```javascript
// In orchestrator CSV generation
const entryCriteria = this.formatEntryCriteria(flow.criteria);
const truncated = entryCriteria.length > 200
  ? entryCriteria.substring(0, 197) + '...'
  : entryCriteria;
```

Store full criteria in JSON:
```javascript
// In Conflicts.json
{
  flowName: "MyFlow",
  entryCriteria: {
    type: "formula",
    formula: "AND(ISCHANGED(StageName), TEXT(Type)='Customer', Amount>10000)",
    description: "Runs when Stage changes AND Type is Customer AND Amount exceeds 10K"
  }
}
```

### If Field Extraction is Unreliable

**Fallback Strategy**:
1. Primary: Parse RecordUpdate XML elements from Flow metadata
2. Fallback 1: Use static analysis on Apex Body field
3. Fallback 2: Mark as "Complex Logic - Manual Review Required"

## Expected Timeline

After getting ChatGPT's response:

- **Day 1**: Test recommended queries on dev org (2 hours)
- **Day 2**: Update flow-metadata-retriever.js and flow-xml-parser.js (4 hours)
- **Day 3**: Update orchestrator CSV generation (3 hours)
- **Day 4**: Enhance conflict-engine.js with field-level detection (4 hours)
- **Day 5**: Full integration testing on 2-3 orgs (4 hours)

**Total**: ~17 hours of implementation

## Next Steps After Implementation

1. **Create regression tests**: Compare before/after CSV outputs
2. **Document new fields**: Update CHANGELOG.md with v3.28.0 notes
3. **Update client deliverables**: Conflict reports now include field details
4. **Measure impact**: Track reduction in "N/A" values (target: <5% of flows)

## Support

If ChatGPT's response is unclear or incomplete:

1. **Follow-up prompts**:
   - "Can you provide a complete SOQL query example for Flow metadata?"
   - "Show me the exact XML structure for filter-based entry criteria"
   - "What's the relationship between FlowDefinition and FlowDefinitionView?"

2. **Validate with Salesforce docs**:
   - Search Salesforce Developer Docs for each API object mentioned
   - Cross-reference field names in Object Reference
   - Test in Workbench (https://workbench.developerforce.com)

3. **Ask Claude (me!) for implementation**:
   - Share ChatGPT's response
   - I'll update the extractors based on the API guidance
   - I'll write tests and validate against real org data

---

**Ready to go?** Copy the research prompt and paste into ChatGPT now!
