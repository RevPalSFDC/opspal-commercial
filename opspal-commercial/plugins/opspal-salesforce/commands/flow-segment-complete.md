---
description: Complete the current segment in a Salesforce Flow with comprehensive validation
argument-hint: "./flows/Account_Processing.flow-meta.xml --validate --org gamma-corp"
---

Complete the current active segment in a Salesforce Flow, performing comprehensive validation against template rules, anti-patterns, and complexity constraints.

The segment completion will:
- **Validate segment** against template-specific rules
- **Check anti-patterns** (DML/SOQL in loops, missing fault paths)
- **Verify complexity** is within budget (or document overages)
- **Check segment isolation** to prevent interference with other segments
- **Generate completion report** with validation results and recommendations
- **Mark segment complete** in metadata

**Target Flow**: {flow-path} (path to .flow-meta.xml file with active segment)

**Options**:
- `--validate`: Enable comprehensive validation (default: true)
- `--force`: Complete even if validation fails (not recommended)
- `--strict`: Treat warnings as errors (fail on budget overages)
- `--save-report <path>`: Save validation report to file
- `--org <alias>`: Salesforce org alias (required for validation)

**Validation Stages**:
1. **Template Rules** - Check type-specific constraints
2. **Anti-Pattern Detection** - Critical issues (DML/SOQL in loops)
3. **Element Counts** - Verify within limits (max decisions, max lookups)
4. **Nesting Levels** - Check complexity of nested structures
5. **Segment Isolation** - Ensure proper boundaries
6. **Connector Validation** - Verify clean transitions

**Exit Codes**:
- `0` - Segment completed successfully, passed validation
- `1` - Validation failed (critical errors)
- `2` - Completed with warnings (budget overage, minor issues)
- `3` - No active segment to complete
- `4` - Forced completion (validation failed but --force used)

**Examples**:

**Complete with Validation**:
```bash
# Standard completion with full validation
/flow-segment-complete ./flows/Account_Processing.flow-meta.xml --validate --org gamma-corp
```

**Complete and Save Report**:
```bash
# Save validation report for review
/flow-segment-complete ./flows/Account_Processing.flow-meta.xml \
  --validate \
  --save-report ./reports/validation-report.json \
  --org gamma-corp
```

**Strict Mode (Fail on Warnings)**:
```bash
# Treat budget overages as errors
/flow-segment-complete ./flows/Opportunity_Updates.flow-meta.xml \
  --validate \
  --strict \
  --org gamma-corp
```

**Force Completion (Not Recommended)**:
```bash
# Complete despite validation failures (use with caution)
/flow-segment-complete ./flows/Complex_Flow.flow-meta.xml \
  --force \
  --org gamma-corp
```

**Programmatic Usage**:
```javascript
const FlowAuthor = require('./scripts/lib/flow-author');

const author = new FlowAuthor('gamma-corp', {
  verbose: true,
  segmentationEnabled: true
});

await author.loadFlow('./flows/Account_Processing.flow-meta.xml');

// Complete with validation
const result = await author.completeSegment({
  validate: true,
  strict: false
});

console.log('Segment completed:', result.segmentName);
console.log('Valid:', result.valid);
console.log('Errors:', result.errors.length);
console.log('Warnings:', result.warnings.length);
console.log('Final complexity:', result.complexity);
console.log('Budget usage:', result.budgetUsage + '%');

// Check validation details
if (result.errors.length > 0) {
  console.log('Validation errors:');
  result.errors.forEach(err => {
    console.log(`  - [${err.severity}] ${err.message}`);
  });
}
```

**Validation Report Format**:

```json
{
  "segmentName": "Input_Validation",
  "segmentType": "validation",
  "valid": false,
  "completedAt": "2025-11-21T10:30:00Z",
  "complexity": {
    "current": 6,
    "budget": 5,
    "usage": 120,
    "exceeded": true
  },
  "errors": [
    {
      "rule": "budget-exceeded",
      "severity": "error",
      "message": "Segment complexity (6) exceeds budget (5)",
      "recommendation": "Consider splitting into two segments"
    },
    {
      "rule": "missing-fault-paths",
      "severity": "error",
      "message": "Decision elements lack fault paths",
      "elements": ["Decision1", "Decision2"],
      "recommendation": "Add fault connectors to all decision branches"
    }
  ],
  "warnings": [
    {
      "rule": "segment-isolation",
      "severity": "warning",
      "message": "Segment may interfere with other segments",
      "details": "Variables used: AccountStatus, AccountRating"
    }
  ],
  "elementCounts": {
    "decisions": 3,
    "assignments": 2,
    "recordLookups": 0,
    "loops": 0
  },
  "recommendations": [
    "Add fault paths to Decision1 and Decision2",
    "Consider splitting segment if complexity continues to grow",
    "Use consistent naming: Validation_*, *_Check"
  ]
}
```

**Common Validation Errors**:

**Budget Exceeded**:
```
❌ ERROR: Segment complexity (6) exceeds budget (5)
   Recommendation: Split into two segments or increase budget
   Elements: Decision1 (2), Decision2 (2), Decision3 (2)
```

**DML in Loops (CRITICAL)**:
```
🛑 CRITICAL: DML operations found inside loops
   Elements: Loop1 > RecordUpdate1
   Impact: Governor limit violations, poor performance
   Fix: Collect records in loop, perform bulk DML after loop
```

**Missing Fault Paths**:
```
❌ ERROR: Decision elements lack fault paths
   Elements: Decision1, Decision2
   Impact: Flow execution may fail silently
   Fix: Add fault connectors to all decision branches
```

**Too Many Decisions**:
```
❌ ERROR: Too many decisions (5 > 3) for validation segment
   Recommendation: Split into multiple validation segments
   Alternatively: Change segment type to 'routing'
```

**Successful Completion Output**:

```
✅ Segment 'Input_Validation' completed successfully

📊 Summary:
   Type: validation
   Complexity: 4/5 (80%)
   Elements: 2 decisions, 1 assignment
   Duration: 15 seconds

✅ Validation Passed:
   - All template rules satisfied
   - No anti-patterns detected
   - Budget within limits
   - Segment properly isolated

💡 Recommendations:
   - Good use of fault paths
   - Consistent naming convention
   - Consider adding description metadata

📁 Next Steps:
   1. Start next segment with /flow-segment-start
   2. Or deploy flow with sf project deploy start
```

**Completion with Warnings Output**:

```
⚠️ Segment 'Data_Enrichment' completed with warnings

📊 Summary:
   Type: enrichment
   Complexity: 9/8 (112%) ⚠️ OVER BUDGET
   Elements: 3 record lookups, 5 assignments
   Duration: 20 seconds

⚠️ Warnings (2):
   1. Budget exceeded by 1 point (12.5%)
      → Consider: Split segment or increase budget

   2. Segment isolation concern
      → Variables used: AccountRating, AccountTier
      → Ensure no conflicts with other segments

✅ Validation Passed:
   - No critical anti-patterns
   - All template rules satisfied
   - Proper fault path handling

💡 Recommendations:
   - Document budget overage rationale
   - Review variable naming for clarity
   - Add null checks for record lookups
```

**Integration with Workflow**:

```bash
# Full segment workflow
/flow-segment-start ./MyFlow.flow-meta.xml Validation --type validation --org myorg

# Add elements (complexity tracked automatically)
/flow-segment-add ./MyFlow.flow-meta.xml "Add decision Status_Check..." --org myorg
/flow-segment-add ./MyFlow.flow-meta.xml "Add decision Amount_Check..." --org myorg

# Check status before completing
/flow-segment-status ./MyFlow.flow-meta.xml --org myorg

# Complete with validation
/flow-segment-complete ./MyFlow.flow-meta.xml --validate --org myorg

# Start next segment
/flow-segment-start ./MyFlow.flow-meta.xml Enrichment --type enrichment --org myorg
```

**When to Use --force**:

Use `--force` only in these scenarios:
- **Budget overages are justified** (complex business logic, no way to simplify)
- **False positive anti-patterns** (e.g., DML in loop is actually bulkified)
- **Rapid prototyping** (will refactor later)
- **Emergency fixes** (validation can wait)

**Always document** why --force was used for future reference.

**Validation Bypass**:

```bash
# Skip validation entirely (not recommended)
/flow-segment-complete ./MyFlow.flow-meta.xml --validate=false --org myorg

# Or programmatically
await author.completeSegment({ validate: false });
```

**Runbook Reference**: See Runbook 8 - Incremental Segment Building (coming in Phase 5)

**Estimated Duration**: 5-10 seconds (depends on segment size)

**Related Commands**:
- `/flow-segment-start` - Start new segment
- `/flow-segment-status` - Check segment status
- `/flow-segment-list` - List all segments
- `/flow validate` - Validate entire flow

**Use the FlowAuthor script to complete the current segment in {flow-path}, performing comprehensive validation and generating a completion report with recommendations.**
