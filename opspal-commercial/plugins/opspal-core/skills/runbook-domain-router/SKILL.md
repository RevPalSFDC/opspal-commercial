---
name: runbook-domain-router
description: Route ambiguous operational requests to the correct domain runbooks across plugins with confidence scoring and fallback paths.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-runbook-generator
version: 1.0.0
---

# runbook-domain-router

## When to Use This Skill

Use when a request spans multiple systems or runbook ownership is unclear.

## Required Inputs

- Platform/domain context\n- Task category\n- Incident or lifecycle stage

## Output Artifacts

- Ordered runbook route\n- Confidence score and alternatives\n- Escalation path

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Require confirmation on low-confidence routing\n- Prefer non-destructive runbooks first\n- Preserve audit trail of route decisions
