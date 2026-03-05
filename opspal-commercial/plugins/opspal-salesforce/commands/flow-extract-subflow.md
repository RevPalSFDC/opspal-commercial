---
name: flow-extract-subflow
description: Extract flow elements into a separate subflow. Supports segment-based, element-based, and interactive selection.
argument-hint: "<FlowName> --segment <SegmentName> --org <alias>"
allowed-tools:
  - Read
  - Write
  - Bash
  - TodoWrite
  - Task
  - Grep
thinking-mode: enabled
---

# Flow Subflow Extraction

## Purpose

Extract elements from an existing Salesforce Flow into a separate subflow to reduce complexity, improve maintainability, and enable reuse. Supports three extraction modes: segment-based, element-based, and interactive.

## When to Use

**Use this command when:**
- A segment exceeds its complexity budget (>150% threshold)
- You want to extract reusable logic into a shared subflow
- Flow complexity is too high and needs modularization
- Specific elements should be isolated for testing or maintenance
- You need to create callable subflows from existing logic

**Do NOT use when:**
- Elements are tightly coupled with record context that can't be passed
- The flow is already simple (complexity < 10)
- Elements rely heavily on $Record context without proper handling

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org
- Flow metadata read/write permissions
- Create permissions for new flows

### Required Configuration
- Flow XML file accessible locally
- Output directory writable

## Usage

### Extract by Segment Name

Extract all elements from a named segment:

```bash
/flow-extract-subflow <FlowName> --segment <SegmentName> --org <alias>
```

### Extract by Element Names

Extract specific elements by name:

```bash
/flow-extract-subflow <FlowName> --elements "Element_1,Element_2,Element_3" --org <alias>
```

### Interactive Selection

Launch interactive element picker:

```bash
/flow-extract-subflow <FlowName> --interactive --org <alias>
```

### Preview Mode

Preview extraction impact without creating subflow:

```bash
/flow-extract-subflow <FlowName> --elements "Check_1,Check_2" --preview --org <alias>
```

## Parameters

### Required Parameters

- **FlowName** (REQUIRED): Flow API name to extract from

### Extraction Mode (one required)

- **--segment** (MODE 1): Name of segment to extract (requires segmentation enabled)
- **--elements** (MODE 2): Comma-separated list of element API names
- **--interactive** (MODE 3): Launch interactive element picker

### Optional Parameters

- **--org** (OPTIONAL): Salesforce org alias. Uses default if not specified.
- **--subflow-name** (OPTIONAL): Custom name for the extracted subflow
- **--subflow-label** (OPTIONAL): Custom label for the extracted subflow
- **--output-dir** (OPTIONAL): Directory for subflow output (default: `./flows/subflows`)
- **--preview** (OPTIONAL): Preview impact without creating subflow
- **--force** (OPTIONAL): Extract even if below threshold
- **--verbose** (OPTIONAL): Show detailed logging

## Examples

### Example 1: Extract Segment to Subflow

```bash
# Extract the "Data_Enrichment" segment from Account_Processing flow
/flow-extract-subflow Account_Processing --segment Data_Enrichment --org prod

# Output:
# Extracting segment: Data_Enrichment
# Elements to extract: Get_Account_Details, Enrich_Data, Set_Status
# Variables analyzed: 3 inputs, 2 outputs
# Creating subflow: SF_Data_Enrichment
# Subflow created: ./flows/subflows/SF_Data_Enrichment.flow-meta.xml
# Parent flow updated with subflow call
```

### Example 2: Extract Specific Elements

```bash
# Extract validation elements from Lead_Router
/flow-extract-subflow Lead_Router --elements "Check_Required_Fields,Validate_Email,Validate_Phone" \
  --subflow-name "Lead_Validation" --org prod --preview

# Preview output:
# === Extraction Preview ===
# Elements to extract: 3
# Complexity reduction: 6 points
# Variables:
#   Inputs: Lead_Record, Email_Pattern
#   Outputs: Is_Valid, Error_Messages
# Connectors:
#   Broken: 1 (to Route_Decision - will be rewired)
#   Rewired: 1 (from Start - will point to subflow call)
# Warnings:
#   - Element Check_Required_Fields uses $Record context
```

### Example 3: Interactive Selection

```bash
# Launch interactive picker
/flow-extract-subflow Account_Processing --interactive --org prod

# Interactive output:
# === Element Selection ===
#
# [1] Loop_Contacts (Loop, complexity: 3)
# [2] Route_Decision (Decision, complexity: 2)
# [3] Get_Account (Get Records, complexity: 2)
# [4] Update_Status (Update Records, complexity: 2)
# ...
#
# Suggestions:
# - High complexity cluster: Loop_Contacts, Route_Decision (5 points)
# - Variable-intensive: Get_Account, Update_Status (shared 4 vars)
#
# Enter element numbers to extract (comma-separated):
```

## Output Structure

### Extracted Subflow

The generated subflow includes:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>65.0</apiVersion>
    <label>Subflow: Data Enrichment</label>
    <processType>AutoLaunchedFlow</processType>
    <status>Draft</status>

    <!-- Input/Output Variables -->
    <variables>
        <name>Input_Record</name>
        <dataType>SObject</dataType>
        <isInput>true</isInput>
        <isOutput>false</isOutput>
    </variables>

    <!-- Extracted Elements -->
    <recordLookups>
        <!-- ... -->
    </recordLookups>
</Flow>
```

### Parent Flow Changes

The parent flow is updated with:

1. **Subflow Call Element**: Replaces extracted elements
2. **Input Assignments**: Maps variables to subflow inputs
3. **Output Assignments**: Captures subflow outputs
4. **Connector Rewiring**: Updates connectors to point to subflow call

## Impact Preview

When using `--preview`, the command shows:

```
=== Extraction Impact Preview ===

Elements to Extract:
  - Check_Status (Decision, +2)
  - Get_Details (Get Records, +2)
  - Process_Data (Assignment, +1)

Variables Analysis:
  Inputs (passed to subflow):
    - AccountId (Text)
    - ProcessingMode (Picklist)

  Outputs (returned from subflow):
    - ProcessedRecord (SObject)
    - Status (Text)

  Internal (not exposed):
    - tempVar (Text)

Connector Analysis:
  Broken (point outside extraction):
    - Process_Data → Next_Step

  Rewired (incoming from outside):
    - Previous_Element → Check_Status

Complexity Metrics:
  Current: 12 points
  After extraction: 7 points (subflow call = 2)
  Reduction: 5 points (42%)

Warnings:
  - Get_Details uses $Record.Id - ensure record passed as input
```

## Variable Handling

### Automatic Variable Analysis

The extractor automatically:
1. Identifies variables read by extracted elements (→ inputs)
2. Identifies variables written by extracted elements (→ outputs)
3. Handles `$Record` context with appropriate warnings

### Variable Types

| Type | Handling |
|------|----------|
| Text, Number, Boolean | Direct pass-through |
| SObject | Pass as record input/output |
| Collection | Pass as collection input/output |
| $Record | Warning - must pass explicitly |

## Integration with Segmentation

When segmentation is enabled, extraction works with segments:

```javascript
const author = new FlowAuthor('myOrg');
await author.loadFlow('./MyFlow.flow-meta.xml');

// Enable segmentation (creates legacy segment for existing elements)
const segResult = await author.enableSegmentation();

// List segments
const segments = author.listSegments();
// [{ name: 'Imported_Legacy', elements: 15 }, { name: 'Validation', elements: 3 }]

// Extract a segment
await author.extractSegmentAsSubflow('Validation', {
    subflowName: 'SF_Account_Validation'
});
```

## Related Commands

- `/flow-edit` - Quick edits without segmentation
- `/flow-interactive-build` - Full segmentation mode
- `/flow-analyze-segments` - Analyze flow for segment patterns

## Troubleshooting

### "Cannot extract start element"

The start element cannot be extracted. Select other elements.

### "Element uses $Record context"

Elements using `$Record` need the record passed as an input variable. The extractor warns about this but proceeds. Ensure the calling flow passes the record.

### "Large number of inputs/outputs"

Consider restructuring to reduce variable passing:
- Use a wrapper object to group related variables
- Split extraction into smaller chunks
- Review if all variables are necessary

### "Validation failed"

Run `/flow-analyze-segments` first to understand element dependencies, then adjust selection.
