---
name: diagram
description: Generate Mermaid diagrams from natural language, metadata, or structured data. Supports flowcharts, ERDs, sequence diagrams, and state diagrams.
argument-hint: "[type] [subject] [options]"
---

# /diagram - Interactive Diagram Generation Command

Generate professional Mermaid diagrams for documentation, analysis, and visualization.

## Usage

### Interactive Mode (Recommended)
```bash
/diagram
```
Launches interactive prompts to guide you through diagram creation.

### Quick Generation
```bash
/diagram [type] [subject] [options]
```

**Examples**:
```bash
/diagram flowchart "Lead conversion process"
/diagram erd Account Contact Opportunity
/diagram sequence "Stripe payment API"
/diagram state "Opportunity stages"
```

### From Data File
```bash
/diagram from <file-path>
```

**Example**:
```bash
/diagram from instances/production/metadata/account-schema.json
```

## Diagram Types

### 1. Flowchart
**Use For**: Process flows, workflows, decision trees, automation logic

**Quick Example**:
```bash
/diagram flowchart "Approval workflow"
```

**What You'll Be Asked**:
- Process steps and decision points
- Flow direction (Top-to-Bottom, Left-to-Right, etc.)
- Conditional branches
- Start/end points

### 2. ERD (Entity Relationship Diagram)
**Use For**: Database schemas, object relationships, data models

**Quick Example**:
```bash
/diagram erd Account Contact Opportunity
```

**What You'll Be Asked**:
- Which objects/entities to include
- Salesforce org or HubSpot portal (for metadata)
- Relationship types (one-to-many, many-to-many)
- Whether to include fields

### 3. Sequence Diagram
**Use For**: API interactions, system flows, temporal sequences

**Quick Example**:
```bash
/diagram sequence "OAuth authentication flow"
```

**What You'll Be Asked**:
- Participants/actors (User, System, API)
- Messages/interactions in order
- Synchronous vs asynchronous calls
- Notes and activation boxes

### 4. State Diagram
**Use For**: Lifecycle states, status transitions, state machines

**Quick Example**:
```bash
/diagram state "Contact lifecycle"
```

**What You'll Be Asked**:
- States (New, Qualified, Converted, etc.)
- Transitions and conditions
- Start/end states
- Composite states (optional)

## Interactive Prompts

When you run `/diagram` without arguments, you'll be guided through:

### Step 1: Diagram Type Selection
```
? What type of diagram do you want to create?
  ❯ Flowchart (processes, workflows)
    ERD (data models, relationships)
    Sequence (API interactions, integrations)
    State (lifecycles, status transitions)
```

### Step 2: Data Source
```
? Where should the data come from?
  ❯ Natural language description (I'll describe it)
    Salesforce metadata (query org)
    HubSpot metadata (query portal)
    Existing data file (JSON/CSV)
```

### Step 3: Diagram Details
**For Flowchart**:
```
? Process name: Lead Conversion Process
? Flow direction: Top to Bottom (TB)
? Describe steps (comma-separated): New Lead, Score Lead, Qualify, Convert
? Any decision points? (y/n): y
? Which step is a decision?: Score Lead
```

**For ERD**:
```
? Salesforce org or HubSpot portal?: production
? Objects to include (comma-separated): Account, Contact, Opportunity
? Include field details? (y/n): y
? Show relationships only? (y/n): n
```

**For Sequence**:
```
? Integration name: Stripe Payment Processing
? Participants (comma-separated): User, App, Stripe API, Database
? Describe interaction flow: [Interactive step-by-step]
? Enable auto-numbering? (y/n): y
```

**For State**:
```
? Object/process name: Opportunity
? Field with states: StageName
? Salesforce org (for picklist values): production
? Auto-detect transitions from metadata? (y/n): y
```

### Step 4: Output Location
```
? Save diagram to:
  ❯ Auto-detect (salesforce-plugin/instances/<org>/diagrams/)
    Custom path (I'll specify)
    Current directory
```

### Step 5: Output Format
```
? Save as:
  ❯ Both .md and .mmd (recommended)
    Markdown only (.md)
    Mermaid only (.mmd)
```

### Step 6: Preview & Confirm
```
Preview (first 20 lines):
────────────────────────────────────────
flowchart TB
  start((New Lead))
  score{Score Lead}
  qualify[Qualify]
  convert[Convert]

  start --> score
  score -->|Score > 80| qualify
  score -->|Score < 80| reject
  qualify --> convert
────────────────────────────────────────

? Looks good? (y/n/edit): y
```

## Advanced Options

### Custom Templates
```bash
/diagram from-template salesforce/opportunity-lifecycle
```

Available templates:
- `salesforce/opportunity-lifecycle` - Standard Opp stages
- `salesforce/lead-routing` - Assignment rules flow
- `salesforce/cpq-quote-process` - CPQ quoting workflow
- `hubspot/contact-lifecycle` - Standard lifecycle stages
- `hubspot/workflow-template` - Standard workflow structure
- `cross-platform/sync-architecture` - Bidirectional sync pattern

### Batch Generation
```bash
/diagram batch <config-file>
```

**Example config-file.json**:
```json
{
  "diagrams": [
    {
      "type": "erd",
      "source": "salesforce",
      "org": "production",
      "objects": ["Account", "Contact"],
      "output": "instances/production/diagrams/accounts-contacts"
    },
    {
      "type": "flowchart",
      "title": "Lead Routing",
      "steps": ["New", "Assign", "Notify"],
      "output": "instances/production/diagrams/lead-routing"
    }
  ]
}
```

### Metadata-Driven Generation
```bash
# Auto-generate ERD from Salesforce org
/diagram erd --org production --auto-discover

# Auto-generate workflow flowcharts from HubSpot
/diagram flowchart --portal 12345 --type workflows --auto-discover
```

## Output

After diagram generation, you'll see:

### Success Message
```
✅ Diagram Generated Successfully

📊 Type: Entity Relationship Diagram
📝 Title: Account, Contact, Opportunity Relationships
🎯 Source: Salesforce Org (production)

📂 Files Saved:
  - /path/to/diagram.md (Markdown with embedded Mermaid)
  - /path/to/diagram.mmd (Standalone Mermaid)

✓ Validation: Passed (0 errors, 1 warning)
  ⚠️  Warning: Large diagram (42 nodes) - consider splitting

🔗 View:
  - GitHub: [link if in repo]
  - VS Code: Open .md file for rendered view
  - Mermaid Live Editor: https://mermaid.live/edit

💡 Next Steps:
  - Edit .mmd file to customize
  - Run /diagram from diagram.mmd to regenerate .md
  - Share .md file in documentation
```

### Validation Errors (if any)
```
❌ Diagram Validation Failed

Errors:
  - Line 12: Unbalanced brackets in node definition
  - Line 25: Undefined node reference "step5"

Suggestions:
  - Fix bracket closure: [text]
  - Add missing node: step5[Label]

🛠️  Auto-fix available? Yes
? Apply auto-fixes? (y/n):
```

## Examples

### Example 1: Salesforce ERD
```bash
$ /diagram erd Account Contact

? Salesforce org: production
? Include field details? y
? Show relationships only? n

Querying Salesforce metadata...
  ✓ Account (25 fields, 3 relationships)
  ✓ Contact (18 fields, 2 relationships)

Generating ERD...
  ✓ Entities defined
  ✓ Relationships mapped
  ✓ Validation passed

✅ Saved to: salesforce-plugin/instances/production/diagrams/account-contact-erd.md
```

### Example 2: Workflow Flowchart
```bash
$ /diagram flowchart "Lead assignment process"

? Flow direction: Top to Bottom
? Describe steps: New Lead, Check Criteria, Assign to Sales, Notify Sales Rep
? Any decision points? y
? Which step is a decision?: Check Criteria

Generating flowchart...
  ✓ 4 nodes created
  ✓ 1 decision point
  ✓ 5 edges defined
  ✓ Validation passed

✅ Saved to: opspal-core/diagrams/lead-assignment-process.md
```

### Example 3: API Sequence
```bash
$ /diagram sequence "Stripe subscription creation"

? Participants: User, App, Stripe API
? Enable auto-numbering? y

Interaction 1:
  ? From: User
  ? To: App
  ? Message: Create subscription
  ? Type: Solid arrow

Interaction 2:
  ? From: App
  ? To: Stripe API
  ? Message: POST /subscriptions
  ? Type: Solid arrow (with activation)

[Continue...]

✅ Saved to: opspal-core/diagrams/stripe-subscription-flow.md
```

### Example 4: State Diagram
```bash
$ /diagram state "Opportunity stages"

? Salesforce org: production
? Object: Opportunity
? Field with states: StageName

Querying Salesforce metadata...
  ✓ Found 7 stages
  ✓ Found 12 validation rules for transitions

Generating state diagram...
  ✓ 7 states defined
  ✓ 12 transitions mapped
  ✓ Validation passed

✅ Saved to: salesforce-plugin/instances/production/diagrams/opportunity-stages.md
```

## Integration with Agents

The `/diagram` command delegates to the `diagram-generator` agent for complex generation. You can also invoke the agent directly for programmatic use:

```javascript
const Task = require('claude-code-task');

await Task.invoke('opspal-core:diagram-generator', {
  type: 'erd',
  source: 'salesforce',
  org: 'production',
  objects: ['Account', 'Contact', 'Opportunity']
});
```

## Tips & Best Practices

1. **Start Simple**: Generate a basic diagram first, then iterate
2. **Use Metadata**: Let the system query Salesforce/HubSpot for accuracy
3. **Validate Early**: Check for syntax errors before saving
4. **Leverage Templates**: Use pre-built templates for common patterns
5. **Split Complex Diagrams**: If >50 nodes, consider multiple diagrams
6. **Document Context**: Always include title and description

## Troubleshooting

### "Mermaid Chart MCP unreachable" / Bad Gateway
The `claude.ai Mermaid Chart` MCP is a cloud integration that has intermittent outages. Rendering does **not** depend on it — the local renderer chain (mmdc → puppeteer → styled placeholder) lives at `scripts/lib/mermaid-pre-renderer.js` and handles every Mermaid render in this plugin. Probe the MCP explicitly if needed:
```bash
node plugins/opspal-core/scripts/lib/mcp-connectivity-tester.js --server mermaid --json
```

### "Diagram too complex"
Split into multiple diagrams:
```bash
/diagram erd Account Contact  # Part 1
/diagram erd Opportunity Quote  # Part 2
```

### "Validation failed"
Check specific error messages:
```bash
? View detailed validation report? y
```

### "Metadata query failed"
Verify authentication:
```bash
# For Salesforce
sf org list

# For HubSpot
# Check .env for HUBSPOT_ACCESS_TOKEN
```

### "Output location not found"
Create directory manually or use custom path:
```bash
/diagram [type] [subject] --output /custom/path/
```

## Related Commands

- `/reflect` - Submit session reflections (may include diagram generation requests)
- `/agents` - List all available agents (includes diagram-generator)

## Documentation

For detailed documentation, see:
- **User Guide**: `docs/MERMAID_DIAGRAM_GUIDE.md`
- **Generator Library**: `scripts/lib/mermaid-generator.js`
- **Validator Library**: `scripts/lib/mermaid-validator.js`
- **Agent Definition**: `agents/diagram-generator.md`

---

**💡 Pro Tip**: For recurring diagram generation needs, create a config file and use `/diagram batch <config-file>` to generate multiple diagrams at once.
