---
description: Start a new segment in a Salesforce Flow with complexity tracking and template guidance
argument-hint: "./flows/Account_Processing.flow-meta.xml Input_Validation --org gamma-corp"
---

Start a new segment in a Salesforce Flow to enable incremental, complexity-aware development. This command uses the Flow Segmentation System (Phase 1-2) to break large flows into manageable logical units.

The segment start will:
- **Create segment metadata** tracking name, type, budget, and boundaries
- **Load template** with best practices and validation rules
- **Initialize complexity tracking** starting at 0 points
- **Set up budget enforcement** with warning thresholds (70%, 90%, 100%)
- **Enable validation** against segment-specific anti-patterns

**Target Flow**: {flow-path} (path to .flow-meta.xml file)
**Segment Name**: {segment-name} (e.g., "Input_Validation", "Data_Enrichment")

**Segment Types Available**:
- **validation** (budget: 5) - Data validation, input checks, pre-processing
- **enrichment** (budget: 8) - Get Records, data enrichment, calculations
- **routing** (budget: 6) - Decision trees, branching logic, routing
- **notification** (budget: 4) - Email, Chatter, platform events
- **loopProcessing** (budget: 10) - Bulkified loops, collections, iterations
- **custom** (budget: 7) - User-defined segment type

**Options**:
- `--type <type>`: Segment type (default: auto-detect from name)
- `--budget <number>`: Override default complexity budget
- `--template-guidance`: Show template best practices and anti-patterns
- `--org <alias>`: Salesforce org alias (required for validation)

**Output**:
- Segment metadata created in memory (FlowAuthor instance)
- Template guidance displayed (if requested)
- Current status summary

**Validation Rules by Type**:

**validation**:
- Max 3 decisions
- Requires fault paths
- No record operations (Get/Create/Update)
- Max 2 nesting levels

**enrichment**:
- Max 3 record lookups (bulkification)
- No SOQL in loops
- Requires null checks
- Max 10 assignments

**routing**:
- Max 5 decisions
- Requires default path
- Max 3 nesting levels

**notification**:
- Max 2 emails (governor limits)
- Requires recipient validation
- No bulk emails from loops

**loopProcessing**:
- No DML in loops (CRITICAL)
- No SOQL in loops (CRITICAL)
- Max 1 loop nesting
- Requires bulkification

**Exit Codes**:
- `0` - Segment started successfully
- `1` - Invalid segment type or budget
- `2` - Flow not found or invalid
- `3` - Segment already active (must complete first)

**Examples**:

**Start Validation Segment**:
```bash
# Auto-detect type from name
/flow-segment-start ./flows/Account_Processing.flow-meta.xml Input_Validation --org gamma-corp

# Explicit type with template guidance
/flow-segment-start ./flows/Account_Processing.flow-meta.xml Validation --type validation --template-guidance --org gamma-corp
```

**Start Enrichment Segment with Custom Budget**:
```bash
# Higher budget for complex enrichment
/flow-segment-start ./flows/Opportunity_Updates.flow-meta.xml Data_Enrichment \
  --type enrichment \
  --budget 12 \
  --org gamma-corp
```

**Start Loop Processing Segment**:
```bash
# Bulkified processing segment
/flow-segment-start ./flows/Bulk_Contact_Update.flow-meta.xml Contact_Processing \
  --type loopProcessing \
  --template-guidance \
  --org gamma-corp
```

**Programmatic Usage**:
```javascript
const FlowAuthor = require('./scripts/lib/flow-author');

// Create author with segmentation enabled
const author = new FlowAuthor('gamma-corp', {
  verbose: true,
  segmentationEnabled: true
});

// Load existing flow
await author.loadFlow('./flows/Account_Processing.flow-meta.xml');

// Start segment with type and budget
author.startSegment('Input_Validation', {
  type: 'validation',
  budget: 5,
  description: 'Validate Account Status and Amount'
});

// Get status
const status = author.getSegmentStatus();
console.log('Active segment:', status.name);
console.log('Type:', status.type);
console.log('Budget:', status.budget);
console.log('Complexity:', status.complexity);
```

**Template Guidance Output** (with `--template-guidance`):

```
📋 Validation Segment Template

Budget: 5 points (range: 3-7)

✅ Best Practices:
  - Keep validation atomic (one check per decision)
  - Always define fault paths for validation failures
  - Exit early on validation failure
  - Use consistent naming (Validation_*, *_Check, *_Verify)

❌ Anti-Patterns to Avoid:
  - DML in validation → Use enrichment segment instead
  - Too many nested decisions → Split into multiple segments
  - Missing fault paths → Always handle validation failures

📦 Recommended Elements:
  - Decision (2 pts) - "Status equals Active"
  - Decision (2 pts) - "Amount greater than 10000"

🔒 Validation Rules:
  - Max 3 decisions
  - Requires fault paths
  - No record operations
  - Max 2 nesting levels

⚠️ Budget Warnings:
  - 70% (3.5 pts): Caution - consider completing segment
  - 90% (4.5 pts): Critical - should complete segment
  - 100% (5 pts): Blocked - must complete segment
```

**What Happens Next**:

1. **Add Elements**: Use `/flow-segment-add` or FlowAuthor.addElement()
2. **Track Complexity**: Real-time complexity tracking after each element
3. **Get Status**: Use `/flow-segment-status` to check progress
4. **Complete Segment**: Use `/flow-segment-complete` when done

**Integration with Flow Commands**:

```bash
# Full workflow
/flow-segment-start ./MyFlow.flow-meta.xml Validation --type validation --org myorg
/flow-segment-add ./MyFlow.flow-meta.xml "Add decision Status_Check..." --org myorg
/flow-segment-status ./MyFlow.flow-meta.xml --org myorg
/flow-segment-complete ./MyFlow.flow-meta.xml --validate --org myorg
```

**Segment Tracking**:

Segments are tracked in memory within the FlowAuthor instance. To persist segment metadata across sessions, use the `--save-state` option:

```bash
# Save segment state to file
/flow-segment-start ./MyFlow.flow-meta.xml Validation --save-state ./segments.json
```

**Runbook Reference**: See Runbook 8 - Incremental Segment Building (coming in Phase 5)

**Estimated Duration**: < 5 seconds

**Related Commands**:
- `/flow-segment-complete` - Complete current segment
- `/flow-segment-status` - Check segment status
- `/flow-segment-list` - List all segments in flow
- `/flow-segment-add` - Add element to current segment

**Use the FlowAuthor script to start a new segment named {segment-name} in the {flow-path} Flow, enabling complexity-tracked incremental development with template guidance and anti-pattern prevention.**
