---
name: core-n8n-deployment-lifecycle-skill
description: Manage n8n workflow promotion lifecycle with validation gates, environment diffing, and rollback readiness.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:n8n-lifecycle-manager
version: 1.0.0
---

# core-n8n-deployment-lifecycle-skill

## When to Use This Skill

Use for n8n promotion, rollback planning, and lifecycle governance.

## Required Inputs

- Workflow bundle\n- Source/target environment\n- Dependency map

## Output Artifacts

- Promotion checklist\n- Environment diff\n- Rollback procedure

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Require preflight compatibility checks\n- Validate credentials and secrets paths\n- Block promotion on unresolved diffs
