# Subflow Extraction Guide

Complete guide for extracting Flow segments into reusable subflows.

## Extraction Overview

Subflow extraction transforms a segment of a parent flow into an independent, reusable subflow. This improves maintainability, enables reuse, and reduces complexity.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Extraction Process                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Identify segment boundaries                                  │
│  2. Analyze input/output variables                               │
│  3. Create subflow scaffold                                      │
│  4. Move elements to subflow                                     │
│  5. Create subflow element in parent                             │
│  6. Wire connectors                                              │
│  7. Validate both flows                                          │
│  8. Deploy and test                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## When to Extract

### Good Candidates

| Condition | Score | Rationale |
|-----------|-------|-----------|
| Segment >10 elements | +3 | Reduces parent complexity |
| Used in 2+ flows | +5 | Enables reuse |
| Clear boundary | +2 | Clean extraction |
| Self-contained logic | +3 | Minimal dependencies |
| Complex error handling | +2 | Centralize error logic |
| **Total ≥8** | ✅ | Good extraction candidate |

### Poor Candidates

| Condition | Impact | Alternative |
|-----------|--------|-------------|
| <5 elements | Don't extract | Keep inline |
| Heavy cross-references | Difficult | Refactor first |
| Single use only | Low ROI | Document instead |
| Critical path | Risk | Extra testing needed |

---

## Extraction Commands

### Preview Extraction

```bash
# Preview what extraction will do
/flow-extract-subflow MyFlow --segment Validation --preview

# Output:
# ═══════════════════════════════════════════════════════════════
# EXTRACTION PREVIEW: Validation Segment
# ═══════════════════════════════════════════════════════════════
#
# Segment: Validation
# Elements to extract: 4
#   - Check_Record_Type (Decision)
#   - Check_Required_Fields (Decision)
#   - Set_Error_Message (Assignment)
#   - Error_Screen (Screen)
#
# Input Variables (will become subflow inputs):
#   - recordId (Text) - Required
#   - recordType (Text) - Required
#
# Output Variables (will become subflow outputs):
#   - isValid (Boolean)
#   - errorMessage (Text)
#
# Connector Impact:
#   - 1 incoming connector will point to subflow element
#   - 2 outgoing connectors will be replaced
#
# Estimated complexity reduction: 4 points
# ═══════════════════════════════════════════════════════════════
```

### Execute Extraction

```bash
# Extract segment to subflow
/flow-extract-subflow MyFlow --segment Validation --name Validate_Record --org prod

# With custom prefix
/flow-extract-subflow MyFlow --segment Enrichment --prefix "Shared_" --org prod

# Interactive mode (prompts for each decision)
/flow-extract-subflow MyFlow --interactive --org prod
```

### Extract Specific Elements

```bash
# Extract named elements instead of detected segment
/flow-extract-subflow MyFlow --elements "Check_1,Check_2,Set_Vars" --name Custom_Subflow --org prod
```

---

## Variable Handling

### Input Variables

Variables read by the segment but defined outside become subflow inputs.

```xml
<!-- Parent flow: passes value to subflow -->
<subflows>
  <name>Call_Validation</name>
  <flowName>Validate_Record</flowName>
  <inputAssignments>
    <name>recordId</name>
    <value>
      <elementReference>$Record.Id</elementReference>
    </value>
  </inputAssignments>
  <inputAssignments>
    <name>recordType</name>
    <value>
      <elementReference>$Record.RecordType.DeveloperName</elementReference>
    </value>
  </inputAssignments>
</subflows>

<!-- Subflow: receives input -->
<variables>
  <name>recordId</name>
  <dataType>String</dataType>
  <isInput>true</isInput>
  <isOutput>false</isOutput>
</variables>
```

### Output Variables

Variables written by the segment and used afterward become subflow outputs.

```xml
<!-- Subflow: exposes output -->
<variables>
  <name>isValid</name>
  <dataType>Boolean</dataType>
  <isInput>false</isInput>
  <isOutput>true</isOutput>
</variables>

<!-- Parent flow: receives output -->
<subflows>
  <name>Call_Validation</name>
  <flowName>Validate_Record</flowName>
  <outputAssignments>
    <assignToReference>validationResult</assignToReference>
    <name>isValid</name>
  </outputAssignments>
</subflows>
```

### Collection Variables

```xml
<!-- Input collection -->
<variables>
  <name>inputRecords</name>
  <dataType>SObject</dataType>
  <isCollection>true</isCollection>
  <isInput>true</isInput>
  <objectType>Contact</objectType>
</variables>

<!-- Output collection -->
<variables>
  <name>processedRecords</name>
  <dataType>SObject</dataType>
  <isCollection>true</isCollection>
  <isOutput>true</isOutput>
  <objectType>Contact</objectType>
</variables>
```

---

## Connector Rewiring

### Before Extraction

```
Parent Flow:
┌──────────┐     ┌─────────────────┐     ┌──────────────┐
│  Start   │────▶│ Segment Elements │────▶│  Continue... │
└──────────┘     │ (to be extracted)│     └──────────────┘
                 └─────────────────┘
```

### After Extraction

```
Parent Flow:
┌──────────┐     ┌──────────────────┐     ┌──────────────┐
│  Start   │────▶│  Subflow Element │────▶│  Continue... │
└──────────┘     │ (Call_Validation)│     └──────────────┘
                 └──────────────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │    SUBFLOW       │
                 │ Validate_Record  │
                 │ ┌──────────────┐ │
                 │ │   Elements   │ │
                 │ │  (extracted) │ │
                 │ └──────────────┘ │
                 └──────────────────┘
```

### Handling Multiple Exit Points

```xml
<!-- Subflow with multiple outcomes -->
<subflows>
  <name>Call_Routing</name>
  <flowName>Route_Record</flowName>

  <!-- Default connector (after subflow completes) -->
  <connector>
    <targetReference>Next_Step</targetReference>
  </connector>
</subflows>

<!-- Note: Subflows can only have one exit point in the parent -->
<!-- Use output variables to determine next action -->
<decisions>
  <name>Check_Route_Result</name>
  <rules>
    <name>Route_A</name>
    <conditionLogic>and</conditionLogic>
    <conditions>
      <leftValueReference>routeResult</leftValueReference>
      <operator>EqualTo</operator>
      <rightValue>
        <stringValue>A</stringValue>
      </rightValue>
    </conditions>
    <connector>
      <targetReference>Handle_Route_A</targetReference>
    </connector>
  </rules>
</decisions>
```

---

## Error Handling

### Fault Path Preservation

```xml
<!-- Subflow with fault handling -->
<variables>
  <name>hasError</name>
  <dataType>Boolean</dataType>
  <isOutput>true</isOutput>
</variables>
<variables>
  <name>errorMessage</name>
  <dataType>String</dataType>
  <isOutput>true</isOutput>
</variables>

<!-- In subflow, catch errors -->
<recordUpdates>
  <name>Update_Record</name>
  <faultConnector>
    <targetReference>Set_Error_Info</targetReference>
  </faultConnector>
</recordUpdates>

<assignments>
  <name>Set_Error_Info</name>
  <assignmentItems>
    <assignToReference>hasError</assignToReference>
    <operator>Assign</operator>
    <value>
      <booleanValue>true</booleanValue>
    </value>
  </assignmentItems>
  <assignmentItems>
    <assignToReference>errorMessage</assignToReference>
    <operator>Assign</operator>
    <value>
      <elementReference>$Flow.FaultMessage</elementReference>
    </value>
  </assignmentItems>
</assignments>
```

### Parent Flow Error Check

```xml
<!-- After calling subflow, check for errors -->
<decisions>
  <name>Check_Subflow_Error</name>
  <rules>
    <name>Has_Error</name>
    <conditions>
      <leftValueReference>subflowHasError</leftValueReference>
      <operator>EqualTo</operator>
      <rightValue>
        <booleanValue>true</booleanValue>
      </rightValue>
    </conditions>
    <connector>
      <targetReference>Handle_Error</targetReference>
    </connector>
  </rules>
  <defaultConnector>
    <targetReference>Continue_Processing</targetReference>
  </defaultConnector>
</decisions>
```

---

## Naming Conventions

### Subflow Naming

| Pattern | Example | Use Case |
|---------|---------|----------|
| `{Object}_{Action}_{Segment}` | `Account_Update_Validation` | Object-specific |
| `Shared_{Action}_{Purpose}` | `Shared_Validate_Required_Fields` | Reusable |
| `{Domain}_{Function}` | `Sales_Calculate_Discount` | Domain-specific |

### Variable Naming

| Type | Pattern | Example |
|------|---------|---------|
| Input | `input_{Name}` | `inputRecordId` |
| Output | `output_{Name}` | `outputIsValid` |
| Collection Input | `input_{Name}Collection` | `inputContactsCollection` |
| Collection Output | `output_{Name}Collection` | `outputUpdatedContacts` |

---

## Testing Extracted Subflows

### Unit Testing Subflow

```apex
@isTest
private class Test_Validate_Record_Subflow {

    @isTest
    static void testValidRecord() {
        // Create test record
        Account acc = new Account(
            Name = 'Test Account',
            Industry = 'Technology'
        );
        insert acc;

        // Create flow interview
        Map<String, Object> inputs = new Map<String, Object>{
            'inputRecordId' => acc.Id,
            'inputRecordType' => 'Standard'
        };

        Flow.Interview subflow = new Flow.Interview.Validate_Record(inputs);
        subflow.start();

        // Assert outputs
        Boolean isValid = (Boolean)subflow.getVariableValue('outputIsValid');
        System.assertEquals(true, isValid, 'Record should be valid');
    }

    @isTest
    static void testInvalidRecord() {
        // Test with invalid data
        Map<String, Object> inputs = new Map<String, Object>{
            'inputRecordId' => null,
            'inputRecordType' => 'Standard'
        };

        Flow.Interview subflow = new Flow.Interview.Validate_Record(inputs);
        subflow.start();

        Boolean isValid = (Boolean)subflow.getVariableValue('outputIsValid');
        String errorMsg = (String)subflow.getVariableValue('outputErrorMessage');

        System.assertEquals(false, isValid);
        System.assertNotEquals(null, errorMsg);
    }
}
```

### Integration Testing

```apex
@isTest
static void testParentFlowWithSubflow() {
    // Create test data
    Account acc = TestDataFactory.createAccount();

    // Run parent flow (which calls subflow)
    Map<String, Object> inputs = new Map<String, Object>{
        'recordId' => acc.Id
    };

    Flow.Interview parentFlow = new Flow.Interview.Parent_Account_Flow(inputs);
    parentFlow.start();

    // Verify end-to-end behavior
    acc = [SELECT Status__c FROM Account WHERE Id = :acc.Id];
    System.assertEquals('Validated', acc.Status__c);
}
```

---

## Rollback Procedure

### If Extraction Fails

1. **Restore parent flow from backup**:
```bash
# Backups created at extraction time
ls .flow-backups/MyFlow_*.flow-meta.xml

# Restore
cp .flow-backups/MyFlow_2025-01-15T10-30-00.flow-meta.xml force-app/main/default/flows/MyFlow.flow-meta.xml
```

2. **Delete failed subflow**:
```bash
sf project deploy start --source-dir force-app/main/default/flows/Failed_Subflow.flow-meta.xml --ignore-warnings --purge-on-delete
```

3. **Redeploy parent**:
```bash
sf project deploy start --source-dir force-app/main/default/flows/MyFlow.flow-meta.xml
```

### Partial Rollback

If only the subflow needs adjustment:
1. Deactivate subflow
2. Edit subflow
3. Reactivate and test
4. No parent flow changes needed

---

## Best Practices

### Do's

- ✅ Always preview before extraction
- ✅ Create backups before extraction
- ✅ Document subflow purpose and parameters
- ✅ Use meaningful names for inputs/outputs
- ✅ Test subflow in isolation first
- ✅ Consider version implications

### Don'ts

- ❌ Extract segments with <5 elements
- ❌ Extract without understanding dependencies
- ❌ Ignore error handling paths
- ❌ Create deeply nested subflow chains
- ❌ Skip testing after extraction

### Complexity Guidelines

| Parent Complexity After | Assessment |
|------------------------|------------|
| Reduced by 30%+ | Successful extraction |
| Reduced by 10-30% | Marginal benefit |
| Minimal change | Reconsider extraction |
| Increased | Extraction inappropriate |
