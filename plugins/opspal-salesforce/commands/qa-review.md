---
description: Review and analyze existing QA test reports without executing new tests
argument-hint: "[options]"
---

Review and analyze existing QA test reports (no test execution).

**Mode**: REVIEW (analysis only, no execution)

This command will:
1. Locate most recent test report in reports/ directory
2. Validate report freshness (<24 hours)
3. Extract and display metadata (pass rate, timestamp, org)
4. Compare with previous reports to identify trends
5. Alert if report is stale or org mismatch detected

**Pre-requisites**:
- At least one test report exists in reports/
- Report is <24 hours old (or user approval for older)

**Process**:
- Find latest report: scan reports/ for QA_*.md files
- Validate freshness: `node scripts/lib/test-report-manager.js validate [report]`
- Compare with previous: `node scripts/lib/test-report-manager.js compare [old] [new]`
- Extract key metrics and present summary

**Output**:
- Test results summary from existing report
- Freshness validation (age, metadata)
- Comparison with previous results (if available)
- Warnings if report is stale or org mismatch

**When to use**:
- Quick check of recent test results
- No need to re-execute tests
- Recent tests (<24 hours) available
- Reviewing historical test trends
- Analyzing test patterns over time

**Safeguards**:
- Rejects reports >24 hours old (unless user approves)
- Warns if org doesn't match current context
- Flags missing metadata headers
- Detects suspicious result changes (>20% drop)

**If report too old**: Automatically recommends /qa-execute instead
