---
name: gtm-scenario-governance-framework
description: Govern GTM scenario planning with assumption tracking, sensitivity analysis, and decision records.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-gtm-planning:gtm-planning-orchestrator
version: 1.0.0
---

# gtm-scenario-governance-framework

## When to Use This Skill

Use for annual/quarterly GTM planning, quota scenarios, or capacity model changes.

## Required Inputs

- Planning horizon\n- Core assumptions\n- Scenario constraints

## Output Artifacts

- Scenario registry\n- Sensitivity analysis summary\n- Decision memo

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Version assumptions explicitly\n- Capture approval trail\n- Flag unsupported extrapolations
