---
name: marketo-incident-response-playbook
description: Structured incident response for Marketo campaign, routing, and sync failures.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-marketo:marketo-campaign-diagnostician
version: 1.0.0
---

# marketo-incident-response-playbook

## When to Use This Skill

Use when Marketo workflows fail, stall, or produce inconsistent outcomes.

## Required Inputs

- Incident symptoms\n- Impacted assets\n- Time window

## Output Artifacts

- Triage flow\n- Root-cause hypothesis tree\n- Remediation sequence

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Read-only triage first\n- Preserve forensic evidence\n- Require controlled remediation approvals
