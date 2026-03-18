---
name: flow-segmentation-guide
description: Flow segmentation methodology for complexity management, pattern detection, and safe editing. Use when editing flows, extracting subflows, or managing flow complexity.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:flow-segmentation-specialist
---

# Flow Segmentation Guide

## When to Use This Skill

- Editing existing flows with `/flow-edit`
- Analyzing flow complexity with `/flow-analyze-segments`
- Extracting segments to subflows
- Building new flows with `/flow-interactive-build`
- Managing complex multi-purpose flows

## Quick Reference

### Complexity-Based Edit Mode Selection

| Complexity | Risk | Recommended Mode |
|------------|------|------------------|
| 0-5 | Low | `/flow-edit` (Quick Edit) |
| 6-9 | Medium | Standard editing or segmentation |
| 10-19 | High | `/flow-interactive-build` |
| 20+ | Critical | Segmentation + refactoring |

### Segment Types

| Type | Pattern | Budget |
|------|---------|--------|
| Validation | Decision clusters at start | 5 points |
| Enrichment | recordLookups + assignments | 8 points |
| Routing | Dense decision clusters with branching | 6 points |
| Notification | Email/Chatter actions at end | 4 points |
| Loop Processing | Loops with record operations | 10 points |

### Commands

```bash
# Quick edits (low complexity)
/flow-edit <FlowName> "<instruction>" --org <alias>

# Analyze segments
/flow-analyze-segments <FlowName> --org <alias>

# Extract to subflow
/flow-extract-subflow <FlowName> --segment <name>

# Full segmentation mode
/flow-interactive-build <FlowName> --org <alias>
```

## Complexity Scoring

### Element Point Values

| Element Type | Points |
|--------------|--------|
| Decision | 2 |
| Loop | 3 |
| recordLookup | 1 |
| recordCreate | 2 |
| recordUpdate | 2 |
| recordDelete | 3 |
| subflow | 1 |
| action (Apex) | 2 |
| screen | 2 |

### Multipliers

| Condition | Multiplier |
|-----------|------------|
| Nested loops | 1.5x |
| >20 elements | 1.2x |
| >50 elements | 1.5x |
| Cross-object operations | 1.3x |

## Segment Detection Patterns

### Validation Segment
```
Pattern: 2+ decisions within first 5 elements
Purpose: Entry criteria checking
Typical elements: Decision, Assignment (fault handling)
```

### Enrichment Segment
```
Pattern: recordLookup followed by Assignment
Purpose: Gather data before processing
Typical elements: recordLookup, Assignment, Decision
```

### Routing Segment
```
Pattern: Dense decision cluster (3+ decisions, <30% other)
Purpose: Direct flow based on conditions
Typical elements: Decision, Assignment
```

### Notification Segment
```
Pattern: Email/Chatter actions in last 5 elements
Purpose: Alert users of changes
Typical elements: actionCalls (email/chatter)
```

### Loop Processing Segment
```
Pattern: Loop containing record operations
Purpose: Process collections
Typical elements: loop, recordUpdate/Create, Assignment
```

## Quick Edit Mode

For flows with complexity < 10, use quick edit:

```bash
/flow-edit Account_Processing "Change Status_Check label to 'Active Check'" --org prod
```

### Quick Edit Validation (4 stages)
1. **Syntax** - Parse instruction, identify target element
2. **References** - Verify element exists in flow
3. **Variables** - Check variable references valid
4. **API Version** - Ensure element compatible with flow version

### Quick Edit Limitations
- Single element modifications only
- No structural changes (add/remove elements)
- No cross-element dependencies
- No batch operations

## Subflow Extraction

### When to Extract

| Condition | Recommendation |
|-----------|----------------|
| Segment used in 2+ flows | Extract to shared subflow |
| Segment > 10 elements | Extract for maintainability |
| Segment has clear boundary | Good extraction candidate |
| Segment has complex error handling | Extract with fault path |

### Extraction Preview

```bash
/flow-extract-subflow Account_Flow --segment Validation --preview
```

Output:
```
Segment: Validation
Elements: 4 (Decision x2, Assignment x2)
Input Variables: AccountId, Status
Output Variables: IsValid, ErrorMessage
Impact: 2 connectors will point to subflow
```

## Interactive Build Stages

| Stage | Purpose |
|-------|---------|
| 0 | Complexity Analysis |
| 1 | Flow Loading |
| 1.5 | Segment Suggestion Review |
| 1.6 | Interactive Partition Mode |
| 2 | Element Addition |
| 3 | Variable Management |
| 4 | Connector Wiring |
| 5 | Validation & Deploy |

## Best Practices

### Segment Naming
```
<Object>_<Action>_<Segment>
Example: Account_Update_Validation
```

### Complexity Budget
- Keep segments under their budget
- If over budget, consider splitting
- Document exceptions with comments

### Version Control
- Track segment extractions in commit messages
- Reference original flow in subflow description
- Maintain segment mapping documentation

## Detailed Documentation

See supporting files:
- `patterns.md` - Segment detection algorithms
- `extraction.md` - Subflow extraction guide
- `troubleshooting.md` - Common issues
