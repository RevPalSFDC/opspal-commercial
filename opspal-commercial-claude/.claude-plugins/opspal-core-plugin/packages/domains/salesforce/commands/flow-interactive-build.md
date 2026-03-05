---
description: Interactive wizard for segment-by-segment Flow building with complexity tracking and templates
argument-hint: "<flowName> --org <alias> [--resume] [--testing-enabled] [--strict-mode]"
---

# /flow-interactive-build - Interactive Segment-by-Segment Flow Building

**Phase 4.3: Interactive Segmentation Mode**

Launch an interactive wizard that guides you through building Salesforce flows segment-by-segment with real-time complexity tracking, template recommendations, and anti-pattern prevention.

## Command Format

```bash
/flow-interactive-build <flowName> --org <orgAlias> [options]
```

## Workflow Overview

This command provides a **wizard-style interface** that:

1. **Template Selection Wizard** - Helps choose the right segment type
2. **Segment Creation** - Guides element addition with budget tracking
3. **Real-Time Validation** - Warns about anti-patterns as you build
4. **Completion Guidance** - Suggests when to complete and start new segments
5. **Testing Integration** - Optionally test segments before moving on
6. **Subflow Extraction** - Auto-suggests when segments exceed thresholds

## Interactive Wizard Stages

### Stage 1: Flow Initialization

```
┌─────────────────────────────────────────────┐
│  Flow Segmentation Wizard                   │
├─────────────────────────────────────────────┤
│  Flow: OpportunityRenewalAutomation         │
│  Org: production                            │
│  Status: New Flow                           │
└─────────────────────────────────────────────┘

Would you like to:
  1. Start a new segment
  2. Load existing flow for segmentation
  3. View segmentation best practices
  4. Exit

Choice [1-4]: _
```

### Stage 2: Template Selection

```
┌─────────────────────────────────────────────┐
│  Segment Template Selection                 │
├─────────────────────────────────────────────┤
│  Choose a template for your segment:        │
│                                              │
│  1. 📋 Validation                            │
│     Budget: 5 points | Best for: Input      │
│     validation, data quality checks         │
│                                              │
│  2. 🔄 Enrichment                            │
│     Budget: 8 points | Best for: Data       │
│     lookups, calculations, field updates    │
│                                              │
│  3. 🔀 Routing                               │
│     Budget: 6 points | Best for: Workflow   │
│     branching, decision-based paths         │
│                                              │
│  4. 📧 Notification                          │
│     Budget: 4 points | Best for: Emails,    │
│     alerts, external notifications          │
│                                              │
│  5. 🔁 Loop Processing                       │
│     Budget: 10 points | Best for: Batch     │
│     operations, collection iteration        │
│                                              │
│  6. ⚙️  Custom                               │
│     Budget: 7 points | Best for: Mixed      │
│     logic, specialized workflows            │
│                                              │
│  7. ℹ️  View template details                │
│  8. 🎓 Get template recommendations          │
│                                              │
└─────────────────────────────────────────────┘

Choice [1-8]: _
```

### Stage 3: Segment Building

```
┌─────────────────────────────────────────────────────────────┐
│  Building: Validation Segment                               │
├─────────────────────────────────────────────────────────────┤
│  Budget Usage: ████░░░░░░ 3/5 points (60%)                  │
│  Status: ✅ Healthy                                          │
│  Elements: 2 decisions, 1 assignment                        │
├─────────────────────────────────────────────────────────────┤
│  Recent Operations:                                          │
│  ✅ Added Decision: Check_Opportunity_Stage                  │
│  ✅ Added Assignment: Set_Validation_Flag                    │
├─────────────────────────────────────────────────────────────┤
│  Actions:                                                    │
│  1. Add element (natural language)                          │
│  2. View segment details                                    │
│  3. Check for anti-patterns                                 │
│  4. Preview complexity impact                               │
│  5. Complete this segment                                   │
│  6. Test this segment                                       │
│  7. Get suggestions                                         │
│  8. Rollback last operation                                 │
│  9. Save and exit                                           │
│  0. Cancel segment                                          │
├─────────────────────────────────────────────────────────────┤
│  Tip: You have 2 points remaining. Consider adding fault    │
│  paths for error handling before completing.                │
└─────────────────────────────────────────────────────────────┘

Choice [0-9]: _
```

### Stage 4: Element Addition (Natural Language)

```
┌─────────────────────────────────────────────┐
│  Add Element to Segment                     │
├─────────────────────────────────────────────┤
│  Describe what you want to add:             │
│                                              │
│  Examples:                                   │
│  - "Add decision: Is opportunity amount     │
│     greater than 10000"                     │
│  - "Add record lookup: Get account owner"   │
│  - "Add assignment: Set renewal flag to     │
│     true"                                    │
│  - "Add email alert: Notify sales manager"  │
│                                              │
│  Type 'back' to return to menu              │
└─────────────────────────────────────────────┘

Your instruction: _
```

### Stage 5: Complexity Preview

```
┌─────────────────────────────────────────────┐
│  Complexity Impact Preview                  │
├─────────────────────────────────────────────┤
│  Instruction: "Add decision: Is opportunity │
│  amount greater than 10000"                 │
│                                              │
│  Estimated Complexity: +2 points            │
│                                              │
│  After Addition:                             │
│  • Total: 5/5 points (100%) 🛑              │
│  • Status: AT BUDGET LIMIT                   │
│                                              │
│  ⚠️  WARNING: This will reach your budget    │
│  limit. Consider:                            │
│  • Completing segment after this element    │
│  • Removing non-critical elements           │
│  • Extracting to subflow if needed          │
│                                              │
│  Proceed? [y/N]: _                           │
└─────────────────────────────────────────────┘
```

### Stage 6: Anti-Pattern Detection

```
┌─────────────────────────────────────────────┐
│  🛑 CRITICAL ANTI-PATTERN DETECTED           │
├─────────────────────────────────────────────┤
│  Type: DML Inside Loop                       │
│                                              │
│  Issue: Record Update operation detected    │
│  inside a loop element.                     │
│                                              │
│  Impact: This will cause governor limit     │
│  errors when processing large datasets.     │
│                                              │
│  Recommendation:                             │
│  • Collect records in collection variable   │
│  • Perform bulk update AFTER loop           │
│  • Use collection-based DML pattern         │
│                                              │
│  Actions:                                    │
│  1. Remove last element and restructure     │
│  2. Get detailed guidance                   │
│  3. Proceed anyway (not recommended)        │
│  4. Exit to fix manually                    │
│                                              │
│  Choice [1-4]: _                             │
└─────────────────────────────────────────────┘
```

### Stage 7: Segment Completion

```
┌─────────────────────────────────────────────┐
│  Complete Segment?                          │
├─────────────────────────────────────────────┤
│  Segment: Validation                         │
│  Final Complexity: 5/5 points (100%)        │
│  Elements: 3 decisions, 2 assignments       │
│                                              │
│  Validation Results:                         │
│  ✅ Budget compliance                        │
│  ✅ Fault paths present                      │
│  ✅ No anti-patterns detected                │
│  ⚠️  Missing exit path (recommended)         │
│                                              │
│  Would you like to:                          │
│  1. Complete segment as-is                  │
│  2. Add missing exit path first             │
│  3. Test segment before completing          │
│  4. Continue editing                        │
│                                              │
│  Choice [1-4]: _                             │
└─────────────────────────────────────────────┘
```

### Stage 8: Testing Integration

```
┌─────────────────────────────────────────────┐
│  Segment Testing                            │
├─────────────────────────────────────────────┤
│  Generating test scenarios for segment:     │
│  "Validation"                               │
│                                              │
│  Coverage Strategy: decision-paths          │
│                                              │
│  Generated 6 test scenarios:                │
│  ✅ Happy path - valid data                  │
│  ✅ Null value handling                      │
│  ✅ Boundary condition - max amount          │
│  ✅ Invalid stage                            │
│  ✅ Missing required field                   │
│  ✅ Error condition                          │
│                                              │
│  Run tests? [Y/n]: _                         │
└─────────────────────────────────────────────┘

Running tests...
┌─────────────────────────────────────────────┐
│  Test Results                               │
├─────────────────────────────────────────────┤
│  Passed: 5/6 (83%)                          │
│  Failed: 1/6                                │
│                                              │
│  ❌ Failed: Null value handling              │
│     Expected: No errors                     │
│     Actual: NullPointerException            │
│     Location: Decision "Check Amount"       │
│                                              │
│  Recommendation: Add null check before      │
│  amount comparison                          │
│                                              │
│  Actions:                                    │
│  1. Fix and retest                          │
│  2. View detailed test report               │
│  3. Continue anyway                         │
│  4. Exit to fix manually                    │
│                                              │
│  Choice [1-4]: _                             │
└─────────────────────────────────────────────┘
```

### Stage 9: Segment Transition

```
┌─────────────────────────────────────────────┐
│  Segment Completed ✅                        │
├─────────────────────────────────────────────┤
│  Segment: Validation                         │
│  Complexity: 5/5 points                     │
│  Status: Valid                              │
│                                              │
│  Flow Progress:                              │
│  • Completed: 1 segment                     │
│  • Total Complexity: 5/42 points (12%)      │
│                                              │
│  Next Steps:                                 │
│  Based on your flow requirements, we        │
│  recommend:                                  │
│                                              │
│  1. Start "Enrichment" segment              │
│     (Best for: Data lookups, calculations)  │
│                                              │
│  2. Start "Routing" segment                 │
│     (Best for: Decision-based branching)    │
│                                              │
│  3. View all segment templates              │
│  4. Save and exit                           │
│                                              │
│  Choice [1-4]: _                             │
└─────────────────────────────────────────────┘
```

### Stage 10: Subflow Extraction Recommendation

```
┌─────────────────────────────────────────────┐
│  🔔 Subflow Extraction Recommended           │
├─────────────────────────────────────────────┤
│  Segment: Loop Processing                   │
│  Complexity: 15/10 points (150%)            │
│                                              │
│  This segment significantly exceeds the     │
│  budget. We recommend extracting it to a    │
│  subflow for better maintainability.        │
│                                              │
│  Benefits:                                   │
│  • Reduces parent flow complexity           │
│  • Improves testability                     │
│  • Enables reusability                      │
│  • Better AI comprehension                  │
│                                              │
│  Extraction Preview:                         │
│  • Subflow: Opportunity_Renewal_Loop        │
│  • Input Parameters: 3 variables            │
│  • Output Parameters: 2 variables           │
│  • Complexity Reduction: -15 points         │
│                                              │
│  Would you like to:                          │
│  1. Auto-extract to subflow now             │
│  2. Extract after completing segment        │
│  3. View extraction details                 │
│  4. Continue without extraction             │
│                                              │
│  Choice [1-4]: _                             │
└─────────────────────────────────────────────┘
```

### Stage 11: Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Flow Summary                                               │
├─────────────────────────────────────────────────────────────┤
│  Flow: OpportunityRenewalAutomation                         │
│  Total Segments: 4                                          │
│  Total Complexity: 23/42 points (55%)                       │
│  Status: ✅ Healthy                                          │
├─────────────────────────────────────────────────────────────┤
│  Segments:                                                   │
│  1. ✅ Validation (5/5) - 100% - Completed                   │
│  2. ✅ Enrichment (8/8) - 100% - Completed                   │
│  3. ✅ Routing (6/6) - 100% - Completed                      │
│  4. ✅ Notification (4/4) - 100% - Completed                 │
├─────────────────────────────────────────────────────────────┤
│  Quality Checks:                                             │
│  ✅ All segments validated                                   │
│  ✅ No anti-patterns detected                                │
│  ✅ All segments tested                                      │
│  ✅ Fault paths present                                      │
│  ✅ Budget compliance                                        │
├─────────────────────────────────────────────────────────────┤
│  Actions:                                                    │
│  1. Deploy flow to org                                      │
│  2. Generate deployment package                             │
│  3. Export segment documentation                            │
│  4. Add another segment                                     │
│  5. View detailed flow report                               │
│  6. Exit without deployment                                 │
│                                                              │
│  Choice [1-6]: _                                             │
└─────────────────────────────────────────────────────────────┘
```

## Interactive Features

### Contextual Help System

At any stage, users can access contextual help:

```
┌─────────────────────────────────────────────┐
│  Contextual Help                            │
├─────────────────────────────────────────────┤
│  Current Stage: Element Addition            │
│                                              │
│  Available Commands:                         │
│  • help - Show this help                    │
│  • back - Return to previous menu           │
│  • status - Show segment status             │
│  • suggest - Get AI suggestions             │
│  • examples - Show element examples         │
│  • best-practices - View best practices     │
│  • anti-patterns - View anti-patterns       │
│  • save - Save and exit                     │
│  • quit - Exit without saving               │
│                                              │
│  Natural Language Examples:                  │
│  • "Add decision: Check if amount > 10k"    │
│  • "Add lookup: Get account details"        │
│  • "Add assignment: Calculate discount"     │
│  • "Add email: Notify manager"              │
│                                              │
│  Press any key to continue...               │
└─────────────────────────────────────────────┘
```

### Real-Time Suggestions

```
┌─────────────────────────────────────────────┐
│  💡 Smart Suggestions                        │
├─────────────────────────────────────────────┤
│  Based on your current segment structure:   │
│                                              │
│  1. Add fault path handling                 │
│     Your decisions don't have fault paths.  │
│     Add error handling for robustness.      │
│                                              │
│  2. Consider adding null checks             │
│     Detected potential null pointer in      │
│     "Amount" field comparison.              │
│                                              │
│  3. Add exit path                           │
│     No explicit exit path defined. Add      │
│     stop element for clarity.               │
│                                              │
│  Would you like to:                          │
│  1. Apply suggestion #1                     │
│  2. Apply suggestion #2                     │
│  3. Apply suggestion #3                     │
│  4. View more details                       │
│  5. Dismiss suggestions                     │
│                                              │
│  Choice [1-5]: _                             │
└─────────────────────────────────────────────┘
```

### Rollback Capability

```
┌─────────────────────────────────────────────┐
│  Rollback Operation                         │
├─────────────────────────────────────────────┤
│  Recent Operations:                          │
│  [3] Added Decision: Check_Renewal_Date     │
│  [2] Added Assignment: Calculate_Discount   │
│  [1] Added Record Lookup: Get_Account       │
│                                              │
│  Select operation to rollback [1-3]:        │
│  (This will remove the operation and all    │
│   subsequent operations)                    │
│                                              │
│  Choice [1-3]: _                             │
└─────────────────────────────────────────────┘

Are you sure you want to rollback operation #2
and all subsequent operations? [y/N]: _

Rollback complete. Removed 2 operations.
Budget freed: 3 points
Current budget usage: 3/5 points (60%)
```

## Command Options

```bash
/flow-interactive-build <flowName> [options]

Required:
  flowName              Name of the flow to build

Options:
  --org <alias>         Salesforce org alias (required)
  --resume              Resume previous session
  --verbose             Enable detailed logging
  --auto-save           Auto-save after each operation
  --testing-enabled     Enable segment testing by default
  --strict-mode         Enable strict validation
  --allow-override      Allow budget overrides with confirmation
  --extraction-threshold <percent>  Subflow extraction threshold (default: 150)
  --coverage-strategy <strategy>    Test coverage strategy (default: decision-paths)
```

## Implementation Details

The interactive mode is orchestrated by a new script:
`scripts/lib/flow-interactive-builder.js`

This script:
1. **Manages wizard state** - Tracks current stage, segment, history
2. **Provides CLI interface** - Renders menus, captures input
3. **Integrates with existing infrastructure**:
   - `FlowAuthor` for flow manipulation
   - `FlowSegmentManager` for segment tracking
   - `FlowSegmentTemplates` for template guidance
   - `FlowSegmentTester` for testing
   - `FlowSubflowExtractor` for subflow extraction
   - `FlowValidator` for validation
4. **Maintains session state** - Saves progress, enables resume
5. **Provides contextual help** - Context-aware suggestions
6. **Handles errors gracefully** - Rollback capability

## Example Session Flow

```bash
# Start interactive builder
/flow-interactive-build OpportunityRenewalAutomation --org production

# Wizard guides through:
1. Template selection → Choose "Validation"
2. Name segment → "Initial_Validation"
3. Add elements with natural language:
   - "Add decision: Check if stage is Closed Won"
   - "Add assignment: Set renewal flag"
   - "Add decision: Validate opportunity amount"
4. Preview complexity → 5/5 points (100%)
5. Test segment → 6 scenarios, all pass
6. Complete segment → ✅

7. Start next segment → Choose "Enrichment"
8. Add elements:
   - "Add record lookup: Get account details"
   - "Add assignment: Calculate renewal date"
   - "Add record update: Update opportunity"
9. Preview complexity → 8/8 points (100%)
10. Complete segment → ✅

11. Continue for Routing and Notification segments
12. View flow summary → All segments healthy
13. Deploy to org → ✅

# Result: 4-segment flow built with guided assistance
# Total time: 15 minutes (vs 45 minutes manual)
```

## Benefits of Interactive Mode

1. **Lower Learning Curve** - Wizard guides users through complexity
2. **Real-Time Feedback** - Immediate warnings and suggestions
3. **Error Prevention** - Catch anti-patterns before they're committed
4. **Faster Development** - Streamlined workflow with keyboard shortcuts
5. **Better Quality** - Built-in testing and validation at each step
6. **Session Persistence** - Save and resume work anytime
7. **Contextual Help** - Always know what to do next

## Integration with Existing Commands

Interactive mode complements existing commands:

```bash
# Traditional approach (manual)
/flow-segment-start validation --budget 5
/flow-add "Add decision: Check stage"
/flow-add "Add assignment: Set flag"
/flow-segment-complete

# Interactive approach (guided)
/flow-interactive-build MyFlow --org production
# Wizard handles all the above steps with guidance
```

## Session Persistence

Sessions are saved in:
```
instances/<org>/<flow>/segments/.interactive-session.json
```

Resume with:
```bash
/flow-interactive-build MyFlow --org production --resume
```

## Exit Options

At any stage:
- `save` - Save progress and exit gracefully
- `quit` - Exit without saving (confirmation required)
- `back` - Return to previous menu
- `help` - Show contextual help

## Error Handling

The wizard handles errors gracefully:

```
┌─────────────────────────────────────────────┐
│  ⚠️  Error Occurred                          │
├─────────────────────────────────────────────┤
│  Operation: Add Decision                    │
│  Error: Invalid field reference "Amoun"     │
│                                              │
│  Suggestion: Did you mean "Amount"?         │
│                                              │
│  Actions:                                    │
│  1. Retry with corrected field              │
│  2. Skip this operation                     │
│  3. Rollback to previous state              │
│  4. Exit and fix manually                   │
│                                              │
│  Choice [1-4]: _                             │
└─────────────────────────────────────────────┘
```

## Best Practices Integration

The wizard automatically applies best practices:

- ✅ **Fault path reminders** - Prompts for error handling
- ✅ **Null check suggestions** - Identifies potential null pointers
- ✅ **Exit path guidance** - Ensures clear termination
- ✅ **DML/SOQL warnings** - Prevents governor limit issues
- ✅ **Budget awareness** - Shows remaining capacity
- ✅ **Testing integration** - Encourages segment testing
- ✅ **Subflow recommendations** - Suggests extraction when beneficial

## Related Commands

- `/flow-segment-start` - Start segment (manual mode)
- `/flow-segment-complete` - Complete segment (manual mode)
- `/flow-segment-status` - Check segment status
- `/flow-add` - Add element to flow (manual mode)
- `/flow-test-segment` - Test specific segment

## Related Files

- `scripts/lib/flow-interactive-builder.js` - Core wizard orchestration
- `scripts/lib/flow-segment-manager.js` - Segment tracking
- `scripts/lib/flow-segment-templates.js` - Template library
- `scripts/lib/flow-segment-tester.js` - Testing framework
- `scripts/lib/flow-subflow-extractor.js` - Subflow extraction

## Agent Integration

The `flow-segmentation-specialist` agent can:
- Launch interactive mode on user request
- Resume interrupted sessions
- Provide guidance during interactive building
- Interpret natural language instructions

Example:
```
User: "Help me build a renewal flow interactively"
Agent: "I'll launch the interactive flow builder for you."
        [Invokes /flow-interactive-build with appropriate options]
```

---

**Implementation**: Phase 4.3 (Week 8)
**Dependencies**: Phases 1-4.2 (SegmentManager, Templates, Tester, Extractor)
**Status**: Ready for development
**Lines of Code**: ~2,000 (estimated for flow-interactive-builder.js)
