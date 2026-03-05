---
description: Run comprehensive Flow diagnostic workflows combining preflight, execution, and coverage analysis
---

Run comprehensive diagnostic workflows that orchestrate multiple testing modules to provide complete Flow validation, execution testing, and coverage analysis.

The diagnostic workflow will:
- **Pre-flight validation** (connectivity, metadata, conflicts, validation rules)
- **Execution testing** (run Flow with test data, capture state, parse logs)
- **Coverage analysis** (track decision branches, generate test plans)
- **Consolidated reporting** (HTML/markdown with recommendations)
- **Production readiness determination** (go/no-go decision)

**Target Flow**: {flow-api-name}
**Target Org**: {org-alias} (optional, uses default if not specified)

**Workflow Types**:
- `preflight`: Pre-flight checks only (fastest, 1-2 minutes)
- `execution`: Execute + capture state + parse logs (3-5 minutes)
- `coverage`: Multiple executions + coverage analysis (5-10 minutes)
- `full`: Complete diagnostic (preflight + execution + coverage, 10-15 minutes)

**Options** (vary by workflow type):
- `--type <workflow>`: Workflow type (required) - `preflight`, `execution`, `coverage`, `full`
- `--object <ObjectName>`: Object API name (for record-triggered Flows)
- `--trigger-type <type>`: Trigger type - `before-save`, `after-save`, `before-delete`, `after-delete`
- `--test-cases '<JSON>'`: Array of test case configurations (for coverage/full)
- `--format <fmt>`: Report format - `html`, `markdown`, `json` (default: html)
- `--no-reports`: Skip report generation (faster, data only)

**Output Location**: `instances/{org-alias}/flow-diagnostics/{flow-name}/diagnose-{timestamp}/`

**Generated Artifacts**:
- Consolidated diagnostic report (HTML/markdown/JSON)
- Pre-flight check results
- Execution results with state diffs
- Debug log analysis
- Coverage report with test plan
- Production readiness assessment
- Recommendations and next steps

**Runbook Reference**: See [Runbook 7, Section 5](../../docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md#section-5-diagnostic-workflows)

**Estimated Duration**:
- Preflight: 1-2 minutes
- Execution: 3-5 minutes
- Coverage: 5-10 minutes (depends on test case count)
- Full: 10-15 minutes

**Exit Codes**:
- `0` - Diagnostics passed, Flow ready for deployment
- `1` - Critical issues found, cannot deploy
- `2` - Warnings present, review before deployment

**Examples**:

**Pre-flight Diagnostic Only**:
```bash
# Quick readiness check (fastest)
/flow-diagnose Account_Validation_Flow neonone --type preflight \
  --object Account --trigger-type after-save
```

**Execution Diagnostic**:
```bash
# Execute Flow and analyze results
/flow-diagnose Account_Validation_Flow neonone --type execution \
  --object Account \
  --trigger-type after-save \
  --test-cases '[{
    "operation": "insert",
    "recordData": {"Name":"Test Account","Type":"Customer"}
  }]'
```

**Coverage Diagnostic**:
```bash
# Test multiple scenarios for branch coverage
/flow-diagnose Account_Status_Flow neonone --type coverage \
  --object Account \
  --trigger-type after-save \
  --test-cases '[
    {"operation":"insert","recordData":{"Status__c":"Active"}},
    {"operation":"insert","recordData":{"Status__c":"Inactive"}},
    {"operation":"insert","recordData":{"Status__c":"Pending"}}
  ]'
```

**Full Diagnostic (Recommended)**:
```bash
# Complete validation, execution, and coverage analysis
/flow-diagnose Account_Validation_Flow neonone --type full \
  --object Account \
  --trigger-type after-save \
  --test-cases '[
    {"operation":"insert","recordData":{"Name":"Test 1","Type":"Customer","Status__c":"Active"}},
    {"operation":"insert","recordData":{"Name":"Test 2","Type":"Prospect","Status__c":"Inactive"}},
    {"operation":"insert","recordData":{"Name":"Test 3","Type":"Partner","Status__c":"Pending"}}
  ]' \
  --format html
```

**Programmatic Usage**:
```javascript
// Direct script invocation
const { FlowDiagnosticOrchestrator } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-diagnostic-orchestrator');
const orchestrator = new FlowDiagnosticOrchestrator('neonone', {
  verbose: true,
  generateReports: true
});

// Full diagnostic
const result = await orchestrator.runFullDiagnostic('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  testCases: [
    { recordData: { Status__c: 'Active' } },
    { recordData: { Status__c: 'Inactive' } }
  ]
});

console.log('Can Deploy:', result.overallSummary.canDeploy);
console.log('Production Ready:', result.overallSummary.readyForProduction);
console.log('Coverage:', result.overallSummary.coveragePercentage + '%');
```

**Workflow Details**:

### 1. Pre-flight Diagnostic (`--type preflight`)
**Duration**: 1-2 minutes
**Steps**:
1. Verify org connectivity
2. Validate Flow metadata
3. Check competing automation (if --object specified)
4. Identify blocking validation rules (if --object specified)
5. Setup debug logging
6. Generate readiness report

**Output**:
- Pre-flight check results (passed/failed/warnings)
- Competing automation inventory
- Validation rules analysis
- Recommendations and next steps

### 2. Execution Diagnostic (`--type execution`)
**Duration**: 3-5 minutes
**Steps**:
1. Capture before state (for record-triggered)
2. Execute Flow with test data
3. Capture after state
4. Compare snapshots (state diff)
5. Retrieve latest debug log
6. Parse log for Flow events and errors
7. Generate execution report

**Output**:
- Execution result (success/failure, timing)
- State diff (fields changed, related records affected)
- Debug log analysis (elements, decisions, errors)
- Governor limit analysis
- Recommendations

### 3. Coverage Diagnostic (`--type coverage`)
**Duration**: 5-10 minutes (varies by test case count)
**Steps**:
1. Execute Flow multiple times with different test cases
2. Track element and decision coverage
3. Identify uncovered branches
4. Generate test plan for uncovered paths
5. Calculate coverage percentage
6. Generate coverage report

**Output**:
- Coverage percentage
- Elements executed/total
- Decision coverage (branches taken)
- Uncovered branches and elements
- Test plan (if coverage < 100%)
- Recommendations

### 4. Full Diagnostic (`--type full`)
**Duration**: 10-15 minutes
**Steps**:
1. **Phase 1**: Run pre-flight diagnostic
2. **Phase 2**: Run execution diagnostic (first test case)
3. **Phase 3**: Run coverage diagnostic (all test cases)
4. **Consolidation**: Generate overall summary
5. **Assessment**: Determine production readiness
6. **Reporting**: Create consolidated HTML/markdown report

**Output**:
- Consolidated diagnostic report
- Overall summary (can deploy, production ready, coverage %)
- Critical issues list
- Warnings list
- Comprehensive recommendations
- Phase-by-phase results

**Production Readiness Criteria**:
- ✅ **Can Deploy**: No critical issues (pre-flight passed, no fatal errors)
- ✅ **Production Ready**: Can deploy + no warnings + coverage ≥ 80%

**Report Formats**:

**HTML** (default, best for stakeholders):
- Color-coded status indicators
- Expandable sections
- Linked navigation
- Charts and visualizations
- Print-friendly

**Markdown** (best for CI/CD):
- GitHub-flavored markdown
- Tables and code blocks
- Easy diff in version control
- Readable in terminal

**JSON** (best for automation):
- Complete structured data
- Programmatic analysis
- Integration with dashboards
- Trend analysis over time

**Post-Diagnostic Commands**:
```bash
# View consolidated report (HTML)
open instances/{org-alias}/flow-diagnostics/{flow-name}/diagnose-latest/report.html

# View production readiness summary (markdown)
cat instances/{org-alias}/flow-diagnostics/{flow-name}/diagnose-latest/summary.md

# Extract critical issues (JSON)
cat instances/{org-alias}/flow-diagnostics/{flow-name}/diagnose-latest/result.json | \
  jq '.overallSummary.criticalIssues'

# Check if ready for production
READY=$(cat instances/{org-alias}/flow-diagnostics/{flow-name}/diagnose-latest/result.json | \
  jq -r '.overallSummary.readyForProduction')

if [ "$READY" = "true" ]; then
  echo "✅ Flow is ready for production deployment"
  exit 0
else
  echo "❌ Flow is NOT ready for production"
  exit 1
fi
```

**CI/CD Integration**:
```yaml
# GitLab CI example
flow-diagnostic:
  stage: test
  script:
    - /flow-diagnose $FLOW_NAME $ORG_ALIAS --type full --format json
    - READY=$(cat instances/$ORG_ALIAS/flow-diagnostics/$FLOW_NAME/diagnose-latest/result.json | jq -r '.overallSummary.readyForProduction')
    - |
      if [ "$READY" != "true" ]; then
        echo "Flow failed diagnostic checks"
        exit 1
      fi
  artifacts:
    paths:
      - instances/$ORG_ALIAS/flow-diagnostics/$FLOW_NAME/diagnose-latest/
    reports:
      junit: instances/$ORG_ALIAS/flow-diagnostics/$FLOW_NAME/diagnose-latest/junit.xml
  only:
    - merge_requests
```

**Comparison with Individual Commands**:

| Feature | flow-preflight | flow-test | flow-logs | flow-diagnose |
|---------|---------------|-----------|-----------|---------------|
| Pre-flight checks | ✅ | ❌ | ❌ | ✅ |
| Flow execution | ❌ | ✅ | ❌ | ✅ |
| State capture | ❌ | ✅ | ❌ | ✅ |
| Log parsing | ❌ | ✅ | ✅ | ✅ |
| Coverage analysis | ❌ | ❌ | ❌ | ✅ |
| Consolidated report | ❌ | ❌ | ❌ | ✅ |
| Production readiness | ❌ | ❌ | ❌ | ✅ |
| Duration | 1-2 min | 1-2 min | 15-30 sec | 10-15 min |

**When to Use Each**:
- **flow-diagnose --type preflight**: Quick validation before starting work
- **flow-diagnose --type execution**: After Flow changes, test one scenario
- **flow-diagnose --type coverage**: Before merge request, ensure all branches tested
- **flow-diagnose --type full**: Before production deployment, complete validation

**Agent Integration**: Use `flow-diagnostician` agent for automated diagnostic workflows with intelligent test case generation.

**Use the flow-diagnostic-orchestrator script to run a comprehensive diagnostic workflow on the {flow-api-name} Flow in the {org-alias} Salesforce org. Orchestrate preflight checks, execution testing, and coverage analysis to determine production readiness.**
