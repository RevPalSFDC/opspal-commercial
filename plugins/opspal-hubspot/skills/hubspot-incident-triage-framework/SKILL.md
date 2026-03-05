---
name: hubspot-incident-triage-framework
description: Triage and stabilize HubSpot automation incidents with severity scoring and recovery plans.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-hubspot:hubspot-workflow-auditor
version: 1.0.0
---

# hubspot-incident-triage-framework

## When to Use This Skill

Use for HubSpot workflow outages, callback failures, or automation regressions.

## Required Inputs

- Portal ID/context\n- Workflow IDs\n- Error evidence

## Output Artifacts

- Incident severity report\n- Stabilization plan\n- Escalation checklist

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Prioritize low-blast-radius mitigation\n- Confirm affected-object scope\n- Track every remediation step
