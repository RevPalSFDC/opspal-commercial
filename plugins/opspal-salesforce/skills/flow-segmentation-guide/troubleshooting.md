# Flow Segmentation Troubleshooting

Common issues and solutions when working with flow segmentation and subflow extraction.

## Quick Diagnosis

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| No segments detected | Flow too simple | Manual review |
| Wrong segment boundaries | Ambiguous patterns | Use interactive mode |
| Extraction fails | Circular references | Resolve dependencies |
| Subflow not callable | API version mismatch | Align versions |
| Variables missing | Scope issues | Check input/output flags |
| Performance degraded | Too many subflow calls | Batch operations |

---

## Segment Detection Issues

### No Segments Detected

**Symptom**: `/flow-analyze-segments` returns no segments.

**Causes**:
1. Flow complexity below threshold
2. Non-standard patterns
3. Single-purpose flow

**Solutions**:

```bash
# Lower detection thresholds
/flow-analyze-segments MyFlow --min-confidence 0.5

# Force pattern analysis
/flow-analyze-segments MyFlow --force-all-patterns

# Manual segment definition
/flow-analyze-segments MyFlow --define-segment "elements:Check_1,Check_2,Check_3"
```

### Incorrect Boundaries

**Symptom**: Detected segment includes wrong elements or misses elements.

**Solutions**:

1. **Use interactive mode**:
```bash
/flow-analyze-segments MyFlow --interactive

# Prompts for each detected segment:
# "Include Check_3 in Validation segment? [y/n/skip]"
```

2. **Override with explicit elements**:
```bash
/flow-extract-subflow MyFlow --elements "Check_1,Check_2" --exclude "Check_3"
```

3. **Adjust configuration**:
```json
// config/flow-segmentation-config.json
{
  "patterns": {
    "validation": {
      "maxPosition": 7  // Increased from 5
    }
  }
}
```

### Overlapping Segments

**Symptom**: Same elements assigned to multiple segments.

**Resolution**:
```bash
# View overlap details
/flow-analyze-segments MyFlow --show-overlaps

# Output:
# Element 'Set_Variables' claimed by:
#   - Enrichment (confidence: 0.82)
#   - Validation (confidence: 0.75)
# Assigning to: Enrichment (higher confidence)

# Force assignment
/flow-analyze-segments MyFlow --assign "Set_Variables:Validation"
```

---

## Extraction Failures

### Circular Reference Error

**Symptom**: "Cannot extract: circular variable reference detected"

**Cause**: Variable A depends on B which depends on A within segment.

**Debug**:
```bash
/flow-extract-subflow MyFlow --segment Enrichment --debug-dependencies

# Output:
# Dependency Analysis:
# accountId → Get_Account → accountRecord
# accountRecord → Set_Variables → enrichedData
# enrichedData → Check_Account → accountId  ⚠️ CIRCULAR
```

**Solutions**:
1. Split the circular chain
2. Extract smaller segment
3. Refactor flow to break cycle

### Missing Required Elements

**Symptom**: "Extraction would orphan elements"

**Cause**: Elements outside segment depend on extracted elements but aren't included.

**Solution**:
```bash
# Include dependent elements
/flow-extract-subflow MyFlow --segment Validation --include-dependents

# Or exclude problematic elements
/flow-extract-subflow MyFlow --segment Validation --exclude "Dependent_Element"
```

### API Version Mismatch

**Symptom**: "Subflow element type not available in API version"

**Cause**: Parent flow version doesn't support subflow features.

**Solution**:
```bash
# Check versions
/flow-versions MyFlow --org prod

# Upgrade parent flow
sf flow:version:upgrade --flow-name MyFlow --target-version 61.0
```

### Connector Integrity Failure

**Symptom**: "Cannot rewire connectors: multiple entry points"

**Cause**: Segment has more than one incoming connector.

**Solutions**:
1. Add routing decision before segment
2. Extract only portion with single entry
3. Merge entry paths first

---

## Variable Issues

### Input Variable Not Passed

**Symptom**: Subflow receives null for expected input.

**Debug**:
```bash
# Enable debug logging
/debug-start MyOrg --category "Flow" --level FINEST

# Check variable assignment
sf data query --query "SELECT Id FROM FlowVersionView WHERE FlowDefinition.DeveloperName = 'MyFlow'" --use-tooling-api
```

**Solutions**:

1. **Verify isInput flag**:
```xml
<!-- In subflow -->
<variables>
  <name>recordId</name>
  <dataType>String</dataType>
  <isInput>true</isInput>  <!-- Must be true -->
</variables>
```

2. **Check parent assignment**:
```xml
<!-- In parent flow -->
<subflows>
  <inputAssignments>
    <name>recordId</name>
    <value>
      <elementReference>$Record.Id</elementReference>
    </value>
  </inputAssignments>
</subflows>
```

### Output Variable Not Returned

**Symptom**: Parent flow doesn't receive subflow output.

**Checklist**:
1. ✅ Variable has `isOutput="true"` in subflow
2. ✅ Variable is assigned value before subflow ends
3. ✅ Parent has outputAssignment for variable
4. ✅ assignToReference exists in parent

```xml
<!-- Common mistake: output not flagged -->
<variables>
  <name>result</name>
  <dataType>Boolean</dataType>
  <isInput>false</isInput>
  <isOutput>false</isOutput>  <!-- ❌ Should be true -->
</variables>
```

### Collection Variable Issues

**Symptom**: Collection passed to subflow is empty or modifications not returned.

**Key Points**:
1. Collections passed by reference (modifications visible in parent)
2. But output assignment still needed if creating new collection
3. Object type must match exactly

```xml
<!-- Correct collection variable -->
<variables>
  <name>contactList</name>
  <dataType>SObject</dataType>
  <isCollection>true</isCollection>
  <isInput>true</isInput>
  <isOutput>true</isOutput>
  <objectType>Contact</objectType>  <!-- Must match exactly -->
</variables>
```

---

## Performance Issues

### Subflow Overhead

**Symptom**: Flow execution slower after extraction.

**Causes**:
1. Subflow call overhead
2. Variable marshalling cost
3. Too many subflow calls in loop

**Solutions**:

1. **Avoid subflows in loops**:
```xml
<!-- ❌ BAD: Subflow called per iteration -->
<loops>
  <name>Loop_Records</name>
  <iterationOrder>Asc</iterationOrder>
  <nextValueConnector>
    <targetReference>Call_Subflow</targetReference>  <!-- Called N times -->
  </nextValueConnector>
</loops>

<!-- ✅ BETTER: Pass collection to subflow -->
<subflows>
  <name>Process_All_Records</name>
  <inputAssignments>
    <name>inputRecords</name>
    <value>
      <elementReference>recordCollection</elementReference>
    </value>
  </inputAssignments>
</subflows>
```

2. **Batch subflow operations**:
   - Pass collections instead of single records
   - Process multiple items per subflow call
   - Reduce total invocations

### Memory Issues

**Symptom**: "Apex heap size exceeded" in complex subflows.

**Solutions**:
1. Clear large collections after use
2. Use selective queries (not SELECT *)
3. Process in smaller batches

---

## Deployment Issues

### Subflow Not Found

**Symptom**: "Referenced subflow does not exist"

**Cause**: Deploying parent before subflow.

**Solution**:
```bash
# Deploy subflow first
sf project deploy start --source-dir force-app/main/default/flows/My_Subflow.flow-meta.xml

# Then deploy parent
sf project deploy start --source-dir force-app/main/default/flows/Parent_Flow.flow-meta.xml

# Or deploy together (Salesforce handles order)
sf project deploy start --source-dir force-app/main/default/flows/
```

### Version Activation Issues

**Symptom**: "Cannot activate: subflow version not active"

**Solution**:
1. Activate subflow first
2. Then activate parent flow
3. Use deployment scripts that handle ordering

```bash
# Activation order script
sf flow:activate --flow-name My_Subflow --target-org prod
sf flow:activate --flow-name Parent_Flow --target-org prod
```

### Test Coverage Failure

**Symptom**: Subflow has no test coverage.

**Solution**:
Create dedicated test class for subflow (see extraction.md for examples).

---

## Quick Edit Issues

### Edit Rejected

**Symptom**: `/flow-edit` refuses to make change.

**Causes**:
1. Flow complexity too high
2. Structural change requested
3. Cross-element dependencies

```bash
# Check why edit was rejected
/flow-edit MyFlow "Add new decision" --explain-rejection

# Output:
# Edit rejected because:
# - Flow complexity (15) exceeds quick edit threshold (10)
# - Requested change is structural (add element)
# Recommendation: Use /flow-interactive-build instead
```

### Variable Reference Error

**Symptom**: Quick edit fails with "variable not found"

**Debug**:
```bash
# List flow variables
/flow-variables MyFlow --org prod

# Validate edit before applying
/flow-edit MyFlow "Change X to Y" --validate-only
```

---

## Recovery Procedures

### Restore from Backup

```bash
# List backups
ls .flow-backups/

# Restore specific version
cp .flow-backups/MyFlow_2025-01-15T10-30-00.flow-meta.xml \
   force-app/main/default/flows/MyFlow.flow-meta.xml

# Deploy restored version
sf project deploy start --source-dir force-app/main/default/flows/MyFlow.flow-meta.xml
```

### Emergency Deactivation

```bash
# Deactivate problematic flow
sf flow deactivate --flow-name Broken_Flow --target-org prod

# Verify deactivation
sf data query --query "SELECT Status FROM FlowDefinitionView WHERE DeveloperName = 'Broken_Flow'" --use-tooling-api
```

### Rollback Extraction

See extraction.md for detailed rollback procedures.

---

## Getting Help

### Diagnostic Commands

```bash
# Full flow analysis
/flow-analyze-segments MyFlow --verbose --org prod

# Dependency graph
/flow-dependencies MyFlow --graph --output flow-deps.svg

# Complexity breakdown
/flow-complexity MyFlow --detailed --org prod
```

### Debug Logging

```bash
# Enable flow debug logs
/debug-start MyOrg --categories "Flow:FINEST,Workflow:FINEST"

# Run flow
# ...

# Retrieve logs
/apex-logs --count 1 --search "FLOW_"
```

### Support Resources

- Flow documentation: `docs/runbooks/flow-xml-development/`
- Segmentation config: `config/flow-segmentation-config.json`
- API compatibility: `config/flow-api-version-compatibility.json`
