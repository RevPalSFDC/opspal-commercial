---
description: List all segments in a Salesforce Flow with summary statistics and recommendations
argument-hint: "./flows/Account_Processing.flow-meta.xml --org gamma-corp"
---

List all segments in a Salesforce Flow, showing completion status, complexity distribution, and flow-level recommendations for segment organization.

The list command will:
- **Show all segments** (completed and active) in chronological order
- **Display summary statistics** (total complexity, average budget usage)
- **Highlight issues** (budget overages, incomplete segments)
- **Provide recommendations** for segment organization
- **Show flow timeline** (segment progression over time)

**Target Flow**: {flow-path} (path to .flow-meta.xml file)

**Options**:
- `--filter <status>`: Filter by status - `active`, `completed`, `all` (default: all)
- `--sort <field>`: Sort by field - `name`, `type`, `complexity`, `usage`, `created` (default: created)
- `--format <format>`: Output format - `table` (default), `json`, `timeline`
- `--verbose`: Show detailed element breakdown per segment
- `--org <alias>`: Salesforce org alias (optional)

**Exit Codes**:
- `0` - List retrieved successfully
- `1` - Flow not found or invalid
- `2` - No segments in flow (segmentation not enabled)

**Examples**:

**List All Segments**:
```bash
# Show all segments with default table format
/flow-segment-list ./flows/Account_Processing.flow-meta.xml --org gamma-corp
```

**Filter Active Segments Only**:
```bash
# Show only in-progress segments
/flow-segment-list ./flows/Account_Processing.flow-meta.xml --filter active --org gamma-corp
```

**Sort by Complexity**:
```bash
# Show segments ordered by complexity (highest first)
/flow-segment-list ./flows/Opportunity_Updates.flow-meta.xml --sort complexity --org gamma-corp
```

**Timeline View**:
```bash
# Chronological timeline of segment development
/flow-segment-list ./flows/MyFlow.flow-meta.xml --format timeline --org gamma-corp
```

**JSON Output for Analysis**:
```bash
# Machine-readable format for scripting
/flow-segment-list ./flows/MyFlow.flow-meta.xml --format json --org gamma-corp | jq '.segments[] | select(.complexity.usage > 90)'
```

**Programmatic Usage**:
```javascript
const FlowAuthor = require('./scripts/lib/flow-author');

const author = new FlowAuthor('gamma-corp', {
  verbose: true,
  segmentationEnabled: true
});

await author.loadFlow('./flows/Account_Processing.flow-meta.xml');

// List all segments
const segments = author.listSegments();

console.log('Total segments:', segments.length);
console.log('Active segments:', segments.filter(s => s.status === 'active').length);
console.log('Completed segments:', segments.filter(s => s.status === 'completed').length);

// Calculate flow statistics
const totalComplexity = segments.reduce((sum, s) => sum + s.complexity, 0);
const avgBudgetUsage = segments.reduce((sum, s) => sum + s.budgetUsage, 0) / segments.length;

console.log('Total flow complexity:', totalComplexity);
console.log('Average budget usage:', avgBudgetUsage.toFixed(1) + '%');

// Find segments over budget
const overBudget = segments.filter(s => s.complexity > s.budget);
if (overBudget.length > 0) {
  console.log('Segments over budget:', overBudget.map(s => s.name).join(', '));
}
```

**List Output (Table Format - Default)**:

```
📊 Segments in Flow: Account_Processing.flow-meta.xml

Total Segments: 4 (3 completed, 1 active)
Total Flow Complexity: 22 points

┌─────┬──────────────────────┬─────────────┬────────┬──────────┬────────┬─────────┬──────────┐
│ #   │ Segment              │ Type        │ Status │ Complex  │ Budget │ Usage   │ Duration │
├─────┼──────────────────────┼─────────────┼────────┼──────────┼────────┼─────────┼──────────┤
│ 1   │ Input_Validation     │ validation  │ ✅     │ 4        │ 5      │ 80%     │ 3m 15s   │
│ 2   │ Data_Enrichment      │ enrichment  │ ✅     │ 8        │ 8      │ 100%    │ 5m 42s   │
│ 3   │ Routing_Logic        │ routing     │ ✅     │ 5        │ 6      │ 83%     │ 4m 10s   │
│ 4   │ Notification_Setup   │ notification│ 🔄     │ 2        │ 4      │ 50%     │ ongoing  │
└─────┴──────────────────────┴─────────────┴────────┴──────────┴────────┴─────────┴──────────┘

🔄 Active: Notification_Setup (started 2m ago)

📊 Flow Statistics:
   Average Budget Usage: 78.25%
   Segments Over Budget: 0
   Segments Near Limit (>90%): 1 (Data_Enrichment)

💡 Flow Recommendations:
   ✅ Good segment balance across types
   ✅ No critical budget overages
   ⚠️ Data_Enrichment at 100% - may need refactoring if extended
   ℹ️ Consider adding error handling segment
```

**List Output (Timeline Format)**:

```
📅 Segment Timeline: Account_Processing.flow-meta.xml

Flow Start: 2025-11-21 10:00:00
Total Duration: 13m 7s (so far)

10:00:00 ──────────────────────────────────────────────────────────
         │
         ├─ 📝 Input_Validation (validation)
         │  ├─ Started: 10:00:15
         │  ├─ Complexity: 4/5 (80%)
         │  ├─ Operations: 3
         │  └─ Completed: 10:03:30 ✅
         │
10:03:30 ├─ 🔍 Data_Enrichment (enrichment)
         │  ├─ Started: 10:03:45
         │  ├─ Complexity: 8/8 (100%)
         │  ├─ Operations: 7
         │  └─ Completed: 10:09:27 ✅
         │
10:09:27 ├─ 🔀 Routing_Logic (routing)
         │  ├─ Started: 10:09:40
         │  ├─ Complexity: 5/6 (83%)
         │  ├─ Operations: 4
         │  └─ Completed: 10:13:50 ✅
         │
10:13:50 ├─ 📧 Notification_Setup (notification) 🔄 ACTIVE
         │  ├─ Started: 10:14:05
         │  ├─ Complexity: 2/4 (50%)
         │  ├─ Operations: 2
         │  └─ In Progress (2m elapsed)
         │
Current  ──────────────────────────────────────────────────────────

⏱️ Timeline Stats:
   Total segments: 4 (3 complete, 1 active)
   Average segment time: 4m 22s
   Estimated completion: 2m remaining
```

**List Output (Verbose with Element Breakdown)**:

```
📊 Detailed Segment List

Flow: Account_Processing.flow-meta.xml

╔════════════════════════════════════════════════════════════════╗
║ Segment 1: Input_Validation (validation) ✅                    ║
╚════════════════════════════════════════════════════════════════╝

Complexity: 4/5 (80%)
Started: 10:00:15 | Completed: 10:03:30 | Duration: 3m 15s

Elements (3):
  1. Decision: Status_Check (2 pts)
  2. Decision: Amount_Check (2 pts)
  3. Assignment: Set_Rating (0 pts)

Template Compliance:
  ✅ Within budget
  ✅ Proper fault paths
  ✅ No record operations

╔════════════════════════════════════════════════════════════════╗
║ Segment 2: Data_Enrichment (enrichment) ✅                     ║
╚════════════════════════════════════════════════════════════════╝

Complexity: 8/8 (100%)
Started: 10:03:45 | Completed: 10:09:27 | Duration: 5m 42s

Elements (7):
  1. Get Records: Find_Related_Contacts (2 pts)
  2. Get Records: Find_Opportunities (2 pts)
  3. Get Records: Find_Cases (2 pts)
  4. Assignment: Calculate_Total_Amount (0 pts)
  5. Assignment: Set_Account_Rating (0 pts)
  6. Assignment: Set_Priority_Flag (0 pts)
  7. Decision: Has_Related_Records (2 pts)

Template Compliance:
  ✅ Within budget (at 100%)
  ✅ No SOQL in loops
  ⚠️ At record lookup limit (3/3)

[Additional segments...]
```

**List Output (JSON Format)**:

```json
{
  "flow": "Account_Processing.flow-meta.xml",
  "totalSegments": 4,
  "completedSegments": 3,
  "activeSegments": 1,
  "totalFlowComplexity": 22,
  "statistics": {
    "averageBudgetUsage": 78.25,
    "segmentsOverBudget": 0,
    "segmentsNearLimit": 1,
    "averageDuration": 262
  },
  "segments": [
    {
      "id": 1,
      "name": "Input_Validation",
      "type": "validation",
      "status": "completed",
      "startedAt": "2025-11-21T10:00:15Z",
      "completedAt": "2025-11-21T10:03:30Z",
      "duration": 195,
      "complexity": {
        "current": 4,
        "budget": 5,
        "usage": 80
      },
      "elements": {
        "decisions": 2,
        "assignments": 1,
        "total": 3
      },
      "validation": {
        "passed": true,
        "issues": []
      }
    },
    {
      "id": 2,
      "name": "Data_Enrichment",
      "type": "enrichment",
      "status": "completed",
      "startedAt": "2025-11-21T10:03:45Z",
      "completedAt": "2025-11-21T10:09:27Z",
      "duration": 342,
      "complexity": {
        "current": 8,
        "budget": 8,
        "usage": 100
      },
      "elements": {
        "recordLookups": 3,
        "assignments": 3,
        "decisions": 1,
        "total": 7
      },
      "validation": {
        "passed": true,
        "warnings": ["At record lookup limit (3/3)"]
      }
    }
  ],
  "recommendations": [
    "Good segment balance across types",
    "No critical budget overages",
    "Data_Enrichment at 100% - may need refactoring if extended",
    "Consider adding error handling segment"
  ]
}
```

**Filtered Views**:

**Active Segments Only**:
```bash
/flow-segment-list ./MyFlow.flow-meta.xml --filter active

# Output:
🔄 Active Segments (1)

┌──────────────────────┬─────────────┬──────────┬────────┬─────────┐
│ Segment              │ Type        │ Complex  │ Budget │ Usage   │
├──────────────────────┼─────────────┼──────────┼────────┼─────────┤
│ Notification_Setup   │ notification│ 2        │ 4      │ 50%     │
└──────────────────────┴─────────────┴──────────┴────────┴─────────┘

Started 2m ago | Duration: 2m 15s
```

**Completed Segments Only**:
```bash
/flow-segment-list ./MyFlow.flow-meta.xml --filter completed

# Output:
✅ Completed Segments (3)

┌──────────────────────┬─────────────┬──────────┬────────┬─────────┬──────────┐
│ Segment              │ Type        │ Complex  │ Budget │ Usage   │ Duration │
├──────────────────────┼─────────────┼──────────┼────────┼─────────┼──────────┤
│ Input_Validation     │ validation  │ 4        │ 5      │ 80%     │ 3m 15s   │
│ Data_Enrichment      │ enrichment  │ 8        │ 8      │ 100%    │ 5m 42s   │
│ Routing_Logic        │ routing     │ 5        │ 6      │ 83%     │ 4m 10s   │
└──────────────────────┴─────────────┴──────────┴────────┴─────────┴──────────┘

Total Complexity: 17 points | Average Duration: 4m 22s
```

**Sorted by Complexity (Descending)**:
```bash
/flow-segment-list ./MyFlow.flow-meta.xml --sort complexity

# Shows segments with highest complexity first
# Useful for identifying refactoring candidates
```

**Analysis Use Cases**:

**Find Over-Budget Segments**:
```bash
/flow-segment-list ./MyFlow.flow-meta.xml --format json | \
  jq '.segments[] | select(.complexity.usage > 100) | {name, complexity: .complexity.current, budget: .complexity.budget}'
```

**Calculate Total Flow Complexity**:
```bash
/flow-segment-list ./MyFlow.flow-meta.xml --format json | \
  jq '.totalFlowComplexity'
```

**Find Longest Segments**:
```bash
/flow-segment-list ./MyFlow.flow-meta.xml --format json | \
  jq '.segments | sort_by(.duration) | reverse | .[0:3] | .[] | {name, duration}'
```

**Integration with CI/CD**:

```bash
# Fail build if any segment exceeds budget by >10%
SEGMENTS=$(/flow-segment-list ./MyFlow.flow-meta.xml --format json)
OVER_BUDGET=$(echo $SEGMENTS | jq '.segments[] | select(.complexity.usage > 110) | .name' | wc -l)

if [ $OVER_BUDGET -gt 0 ]; then
  echo "❌ Build failed: $OVER_BUDGET segments exceed budget by >10%"
  echo $SEGMENTS | jq '.segments[] | select(.complexity.usage > 110) | {name, complexity, budget}'
  exit 1
fi
```

**Segment Organization Recommendations**:

The command analyzes segment distribution and provides recommendations:

- **Too many validation segments**: Consider consolidating
- **Missing error handling**: Suggest adding fault handling segment
- **Unbalanced complexity**: Identify segments that should be split
- **Segment type patterns**: Suggest reordering for better flow
- **Budget optimization**: Identify segments that could share budget

**Example Recommendations**:

```
💡 Segment Organization Recommendations:

1. Balance: GOOD
   ✅ 4 segment types represented
   ✅ No single type dominates (max 25%)

2. Complexity Distribution: ACCEPTABLE
   ⚠️ Data_Enrichment (36%) carries most complexity
   → Consider: Split into Data_Enrichment_1 and Data_Enrichment_2

3. Missing Patterns: MINOR
   ℹ️ No error handling segment detected
   → Consider: Add dedicated fault handling segment

4. Budget Efficiency: GOOD
   ✅ Average usage 78% (optimal: 70-85%)
   ✅ No segments significantly under budget

5. Segment Order: OPTIMAL
   ✅ Validation → Enrichment → Routing → Notification
   ✅ Follows best practice patterns
```

**Runbook Reference**: See Runbook 8 - Incremental Segment Building (coming in Phase 5)

**Estimated Duration**: < 2 seconds

**Related Commands**:
- `/flow-segment-start` - Start new segment
- `/flow-segment-complete` - Complete current segment
- `/flow-segment-status` - Get active segment status
- `/flow validate` - Validate entire flow

**Use the FlowAuthor script to list all segments in {flow-path}, showing completion status, complexity distribution, and flow-level recommendations for optimal segment organization.**
