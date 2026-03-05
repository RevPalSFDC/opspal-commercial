# Flow Decision Logic Analyzer

**Version:** 1.0.0
**Created:** 2025-10-26
**ROI:** $48,000/year
**Addresses:** Reflection Cohort - Flow Decision Logic Issues

## Purpose

Validates decision logic in Salesforce Flows **before deployment** to prevent:
- ❌ Unreachable decision branches
- ❌ Required fields used before population
- ❌ Infinite loops in flow paths
- ❌ Dead-end paths with no fault handler
- ⚠️  Contradictory decision conditions (limited - see Known Limitations)

## What It Does

The analyzer parses Salesforce Flow metadata XML and performs 5 key validations:

### 1. Unreachable Branch Detection ✅
Identifies decision branches that can never be reached from the flow start.

```
Flow: Start → Decision_1 → End
      OrphanDecision (not connected)

Result: WARNING - OrphanDecision is unreachable
```

### 2. Infinite Loop Detection ✅
Identifies potential infinite loops where flows circle back without termination.

```
Flow: Decision_1 → Assignment_1 → Decision_1 (loops forever)

Result: ERROR - Infinite loop detected
```

### 3. Dead-End Path Detection ✅
Identifies paths that end without proper termination or fault handling.

```
Flow: Decision_1 → Assignment_1 (no connector after)

Result: WARNING - Assignment_1 has no outcome (dead end)
```

### 4. Field Usage Order Validation ✅
Identifies fields used in decisions before they're populated.

```
Flow: Decision checks "NetPrice__c"
      But NetPrice__c assigned later in Assignment_1

Result: WARNING - Field used before population
```

### 5. Contradictory Condition Detection ⚠️
Attempts to identify mutually exclusive conditions (see limitations).

```
Expected: Decision_1: Amount >= 10000
          Decision_2: Amount < 5000
          → Should detect contradiction

Current: Limited detection within single decision only
```

## Usage

### Command Line

```bash
# Analyze single flow
node flow-decision-logic-analyzer.js myorg ./flows/MyFlow.flow-meta.xml

# Analyze all flows in directory
node flow-decision-logic-analyzer.js myorg ./force-app/main/default/flows/
```

### Programmatic

```javascript
const FlowDecisionLogicAnalyzer = require('./flow-decision-logic-analyzer');

const analyzer = new FlowDecisionLogicAnalyzer('myorg', {
  verbose: true,
  checkInfiniteLoops: true,
  checkDeadEnds: true
});

const result = await analyzer.analyze('./flows/MyFlow.flow-meta.xml');

if (!result.valid) {
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);
}
```

### Integration with CI/CD

```bash
# In .github/workflows/salesforce-deploy.yml
- name: Validate Flow Logic
  run: |
    for flow in force-app/main/default/flows/*.flow-meta.xml; do
      node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-decision-logic-analyzer.js $SFDC_ORG "$flow"
    done
```

## Output Format

```javascript
{
  valid: false,
  flowPath: './flows/MyFlow.flow-meta.xml',
  flowName: 'MyFlow',
  errors: [
    {
      type: 'INFINITE_LOOP',
      message: 'Potential infinite loop detected: Decision_1 → Assignment_1 → Decision_1',
      severity: 'ERROR',
      details: { cyclePath: ['Decision_1', 'Assignment_1', 'Decision_1'] },
      suggestion: 'Add loop exit condition or ensure flow terminates'
    }
  ],
  warnings: [
    {
      type: 'UNREACHABLE_BRANCH',
      message: "Node 'OrphanDecision' is unreachable from flow start",
      severity: 'WARNING',
      details: { nodeName: 'OrphanDecision', nodeType: 'decision' },
      suggestion: 'Review flow connections to ensure all nodes are reachable'
    }
  ],
  suggestions: [],
  decisions: [...],
  flowGraph: {...},
  reachabilityMatrix: Map(...)
}
```

## Test Results

**Test Suite:** `test/flow-decision-logic-analyzer.test.js`

| Test | Status | Description |
|------|--------|-------------|
| Unreachable Branch Detection | ✅ PASS | Detects orphaned decision nodes |
| Infinite Loop Detection | ✅ PASS | Detects circular flow paths |
| Dead End Path Detection | ✅ PASS | Detects paths with no outcome |
| Valid Flow Validation | ✅ PASS | Correctly validates good flows |
| Contradictory Conditions | ⚠️  PARTIAL | Limited to single-decision scope |

**Overall:** 4/5 tests passing (80%)

Run tests:
```bash
cd .claude-plugins/opspal-core-plugin/packages/domains/salesforce
node test/flow-decision-logic-analyzer.test.js
```

## Known Limitations

### 1. Cross-Decision Contradiction Detection
**Issue:** Contradictions across different decision elements not fully detected

**Example:**
```
Decision_1: Amount >= 10000 → Decision_2
Decision_2: Amount < 5000 → End
```

**Current:** Only detects contradictions within same decision element
**Planned:** Full path-based analysis in v2.0

**Workaround:** Manual review of sequential decisions on same field

### 2. Complex Condition Logic
**Issue:** AND/OR logic across multiple conditions not fully analyzed

**Example:**
```
Rule 1: (Amount > 1000 AND Status = 'Active') OR Type = 'Premium'
```

**Current:** Analyzes individual conditions, not compound logic
**Planned:** Boolean expression evaluation in v2.0

### 3. Formula Field Dependencies
**Issue:** Field population via formulas not tracked

**Example:**
```
NetPrice__c is a formula field (Price__c * (1 - Discount__c))
```

**Current:** Warns about NetPrice__c usage even if formula auto-populates
**Planned:** Formula field awareness in v1.1

## Success Metrics

**Prevention Target:** 60% reduction in flow-related deployment failures

**Measured By:**
- Pre-deployment validation errors caught
- Post-deployment flow errors reduced
- Developer time saved (hours/week)

**Expected ROI:** $48,000/year
- 4 hours/week saved on flow debugging
- 50 weeks/year
- $240/hour developer rate

## Integration Points

### Extends Existing Validators

Designed to work alongside:
- `flow-field-reference-validator.js` - Field existence validation
- `flow-formula-validator.js` - Formula syntax validation
- `flow-trigger-validator.js` - Trigger configuration validation

### Used By

- `flow-validator.js` - Main validation orchestrator
- CI/CD pipelines - Pre-deployment checks
- `sfdc-metadata-manager` agent - Deployment validation

## Future Enhancements (v2.0 Roadmap)

1. **Full Path Analysis**
   - Track all possible execution paths
   - Detect contradictions across decision sequence
   - Validate field state at each decision point

2. **Coverage Analysis**
   - Which business scenarios tested
   - Untested decision branches
   - Edge case identification

3. **Performance Prediction**
   - Estimate flow execution time
   - Identify potential governor limit issues
   - Recommend optimization

4. **Visual Flow Graph**
   - Generate Mermaid/Lucid diagrams
   - Highlight problem areas
   - Show execution paths

## Files

**Main Script:** `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-decision-logic-analyzer.js`
**Tests:** `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/test/flow-decision-logic-analyzer.test.js`
**Documentation:** This file

## Contributing

To improve contradiction detection:
1. Implement path-based analysis (track execution sequences)
2. Build condition dependency graph
3. Add constraint solver for numeric ranges
4. Test with real-world flow examples

See: `docs/CONTRIBUTING.md` for guidelines

---

**Status:** ✅ Production Ready (with documented limitations)
**Maintenance:** Active
**Support:** File issues in project repository
