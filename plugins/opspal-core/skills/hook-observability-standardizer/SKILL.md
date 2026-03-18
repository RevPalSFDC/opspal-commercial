---
name: hook-observability-standardizer
description: Standardize hook logging, telemetry fields, and health checks across plugin ecosystems.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-observability-standardizer

## When to Use This Skill

Use when hook diagnostics are inconsistent across plugins.

## Required Inputs

- Hook inventory\n- Existing log schemas\n- Retention constraints

## Output Artifacts

- Standard log schema\n- Gap analysis\n- Instrumentation plan

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Avoid sensitive payload logging\n- Require correlation IDs\n- Define retention and rotation controls
