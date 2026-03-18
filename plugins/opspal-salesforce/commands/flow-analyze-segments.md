---
name: flow-analyze-segments
description: Analyze existing Salesforce Flow for logical segment patterns, complexity distribution, and segmentation recommendations.
argument-hint: "<FlowName> --org <alias>"
allowed-tools:
  - Read
  - Write
  - Bash
  - TodoWrite
  - Grep
thinking-mode: enabled
---

# Flow Segment Analysis

## Purpose

Analyze an existing Salesforce Flow to detect logical segment patterns, assess complexity distribution, and provide recommendations for segmentation or restructuring. This command helps understand existing flows before enabling segmentation.

## When to Use

**Use this command when:**
- Loading an existing flow for the first time
- Planning to enable segmentation on an existing flow
- Assessing flow complexity before modifications
- Understanding the logical structure of a complex flow
- Preparing for flow refactoring or subflow extraction
- Auditing flows for maintainability

**Benefits:**
- Automatic pattern detection (validation, enrichment, routing, etc.)
- Complexity scoring with risk assessment
- Segment boundary suggestions
- Ready-to-apply segmentation recommendations

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org (if retrieving from org)
- Flow XML file accessible locally

### Required Files
- Flow metadata file (`.flow-meta.xml`)

## Usage

### Basic Usage

```bash
/flow-analyze-segments <FlowName> --org <alias>
```

### Analyze Local File

```bash
/flow-analyze-segments --file ./force-app/main/default/flows/MyFlow.flow-meta.xml
```

### With Options

```bash
/flow-analyze-segments <FlowName> --org <alias> --output json --verbose
```

## Parameters

### Source (one required)

- **FlowName** (MODE 1): Flow API name to retrieve from org
- **--file** (MODE 2): Path to local flow XML file

### Optional Parameters

- **--org** (OPTIONAL): Salesforce org alias. Uses default if not specified.
- **--output** (OPTIONAL): Output format - `text` (default), `json`, or `markdown`
- **--suggest** (OPTIONAL): Include actionable segmentation suggestions
- **--verbose** (OPTIONAL): Show detailed pattern detection logic
- **--threshold** (OPTIONAL): Custom segmentation threshold (default: 10)

## Detected Patterns

The analyzer detects these logical patterns:

### 1. Validation Pattern
- **Location**: Start of flow (early elements)
- **Indicators**: Decision elements with validation names, checks before record operations
- **Naming**: Contains "Check", "Validate", "Is", "Verify"
- **Budget**: 5 complexity points

### 2. Enrichment Pattern
- **Location**: Early-to-middle of flow
- **Indicators**: recordLookups followed by assignments, data gathering
- **Purpose**: Fetching related data before processing
- **Budget**: 8 complexity points

### 3. Routing Pattern
- **Location**: Middle of flow
- **Indicators**: Dense decision clusters, multiple branches, conditional logic
- **Purpose**: Directing flow based on conditions
- **Budget**: 6 complexity points

### 4. Processing Pattern
- **Location**: Middle-to-late in flow
- **Indicators**: Record creates/updates, DML operations
- **Purpose**: Core business logic execution
- **Budget**: 8 complexity points

### 5. Notification Pattern
- **Location**: End of flow or in branches
- **Indicators**: Action calls (email, Chatter, alerts)
- **Purpose**: Communication and notification
- **Budget**: 4 complexity points

### 6. Loop Processing Pattern
- **Location**: Any position
- **Indicators**: Loop elements with nested record operations
- **Purpose**: Bulk data processing
- **Budget**: 10 complexity points

## Output Examples

### Text Output (Default)

```
=== Flow Segment Analysis ===

Flow: Account_Processing
Total Elements: 24
Total Complexity: 18 points
Risk Category: Medium

Detected Segment Patterns:
─────────────────────────────────────────────────────────

Segment 1: Validation (95% confidence)
  Type: validation
  Elements:
    - Check_Required_Fields (Decision, +2)
    - Validate_Status (Decision, +2)
    - Has_Owner (Decision, +2)
  Complexity: 6/5 points (OVER BUDGET)
  Suggested Budget: 6 points
  Reason: Dense decision cluster at flow start with validation naming

Segment 2: Data_Enrichment (88% confidence)
  Type: enrichment
  Elements:
    - Get_Account_Details (Get Records, +2)
    - Get_Related_Contacts (Get Records, +2)
    - Set_Enrichment_Data (Assignment, +1)
  Complexity: 5/8 points
  Reason: recordLookups followed by assignments in early-middle flow

Segment 3: Routing_Logic (82% confidence)
  Type: routing
  Elements:
    - Route_By_Type (Decision, +2)
    - Route_By_Region (Decision, +2)
    - Route_Default (Assignment, +1)
  Complexity: 5/6 points
  Reason: Multiple decisions with branching connectors

Unclassified Elements:
  - Update_Account (Update Records)
  - Send_Notification (Action)

─────────────────────────────────────────────────────────

Recommendations:
  1. Segment 1 (Validation) exceeds budget - consider extracting to subflow
  2. Consider grouping unclassified elements into a "Processing" segment
  3. Flow complexity (18) suggests segmentation would be beneficial
```

### JSON Output

```bash
/flow-analyze-segments Account_Processing --org prod --output json
```

```json
{
  "flowName": "Account_Processing",
  "analysisTimestamp": "2025-01-09T15:30:00Z",
  "metrics": {
    "totalElements": 24,
    "totalComplexity": 18,
    "riskCategory": "medium",
    "segmentationRecommended": true
  },
  "suggestedSegments": [
    {
      "name": "Validation",
      "type": "validation",
      "elements": ["Check_Required_Fields", "Validate_Status", "Has_Owner"],
      "suggestedBudget": 6,
      "calculatedComplexity": 6,
      "confidenceScore": 0.95,
      "reason": "Dense decision cluster at flow start with validation naming"
    },
    {
      "name": "Data_Enrichment",
      "type": "enrichment",
      "elements": ["Get_Account_Details", "Get_Related_Contacts", "Set_Enrichment_Data"],
      "suggestedBudget": 8,
      "calculatedComplexity": 5,
      "confidenceScore": 0.88,
      "reason": "recordLookups followed by assignments in early-middle flow"
    }
  ],
  "unclassifiedElements": ["Update_Account", "Send_Notification"],
  "recommendations": [
    "Segment 1 (Validation) exceeds budget - consider extracting to subflow",
    "Flow complexity (18) suggests segmentation would be beneficial"
  ]
}
```

### Markdown Output

```bash
/flow-analyze-segments Account_Processing --org prod --output markdown > analysis.md
```

## Complexity Scoring

Elements are scored as follows:

| Element Type | Complexity Points |
|--------------|-------------------|
| Decision | 2 |
| Loop | 3 |
| Wait | 3 |
| Action Call | 2 |
| Get Records | 2 |
| Create Records | 2 |
| Update Records | 2 |
| Delete Records | 2 |
| Screen | 2 |
| Subflow | 2 |
| Assignment | 1 |

### Risk Categories

| Complexity | Risk Level | Recommendation |
|------------|------------|----------------|
| 0-5 | Low | Quick Edit Mode sufficient |
| 6-9 | Medium | Standard editing, segmentation optional |
| 10-19 | High | Segmentation recommended |
| 20+ | Critical | Segmentation required, consider refactoring |

## Applying Suggestions

After analysis, apply suggestions using:

```javascript
const FlowAuthor = require('./scripts/lib/flow-author');
const author = new FlowAuthor('myOrg');

await author.loadFlow('./MyFlow.flow-meta.xml');

// Run analysis
const analysis = await author.analyzeExistingSegments();

// Enable segmentation with suggestions
const result = await author.enableSegmentation({
    autoAnalyze: true,
    createLegacySegment: true
});

if (result.initResult.suggestedSegments) {
    // Apply suggested segments
    await author.segmentManager.applySuggestedSegments(
        result.initResult.suggestedSegments
    );
}
```

## Integration with Other Commands

### Workflow: Analyze → Decide → Act

```bash
# Step 1: Analyze the flow
/flow-analyze-segments Account_Processing --org prod --suggest

# Step 2: Based on complexity...
# If complexity < 10:
/flow-edit Account_Processing "Make quick change" --org prod

# If complexity >= 10:
/flow-interactive-build Account_Processing --org prod
# (Will automatically use analysis results)

# Step 3: If segment needs extraction:
/flow-extract-subflow Account_Processing --segment Validation --org prod
```

## Related Commands

- `/flow-edit` - Quick edits for simple flows
- `/flow-extract-subflow` - Extract segments into subflows
- `/flow-interactive-build` - Full segmentation mode

## Troubleshooting

### "No segments detected"

Flow may be too simple or use non-standard patterns. This is fine - the flow may not need segmentation.

### "Low confidence scores"

Confidence below 70% indicates ambiguous patterns. Review the elements manually and consider:
- Renaming elements with clearer conventions
- Restructuring to match standard patterns
- Manually defining segments

### "All elements unclassified"

The flow uses non-standard patterns. Options:
1. Manually assign elements to segments during `/flow-interactive-build`
2. Keep all elements in "Imported_Legacy" segment
3. Refactor flow to use recognizable patterns

### Analysis takes too long

For very large flows (100+ elements), analysis may take several seconds. Use `--verbose` to see progress. Consider splitting the flow into multiple subflows.
