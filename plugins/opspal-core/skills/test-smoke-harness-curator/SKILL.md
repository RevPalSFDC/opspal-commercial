---
name: test-smoke-harness-curator
description: Curate smoke test harnesses for critical scripts, hooks, and operational workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:uat-orchestrator
version: 1.0.0
---

# test-smoke-harness-curator

## When to Use This Skill

- Pre-release gate: confirming that the critical paths (hook execution, agent routing, script invocations) still work after a plugin version bump
- After a major hook or script refactor: verifying the harness still covers the refactored entry points and identifying coverage gaps
- Building the initial smoke test matrix for a new plugin or agent that lacks any automated verification
- Identifying and quarantining flaky tests that produce intermittent failures and pollute the CI gate signal
- Producing a coverage gap report to justify investing in additional test coverage before a production deployment

**Not for**: Full integration or unit test suites — smoke tests are fast, non-destructive probes, not comprehensive coverage.

## Required Inputs

| Input | Description |
|-------|-------------|
| Critical workflow list | Ordered list of workflows that must pass for a release to proceed (e.g., `/gong-auth`, `/n8n-lifecycle preflight`, hook fire on PreToolUse) |
| Existing test scripts | Paths to current smoke scripts in `scripts/lib/__tests__/` or plugin test directories |
| Environment constraints | Whether tests run in sandbox, staging, or CI-only (no production test execution) |

## Output Artifacts

- Smoke test matrix: every critical workflow mapped to its test script, expected output, and pass/fail criteria
- Harness command set: the exact commands to execute each smoke test, ready to paste into CI or run manually
- Coverage gap report: critical workflows with no corresponding smoke test, ranked by risk (HIGH/MEDIUM/LOW)

## Workflow

1. Load the critical workflow list and map each workflow to any existing test script using Glob and Grep.
2. For each mapped test: read the script to confirm it probes the correct entry point and produces a verifiable output (not just "no error").
3. Run a dry-probe of each smoke test in the target environment — confirm it completes in <30 seconds and produces no writes.
4. Identify flaky tests: any test that has produced inconsistent results in the last 3 runs should be quarantined and flagged for root-cause analysis.
5. For unmapped critical workflows, generate a stub harness command and add it to the coverage gap report with a risk rating.
6. Output the final test matrix and harness command set; confirm all HIGH-risk gaps are accepted or assigned a fix owner before the release proceeds.

## Safety Checks

- Non-destructive probes only: smoke tests must not write data, modify configuration, or trigger billable API calls
- Quarantine flaky tests immediately — do not allow flaky tests to block or falsely clear CI gates
- Require explicit production-test guards: any test that could run against a production environment must include a `[[ "$ENV" == "production" ]] && exit 0` guard
