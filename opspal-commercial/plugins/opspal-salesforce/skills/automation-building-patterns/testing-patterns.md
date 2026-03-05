# Automation Testing Patterns

## Testing Lifecycle

```
Unit Tests → Integration Tests → UAT → Staging → Production
```

## Test Scenario Development

### Required Test Cases

| Scenario | Records | Expected Result |
|----------|---------|-----------------|
| Single Insert | 1 | Flow executes correctly |
| Bulk Insert | 200 | All records processed |
| Update Trigger | 1-200 | Changes detected and processed |
| Delete Trigger | 1-200 | Cleanup actions execute |
| Error Path | N/A | Fault handlers activate |

### Test Data Patterns

```javascript
// Single record test
const testAccount = await executor.executeRecordTriggeredFlow(flowApiName, {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',
  recordData: { Name: 'Test Account', Industry: 'Technology' }
});

// Bulk record test
const bulkAccounts = Array(200).fill().map((_, i) => ({
  Name: `Test Account ${i}`,
  Industry: 'Technology'
}));
await executor.executeBulkTest(flowApiName, bulkAccounts);
```

## Integration Testing

### Flow + Validation Rule Testing
1. Create Flow that updates field
2. Create Validation Rule on same field
3. Verify Flow respects validation
4. Test error messaging

### Flow Chaining Testing
1. Flow A triggers Flow B
2. Verify execution order
3. Test bulk behavior (recursion prevention)
4. Verify error propagation

## Pre-Deployment Checklist

### Validation (24-point)

**Structure & Syntax**
- [ ] Well-formed XML
- [ ] Valid schema
- [ ] Required fields present

**Logic & Flow**
- [ ] All paths reachable
- [ ] No infinite loops
- [ ] Decisions have all branches

**Best Practices**
- [ ] No DML in loops
- [ ] No SOQL in loops
- [ ] Fault paths present
- [ ] Proper naming

**Governor Limits**
- [ ] DML under 150
- [ ] SOQL under 100
- [ ] CPU time monitored

**Security**
- [ ] FLS respected
- [ ] Object access verified
- [ ] Sharing rules honored

## Diagnostic Commands

```bash
# Run unit tests
flow test MyFlow.xml --scenarios ./test/unit/ --org dev

# Check execution logs
flow-logs <flow-api-name> <org-alias> --latest --parse

# Full diagnostic validation
flow-diagnose <flow-api-name> <org-alias> --type execution

# Validate before deployment
flow validate MyFlow.xml --checks all --fix-auto
```

## Coverage Analysis

### Branch Coverage
```javascript
const { FlowBranchAnalyzer } = require('./scripts/lib/flow-branch-analyzer');
const analyzer = new FlowBranchAnalyzer(flowPath);
const coverage = await analyzer.analyze();

console.log(`Branch Coverage: ${coverage.percentage}%`);
coverage.uncoveredBranches.forEach(branch => {
  console.log(`Uncovered: ${branch.name}`);
});
```

### Minimum Standards
- Overall coverage: ≥80%
- Critical paths: 100%
- Error paths: 100%
- Edge cases: ≥50%

## Post-Deployment Verification

### Immediate Checks (First 24h)
1. Monitor execution success rate
2. Check for unexpected errors
3. Verify expected behavior
4. Review debug logs

### Weekly Monitoring
1. Execution volume trends
2. Error rate patterns
3. Performance metrics
4. User feedback
