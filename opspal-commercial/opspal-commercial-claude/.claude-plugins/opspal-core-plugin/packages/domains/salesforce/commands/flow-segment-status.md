---
description: Get status of current or all segments in a Salesforce Flow with complexity tracking
---

Display real-time status of the current active segment or all segments in a Salesforce Flow, including complexity tracking, budget usage, and recommendations.

The status command will:
- **Show active segment** details (name, type, complexity, budget)
- **Display budget usage** with visual indicators (70%, 90%, 100% thresholds)
- **List recent operations** and their complexity impact
- **Provide recommendations** based on current state
- **Show segment timeline** (start time, duration, estimated completion)

**Target Flow**: {flow-path} (path to .flow-meta.xml file)

**Options**:
- `--all`: Show all segments (completed and active)
- `--verbose`: Show detailed element breakdown
- `--format <format>`: Output format - `table` (default), `json`, `summary`
- `--org <alias>`: Salesforce org alias (optional)

**Output Formats**:
- **table** - Formatted table with visual indicators
- **json** - Machine-readable JSON for scripting
- **summary** - Brief one-line summary

**Exit Codes**:
- `0` - Status retrieved successfully
- `1` - Flow not found or invalid
- `2` - No segments in flow (segmentation not enabled)

**Examples**:

**Get Current Segment Status**:
```bash
# Show active segment with default table format
/flow-segment-status ./flows/Account_Processing.flow-meta.xml --org neonone
```

**Show All Segments**:
```bash
# List all segments (completed and active)
/flow-segment-status ./flows/Account_Processing.flow-meta.xml --all --org neonone
```

**Verbose Output with Element Breakdown**:
```bash
# Detailed status with all elements
/flow-segment-status ./flows/Opportunity_Updates.flow-meta.xml --verbose --org neonone
```

**JSON Output for Scripting**:
```bash
# Machine-readable format
/flow-segment-status ./flows/MyFlow.flow-meta.xml --format json --org neonone | jq '.complexity'
```

**Programmatic Usage**:
```javascript
const FlowAuthor = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-author');

const author = new FlowAuthor('neonone', {
  verbose: true,
  segmentationEnabled: true
});

await author.loadFlow('./flows/Account_Processing.flow-meta.xml');

// Get current segment status
const status = author.getSegmentStatus();

console.log('Active:', status.hasActiveSegment);
console.log('Name:', status.name);
console.log('Type:', status.type);
console.log('Complexity:', status.complexity);
console.log('Budget:', status.budget);
console.log('Usage:', status.budgetUsage + '%');

// List all segments
const segments = author.listSegments();
console.log('Total segments:', segments.length);
segments.forEach(seg => {
  console.log(`  ${seg.name}: ${seg.complexity}/${seg.budget} (${seg.status})`);
});
```

**Status Output (Table Format - Default)**:

```
📊 Active Segment Status

Segment: Input_Validation
Type: validation
Status: Active
Started: 2 minutes ago

┌────────────────────────┬─────────┬────────┬─────────┐
│ Metric                 │ Current │ Budget │ Usage   │
├────────────────────────┼─────────┼────────┼─────────┤
│ Complexity             │ 4       │ 5      │ 80% ⚠️  │
│ Decisions              │ 2       │ 3      │ 67%     │
│ Assignments            │ 1       │ -      │ -       │
│ Record Operations      │ 0       │ 0      │ ✅      │
└────────────────────────┴─────────┴────────┴─────────┘

⚠️ Budget Status: CAUTION (80% used)
   → Consider completing segment soon

📝 Recent Operations:
   1. Add decision Status_Check (+2 pts) → 2/5 (40%)
   2. Add decision Amount_Check (+2 pts) → 4/5 (80%)
   3. Add assignment Set_Rating (+0 pts) → 4/5 (80%)

💡 Recommendations:
   ✅ Good: Within budget, proper fault paths
   ⚠️ Caution: Approaching budget limit (80%)
   → Action: Add 1 more element max, then complete

🕐 Timeline:
   Started: 10:15:30
   Duration: 2m 15s
   Operations: 3
```

**Status with Budget Warning (90%)**:

```
📊 Active Segment Status

Segment: Data_Enrichment
Type: enrichment
Status: Active (CRITICAL ❌)
Started: 5 minutes ago

┌────────────────────────┬─────────┬────────┬─────────┐
│ Metric                 │ Current │ Budget │ Usage   │
├────────────────────────┼─────────┼────────┼─────────┤
│ Complexity             │ 9       │ 10     │ 90% 🛑  │
│ Record Lookups         │ 3       │ 3      │ 100% ⚠️ │
│ Assignments            │ 6       │ 10     │ 60%     │
└────────────────────────┴─────────┴────────┴─────────┘

🛑 Budget Status: CRITICAL (90% used)
   → Must complete segment VERY soon

📝 Recent Operations:
   1. Add Get Records for Contacts (+2 pts) → 5/10 (50%)
   2. Add Get Records for Opportunities (+2 pts) → 7/10 (70%)
   3. Add Get Records for Cases (+2 pts) → 9/10 (90%)
   4. Add assignment Calculate_Score (+0 pts) → 9/10 (90%)

💡 Recommendations:
   🛑 Critical: At 90% budget, complete immediately
   ⚠️ Warning: Record lookup limit reached (3/3)
   → Action: Complete segment now or risk exceeding budget

🕐 Timeline:
   Started: 10:10:00
   Duration: 5m 30s
   Operations: 7
```

**Status Output (All Segments)**:

```
📊 All Segments in Flow

Flow: Account_Processing.flow-meta.xml
Total Segments: 3 (2 completed, 1 active)

┌──────────────────────┬─────────────┬────────┬────────┬─────────┬──────────┐
│ Segment              │ Type        │ Status │ Complex│ Budget  │ Usage    │
├──────────────────────┼─────────────┼────────┼────────┼─────────┼──────────┤
│ Input_Validation     │ validation  │ ✅     │ 4      │ 5       │ 80%      │
│ Data_Enrichment      │ enrichment  │ ✅     │ 8      │ 8       │ 100%     │
│ Routing_Logic        │ routing     │ 🔄     │ 3      │ 6       │ 50%      │
└──────────────────────┴─────────────┴────────┴────────┴─────────┴──────────┘

🔄 Active: Routing_Logic (started 1m ago)
✅ Completed: 2 segments
📊 Total Flow Complexity: 15 points

💡 Flow Recommendations:
   ✅ Segments well-balanced
   ✅ No budget overages
   ℹ️ Consider: Add 'Notification' segment for alerts
```

**Status Output (JSON Format)**:

```json
{
  "flow": "Account_Processing.flow-meta.xml",
  "hasActiveSegment": true,
  "activeSegment": {
    "name": "Input_Validation",
    "type": "validation",
    "status": "active",
    "startedAt": "2025-11-21T10:15:30Z",
    "duration": 135,
    "complexity": {
      "current": 4,
      "budget": 5,
      "usage": 80,
      "status": "caution"
    },
    "elements": {
      "decisions": 2,
      "assignments": 1,
      "recordLookups": 0,
      "loops": 0
    },
    "recentOperations": [
      {
        "operation": "Add decision Status_Check",
        "complexityImpact": 2,
        "timestamp": "2025-11-21T10:15:45Z",
        "resultingComplexity": 2,
        "budgetUsage": 40
      },
      {
        "operation": "Add decision Amount_Check",
        "complexityImpact": 2,
        "timestamp": "2025-11-21T10:16:30Z",
        "resultingComplexity": 4,
        "budgetUsage": 80
      }
    ],
    "recommendations": [
      "Within budget, proper fault paths",
      "Approaching budget limit (80%)",
      "Add 1 more element max, then complete"
    ],
    "warnings": [
      {
        "level": "caution",
        "message": "Segment at 80% of budget"
      }
    ]
  },
  "totalSegments": 3,
  "completedSegments": 2,
  "totalFlowComplexity": 15
}
```

**Status Output (Summary Format)**:

```
Input_Validation (validation): 4/5 (80%) - CAUTION ⚠️
```

**Verbose Output (with --verbose)**:

```
📊 Detailed Segment Status

Segment: Data_Enrichment
Type: enrichment
Status: Active
Started: 5 minutes ago

Complexity Breakdown:
┌────────────────────────┬────────┬────────┬─────────┐
│ Element Type           │ Count  │ Points │ % Total │
├────────────────────────┼────────┼────────┼─────────┤
│ Record Lookups         │ 3      │ 6      │ 75%     │
│ Assignments            │ 6      │ 2      │ 25%     │
│ Decisions              │ 0      │ 0      │ 0%      │
│ Loops                  │ 0      │ 0      │ 0%      │
└────────────────────────┴────────┴────────┴─────────┘

Total: 8 points / 8 budget (100%)

Elements in Segment:
  1. Get Records: Find_Related_Contacts (complexity: 2)
  2. Get Records: Find_Opportunities (complexity: 2)
  3. Get Records: Find_Cases (complexity: 2)
  4. Assignment: Calculate_Total_Amount (complexity: 0)
  5. Assignment: Set_Account_Rating (complexity: 0)
  6. Assignment: Set_Priority_Flag (complexity: 0)

Template Validation:
  ✅ Max record lookups: 3/3 (at limit)
  ✅ No SOQL in loops
  ✅ Null checks present
  ⚠️ Assignments: 6/10 (consider consolidating)

Segment Boundaries:
  Entry: Flow Start
  Exit: Not defined (segment still active)
  Variables: AccountRating, AccountTier, PriorityFlag
```

**Real-Time Monitoring**:

```bash
# Watch segment status with auto-refresh
watch -n 5 '/flow-segment-status ./MyFlow.flow-meta.xml --format summary'

# Output refreshes every 5 seconds:
# Data_Enrichment (enrichment): 7/10 (70%) - OK ✅
# Data_Enrichment (enrichment): 8/10 (80%) - CAUTION ⚠️
# Data_Enrichment (enrichment): 9/10 (90%) - CRITICAL 🛑
```

**Integration with Workflow**:

```bash
# Check status before adding more elements
STATUS=$(/flow-segment-status ./MyFlow.flow-meta.xml --format json | jq -r '.activeSegment.complexity.usage')

if [ $STATUS -lt 80 ]; then
  echo "Safe to add more elements"
  /flow-segment-add ./MyFlow.flow-meta.xml "Add decision..." --org myorg
elif [ $STATUS -lt 90 ]; then
  echo "Caution: approaching budget limit"
  read -p "Continue? (y/n) " -n 1 -r
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    /flow-segment-add ./MyFlow.flow-meta.xml "Add decision..." --org myorg
  fi
else
  echo "Critical: must complete segment first"
  /flow-segment-complete ./MyFlow.flow-meta.xml --validate --org myorg
fi
```

**Budget Status Indicators**:

- **0-69%**: ✅ OK - Healthy budget usage
- **70-89%**: ⚠️ CAUTION - Approaching limit, plan to complete soon
- **90-99%**: 🛑 CRITICAL - Must complete immediately
- **100%+**: ❌ EXCEEDED - Segment over budget, complete now

**Runbook Reference**: See Runbook 8 - Incremental Segment Building (coming in Phase 5)

**Estimated Duration**: < 2 seconds

**Related Commands**:
- `/flow-segment-start` - Start new segment
- `/flow-segment-complete` - Complete current segment
- `/flow-segment-list` - List all segments (same as --all)
- `/flow-segment-add` - Add element to segment

**Use the FlowAuthor script to get real-time status of segments in {flow-path}, showing complexity tracking, budget usage, and actionable recommendations.**
