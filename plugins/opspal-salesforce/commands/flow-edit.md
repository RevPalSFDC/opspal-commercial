---
name: flow-edit
description: Safe minor edits to Salesforce Flows without segmentation overhead. Best for quick changes to simple flows.
argument-hint: "<FlowName> \"<instruction>\" --org <alias>"
allowed-tools:
  - Read
  - Write
  - Bash
  - TodoWrite
  - Grep
thinking-mode: enabled
---

# Flow Quick Edit Mode

## Purpose

Perform lightweight edits on Salesforce Flows without the overhead of segmentation tracking. This command uses a 4-stage validation subset (syntax, references, variables, API version) for fast, safe modifications to simple flows.

## When to Use

**Use this command when:**
- Making minor changes to low-complexity flows (complexity < 10)
- Changing element labels, descriptions, or simple properties
- Adding a single assignment or simple element
- Quick fixes that don't warrant full segmentation
- The flow is already well-structured

**Do NOT use when:**
- Flow complexity is high (use `/flow-interactive-build` instead)
- Adding multiple complex elements (decisions, loops, subflows)
- Restructuring flow logic significantly
- Working on production-critical flows requiring comprehensive validation

## Governance Pre-Check (Recommended)

Before applying changes that alter trigger context, entry criteria, or security posture, run:

```bash
/flow-preflight <FlowName> <org> \
  --object <ObjectName> \
  --trigger-type <after-save|before-save|before-delete|after-delete> \
  --proposed-action update \
  --capability-domain <domain> \
  --entry-criteria "<criteria>"
```

Use the `decision` payload to confirm `update_existing` is appropriate.  
If preflight recommends `create_new` or `refactor_with_subflow`, do not proceed with quick-edit mode.

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org
- Flow metadata read/write permissions

### Required Files
- Flow XML file (`.flow-meta.xml`) accessible locally or retrievable from org

## Usage

### Basic Usage

```bash
/flow-edit <FlowName> "<instruction>" --org <alias>
```

### Examples

```bash
# Change an element label
/flow-edit Account_Processing "Change Status_Check label to 'Active Status Check'" --org prod

# Add a simple assignment
/flow-edit Lead_Router "Add assignment Stage = 'Qualified' after Lead_Check" --org prod

# Modify a condition
/flow-edit Case_Handler "Update Status_Decision to check Status equals 'Closed'" --org prod

# Preview changes without saving
/flow-edit Account_Processing "Add comment to Get_Account element" --org prod --dry-run
```

### With Options

```bash
/flow-edit <FlowName> "<instruction>" --org <alias> --dry-run --verbose
```

## Parameters

### Required Parameters

- **FlowName** (REQUIRED): Flow API name (without `.flow-meta.xml` extension)
- **instruction** (REQUIRED): Natural language instruction describing the edit

### Optional Parameters

- **--org** (OPTIONAL): Salesforce org alias. Uses default org if not specified.
- **--dry-run** (OPTIONAL): Preview changes without saving
- **--verbose** (OPTIONAL): Show detailed logging
- **--skip-validation** (OPTIONAL): Skip 4-stage validation (not recommended)
- **--force** (OPTIONAL): Apply edit even if complexity is above threshold

## Validation Stages

Quick Edit Mode runs a streamlined 4-stage validation (vs full 11-stage):

1. **Syntax** - Well-formed XML structure
2. **References** - No dangling connectors or broken references
3. **Variables** - All referenced variables are declared
4. **API Version** - Compatibility with org API version

Target validation time: <500ms total

## Complexity Check

Before editing, the system checks flow complexity:

- **Complexity < 5**: Ideal for Quick Edit Mode
- **Complexity 5-9**: Acceptable, standard editing
- **Complexity >= 10**: Segmentation recommended (use `--force` to override)

## Rollback Support

Quick Edit Mode creates in-memory rollback points:

```javascript
// Behind the scenes:
quickEditor.createRollbackPoint(); // Before edit
await quickEditor.executeQuickEdit(instruction);
// If error:
await quickEditor.rollback('rollback_001');
```

## Output

### Successful Edit

```
[FlowQuickEditor] Loading flow: Account_Processing
[FlowQuickEditor] Running 4-stage validation...
[FlowQuickEditor] Validation passed (234ms)
[FlowQuickEditor] Executing edit: Change Status_Check label to 'Active Status Check'
[FlowQuickEditor] Edit applied successfully

Summary:
  Flow: Account_Processing
  Edit: Label change
  Validation: Passed (4/4 stages)
  Time: 456ms

Flow saved: ./force-app/main/default/flows/Account_Processing.flow-meta.xml
```

### Dry Run Output

```
[DRY RUN] Would apply edit to: Account_Processing
[DRY RUN] Instruction: Change Status_Check label to 'Active Status Check'
[DRY RUN] Affected elements: Status_Check
[DRY RUN] Validation: Would pass (based on current state)
[DRY RUN] No changes made.
```

## Integration with FlowAuthor

Quick Edit Mode integrates with FlowAuthor via the `switchToQuickEditMode()` method:

```javascript
const FlowAuthor = require('./scripts/lib/flow-author');
const author = new FlowAuthor('myOrg', { verbose: true });

await author.loadFlow('./MyFlow.flow-meta.xml');

// Check complexity first
const analysis = await author.analyzeForSegmentation();
if (analysis.recommendedMode === 'simple') {
    // Switch to quick edit mode
    const quickEditor = await author.switchToQuickEditMode();
    await quickEditor.executeQuickEdit('Change label of Element_1 to "New Label"');
}
```

## Related Commands

- `/flow-interactive-build` - Full segmentation mode for complex flows
- `/flow-extract-subflow` - Extract elements into separate subflow
- `/flow-analyze-segments` - Analyze existing flow for segment patterns

## Troubleshooting

### "Complexity above threshold"

Flow is too complex for Quick Edit Mode. Use:
- `/flow-interactive-build` for full segmentation support, OR
- `--force` flag to override (not recommended for high-complexity flows)

### "Validation failed"

Check the specific validation stage that failed:
- **Syntax**: Invalid XML - check for malformed elements
- **References**: Broken connector - verify target element exists
- **Variables**: Undeclared variable - add variable declaration
- **API Version**: Incompatible version - consider upgrading flow

### "Element not found"

Verify the element name matches exactly (case-sensitive). Use:
```bash
sf project retrieve start --metadata Flow:FlowName -o orgAlias
```
to get the latest flow definition.
