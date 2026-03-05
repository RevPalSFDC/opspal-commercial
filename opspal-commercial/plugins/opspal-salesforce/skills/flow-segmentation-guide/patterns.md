# Flow Segment Detection Patterns

Detailed algorithms and heuristics for identifying logical segments within Salesforce Flows.

## Pattern Detection Overview

The flow segmentation system analyzes Flow XML to identify 5 primary segment types based on element clustering, connector patterns, and contextual positioning.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Flow Segment Detection                        │
├─────────────────────────────────────────────────────────────────┤
│  Input: Flow XML                                                 │
│  ↓                                                               │
│  1. Parse elements and connectors                                │
│  2. Build adjacency graph                                        │
│  3. Identify clusters by type                                    │
│  4. Apply pattern rules                                          │
│  5. Calculate segment boundaries                                 │
│  6. Assign complexity scores                                     │
│  ↓                                                               │
│  Output: Segment definitions with metadata                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Segment Type Definitions

### 1. Validation Segment

**Purpose**: Entry criteria checking and guard conditions.

**Detection Algorithm**:
```javascript
function detectValidationSegment(flow) {
  const candidates = [];

  // Rule 1: Decision clusters at flow start
  const startElement = flow.getStartElement();
  const firstFive = flow.getElementsWithinHops(startElement, 5);
  const decisions = firstFive.filter(e => e.type === 'Decision');

  if (decisions.length >= 2) {
    candidates.push({
      type: 'Validation',
      elements: decisions,
      confidence: 0.85
    });
  }

  // Rule 2: Early fault paths
  const faultConnectors = firstFive.filter(e =>
    e.connectors?.some(c => c.type === 'fault')
  );

  if (faultConnectors.length > 0) {
    // Boost confidence if fault paths exist
    candidates[0].confidence += 0.1;
  }

  return candidates;
}
```

**Pattern Characteristics**:
| Characteristic | Threshold |
|----------------|-----------|
| Min decisions | 2 |
| Position | First 5 elements |
| Typical elements | Decision, Assignment (error) |
| Fault paths | Common |
| Complexity budget | 5 points |

**Example Structure**:
```
Start → Check_Record_Type (Decision)
          ├── Valid → Check_Required_Fields (Decision)
          │              ├── Valid → Continue...
          │              └── Invalid → Set_Error → End
          └── Invalid → Set_Error → End
```

---

### 2. Enrichment Segment

**Purpose**: Gather additional data before processing.

**Detection Algorithm**:
```javascript
function detectEnrichmentSegment(flow) {
  const candidates = [];

  // Find recordLookup clusters
  const lookups = flow.getElementsByType('recordLookups');

  // Group adjacent lookups
  const clusters = groupAdjacentElements(lookups, 3); // Within 3 hops

  for (const cluster of clusters) {
    // Check for assignment following lookups
    const nextElements = cluster.flatMap(l =>
      flow.getConnectedElements(l, 2)
    );
    const assignments = nextElements.filter(e =>
      e.type === 'assignments'
    );

    if (assignments.length > 0) {
      candidates.push({
        type: 'Enrichment',
        elements: [...cluster, ...assignments],
        confidence: 0.8
      });
    }
  }

  return candidates;
}
```

**Pattern Characteristics**:
| Characteristic | Threshold |
|----------------|-----------|
| Min lookups | 1 |
| Assignment follows | Required |
| Typical elements | recordLookup, Assignment, Decision |
| Data dependency | High |
| Complexity budget | 8 points |

**Example Structure**:
```
→ Get_Account_Details (recordLookup)
→ Get_Contact_Count (recordLookup)
→ Set_Variables (Assignment)
→ Check_Data_Quality (Decision) [optional]
→ Continue...
```

---

### 3. Routing Segment

**Purpose**: Direct flow execution based on complex conditions.

**Detection Algorithm**:
```javascript
function detectRoutingSegment(flow) {
  const candidates = [];

  // Find dense decision clusters
  const decisions = flow.getElementsByType('decisions');
  const clusters = findDenseClusters(decisions, {
    minSize: 3,
    maxDistance: 2,
    nonDecisionRatio: 0.3  // Max 30% non-decision elements
  });

  for (const cluster of clusters) {
    // Check branching factor
    const branches = cluster.reduce((sum, d) =>
      sum + d.outcomes.length, 0
    );

    if (branches >= 4) {
      candidates.push({
        type: 'Routing',
        elements: cluster,
        confidence: 0.75,
        branchingFactor: branches
      });
    }
  }

  return candidates;
}
```

**Pattern Characteristics**:
| Characteristic | Threshold |
|----------------|-----------|
| Min decisions | 3 |
| Branching factor | ≥4 outcomes |
| Non-decision ratio | <30% |
| Typical elements | Decision, Assignment |
| Complexity budget | 6 points |

**Example Structure**:
```
→ Check_Region (Decision)
    ├── US → Check_State (Decision)
    │         ├── CA → Route_West
    │         ├── NY → Route_East
    │         └── Default → Route_Central
    ├── EMEA → Check_Country (Decision)
    │           ├── UK → Route_UK
    │           └── Default → Route_EMEA
    └── APAC → Route_APAC
```

---

### 4. Notification Segment

**Purpose**: Alert users or external systems of changes.

**Detection Algorithm**:
```javascript
function detectNotificationSegment(flow) {
  const candidates = [];

  // Find email/chatter actions
  const notifications = flow.getElementsByType([
    'actionCalls'
  ]).filter(a =>
    a.actionType === 'emailAlert' ||
    a.actionType === 'chatterPost' ||
    a.actionType === 'customNotification' ||
    a.actionName.includes('sendEmail')
  );

  // Check position (typically near end)
  const totalElements = flow.getAllElements().length;
  const nearEnd = notifications.filter(n => {
    const position = flow.getElementPosition(n);
    return position > totalElements * 0.7;  // Last 30%
  });

  if (nearEnd.length > 0) {
    candidates.push({
      type: 'Notification',
      elements: nearEnd,
      confidence: 0.9,
      position: 'end'
    });
  }

  return candidates;
}
```

**Pattern Characteristics**:
| Characteristic | Threshold |
|----------------|-----------|
| Action types | Email, Chatter, Custom Notification |
| Position | Last 30% of flow |
| Typical elements | actionCalls |
| External calls | Common |
| Complexity budget | 4 points |

**Example Structure**:
```
... (main processing)
→ Check_Notification_Needed (Decision)
    ├── Yes → Send_Manager_Email (actionCalls)
    │       → Post_To_Chatter (actionCalls)
    │       → End
    └── No → End
```

---

### 5. Loop Processing Segment

**Purpose**: Process collections of records.

**Detection Algorithm**:
```javascript
function detectLoopSegment(flow) {
  const candidates = [];

  // Find loops
  const loops = flow.getElementsByType('loops');

  for (const loop of loops) {
    // Get elements inside loop
    const loopBody = flow.getLoopBody(loop);

    // Check for record operations
    const recordOps = loopBody.filter(e =>
      ['recordCreate', 'recordUpdate', 'recordDelete']
        .includes(e.type)
    );

    if (recordOps.length > 0) {
      candidates.push({
        type: 'LoopProcessing',
        elements: [loop, ...loopBody],
        confidence: 0.95,
        recordOperations: recordOps.length,
        bulkificationRisk: recordOps.length > 0 ? 'HIGH' : 'LOW'
      });
    }
  }

  return candidates;
}
```

**Pattern Characteristics**:
| Characteristic | Threshold |
|----------------|-----------|
| Loop element | Required |
| Record operations | Inside loop |
| Typical elements | loop, recordUpdate, recordCreate |
| Bulkification | Critical consideration |
| Complexity budget | 10 points |

**Example Structure**:
```
→ Get_Line_Items (recordLookup) → collection
→ Loop_Through_Items (loop)
    → Calculate_Discount (Assignment)
    → Update_Line_Item (recordUpdate) ⚠️ Bulkification risk
    → Next iteration
→ Continue after loop...
```

---

## Boundary Detection

### Algorithm

```javascript
function detectSegmentBoundaries(segment, flow) {
  const boundaries = {
    start: null,
    end: null,
    inputs: [],
    outputs: []
  };

  // Find earliest element in segment
  boundaries.start = segment.elements.reduce((earliest, el) => {
    const pos = flow.getElementPosition(el);
    return pos < flow.getElementPosition(earliest) ? el : earliest;
  });

  // Find latest element
  boundaries.end = segment.elements.reduce((latest, el) => {
    const pos = flow.getElementPosition(el);
    return pos > flow.getElementPosition(latest) ? el : latest;
  });

  // Identify inputs (variables read but not written before)
  boundaries.inputs = findInputVariables(segment, flow);

  // Identify outputs (variables written and used after)
  boundaries.outputs = findOutputVariables(segment, flow);

  return boundaries;
}
```

### Connector Analysis

```javascript
function analyzeConnectors(segment, flow) {
  return {
    // Connectors entering segment
    incoming: flow.getIncomingConnectors(segment.elements[0]),

    // Connectors leaving segment
    outgoing: flow.getOutgoingConnectors(segment.elements.slice(-1)[0]),

    // Internal connectors (within segment)
    internal: flow.getInternalConnectors(segment.elements),

    // Impact of extraction
    extractionImpact: calculateExtractionImpact(segment, flow)
  };
}
```

---

## Confidence Scoring

### Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Element type match | 0.3 | Elements match expected types |
| Position match | 0.2 | Elements in expected position |
| Clustering density | 0.2 | Elements are tightly grouped |
| Connector coherence | 0.15 | Connectors form logical unit |
| Naming patterns | 0.15 | Element names suggest purpose |

### Calculation

```javascript
function calculateConfidence(segment, factors) {
  const weights = {
    elementMatch: 0.3,
    positionMatch: 0.2,
    clusterDensity: 0.2,
    connectorCoherence: 0.15,
    namingPatterns: 0.15
  };

  return Object.entries(weights).reduce((score, [factor, weight]) => {
    return score + (factors[factor] * weight);
  }, 0);
}
```

### Thresholds

| Confidence | Recommendation |
|------------|----------------|
| ≥0.85 | High confidence - auto-segment |
| 0.70-0.84 | Medium confidence - suggest with review |
| 0.50-0.69 | Low confidence - manual review required |
| <0.50 | Insufficient - do not suggest |

---

## Multi-Segment Detection

### Overlap Resolution

```javascript
function resolveOverlaps(segments) {
  // Sort by confidence descending
  segments.sort((a, b) => b.confidence - a.confidence);

  const resolved = [];
  const assignedElements = new Set();

  for (const segment of segments) {
    // Remove elements already assigned
    const available = segment.elements.filter(e =>
      !assignedElements.has(e.name)
    );

    if (available.length >= segment.minElements) {
      resolved.push({
        ...segment,
        elements: available
      });
      available.forEach(e => assignedElements.add(e.name));
    }
  }

  return resolved;
}
```

### Gap Detection

```javascript
function detectGaps(segments, flow) {
  const allElements = flow.getAllElements();
  const segmentedElements = new Set(
    segments.flatMap(s => s.elements.map(e => e.name))
  );

  return allElements.filter(e => !segmentedElements.has(e.name));
}
```

---

## Configuration

### Tuning Parameters

Located in `config/flow-segmentation-config.json`:

```json
{
  "patterns": {
    "validation": {
      "minDecisions": 2,
      "maxPosition": 5,
      "confidenceBoostForFault": 0.1
    },
    "enrichment": {
      "minLookups": 1,
      "requireAssignment": true,
      "maxHopDistance": 3
    },
    "routing": {
      "minDecisions": 3,
      "minBranches": 4,
      "maxNonDecisionRatio": 0.3
    },
    "notification": {
      "positionThreshold": 0.7,
      "actionTypes": ["emailAlert", "chatterPost", "customNotification"]
    },
    "loopProcessing": {
      "requireRecordOps": true,
      "bulkificationWarning": true
    }
  },
  "confidence": {
    "autoSegmentThreshold": 0.85,
    "suggestThreshold": 0.70,
    "minimumThreshold": 0.50
  }
}
```

---

## Usage Example

```bash
# Analyze flow for segments
/flow-analyze-segments Account_Automation --org prod

# Output:
# Detected Segments:
# 1. Validation (confidence: 0.92)
#    Elements: Check_Record_Type, Validate_Fields
#    Position: 1-4
#    Complexity: 4/5 budget
#
# 2. Enrichment (confidence: 0.85)
#    Elements: Get_Account, Get_Contacts, Set_Variables
#    Position: 5-8
#    Complexity: 6/8 budget
#
# 3. LoopProcessing (confidence: 0.88)
#    Elements: Loop_Contacts, Update_Contact
#    Position: 9-12
#    Complexity: 8/10 budget
#    ⚠️ Bulkification risk detected
#
# Total Flow Complexity: 18 points
# Recommendation: Consider extracting segments to subflows
```
