# Flow Diagnostic Report: {{flowName}}

**Generated**: {{timestamp}}
**Org**: {{orgAlias}}
**API Version**: {{apiVersion}}
**Report Type**: Full Diagnostic

---

## Executive Summary

**Production Readiness**: {{readinessStatus}} {{readinessEmoji}}

| Metric | Value |
|--------|-------|
| Production Ready | {{readyForProduction}} |
| Coverage | {{coveragePercentage}}% |
| Critical Issues | {{criticalIssues}} |
| Warnings | {{warnings}} |
| Test Cases Passed | {{testCasesPassed}}/{{totalTestCases}} |

### Readiness Decision

**{{readinessDecision}}**

{{readinessExplanation}}

---

## 🔍 Pre-flight Validation

Pre-flight checks validate org readiness before Flow deployment.

| Check | Status | Details |
|-------|--------|---------|
{{#preflightChecks}}
| {{checkName}} | {{status}} | {{details}} |
{{/preflightChecks}}

{{#if preflightPassed}}
✅ **All pre-flight checks passed**
{{else}}
❌ **Pre-flight validation failed** - Review issues above before proceeding
{{/if}}

---

## ▶️ Execution Testing

Execution testing validates Flow behavior with representative test data.

### Test Cases

{{#testCases}}
#### {{testCaseId}}: {{testCaseName}}

- **Status**: {{status}} {{statusEmoji}}
- **Duration**: {{duration}}ms
- **Object**: {{object}}
- **Operation**: {{operation}}

{{#if success}}
✅ **Passed** - Flow executed successfully

**Results:**
- Execution ID: `{{executionId}}`
- Record ID: `{{recordId}}`
- Duration: {{duration}}ms

{{else}}
❌ **Failed** - {{errorType}}

**Error Details:**
```
{{errorMessage}}
```

**Stack Trace:**
```
{{stackTrace}}
```

**Recommendation:** {{errorRecommendation}}
{{/if}}

---

{{/testCases}}

### Execution Statistics

| Metric | Value |
|--------|-------|
| Total Executions | {{totalExecutions}} |
| Successful | {{successfulExecutions}} ({{successRate}}%) |
| Failed | {{failedExecutions}} ({{failureRate}}%) |
| Average Duration | {{avgDuration}}ms |
| Min Duration | {{minDuration}}ms |
| Max Duration | {{maxDuration}}ms |

---

## 📈 Branch Coverage Analysis

Coverage analysis tracks which Flow decision branches were executed during testing.

### Coverage Summary

**Overall Coverage**: {{coveragePercentage}}% {{coverageBar}}

{{#if coverageGood}}
✅ Coverage meets production threshold (≥80%)
{{else}}
⚠️ Coverage below production threshold ({{coveragePercentage}}% < 80%)
{{/if}}

### Coverage by Element Type

| Element Type | Total | Covered | Uncovered | Coverage % |
|--------------|-------|---------|-----------|------------|
{{#coverageByType}}
| {{elementType}} | {{total}} | {{covered}} | {{uncovered}} | {{percentage}}% |
{{/coverageByType}}

### Uncovered Branches

{{#if uncoveredBranches}}
The following decision branches were not executed during testing:

{{#uncoveredBranches}}
#### {{elementName}}

- **Decision**: {{decisionLabel}}
- **Condition**: {{condition}}
- **Branch**: {{branchLabel}}

**Test Case Needed:** {{suggestedTestCase}}

---

{{/uncoveredBranches}}

**Recommendation**: Create additional test cases to cover these branches before production deployment.

{{else}}
✅ **All branches covered** - No additional test cases needed.
{{/if}}

---

## ⚠️ Issues and Recommendations

### Critical Issues ({{criticalIssuesCount}})

{{#if criticalIssuesList}}
These issues **BLOCK** production deployment and must be fixed:

{{#criticalIssuesList}}
#### 🔴 {{issue}}

**Description**: {{description}}

**Impact**: {{impact}}

**Fix**: {{recommendation}}

**Priority**: IMMEDIATE

---

{{/criticalIssuesList}}

{{else}}
✅ **No critical issues found**
{{/if}}

### Warnings ({{warningsCount}})

{{#if warningsList}}
These issues should be addressed before production deployment:

{{#warningsList}}
#### ⚠️ {{issue}}

**Description**: {{description}}

**Impact**: {{impact}}

**Recommendation**: {{recommendation}}

**Priority**: {{priority}}

---

{{/warningsList}}

{{else}}
✅ **No warnings**
{{/if}}

### Informational ({{infoCount}})

{{#if infoList}}
{{#infoList}}
#### ℹ️ {{issue}}

{{description}}

---

{{/infoList}}
{{/if}}

---

## 📊 Governor Limits Usage

Salesforce enforces governor limits to ensure platform performance. Monitor usage during testing.

| Limit Type | Used | Available | Percentage | Status |
|------------|------|-----------|------------|--------|
{{#governorLimits}}
| {{limitType}} | {{used}} | {{available}} | {{percentage}}% | {{status}} {{statusEmoji}} |
{{/governorLimits}}

### Governor Limit Thresholds

- **🟢 Safe** (< 80%): Normal usage, no action needed
- **🟡 Warning** (80-89%): Approaching limit, optimize if possible
- **🔴 Critical** (≥ 90%): Near limit, immediate optimization required

{{#if governorLimitIssues}}
**Issues Detected:**

{{#governorLimitIssues}}
- **{{limitType}}**: {{percentage}}% used ({{used}}/{{available}}) - {{recommendation}}
{{/governorLimitIssues}}
{{/if}}

---

## 📝 Detailed Execution Logs

### Flow Execution Sequence

{{#executionSequence}}
{{sequenceNumber}}. **{{elementType}}** - `{{elementName}}`
   - **Status**: {{status}}
   - **Duration**: {{duration}}ms
   {{#if decision}}
   - **Decision Result**: {{decisionResult}}
   {{/if}}
   {{#if assignment}}
   - **Assignment**: {{assignment}}
   {{/if}}
   {{#if error}}
   - **Error**: {{error}}
   {{/if}}

{{/executionSequence}}

---

## 💡 Next Steps and Recommendations

### Immediate Actions Required

{{#immediateActions}}
{{actionNumber}}. **{{action}}**
   - Priority: {{priority}}
   - Reason: {{reason}}
   - Expected Time: {{expectedTime}}

{{/immediateActions}}

### Recommendations

{{#recommendations}}
{{recommendationNumber}}. **{{recommendation}}**
   - Category: {{category}}
   - Impact: {{impact}}
   - Effort: {{effort}}

{{/recommendations}}

---

## 📋 Production Deployment Checklist

Use this checklist before deploying to production:

### Pre-Deployment

- [ ] All critical issues resolved
- [ ] Coverage ≥ 80%
- [ ] All test cases passing
- [ ] Governor limit usage < 80%
- [ ] Pre-flight checks passed
- [ ] Code review completed
- [ ] Documentation updated

### Deployment

- [ ] Deploy to sandbox first
- [ ] Run full diagnostic in sandbox
- [ ] Verify expected behavior
- [ ] Test with production-like data volume
- [ ] Review deployment plan with stakeholders
- [ ] Schedule maintenance window (if needed)
- [ ] Prepare rollback plan

### Post-Deployment

- [ ] Verify Flow activated successfully
- [ ] Monitor first 10 executions
- [ ] Check for unexpected errors
- [ ] Validate expected outcomes
- [ ] Monitor governor limit usage
- [ ] Document any issues
- [ ] Update runbook with lessons learned

---

## 📊 Diagnostic Metadata

| Field | Value |
|-------|-------|
| Diagnostic Type | {{diagnosticType}} |
| Modules Used | {{modulesUsed}} |
| Total Duration | {{totalDuration}}ms |
| Report Generated | {{timestamp}} |
| Report Version | 3.43.0 |
| Runbook Reference | Runbook 7: Flow Testing & Diagnostics |

---

## 📚 Reference Documentation

- **Runbook 7**: `docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md`
- **Section 5.5**: Full Diagnostic Workflow
- **CLI Commands**: `/flow-preflight`, `/flow-test`, `/flow-logs`, `/flow-diagnose`
- **Agents**: `flow-diagnostician`, `flow-test-orchestrator`, `flow-log-analyst`

---

**Generated by**: FlowDiagnosticOrchestrator v3.43.0
**Plugin**: salesforce-plugin@revpal-internal-plugins
**© 2025 RevPal Engineering**
