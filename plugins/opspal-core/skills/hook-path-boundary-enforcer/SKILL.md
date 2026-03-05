---
name: hook-path-boundary-enforcer
description: Detect and prevent cross-plugin hook path coupling and boundary violations in configs and scripts.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-path-boundary-enforcer

## When to Use This Skill

Use when adding or modifying hooks that invoke shared script paths.

## Required Inputs

- Hook configs\n- Hook scripts\n- Allowed boundary rules

## Output Artifacts

- Boundary violation report\n- Allowed exceptions list\n- Refactor recommendations

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Block new cross-plugin internal references\n- Keep baseline debt separate from net-new findings\n- Require explicit exception ownership
