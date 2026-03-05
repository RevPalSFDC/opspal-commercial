---
description: Execute fresh QA tests against the current Salesforce org state
argument-hint: "[options]"
---

Execute fresh QA tests against the current Salesforce org state.

**Mode**: EXECUTE (fresh test execution)

This command will:
1. Archive existing test reports to prevent confusion
2. Execute comprehensive QA tests against the current org
3. Generate timestamped report with metadata
4. Compare results with previous tests to detect regressions
5. Alert if significant regression detected (>20% drop)

**Pre-requisites**:
- Org authentication valid
- Test scripts available in scripts/qa/
- TodoWrite tool for progress tracking

**Process**:
- Archive old reports: `node scripts/lib/test-report-manager.js archive ./reports`
- Validate mode: `node scripts/lib/qa-workflow-validator.js validate-mode execute [org] ./reports`
- Execute tests via appropriate agent (sfdc-orchestrator or sfdc-apex-developer)
- Generate report with metadata header
- Compare with previous results

**Output**:
- Timestamped test report in reports/ directory
- Regression detection results (if previous tests exist)
- Pass/fail summary with evidence

**When to use**:
- Need current, fresh test results
- Org state may have changed since last test
- Previous test reports are >24 hours old
- Verifying deployment success
- Production deployment validation

**Automated archival**: Old reports moved to reports/archive/{timestamp}/
