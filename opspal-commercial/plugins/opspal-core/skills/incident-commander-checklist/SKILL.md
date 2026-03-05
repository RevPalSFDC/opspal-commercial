---
name: incident-commander-checklist
description: Operational incident command workflow for triage, communication, escalation, and closure evidence.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:alert-streaming-manager
version: 1.0.0
---

# incident-commander-checklist

## When to Use This Skill

Use at incident declaration or when service degradation is detected.

## Required Inputs

- Severity and blast radius\n- Affected systems\n- Incident owner

## Output Artifacts

- Triage checklist\n- Communication timeline\n- Escalation and resolution log

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Timestamp every decision\n- Keep read-first diagnostics before remediation\n- Require explicit closure criteria
