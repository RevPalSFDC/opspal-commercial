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

Use before releases and after major script/hook refactors.

## Required Inputs

- Critical workflow list\n- Existing test scripts\n- Environment constraints

## Output Artifacts

- Smoke test matrix\n- Harness command set\n- Coverage gap report

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Non-destructive probes by default\n- Isolate flaky tests\n- Require explicit production-test guards
