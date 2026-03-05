---
name: script-inventory-operator
description: Create a deterministic inventory of scripts and tooling clusters with ownership and risk metadata.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:platform-instance-manager
version: 1.0.0
---

# script-inventory-operator

## When to Use This Skill

Use before consolidation, cleanup, or migration work across script-heavy plugins.

## Required Inputs

- Scope paths\n- Include/exclude filters\n- Ownership mapping

## Output Artifacts

- Script inventory report\n- Cluster and duplication summary\n- Candidate consolidation list

## Workflow

1. Collect scope, constraints, and success criteria.
2. Build a deterministic execution plan with explicit checks.
3. Run read-first diagnostics and capture baseline evidence.
4. Propose safe execution steps with rollback or abort criteria.
5. Produce final artifacts with owners and next actions.

## Safety Checks

- Exclude generated/vendor directories\n- Do not delete scripts automatically\n- Mark confidence for inferred ownership
