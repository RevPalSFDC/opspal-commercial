---
description: Add an element to a Salesforce Flow with natural language and real-time complexity tracking
---

Add a new element to a Salesforce Flow using natural language instructions, with optional segment-aware complexity tracking and budget warnings.

The flow add command will:
- **Parse natural language** instruction into Flow XML element
- **Calculate complexity impact** before adding (with segmentation)
- **Show budget warnings** at 70%, 90%, 100% thresholds
- **Display recommendations** based on current state
- **Add element to flow** and update XML
- **Validate element** against segment rules (if applicable)

**Target Flow**: {flow-path} (path to .flow-meta.xml file)
**Instruction**: {natural-language-instruction} (e.g., "Add a decision called Status_Check if Status equals Active")

**Supported Element Types**:
- **Decision** - Conditional branching logic
- **Assignment** - Variable assignment and calculations
- **Get Records** - SOQL queries to retrieve records
- **Create Records** - DML to create new records
- **Update Records** - DML to update existing records
- **Delete Records** - DML to delete records
- **Loop** - Iterate through collections
- **Subflow** - Call another flow
- **Send Email** - Email notifications
- **Post to Chatter** - Chatter posts
- **Wait** - Pause execution until condition met
- **Screen** - User interaction (for Screen flows)

**Options**:
- `--org <alias>`: Salesforce org alias (required for validation)
- `--dry-run`: Preview complexity impact without adding element
- `--skip-preflight`: Skip complexity calculation (faster but no warnings)
- `--force`: Add element even if budget exceeded (not recommended)
- `--verbose`: Show detailed parsing and complexity breakdown

**Complexity Tracking** (when segmentation enabled):
- Calculates complexity impact before adding
- Shows current vs new complexity
- Displays budget usage percentage
- Issues warnings at thresholds (70%, 90%, 100%)
- Blocks additions exceeding budget (unless --force)

**Exit Codes**:
- `0` - Element added successfully
- `1` - Failed to parse instruction or add element
- `2` - Budget exceeded (and --force not used)
- `3` - Validation failed (invalid element for segment type)

**Examples**:

**Add Decision (Basic)**:
```bash
# Simple decision element
/flow-add ./flows/Account_Processing.flow-meta.xml \
  "Add a decision called Status_Check if Status equals Active" \
  --org neonone
```

**Add Decision with Complex Logic**:
```bash
# Decision with multiple conditions
/flow-add ./flows/Opportunity_Updates.flow-meta.xml \
  "Add a decision called High_Value if Amount greater than 100000 and Stage equals Closed Won" \
  --org neonone
```

**Add Get Records**:
```bash
# Query related records
/flow-add ./flows/Account_Processing.flow-meta.xml \
  "Add Get Records to find related Contacts where Account equals RecordId" \
  --org neonone
```

**Add Assignment**:
```bash
# Variable assignment
/flow-add ./flows/Scoring_Flow.flow-meta.xml \
  "Add assignment to set Account_Rating to Hot based on Annual_Revenue" \
  --org neonone
```

**Add Loop**:
```bash
# Iterate through collection
/flow-add ./flows/Bulk_Update.flow-meta.xml \
  "Add loop through Opportunity_Products collection" \
  --org neonone
```

**Dry-Run to Preview Complexity**:
```bash
# Check impact without making changes
/flow-add ./flows/MyFlow.flow-meta.xml \
  "Add a loop through Contacts" \
  --dry-run \
  --org neonone
```

**Force Add (Override Budget)**:
```bash
# Add even if budget exceeded (use with caution)
/flow-add ./flows/Complex_Flow.flow-meta.xml \
  "Add decision Priority_Check..." \
  --force \
  --org neonone
```

**Programmatic Usage**:
```javascript
const FlowAuthor = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-author');

const author = new FlowAuthor('neonone', {
  verbose: true,
  segmentationEnabled: true
});

await author.loadFlow('./flows/Account_Processing.flow-meta.xml');

// Add element (with complexity tracking if segment active)
const result = await author.addElement(
  'Add a decision called Status_Check if Status equals Active'
);

console.log('Element added:', result.elementName);
console.log('Complexity impact:', result.complexityImpact?.score);
console.log('New complexity:', result.newComplexity);
console.log('Budget usage:', result.budgetUsage + '%');

// Check for warnings
if (result.warnings && result.warnings.length > 0) {
  result.warnings.forEach(warning => {
    console.log(`⚠️ ${warning.message}`);
  });
}
```

**Output with Complexity Tracking** (Segmentation Enabled):

```
📝 Adding Element to Flow

Parsing instruction...
✅ Parsed: Decision "Status_Check" (Status = "Active")

📊 Complexity Impact Analysis:
   Element type: Decision
   Complexity: +2 points

📈 Current Segment Status:
   Segment: Input_Validation (validation)
   Current: 2/5 (40%)
   After add: 4/5 (80%) ⚠️

⚠️ CAUTION: Segment at 80% of budget
   → Recommendation: Add 1 more element max, then complete segment

✅ Element Added Successfully
   Name: Status_Check
   Type: Decision
   Complexity: 2 points
   Total segment complexity: 4/5 (80%)

💡 Next Steps:
   - Add 0-1 more elements (1 point remaining)
   - Or complete segment with /flow-segment-complete
```

**Output with Budget Warning (90%)**:
```
📝 Adding Element to Flow

Parsing instruction...
✅ Parsed: Decision "Priority_Check" (Priority = "High")

📊 Complexity Impact Analysis:
   Element type: Decision
   Complexity: +2 points

📈 Current Segment Status:
   Segment: Routing_Logic (routing)
   Current: 4/6 (67%)
   After add: 6/6 (100%) 🛑

🛑 CRITICAL: Segment at 100% of budget
   → This will fill the budget completely
   → Must complete segment after this addition

⚠️ Confirm Addition? (y/n)
[User input required unless --force]

✅ Element Added Successfully
   Name: Priority_Check
   Type: Decision
   Complexity: 2 points
   Total segment complexity: 6/6 (100%)

⚠️ SEGMENT FULL - MUST COMPLETE NOW
   Use: /flow-segment-complete ./MyFlow.flow-meta.xml --validate --org myorg
```

**Output with Budget Exceeded**:

```
📝 Adding Element to Flow

Parsing instruction...
✅ Parsed: Decision "Final_Check" (Status = "Complete")

📊 Complexity Impact Analysis:
   Element type: Decision
   Complexity: +2 points

📈 Current Segment Status:
   Segment: Validation (validation)
   Current: 5/5 (100%)
   After add: 7/5 (140%) ❌

❌ ERROR: Budget Exceeded
   Segment: Validation (validation)
   Budget: 5 points
   Current: 5 points
   After add: 7 points (140%)
   Overage: +2 points (40%)

🚫 Addition Blocked

💡 Options:
   1. Complete current segment first:
      /flow-segment-complete ./MyFlow.flow-meta.xml --validate --org myorg

   2. Start new segment:
      /flow-segment-start ./MyFlow.flow-meta.xml Validation_Part2 --type validation --org myorg

   3. Force add (not recommended):
      /flow-add ./MyFlow.flow-meta.xml "..." --force --org myorg

Exiting with code 2 (budget exceeded)
```

**Output without Segmentation**:

```
📝 Adding Element to Flow

Parsing instruction...
✅ Parsed: Decision "Status_Check" (Status = "Active")

✅ Element Added Successfully
   Name: Status_Check
   Type: Decision

💡 Tip: Enable segmentation for complexity tracking
   author.enableSegmentation();
```

**Dry-Run Output**:

```
📝 Dry-Run: Previewing Element Addition

Parsing instruction...
✅ Parsed: Loop through "Contacts" collection

📊 Complexity Impact Analysis:
   Element type: Loop
   Complexity: +3 points
   Breakdown: loops (1) = 3 points

📈 Projected Segment Status:
   Segment: BulkProcessing (loopProcessing)
   Current: 7/10 (70%)
   After add: 10/10 (100%) 🛑
   Impact: +30% budget usage

⚠️ Warnings:
   - This will fill budget to 100%
   - Must complete segment after adding
   - No room for additional elements

💡 Recommendations:
   ✅ Addition acceptable (within budget)
   ⚠️ Plan to complete segment immediately after
   ℹ️ Consider: Ensure loop is properly bulkified

🔍 Dry-Run Complete (no changes made)
   Use: /flow-add ./MyFlow.flow-meta.xml "..." --org myorg (without --dry-run)
```

**Verbose Output**:

```
📝 Adding Element to Flow (Verbose Mode)

[1] Parsing instruction...
    Input: "Add a decision called Status_Check if Status equals Active"
    Detected type: Decision
    Detected name: Status_Check
    Detected condition: Status = "Active"

[2] Complexity calculation...
    Element type: Decision
    Weight: 2 points
    Keyword analysis: "decision" detected
    Impact: +2 points

[3] Segment status check...
    Has active segment: true
    Segment name: Input_Validation
    Segment type: validation
    Current complexity: 2 points
    Budget: 5 points
    Usage: 40%

[4] Budget validation...
    Projected complexity: 4 points
    Projected usage: 80%
    Threshold: CAUTION (>70%)
    Status: ACCEPTABLE

[5] Adding element to XML...
    Element added to flow XML
    Connector created
    Metadata updated

[6] Recording operation...
    Operation recorded in segment history
    Complexity tracked: +2 points
    Timestamp: 2025-11-21T12:30:45Z

✅ Element Added Successfully
   [Full output as shown above]
```

**Integration with Workflow**:

```bash
# Full segment workflow with complexity-tracked additions
/flow-segment-start ./MyFlow.flow-meta.xml Validation --type validation --org myorg

# Add elements with automatic warnings
/flow-add ./MyFlow.flow-meta.xml "Add decision Status_Check..." --org myorg
# Output: "2/5 (40%)"

/flow-add ./MyFlow.flow-meta.xml "Add decision Amount_Check..." --org myorg
# Output: "4/5 (80%) ⚠️ CAUTION"

# Check status before adding more
/flow-segment-status ./MyFlow.flow-meta.xml --org myorg

# Add one more (completes budget)
/flow-add ./MyFlow.flow-meta.xml "Add assignment Set_Rating..." --org myorg
# Output: "4/5 (80%)" (assignments = 0 points)

# Try to add beyond budget
/flow-add ./MyFlow.flow-meta.xml "Add decision Final_Check..." --org myorg
# Output: "❌ ERROR: Budget Exceeded" (exit code 2)

# Complete segment
/flow-segment-complete ./MyFlow.flow-meta.xml --validate --org myorg
```

**Conditional Addition Based on Budget**:

```bash
# Script to safely add elements
add_with_budget_check() {
  local flow=$1
  local instruction=$2
  local org=$3

  # Dry-run to check impact
  RESULT=$(/flow-add "$flow" "$instruction" --dry-run --org "$org" 2>&1)

  # Extract projected usage
  USAGE=$(echo "$RESULT" | grep "After add:" | grep -oP '\d+(?=%)')

  if [ "$USAGE" -le 90 ]; then
    echo "✅ Safe to add (${USAGE}% usage)"
    /flow-add "$flow" "$instruction" --org "$org"
  elif [ "$USAGE" -le 100 ]; then
    echo "⚠️ Warning: ${USAGE}% usage, segment will be full"
    read -p "Continue? (y/n) " -n 1 -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      /flow-add "$flow" "$instruction" --org "$org"
    fi
  else
    echo "❌ Blocked: ${USAGE}% exceeds budget"
    echo "Complete segment first"
    return 1
  fi
}

# Usage
add_with_budget_check ./MyFlow.flow-meta.xml "Add decision..." myorg
```

**Budget Threshold Indicators**:

- **0-69%**: ✅ OK - Healthy budget, safe to continue
- **70-89%**: ⚠️ CAUTION - Approaching limit, plan to complete soon
- **90-99%**: 🛑 CRITICAL - Near limit, add carefully
- **100%**: ⚠️ FULL - Budget complete, must complete segment now
- **>100%**: ❌ EXCEEDED - Blocked (unless --force)

**Anti-Pattern Warnings**:

The command detects potential anti-patterns when adding to segments:

```
⚠️ WARNING: Potential Anti-Pattern Detected

Adding: Get Records (inside loop segment)
Issue: SOQL query in loop
Severity: CRITICAL
Impact: Governor limit violations (max 100 SOQL/transaction)

Recommendation:
  ❌ Don't: Query inside loop
  ✅ Do: Query before loop, filter in memory

Continue anyway? (--force to bypass)
```

**Element Syntax Guide**:

**Decisions**:
- "Add a decision called {name} if {field} equals {value}"
- "Add a decision called {name} if {field} greater than {value}"
- "Add a decision called {name} if {field} contains {value}"

**Assignments**:
- "Add assignment to set {variable} to {value}"
- "Add assignment to calculate {variable} from {formula}"

**Get Records**:
- "Add Get Records to find {object} where {conditions}"
- "Add Get Records for related {object}"

**Create/Update/Delete Records**:
- "Add Create Records for {object}"
- "Add Update Records for {object}"
- "Add Delete Records for {object}"

**Loops**:
- "Add loop through {collection}"
- "Add loop through {object} records"

**Email/Chatter**:
- "Add Send Email to {recipient}"
- "Add Post to Chatter in {feed}"

**Runbook Reference**: See Runbook 3 - Tools and Techniques, Section 2 (NLP Method)

**Estimated Duration**: 5-10 seconds per element

**Related Commands**:
- `/flow-segment-start` - Start new segment with budget tracking
- `/flow-segment-status` - Check current segment status
- `/flow-segment-complete` - Complete segment with validation
- `/flow validate` - Validate entire flow

**Use the FlowAuthor script to add an element to {flow-path} using natural language, with real-time complexity tracking and budget warnings to prevent exceeding segment budgets.**
